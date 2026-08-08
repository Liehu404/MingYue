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
from app.models import User, Team, TeamMember, MediaResource, ResourceImage, Review, Urge, Like, Report, Comment, Partition
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


def _is_loaded(obj: object, attr: str) -> bool:
    from sqlalchemy import inspect
    return attr not in inspect(obj).unloaded


def resource_to_dict(r: MediaResource) -> dict:
    return {
        "id": r.id,
        "title": r.title,
        "description": r.description,
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
    page: int = 1,
    page_size: int = 20,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(MediaResource).options(
        selectinload(MediaResource.uploader),
        selectinload(MediaResource.urges),
    )

    if current_user.role.value == "super_admin":
        if status_filter:
            query = query.where(MediaResource.status == ResourceStatus(status_filter))
    else:
        # Non-admins: see published resources + ONLY their own non-published ones
        query = query.where(
            or_(
                MediaResource.status == ResourceStatus.published,
                MediaResource.uploader_id == current_user.id,
            )
        )

    if team_id:
        query = query.where(MediaResource.team_id == team_id)
    if partition_id:
        query = query.where(MediaResource.partition_id == partition_id)
    if resource_type:
        query = query.where(MediaResource.resource_type == ResourceType(resource_type))
    if visibility:
        query = query.where(MediaResource.visibility == Visibility(visibility))
    if uploader_id:
        query = query.where(MediaResource.uploader_id == uploader_id)
    if search:
        query = query.where(MediaResource.title.ilike(f"%{search}%"))

    # For team_only resources, only team members can see
    query = query.where(
        or_(
            MediaResource.visibility == Visibility.public,
            MediaResource.team_id.in_(
                select(TeamMember.team_id).where(TeamMember.user_id == current_user.id)
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
    resource = MediaResource(
        title=data.get("title", ""),
        description=data.get("description", ""),
        resource_type=ResourceType(data.get("resource_type", "link")),
        file_path=data.get("file_path"),
        file_size=data.get("file_size", 0),
        thumbnail_path=data.get("thumbnail_path"),
        external_url=data.get("external_url"),
        team_id=data["team_id"],
        partition_id=data.get("partition_id"),
        uploader_id=current_user.id,
        visibility=Visibility(data.get("visibility", "team_only")),
        status=ResourceStatus.draft,
    )
    db.add(resource)
    await db.commit()
    await db.refresh(resource)
    return {
        "id": resource.id,
        "title": resource.title,
        "description": resource.description,
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
        )
    )
    r = result.scalar_one_or_none()
    if not r:
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
        )
    )
    r = result.scalar_one_or_none()
    if not r:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="资源不存在")

    is_admin = current_user.role.value == "super_admin"
    is_owner = r.uploader_id == current_user.id
    if not (is_admin or is_owner):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权限")

    for key in ["title", "description", "visibility", "partition_id"]:
        if key in data:
            if key == "visibility":
                setattr(r, key, Visibility(data[key]))
            else:
                setattr(r, key, data[key])
    await db.commit()
    await db.refresh(r)
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

    await db.delete(r)
    await db.commit()


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
