import os
import uuid
from datetime import datetime
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form, Query, Request
from sqlalchemy import select, func, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.database import get_db
from app.models import User, Team, TeamMember, MediaResource, ResourceImage, ResourceAttachment, Review, Urge, Like, Report, Comment, Partition
from app.models.resource import ResourceType, ResourceStatus, Visibility, ReviewDecision
from app.utils.dependencies import get_current_user

router = APIRouter(prefix="/resources", tags=["resources"])

# 最大上传 550MB (略高于 Nginx 的 500M 以让它先拦截)
MAX_UPLOAD_SIZE = 550 * 1024 * 1024
# 允许的文件扩展名
ALLOWED_EXTENSIONS = {
    "video": {"mp4", "webm", "mov", "avi", "mkv"},
    "image": {"jpg", "jpeg", "png", "gif", "webp", "svg", "bmp"},
    "document": {"pdf", "doc", "docx", "ppt", "pptx", "xls", "xlsx", "txt", "md", "csv"},
}


def _parse_status(value: str | None) -> "ResourceStatus | None":
    """容错解析状态筛选值。前端历史版本会发 pending/all 等写法，
    这里做别名映射；无法识别时返回 None（忽略筛选）而不是抛 500。"""
    if not value:
        return None
    v = value.strip().lower()
    aliases = {
        "pending": "pending_review",
        "reviewing": "pending_review",
        "under_review": "pending_review",
        "reviewed": "reviewed",
        "approved": "published",
        "all": "",
        "": "",
    }
    v = aliases.get(v, v)
    if not v:
        return None
    try:
        return ResourceStatus(v)
    except ValueError:
        return None


def _archive_content_images(content: str) -> str:
    """把正文 Markdown 里引用的 /uploads/temp/xxx 图片归档到 uploads/document/，
    并改写正文中的链接。

    动机：编辑器插图先落 temp/，若只靠自动保存，文件会永远留在 temp/（且与
    资源数据脱钩）。在保存正文时顺手归档，正文里存的就是最终地址。
    """
    if not content or "/uploads/temp/" not in content:
        return content
    import re as _re
    base = _re.escape(settings.PUBLIC_BASE_PATH)
    pattern = _re.compile(rf"{base}/uploads/(temp/[A-Za-z0-9_\-]+\.(?:jpg|jpeg|png|gif|webp|svg|bmp))")
    mapping = {}

    def repl(m):
        rel = m.group(1)
        if rel in mapping:
            return f"{settings.PUBLIC_BASE_PATH}/uploads/{mapping[rel]}"
        src = _upload_full_path(rel)
        if not os.path.isfile(src):
            return m.group(0)
        ext = os.path.splitext(rel)[1].lower()
        new_rel = f"document/{uuid.uuid4().hex}{ext}"
        dest = _upload_full_path(new_rel)
        try:
            os.makedirs(os.path.dirname(dest), exist_ok=True)
            os.replace(src, dest)
        except Exception:
            return m.group(0)
        mapping[rel] = new_rel
        return f"{settings.PUBLIC_BASE_PATH}/uploads/{new_rel}"

    try:
        return pattern.sub(repl, content)
    except Exception:
        return content


async def _team_member_role(db: AsyncSession, user_id: int, team_id: int) -> str | None:
    res = await db.execute(
        select(TeamMember).where(
            TeamMember.team_id == team_id,
            TeamMember.user_id == user_id,
        )
    )
    tm = res.scalar_one_or_none()
    return tm.team_role.value if tm else None


async def _team_advisor_id(db: AsyncSession, team_id: int) -> int | None:
    res = await db.execute(select(Team.advisor_teacher_id).where(Team.id == team_id))
    return res.scalar_one_or_none()


async def can_view_resource(db: AsyncSession, user: User, r: MediaResource) -> bool:
    """统一的可视性判定。

    允许：超管 / 上传者本人 / 该团队指导老师；
    已发布：public 对全体登录用户开放；team_only 对本团队成员开放；
    未发布（草稿/审核中/驳回）：仅团队管理层（队长/项管）可见。
    """
    if user.role.value == "super_admin":
        return True
    if r.uploader_id == user.id:
        return True
    if await _team_advisor_id(db, r.team_id) == user.id:
        return True
    role = await _team_member_role(db, user.id, r.team_id)
    if r.status == ResourceStatus.published:
        if r.visibility == Visibility.public:
            return True
        if r.visibility == Visibility.team_only and role is not None:
            return True
    return role in ("captain", "pm")


def _upload_full_path(rel: str) -> str:
    return os.path.join(settings.UPLOAD_DIR, rel)


def _safe_remove_upload(rel: str) -> None:
    """删除 uploads/ 下的物理文件，且严格限制在 UPLOAD_DIR 内，避免越界删除。"""
    if not rel:
        return
    try:
        full = os.path.abspath(_upload_full_path(rel))
        base = os.path.abspath(settings.UPLOAD_DIR)
        if full.startswith(base + os.sep) and os.path.isfile(full):
            os.remove(full)
    except Exception:
        pass


def _is_loaded(obj: object, attr: str) -> bool:
    from sqlalchemy import inspect
    return attr not in inspect(obj).unloaded


def _archive_temp_file(file_path: str, team_id) -> str:
    """把 temp/ 下的临时上传文件归档到团队目录，返回新的相对路径。"""
    if not file_path or not str(file_path).startswith("temp/"):
        return file_path
    src = _upload_full_path(file_path)
    if not os.path.isfile(src):
        return file_path
    ext = os.path.splitext(file_path)[1]
    new_rel = f"{team_id}/{uuid.uuid4().hex}{ext}"
    dest = _upload_full_path(new_rel)
    try:
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        os.replace(src, dest)
        return new_rel
    except Exception:
        return file_path


def _build_attachments(data: dict, team_id) -> list:
    """把请求里的 attachments 列表构造成 ResourceAttachment 对象列表。
    支持 kind=link(url) / kind=file(file_path,file_size)；缺 name 时用文件名/URL 兜底。"""
    items = data.get("attachments")
    if not isinstance(items, list):
        return []
    out = []
    for i, it in enumerate(items):
        if not isinstance(it, dict):
            continue
        kind = (it.get("kind") or "link").strip().lower()
        if kind not in ("link", "file"):
            continue
        if kind == "file":
            fp = _archive_temp_file(it.get("file_path") or "", team_id)
            if not fp:
                continue
            name = (it.get("name") or os.path.basename(fp) or "附件").strip()
            out.append(ResourceAttachment(
                kind="file", name=name[:300], file_path=fp,
                file_size=int(it.get("file_size") or 0), sort_order=i,
            ))
        else:
            url = (it.get("url") or "").strip()
            if not url:
                continue
            name = (it.get("name") or url).strip()
            out.append(ResourceAttachment(
                kind="link", name=name[:300], url=url[:2000], sort_order=i,
            ))
    return out


def _require_body(data: dict) -> str:
    """规则：资源主体必须是正文文字。只有链接/文件、没有文字 → 不允许提交。"""
    body = (data.get("content") or "").strip() or (data.get("description") or "").strip()
    if not body:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="请先填写正文文字；链接或文件不能单独提交，需作为附件挂在此资源下",
        )
    return body


def resource_to_dict(r: MediaResource) -> dict:
    return {
        "id": r.id,
        "title": r.title,
        "description": r.description,
        "content": r.content or "",
        "resource_type": r.resource_type.value,
        "file_path": r.file_path,
        "file_size": r.file_size,
        "thumbnail_path": r.thumbnail_path,
        "external_url": r.external_url,
        "team_id": r.team_id,
        "partition_id": r.partition_id,
        "uploader_id": r.uploader_id,
        "visibility": r.visibility.value,
        "status": r.status.value,
        "review_comment": r.review_comment,
        "created_at": r.created_at.isoformat() if r.created_at else None,
        "updated_at": r.updated_at.isoformat() if r.updated_at else None,
        "uploader": {"id": r.uploader.id, "display_name": r.uploader.display_name} if r.uploader else None,
        "like_count": len(r.likes) if _is_loaded(r, "likes") and r.likes else 0,
        "urge_count": len(r.urges) if _is_loaded(r, "urges") and r.urges else 0,
        "comment_count": len(r.comments) if _is_loaded(r, "comments") and r.comments else 0,
        "images": [{"id": img.id, "file_path": img.file_path, "sort_order": img.sort_order}
                   for img in (r.images if _is_loaded(r, "images") and r.images else [])],
        "attachments": [
            {
                "id": a.id, "kind": a.kind, "name": a.name,
                "url": a.url, "file_path": a.file_path,
                "file_size": a.file_size or 0, "sort_order": a.sort_order,
            }
            for a in (r.attachments if _is_loaded(r, "attachments") and r.attachments else [])
        ],
    }


@router.get("")
async def list_resources(
    team_id: int | None = None,
    partition_id: int | None = None,
    resource_type: str | None = None,
    visibility: str | None = None,
    status_filter: str = Query("published", alias="status"),
    search: str | None = None,
    uploader_id: int | None = None,
    my: int | None = None,
    page: int = 1,
    page_size: int = 20,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(MediaResource).options(
        selectinload(MediaResource.uploader),
        selectinload(MediaResource.urges),
        selectinload(MediaResource.attachments),
    )

    if current_user.role.value == "super_admin":
        parsed_status = _parse_status(status_filter)
        if parsed_status is not None:
            query = query.where(MediaResource.status == parsed_status)
    else:
        # Non-admins: see published resources + ONLY their own non-published ones
        query = query.where(
            or_(
                MediaResource.status == ResourceStatus.published,
                MediaResource.uploader_id == current_user.id,
            )
        )
        parsed_status = _parse_status(status_filter)
        if parsed_status is not None:
            query = query.where(MediaResource.status == parsed_status)

    # 「我的资源」：只看自己上传的
    if my:
        query = query.where(MediaResource.uploader_id == current_user.id)

    if team_id:
        query = query.where(MediaResource.team_id == team_id)
    if partition_id:
        query = query.where(MediaResource.partition_id == partition_id)
    if resource_type:
        try:
            query = query.where(MediaResource.resource_type == ResourceType(resource_type))
        except ValueError:
            pass
    if visibility:
        try:
            query = query.where(MediaResource.visibility == Visibility(visibility))
        except ValueError:
            pass
    if uploader_id:
        query = query.where(MediaResource.uploader_id == uploader_id)
    if search:
        query = query.where(MediaResource.title.ilike(f"%{search}%"))

    # For team_only resources, only team members / 该团队指导老师 can see
    query = query.where(
        or_(
            MediaResource.visibility == Visibility.public,
            MediaResource.team_id.in_(
                select(TeamMember.team_id).where(TeamMember.user_id == current_user.id)
            ),
            MediaResource.team_id.in_(
                select(Team.id).where(Team.advisor_teacher_id == current_user.id)
            ),
            current_user.role.value == "super_admin",
        )
    )

    query = query.order_by(MediaResource.created_at.desc())
    query = query.offset((page - 1) * page_size).limit(page_size)

    result = await db.execute(query)
    resources = result.unique().scalars().all()
    return [resource_to_dict(r) for r in resources]


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_resource(
    data: dict,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    team_id = data.get("team_id")
    if not team_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="缺少所属团队")

    team_res = await db.execute(select(Team).where(Team.id == team_id))
    team_obj = team_res.scalar_one_or_none()
    if not team_obj:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="团队不存在")

    # 权限：仅超管 / 该团队指导老师 / 该团队成员 可在团队下发布资源
    if current_user.role.value != "super_admin" and team_obj.advisor_teacher_id != current_user.id:
        role = await _team_member_role(db, current_user.id, team_id)
        if role is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="你不是该团队成员，无权在该团队下发布资源",
            )

    try:
        rtype = ResourceType(data.get("resource_type", "link"))
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="无效的资源类型")
    try:
        vis = Visibility(data.get("visibility", "team_only"))
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="无效的可见范围")

    # 规则：资源主体必须是正文文字（链接/文件不能单独提交）
    _require_body(data)

    file_path = _archive_temp_file(data.get("file_path"), team_id)
    attachments = _build_attachments(data, team_id)

    content_val = _archive_content_images(data.get("content") or "")
    desc_val = data.get("description", "") or ""
    if not content_val.strip() and desc_val.strip():
        # 只有描述时，把它当作正文文字存起来
        content_val = _archive_content_images(desc_val)

    resource = MediaResource(
        title=data.get("title", ""),
        description=desc_val,
        content=content_val,
        resource_type=rtype,
        file_path=file_path,
        file_size=data.get("file_size", 0),
        thumbnail_path=data.get("thumbnail_path"),
        external_url=data.get("external_url"),
        team_id=team_id,
        partition_id=data.get("partition_id"),
        uploader_id=current_user.id,
        visibility=vis,
        status=ResourceStatus.draft,
    )
    resource.attachments = attachments
    db.add(resource)
    await db.commit()
    return {
        "attachments": [
            {"id": a.id, "kind": a.kind, "name": a.name, "url": a.url,
             "file_path": a.file_path, "file_size": a.file_size or 0, "sort_order": a.sort_order}
            for a in attachments
        ],
        "id": resource.id,
        "title": resource.title,
        "description": resource.description,
        "content": resource.content or "",
        "resource_type": resource.resource_type.value,
        "file_path": resource.file_path,
        "file_size": resource.file_size,
        "thumbnail_path": resource.thumbnail_path,
        "external_url": resource.external_url,
        "team_id": resource.team_id,
        "partition_id": resource.partition_id,
        "uploader_id": resource.uploader_id,
        "visibility": resource.visibility.value,
        "status": resource.status.value,
        "review_comment": resource.review_comment,
        "created_at": resource.created_at.isoformat() if resource.created_at else None,
        "updated_at": resource.updated_at.isoformat() if resource.updated_at else None,
        "uploader": {"id": current_user.id, "display_name": current_user.display_name},
        "like_count": 0,
        "urge_count": 0,
        "comment_count": 0,
    }


@router.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    ext = os.path.splitext(file.filename or "")[1].lower() or ".bin"

    # 验证文件扩展名
    all_allowed = set()
    for exts in ALLOWED_EXTENSIONS.values():
        all_allowed.update(exts)
    if ext.lstrip(".") not in all_allowed and ext != ".bin":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"不支持的文件格式: {ext}",
        )

    team_id = "temp"
    relative_path = f"{team_id}/{uuid.uuid4().hex}{ext}"
    full_path = os.path.join(settings.UPLOAD_DIR, relative_path)
    os.makedirs(os.path.dirname(full_path), exist_ok=True)

    total = 0
    try:
        with open(full_path, "wb") as f:
            while chunk := await file.read(1024 * 1024):  # 1MB 分块读取
                total += len(chunk)
                if total > MAX_UPLOAD_SIZE:
                    f.close()
                    os.remove(full_path)
                    raise HTTPException(
                        status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                        detail=f"文件过大，最大支持 {MAX_UPLOAD_SIZE // (1024 * 1024)}MB",
                    )
                f.write(chunk)
    except HTTPException:
        raise
    except Exception as e:
        if os.path.exists(full_path):
            os.remove(full_path)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"文件写入失败: {str(e)}",
        )

    if total == 0:
        os.remove(full_path)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="上传的文件为空",
        )

    return {
        "file_path": relative_path,
        "file_size": total,
        "filename": file.filename,
    }


@router.get("/{resource_id}")
async def get_resource(
    resource_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(MediaResource).where(MediaResource.id == resource_id).options(
            selectinload(MediaResource.uploader),
            selectinload(MediaResource.likes),
            selectinload(MediaResource.urges),
            selectinload(MediaResource.comments).selectinload(Comment.user),
            selectinload(MediaResource.reviews),
            selectinload(MediaResource.images),
            selectinload(MediaResource.attachments),
        )
    )
    r = result.scalar_one_or_none()
    if not r or not await can_view_resource(db, current_user, r):
        # 用 404 而非 403，避免暴露资源是否存在
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="资源不存在")

    d = resource_to_dict(r)
    d["likes"] = [{"user_id": l.user_id} for l in r.likes]
    d["urges"] = [{"urger_id": u.urger_id} for u in r.urges]
    d["comments"] = [
        {"id": c.id, "user_id": c.user_id, "content": c.content,
         "user": {"id": c.user.id, "display_name": c.user.display_name} if c.user else None,
         "created_at": c.created_at.isoformat() if c.created_at else None}
        for c in r.comments
    ]
    d["reviews"] = [
        {"id": rv.id, "review_type": rv.review_type, "decision": rv.decision.value,
         "comment": rv.comment, "created_at": rv.created_at.isoformat() if rv.created_at else None}
        for rv in r.reviews
    ]
    return d


@router.put("/{resource_id}")
async def update_resource(
    resource_id: int,
    data: dict,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(MediaResource).where(MediaResource.id == resource_id).options(
            selectinload(MediaResource.uploader),
            selectinload(MediaResource.likes),
            selectinload(MediaResource.urges),
            selectinload(MediaResource.comments),
            selectinload(MediaResource.attachments),
        )
    )
    r = result.scalar_one_or_none()
    if not r:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="资源不存在")

    is_admin = current_user.role.value == "super_admin"
    is_owner = r.uploader_id == current_user.id
    if not (is_admin or is_owner):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权限")

    for key in ["title", "description", "content", "visibility", "partition_id"]:
        if key in data:
            if key == "visibility":
                setattr(r, key, Visibility(data[key]))
            elif key == "content":
                setattr(r, key, _archive_content_images(data[key]))
            else:
                setattr(r, key, data[key])

    old_att_files = []
    if "attachments" in data:
        old_att_files = [a.file_path for a in r.attachments if a.kind == "file" and a.file_path]
        r.attachments = _build_attachments(data, r.team_id)

    # 规则：主体必须有正文文字（链接/文件不能单独存在）
    if not ((r.content or "").strip() or (r.description or "").strip()):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="请先填写正文文字；链接或文件不能单独提交，需作为附件挂在此资源下",
        )

    await db.commit()

    # 重新取一遍（带 attachments），避免异步会话下懒加载报 MissingGreenlet
    fresh = await db.execute(
        select(MediaResource).where(MediaResource.id == resource_id).options(
            selectinload(MediaResource.uploader),
            selectinload(MediaResource.likes),
            selectinload(MediaResource.urges),
            selectinload(MediaResource.comments),
            selectinload(MediaResource.attachments),
        )
    )
    r = fresh.scalar_one_or_none()

    # 清理被替换掉的旧附件文件（不与其它记录共用时）
    for rel in old_att_files:
        still = await db.execute(select(ResourceAttachment.id).where(ResourceAttachment.file_path == rel).limit(1))
        if still.scalar_one_or_none() is None:
            _safe_remove_upload(rel)

    return resource_to_dict(r)


@router.delete("/{resource_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_resource(
    resource_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(MediaResource).where(MediaResource.id == resource_id))
    r = result.scalar_one_or_none()
    if not r:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="资源不存在")

    is_admin = current_user.role.value == "super_admin"
    is_owner = r.uploader_id == current_user.id

    # Team captain/pm can delete any resource in their team
    member = await db.execute(
        select(TeamMember).where(
            TeamMember.team_id == r.team_id,
            TeamMember.user_id == current_user.id,
        )
    )
    tm = member.scalar_one_or_none()
    is_captain_or_pm = tm and tm.team_role.value in ("captain", "pm")

    # Advisor teacher can delete resources of teams they advise
    team = await db.execute(select(Team).where(Team.id == r.team_id))
    team_obj = team.scalar_one_or_none()
    is_advisor = team_obj and team_obj.advisor_teacher_id == current_user.id

    if not (is_admin or is_owner or is_captain_or_pm or is_advisor):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权限")

    # 先收集关联物理文件，再删记录，最后清理文件（避免孤儿文件占用存储）
    orphan_paths = []
    if r.file_path:
        orphan_paths.append(r.file_path)
    img_res = await db.execute(select(ResourceImage).where(ResourceImage.resource_id == r.id))
    for img in img_res.scalars().all():
        orphan_paths.append(img.file_path)
    att_res = await db.execute(select(ResourceAttachment).where(ResourceAttachment.resource_id == r.id))
    for a in att_res.scalars().all():
        if a.kind == "file" and a.file_path:
            orphan_paths.append(a.file_path)

    await db.delete(r)
    await db.commit()

    # 仅当没有其它资源继续引用该文件时才删除物理文件
    for rel in orphan_paths:
        still = await db.execute(select(MediaResource.id).where(MediaResource.file_path == rel).limit(1))
        still_img = await db.execute(select(ResourceImage.id).where(ResourceImage.file_path == rel).limit(1))
        still_att = await db.execute(select(ResourceAttachment.id).where(ResourceAttachment.file_path == rel).limit(1))
        if (still.scalar_one_or_none() is not None
                or still_img.scalar_one_or_none() is not None
                or still_att.scalar_one_or_none() is not None):
            continue
        _safe_remove_upload(rel)


@router.post("/{resource_id}/submit")
async def submit_for_review(
    resource_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(MediaResource).where(MediaResource.id == resource_id))
    r = result.scalar_one_or_none()
    if not r:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="资源不存在")
    if r.uploader_id != current_user.id and current_user.role.value != "super_admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权限")
    if r.status != ResourceStatus.draft and r.status != ResourceStatus.rejected:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="当前状态不可提交")

    r.status = ResourceStatus.pending_review
    await db.commit()
    return {"message": "已提交审核"}


@router.post("/{resource_id}/urge")
async def urge_review(
    resource_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(MediaResource).where(MediaResource.id == resource_id))
    r = result.scalar_one_or_none()
    if not r:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="资源不存在")
    if r.status not in [ResourceStatus.pending_review, ResourceStatus.reviewed]:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="当前状态不可催促")

    existing = await db.execute(
        select(Urge).where(Urge.resource_id == resource_id, Urge.urger_id == current_user.id)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="已催促过")

    db.add(Urge(resource_id=resource_id, urger_id=current_user.id))
    await db.commit()
    return {"message": "已催促"}


@router.post("/{resource_id}/like")
async def like_resource(
    resource_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(select(MediaResource).where(MediaResource.id == resource_id))
    r = res.scalar_one_or_none()
    if not r or not await can_view_resource(db, current_user, r):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="资源不存在")

    existing = await db.execute(
        select(Like).where(Like.resource_id == resource_id, Like.user_id == current_user.id)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="已点赞")

    db.add(Like(resource_id=resource_id, user_id=current_user.id))
    await db.commit()
    return {"message": "点赞成功"}


@router.delete("/{resource_id}/like")
async def unlike_resource(
    resource_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Like).where(Like.resource_id == resource_id, Like.user_id == current_user.id)
    )
    like = result.scalar_one_or_none()
    if like:
        await db.delete(like)
        await db.commit()
    return {"message": "已取消点赞"}


@router.post("/{resource_id}/report")
async def report_resource(
    resource_id: int,
    data: dict,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(select(MediaResource).where(MediaResource.id == resource_id))
    r = res.scalar_one_or_none()
    if not r or not await can_view_resource(db, current_user, r):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="资源不存在")

    report = Report(
        resource_id=resource_id,
        reporter_id=current_user.id,
        reason=data.get("reason", ""),
        status="pending",
    )
    db.add(report)
    await db.commit()
    return {"message": "举报已提交"}


@router.post("/{resource_id}/comments")
async def add_comment(
    resource_id: int,
    data: dict,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(select(MediaResource).where(MediaResource.id == resource_id))
    r = res.scalar_one_or_none()
    if not r or not await can_view_resource(db, current_user, r):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="资源不存在")

    comment = Comment(
        resource_id=resource_id,
        user_id=current_user.id,
        content=data.get("content", ""),
    )
    db.add(comment)
    await db.commit()
    await db.refresh(comment)
    return {"id": comment.id, "content": comment.content, "created_at": comment.created_at.isoformat()}


@router.post("/{resource_id}/images")
async def upload_resource_images(
    resource_id: int,
    files: List[UploadFile] = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(MediaResource).where(MediaResource.id == resource_id))
    r = result.scalar_one_or_none()
    if not r:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="资源不存在")
    if r.uploader_id != current_user.id and current_user.role.value != "super_admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权限")

    MAX_IMAGE_SIZE = 20 * 1024 * 1024
    uploaded = []
    for idx, file in enumerate(files):
        ext = os.path.splitext(file.filename or "")[1].lower() or ".bin"
        ext_key = ext.lstrip(".")
        if ext_key not in ALLOWED_EXTENSIONS["image"]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"不支持的图片格式: {ext}",
            )
        relative_path = f"images/{uuid.uuid4().hex}{ext}"
        full_path = os.path.join(settings.UPLOAD_DIR, relative_path)
        os.makedirs(os.path.dirname(full_path), exist_ok=True)

        total = 0
        try:
            with open(full_path, "wb") as f_buf:
                while chunk := await file.read(1024 * 1024):
                    total += len(chunk)
                    if total > MAX_IMAGE_SIZE:
                        f_buf.close()
                        os.remove(full_path)
                        raise HTTPException(
                            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                            detail=f"图片过大，单张最大 {MAX_IMAGE_SIZE // (1024 * 1024)}MB",
                        )
                    f_buf.write(chunk)
        except HTTPException:
            raise
        except Exception as e:
            if os.path.exists(full_path):
                os.remove(full_path)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"图片写入失败: {str(e)}",
            )

        img = ResourceImage(
            resource_id=resource_id,
            file_path=relative_path,
            sort_order=idx,
        )
        db.add(img)
        uploaded.append({"id": None, "file_path": relative_path, "sort_order": idx})

    await db.commit()
    for i, img_record in enumerate(uploaded):
        result2 = await db.execute(
            select(ResourceImage).where(
                ResourceImage.resource_id == resource_id,
                ResourceImage.file_path == img_record["file_path"],
            )
        )
        db_img = result2.scalar_one_or_none()
        if db_img:
            uploaded[i]["id"] = db_img.id

    return uploaded


@router.delete("/{resource_id}/images/{image_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_resource_image(
    resource_id: int,
    image_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ResourceImage).where(
            ResourceImage.id == image_id,
            ResourceImage.resource_id == resource_id,
        )
    )
    img = result.scalar_one_or_none()
    if not img:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="图片不存在")

    r = await db.execute(select(MediaResource).where(MediaResource.id == resource_id))
    resource = r.scalar_one_or_none()
    if resource and resource.uploader_id != current_user.id and current_user.role.value != "super_admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权限")

    # Delete physical file
    full_path = os.path.join(settings.UPLOAD_DIR, img.file_path)
    if os.path.exists(full_path):
        os.remove(full_path)

    await db.delete(img)
    await db.commit()
