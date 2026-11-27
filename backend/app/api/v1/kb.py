"""知识库 / 数据管理 API（2026-11）"""
from __future__ import annotations

import os
import shutil
import uuid
from datetime import datetime
from typing import List, Optional

import httpx
from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, Query, UploadFile
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models import User
from app.models.base import UserRole
from app.models.kb import (
    ConflictKind, ConflictStatus, DocSource, JobStatus, KBClass, KBConflict, KBDataSource, KBDocument,
    KBDocumentVersion, KBIngestionJob, KBKind, KnowledgeBase, KnowledgePoint, VersionState,
)
from app.services.kb_ingest import ALLOWED_EXT, kb_dir, register_version
from app.services.kb_pipeline import activate_version, diff_stats, guess_doc_type
from app.services.kb_sync import sync_source
from app.utils.dependencies import get_current_user

router = APIRouter(prefix="/kb", tags=["knowledge-base"])

MAX_SIZE = 500 * 1024 * 1024
ALLOWED_EXT = {
    "pdf", "doc", "docx", "ppt", "pptx", "xls", "xlsx", "csv", "txt", "md", "json",
    "html", "htm", "mp4", "mov", "avi", "mkv", "webm", "mp3", "wav", "m4a",
    "png", "jpg", "jpeg", "gif", "webp", "zip", "rar", "7z",
}


def _is_admin(user: User) -> bool:
    return user.role in (UserRole.super_admin, UserRole.advisor_teacher)


def _can_write(user: User) -> bool:
    return user.role != UserRole.student


def _kb_out(kb: KnowledgeBase, doc_count: int = 0) -> dict:
    return {
        "id": kb.id, "name": kb.name, "kind": kb.kind.value if kb.kind else "course",
        "code": kb.code, "description": kb.description, "term": kb.term,
        "owner_id": kb.owner_id, "team_id": kb.team_id, "is_active": kb.is_active,
        "doc_count": doc_count,
        "class_count": kb.class_count or 0,
        "knowledge_count": kb.knowledge_count or 0,
        "sync_source": kb.sync_source or "",
        "created_at": kb.created_at.isoformat() if kb.created_at else None,
        "updated_at": kb.updated_at.isoformat() if kb.updated_at else None,
    }


def _public_upload_url(path: str) -> str:
    return f"{settings.PUBLIC_BASE_PATH}/uploads/{path}"


def _version_out(v: KBDocumentVersion, with_text: bool = False) -> dict:
    data = {
        "id": v.id, "document_id": v.document_id, "version_no": v.version_no,
        "filename": v.filename, "file_size": v.file_size, "mime": v.mime,
        "sha256": (v.sha256 or "")[:16], "text_length": v.text_length,
        "state": v.state.value if v.state else "pending", "note": v.note,
        "meta": v.meta or {}, "created_by": v.created_by,
        "created_at": v.created_at.isoformat() if v.created_at else None,
        "activated_at": v.activated_at.isoformat() if v.activated_at else None,
        "deactivated_at": v.deactivated_at.isoformat() if v.deactivated_at else None,
        "download_url": _public_upload_url(v.file_path) if v.file_path else None,
    }
    if with_text:
        data["preview"] = (v.extracted_text or "")[:3000]
    return data


def _doc_out(d: KBDocument, versions: Optional[List[KBDocumentVersion]] = None) -> dict:
    active = None
    if versions:
        for v in versions:
            if v.id == d.active_version_id:
                active = v
                break
    return {
        "id": d.id, "kb_id": d.kb_id, "title": d.title, "topic": d.topic,
        "doc_type": d.doc_type, "source": d.source.value if d.source else "upload",
        "source_ref": d.source_ref, "active_version_id": d.active_version_id,
        "version_count": len(versions) if versions is not None else 0,
        "active_version": _version_out(active) if active else None,
        "created_at": d.created_at.isoformat() if d.created_at else None,
        "updated_at": d.updated_at.isoformat() if d.updated_at else None,
        # ---- education2.kb_documents 同名字段（对接口径保持一致）----
        "doc_id": d.external_id or "",
        "dataset_id": d.dataset_id or "",
        "filename": d.title,
        "file_type": d.doc_type,
        "file_size": active.file_size if active else 0,
        "folder_id": d.folder_id,
        "name_synced": bool(d.name_synced),
        "shared": bool(d.is_shared),
        "status": d.file_status or (active.state.value if active else ""),
        "upload_time": d.created_at.isoformat() if d.created_at else None,
        "username": d.owner_username or "",
        "chunk_count": d.chunk_count or 0,
        "collection_id": d.collection_id or "",
        "uploaded_at": d.uploaded_at.isoformat() if d.uploaded_at else None,
        "processed_at": d.processed_at.isoformat() if d.processed_at else None,
        "name_synced_at": None,
        "unshared_at": d.unshared_at.isoformat() if d.unshared_at else None,
    }


def _conflict_out(c: KBConflict) -> dict:
    return {
        "id": c.id, "kb_id": c.kb_id, "document_id": c.document_id,
        "new_version_id": c.new_version_id, "base_version_id": c.base_version_id,
        "kind": c.kind.value if c.kind else "content_diff", "severity": c.severity,
        "summary": c.summary, "detail": c.detail or {},
        "status": c.status.value if c.status else "open",
        "resolution": c.resolution, "resolution_note": c.resolution_note,
        "created_at": c.created_at.isoformat() if c.created_at else None,
        "resolved_at": c.resolved_at.isoformat() if c.resolved_at else None,
    }


def _job_out(j: KBIngestionJob) -> dict:
    return {
        "id": j.id, "kb_id": j.kb_id, "document_id": j.document_id, "version_id": j.version_id,
        "filename": j.filename, "source": j.source,
        "status": j.status.value if j.status else "queued", "stage": j.stage,
        "progress": j.progress, "message": j.message,
        "created_at": j.created_at.isoformat() if j.created_at else None,
        "finished_at": j.finished_at.isoformat() if j.finished_at else None,
    }


# ---------------------------------------------------------------- 知识库

@router.get("/bases")
async def list_bases(
    kind: Optional[str] = None,
    include_personal: bool = True,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    stmt = select(KnowledgeBase).where(KnowledgeBase.is_active == True)  # noqa: E712
    if kind in ("course", "personal", "shared"):
        stmt = stmt.where(KnowledgeBase.kind == KBKind(kind))
    if include_personal is False:
        stmt = stmt.where(KnowledgeBase.kind.in_([KBKind.course, KBKind.shared]))
    stmt = stmt.order_by(KnowledgeBase.kind, KnowledgeBase.id.desc())
    bases = (await db.execute(stmt)).scalars().all()

    counts = dict((await db.execute(
        select(KBDocument.kb_id, func.count(KBDocument.id)).group_by(KBDocument.kb_id)
    )).all())

    out = []
    for kb in bases:
        if kb.kind == KBKind.personal and kb.owner_id != user.id:
            continue
        out.append(_kb_out(kb, int(counts.get(kb.id, 0))))
    return out


@router.post("/bases", status_code=201)
async def create_base(
    payload: dict,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    name = (payload.get("name") or "").strip()
    if not name:
        raise HTTPException(400, "知识库名称不能为空")
    kind = payload.get("kind") or "course"
    if kind not in ("course", "personal"):
        raise HTTPException(400, "kind 只能是 course 或 personal")
    if kind == "course" and not _can_write(user):
        raise HTTPException(403, "学生账号不能创建课程知识库")
    kb = KnowledgeBase(
        name=name, kind=KBKind(kind), code=(payload.get("code") or "").strip(),
        description=payload.get("description") or "", term=payload.get("term") or "",
        owner_id=user.id if kind == "personal" else payload.get("owner_id"),
        team_id=payload.get("team_id"),
    )
    db.add(kb)
    await db.commit()
    await db.refresh(kb)
    return _kb_out(kb)


@router.patch("/bases/{kb_id}")
async def update_base(
    kb_id: int, payload: dict,
    db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user),
):
    kb = await db.get(KnowledgeBase, kb_id)
    if not kb:
        raise HTTPException(404, "知识库不存在")
    for f in ("name", "code", "description", "term"):
        if f in payload:
            setattr(kb, f, payload[f])
    await db.commit()
    await db.refresh(kb)
    return _kb_out(kb)


@router.delete("/bases/{kb_id}")
async def delete_base(
    kb_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user),
):
    kb = await db.get(KnowledgeBase, kb_id)
    if not kb:
        raise HTTPException(404, "知识库不存在")
    if not _is_admin(user) and kb.owner_id != user.id:
        raise HTTPException(403, "无权删除该知识库")
    kb.is_active = False
    await db.commit()
    return {"ok": True}


# ---------------------------------------------------------------- 文档

@router.get("/bases/{kb_id}/documents")
async def list_documents(
    kb_id: int, q: Optional[str] = None, source: Optional[str] = None,
    db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user),
):
    kb = await db.get(KnowledgeBase, kb_id)
    if not kb:
        raise HTTPException(404, "知识库不存在")
    stmt = select(KBDocument).where(KBDocument.kb_id == kb_id)
    if q:
        like = f"%{q}%"
        stmt = stmt.where(or_(KBDocument.title.like(like), KBDocument.topic.like(like)))
    if source:
        stmt = stmt.where(KBDocument.source == DocSource(source))
    docs = (await db.execute(stmt.order_by(KBDocument.updated_at.desc()))).scalars().all()

    counts = dict((await db.execute(
        select(KBDocumentVersion.document_id, func.count(KBDocumentVersion.id))
        .where(KBDocumentVersion.document_id.in_([d.id for d in docs] or [0]))
        .group_by(KBDocumentVersion.document_id)
    )).all())
    active = {}
    if docs:
        rows = (await db.execute(
            select(KBDocumentVersion).where(
                KBDocumentVersion.id.in_([d.active_version_id for d in docs if d.active_version_id] or [0])
            )
        )).scalars().all()
        active = {v.id: v for v in rows}

    out = []
    for d in docs:
        item = _doc_out(d)
        item["version_count"] = int(counts.get(d.id, 0))
        av = active.get(d.active_version_id) if d.active_version_id else None
        if av:
            item["active_version"] = _version_out(av)
        out.append(item)
    return out


@router.get("/documents/{doc_id}")
async def document_detail(
    doc_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user),
):
    doc = await db.get(KBDocument, doc_id)
    if not doc:
        raise HTTPException(404, "文档不存在")
    versions = (await db.execute(
        select(KBDocumentVersion).where(KBDocumentVersion.document_id == doc_id)
        .order_by(KBDocumentVersion.version_no.desc())
    )).scalars().all()
    rec = _doc_out(doc, versions)
    rec["versions"] = [_version_out(v, with_text=True) for v in versions]
    kb = await db.get(KnowledgeBase, doc.kb_id)
    rec["kb_name"] = kb.name if kb else ""
    return rec


async def _save_upload(file: UploadFile, kb_id: int) -> tuple[str, int]:
    """保存上传文件到知识库目录，返回 (相对路径, 大小)。"""
    name = file.filename or "upload.bin"
    ext = os.path.splitext(name)[1].lower().lstrip(".") or "bin"
    if ext not in ALLOWED_EXT:
        raise HTTPException(400, f"不支持的文件类型：.{ext}")
    rel_dir = os.path.join("kb", str(kb_id))
    abs_dir = kb_dir(kb_id)
    fname = f"{uuid.uuid4().hex}.{ext}"
    abs_path = os.path.join(abs_dir, fname)
    size = 0
    with open(abs_path, "wb") as out:
        while True:
            chunk = await file.read(1024 * 1024)
            if not chunk:
                break
            size += len(chunk)
            if size > MAX_SIZE:
                out.close()
                os.remove(abs_path)
                raise HTTPException(413, "文件超过 500MB 限制")
            out.write(chunk)
    return os.path.join(rel_dir, fname).replace(os.sep, "/"), size


@router.post("/bases/{kb_id}/documents", status_code=201)
async def upload_document(
    kb_id: int,
    background: BackgroundTasks,
    file: UploadFile = File(...),
    title: str = Form(""),
    topic: str = Form(""),
    note: str = Form(""),
    doc_type: str = Form(""),
    auto_activate: bool = Form(False),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    kb = await db.get(KnowledgeBase, kb_id)
    if not kb:
        raise HTTPException(404, "知识库不存在")
    if not _can_write(user) and not (kb.kind == KBKind.personal and kb.owner_id == user.id):
        raise HTTPException(403, "无上传权限")
    rel_path, size = await _save_upload(file, kb_id)
    dt = doc_type or guess_doc_type(file.filename or "")
    doc = KBDocument(
        kb_id=kb_id, title=(title or os.path.splitext(file.filename or "未命名")[0]).strip(),
        topic=topic.strip(), doc_type=dt, source=DocSource.upload,
        source_ref=file.filename or "", created_by=user.id,
    )
    db.add(doc)
    await db.flush()
    res = await register_version(
        db, kb, doc, rel_path, size, file.filename or "", user.id, DocSource.upload,
        file.filename or "", note, auto_activate, background,
    )
    res["doc_type"] = dt
    return res


@router.post("/documents/{doc_id}/versions", status_code=201)
async def upload_version(
    doc_id: int,
    background: BackgroundTasks,
    file: UploadFile = File(...),
    note: str = Form(""),
    auto_activate: bool = Form(False),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    doc = await db.get(KBDocument, doc_id)
    if not doc:
        raise HTTPException(404, "文档不存在")
    kb = await db.get(KnowledgeBase, doc.kb_id)
    if not kb:
        raise HTTPException(404, "知识库不存在")
    rel_path, size = await _save_upload(file, kb.id)
    return await register_version(
        db, kb, doc, rel_path, size, file.filename or "", user.id, doc.source or DocSource.upload,
        doc.source_ref or "", note, auto_activate, background,
    )


@router.delete("/documents/{doc_id}")
async def delete_document(
    doc_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user),
):
    doc = await db.get(KBDocument, doc_id)
    if not doc:
        raise HTTPException(404, "文档不存在")
    kb = await db.get(KnowledgeBase, doc.kb_id)
    if not _is_admin(user) and (not kb or (kb.owner_id != user.id and doc.created_by != user.id)):
        raise HTTPException(403, "无权删除")
    doc.active_version_id = None
    await db.delete(doc)
    await db.commit()
    return {"ok": True}


@router.post("/versions/{version_id}/activate")
async def api_activate_version(
    version_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user),
):
    v = await db.get(KBDocumentVersion, version_id)
    if not v:
        raise HTTPException(404, "版本不存在")
    if not _can_write(user):
        raise HTTPException(403, "无权限")
    doc = await db.get(KBDocument, v.document_id)
    if doc and doc.active_version_id == v.id:
        return {"ok": True, "state": "active"}
    await activate_version(db, v, user.id)
    # 该文档下未处理的内容差异冲突，随启用动作自动结案（保留记录）
    conflicts = (await db.execute(
        select(KBConflict).where(
            KBConflict.document_id == v.document_id,
            KBConflict.status == ConflictStatus.open,
            KBConflict.kind.in_(["content_diff", "version_clash"]),
        )
    )).scalars().all()
    for c in conflicts:
        c.status = ConflictStatus.resolved
        c.resolution = "keep_new"
        c.resolution_note = f"启用 v{v.version_no} 后自动结案"
        c.resolved_by = user.id
        c.resolved_at = datetime.utcnow()
    await db.commit()
    return {"ok": True, "state": "active", "closed_conflicts": len(conflicts)}


@router.post("/versions/{version_id}/archive")
async def archive_version(
    version_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user),
):
    v = await db.get(KBDocumentVersion, version_id)
    if not v:
        raise HTTPException(404, "版本不存在")
    if not _can_write(user):
        raise HTTPException(403, "无权限")
    if v.state == VersionState.active:
        raise HTTPException(400, "当前有效版本不能停用，请先启用其它版本")
    v.state = VersionState.archived
    v.deactivated_at = datetime.utcnow()
    await db.commit()
    return {"ok": True}


# ---------------------------------------------------------------- 任务 / 冲突 / 检索

@router.get("/jobs")
async def list_jobs(
    kb_id: Optional[int] = None, limit: int = 30,
    db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user),
):
    stmt = select(KBIngestionJob)
    if kb_id:
        stmt = stmt.where(KBIngestionJob.kb_id == kb_id)
    rows = (await db.execute(stmt.order_by(KBIngestionJob.id.desc()).limit(min(limit, 100)))).scalars().all()
    return [_job_out(j) for j in rows]


@router.get("/conflicts")
async def list_conflicts(
    kb_id: Optional[int] = None, status: str = "open", severity: Optional[str] = None,
    db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user),
):
    stmt = select(KBConflict)
    if kb_id:
        stmt = stmt.where(KBConflict.kb_id == kb_id)
    if status and status != "all":
        stmt = stmt.where(KBConflict.status == ConflictStatus(status))
    if severity:
        stmt = stmt.where(KBConflict.severity == severity)
    rows = (await db.execute(stmt.order_by(KBConflict.id.desc()).limit(200))).scalars().all()
    return [_conflict_out(c) for c in rows]


@router.post("/conflicts/{conflict_id}/resolve")
async def resolve_conflict(
    conflict_id: int, payload: dict,
    db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user),
):
    c = await db.get(KBConflict, conflict_id)
    if not c:
        raise HTTPException(404, "冲突记录不存在")
    action = payload.get("action") or "ignored"
    if action == "keep_new" and c.new_version_id:
        v = await db.get(KBDocumentVersion, c.new_version_id)
        if v:
            await activate_version(db, v, user.id)
    c.status = ConflictStatus.ignored if action == "ignored" else ConflictStatus.resolved
    c.resolution = action
    c.resolution_note = payload.get("note") or ""
    c.resolved_by = user.id
    c.resolved_at = datetime.utcnow()
    await db.commit()
    return _conflict_out(c)


@router.post("/bases/{kb_id}/scan-conflicts")
async def scan_topic_conflicts(
    kb_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user),
):
    """扫描同一知识点下的不同资料，识别内容差异（需求：冲突识别）。

    只比较各自「当前有效版本」，相似度落在 40%~99.5% 之间视为「相似但有差异」，
    完全不同的资料不算冲突，完全相同的会被重复检测覆盖。
    """
    if not _can_write(user):
        raise HTTPException(403, "无权限")
    kb = await db.get(KnowledgeBase, kb_id)
    if not kb:
        raise HTTPException(404, "知识库不存在")

    rows = (await db.execute(
        select(KBDocument, KBDocumentVersion)
        .join(KBDocumentVersion, KBDocumentVersion.id == KBDocument.active_version_id)
        .where(KBDocument.kb_id == kb_id, KBDocument.topic != "")
    )).all()

    groups: dict[str, list] = {}
    for doc, ver in rows:
        key = (doc.topic or "").strip().lower()
        groups.setdefault(key, []).append((doc, ver))

    created = 0
    now = datetime.utcnow()
    for topic, items in groups.items():
        if len(items) < 2:
            continue
        for i in range(len(items)):
            for j in range(i + 1, len(items)):
                doc_a, ver_a = items[i]
                doc_b, ver_b = items[j]
                if not ver_a.extracted_text or not ver_b.extracted_text:
                    continue
                stats = diff_stats(ver_a.extracted_text, ver_b.extracted_text)
                ratio = stats["ratio"]
                if ratio < 0.40 or ratio >= 0.995:
                    continue
                pair = sorted([doc_a.id, doc_b.id])
                dup = (await db.execute(
                    select(KBConflict).where(
                        KBConflict.kb_id == kb_id,
                        KBConflict.kind == ConflictKind.content_diff,
                        KBConflict.status == ConflictStatus.open,
                        KBConflict.document_id == pair[0],
                    )
                )).scalars().all()
                if any((c.detail or {}).get("type") == "topic_diff"
                       and (c.detail or {}).get("other_document_id") == pair[1] for c in dup):
                    continue
                db.add(KBConflict(
                    kb_id=kb_id, document_id=pair[0],
                    new_version_id=ver_a.id, base_version_id=ver_b.id,
                    kind=ConflictKind.content_diff, severity=(
                        "high" if ratio < 0.7 else ("medium" if ratio < 0.9 else "low")),
                    summary=(f"同一知识点「{doc_a.topic}」下两份资料相似度 {ratio:.1%}，"
                             f"《{doc_a.title}》与《{doc_b.title}》内容存在差异"),
                    detail={"type": "topic_diff", "other_document_id": pair[1],
                            "ratio": ratio, "sample": stats["sample"]},
                    created_at=now,
                ))
                created += 1
    await db.commit()
    return {"ok": True, "created": created}


@router.get("/search")
async def search(
    q: str, kb_ids: str = "", include_personal: bool = False, limit: int = 20,
    db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user),
):
    """按课程绑定知识库检索，只取当前有效版本。

    - 默认只检索课程知识库；个人知识库需 include_personal=true（用户勾选）才并入
    - 个人知识库仅限本人
    """
    q = (q or "").strip()
    if not q:
        return {"query": q, "total": 0, "items": []}
    stmt = (
        select(KBDocumentVersion, KBDocument, KnowledgeBase)
        .join(KBDocument, KBDocument.id == KBDocumentVersion.document_id)
        .join(KnowledgeBase, KnowledgeBase.id == KBDocument.kb_id)
        .where(KBDocumentVersion.state == VersionState.active)
        .where(KBDocumentVersion.extracted_text.like(f"%{q}%"))
        .where(KnowledgeBase.is_active == True)  # noqa: E712
    )
    if kb_ids:
        ids = [int(x) for x in kb_ids.split(",") if x.strip().isdigit()]
        if ids:
            stmt = stmt.where(KBDocument.kb_id.in_(ids))
    if include_personal:
        stmt = stmt.where(or_(
            KnowledgeBase.kind.in_([KBKind.course, KBKind.shared]),
            and_(KnowledgeBase.kind == KBKind.personal,
                 KnowledgeBase.owner_id == user.id),
        ))
    else:
        # 共享内容统一走「共享知识库」，个人库默认不并入
        stmt = stmt.where(KnowledgeBase.kind.in_([KBKind.course, KBKind.shared]))
    rows = (await db.execute(stmt.limit(min(limit, 50)))).all()

    items = []
    for v, d, kb in rows:
        text = v.extracted_text or ""
        idx = text.lower().find(q.lower())
        start = max(0, idx - 80)
        snippet = text[start:start + 240].replace("\n", " ")
        items.append({
            "kb_id": kb.id, "kb_name": kb.name, "kb_kind": kb.kind.value,
            "document_id": d.id, "title": d.title, "topic": d.topic,
            "version_id": v.id, "version_no": v.version_no,
            "snippet": ("…" if start > 0 else "") + snippet + "…",
            "download_url": _public_upload_url(v.file_path) if v.file_path else None,
        })
    return {"query": q, "total": len(items), "items": items}


@router.get("/stats")
async def kb_stats(
    kb_id: Optional[int] = None,
    db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user),
):
    doc_q = select(func.count(KBDocument.id))
    ver_q = select(func.count(KBDocumentVersion.id))
    size_q = select(func.coalesce(func.sum(KBDocumentVersion.file_size), 0))
    if kb_id:
        doc_q = doc_q.where(KBDocument.kb_id == kb_id)
        ver_q = ver_q.where(KBDocumentVersion.document_id.in_(
            select(KBDocument.id).where(KBDocument.kb_id == kb_id)))
        size_q = size_q.where(KBDocumentVersion.document_id.in_(
            select(KBDocument.id).where(KBDocument.kb_id == kb_id)))
    docs = (await db.execute(doc_q)).scalar() or 0
    vers = (await db.execute(ver_q)).scalar() or 0
    size = (await db.execute(size_q)).scalar() or 0
    cq = select(func.count(KBConflict.id)).where(KBConflict.status == ConflictStatus.open)
    if kb_id:
        cq = cq.where(KBConflict.kb_id == kb_id)
    conflicts = (await db.execute(cq)).scalar() or 0
    return {"documents": int(docs), "versions": int(vers), "storage_bytes": int(size),
            "open_conflicts": int(conflicts)}


# ---------------------------------------------------------------- 课程视图（Canvas 域）

@router.get("/courses")
async def list_courses(
    q: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """课程列表：字段与 education2.courses 对齐。"""
    stmt = select(KnowledgeBase).where(
        KnowledgeBase.kind == KBKind.course, KnowledgeBase.is_active == True)  # noqa: E712
    if q:
        stmt = stmt.where(KnowledgeBase.name.like(f"%{q}%"))
    stmt = stmt.order_by(KnowledgeBase.name)
    bases = (await db.execute(stmt)).scalars().all()

    counts = dict((await db.execute(
        select(KBDocument.kb_id, func.count(KBDocument.id)).group_by(KBDocument.kb_id)
    )).all())

    all_classes = (await db.execute(
        select(KBClass).order_by(KBClass.term_id, KBClass.class_id))).scalars().all()
    cls_by_code = {}
    for c in all_classes:
        cls_by_code.setdefault(c.course_code, []).append(c)

    all_kps = (await db.execute(
        select(KnowledgePoint).order_by(KnowledgePoint.id))).scalars().all()
    kp_by_course = {}
    for k in all_kps:
        kp_by_course.setdefault(k.course_name, []).append(k)

    out = []
    for kb in bases:
        codes = [c for c in (kb.code or "").split(",") if c]
        kps = kp_by_course.get(kb.name, [])
        out.append({
            "base_id": kb.id,
            "id": kb.id,
            "name": kb.name,
            # ---- education2.courses 同名字段 ----
            "course_name": kb.name,
            "courses_list": [{
                "course_code": code,
                "class_list": [{
                    "id": c.class_id, "enrollment_term_id": c.term_id,
                    "sis_course_id": c.sis_course_id,
                } for c in cls_by_code.get(code, [])],
            } for code in codes],
            "knowledge_count": len(kps),
            "knowledge_list": [{
                "knowledge_id": k.knowledge_id, "knowledge_name": k.name,
            } for k in kps],
            "class_count": len({c.id for c in all_classes if c.course_code in codes}),
            "doc_count": int(counts.get(kb.id, 0)),
            "term": kb.term,
            "sync_source": kb.sync_source or "",
            "code": kb.code,
        })
    return out


@router.get("/courses/{kb_id}")
async def course_detail(
    kb_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    kb = (await db.execute(select(KnowledgeBase).where(KnowledgeBase.id == kb_id))).scalar_one_or_none()
    if not kb:
        raise HTTPException(404, "课程不存在")

    codes = [c for c in (kb.code or "").split(",") if c]
    cstmt = select(KBClass)
    if codes:
        cstmt = cstmt.where(KBClass.course_code.in_(codes))
    else:
        cstmt = cstmt.where(KBClass.course_name == kb.name)
    classes = (await db.execute(cstmt.order_by(KBClass.term_id, KBClass.class_id))).scalars().all()

    kstmt = select(KnowledgePoint).where(KnowledgePoint.course_name == kb.name)
    kps = (await db.execute(kstmt.order_by(KnowledgePoint.id))).scalars().all()

    docs = (await db.execute(
        select(KBDocument).where(KBDocument.kb_id == kb.id)
        .order_by(KBDocument.updated_at.desc()).limit(50))).scalars().all()
    doc_total = (await db.execute(
        select(func.count(KBDocument.id)).where(KBDocument.kb_id == kb.id))).scalar() or 0

    class_out = [{
        "id": c.class_id, "sis_course_id": c.sis_course_id,
        "course_code": c.course_code, "course_name": c.course_name,
        "enrollment_term_id": c.term_id,
        "student_count": c.student_count, "student_list": c.student_list or [],
        "teacher_count": c.teacher_count, "teacher_list": c.teacher_list or [],
    } for c in classes]

    kp_out = [{
        "knowledge_id": k.knowledge_id, "course_code": k.course_code,
        "knowledge_name": k.name,
    } for k in kps]

    return {
        # 与 education2 对齐的主结构
        "course_name": kb.name,
        "courses_list": [{
            "course_code": code,
            "class_list": [{"id": c.class_id, "enrollment_term_id": c.term_id,
                            "sis_course_id": c.sis_course_id} for c in classes
                           if c.course_code == code],
        } for code in codes],
        "knowledge_count": len(kps),
        "knowledge_list": kp_out,
        "classes": class_out,
        "documents": [_doc_out(d) for d in docs],
        # 兼容旧前端
        "base": _kb_out(kb, int(doc_total)),
        "knowledge_points": [{
            "id": k.id, "course_code": k.course_code, "knowledge_id": k.knowledge_id,
            "name": k.name, "doc_count": k.doc_count,
        } for k in kps],
    }


@router.get("/knowledge-points")
async def list_knowledge_points(
    kb_id: Optional[int] = None,
    course_code: Optional[str] = None,
    q: Optional[str] = None,
    limit: int = Query(500, le=2000),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    stmt = select(KnowledgePoint)
    if kb_id:
        kb = (await db.execute(select(KnowledgeBase).where(KnowledgeBase.id == kb_id))).scalar_one_or_none()
        if not kb:
            raise HTTPException(404, "课程不存在")
        stmt = stmt.where(KnowledgePoint.course_name == kb.name)
    if course_code:
        stmt = stmt.where(KnowledgePoint.course_code == course_code)
    if q:
        stmt = stmt.where(KnowledgePoint.name.like(f"%{q}%"))
    rows = (await db.execute(stmt.order_by(KnowledgePoint.id).limit(limit))).scalars().all()
    return [{"id": k.id, "course_code": k.course_code, "knowledge_id": k.knowledge_id,
             "name": k.name, "knowledge_name": k.name, "doc_count": k.doc_count} for k in rows]


@router.post("/sync/canvas")
async def sync_canvas(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """从 education2 拉取课程/班级/知识点/文档并导入（需要校园网隧道在线）。"""
    if not _is_admin(user):
        raise HTTPException(403, "需要管理员权限")
    from fastapi.concurrency import run_in_threadpool

    from app.services.kb_canvas import pull_and_import

    try:
        result = await run_in_threadpool(pull_and_import)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(502, f"同步失败：{exc}") from exc
    return result


# ---------------------------------------------------------------- 数据源

def _source_out(s: KBDataSource) -> dict:
    cfg = dict(s.config or {})
    if cfg.get("token"):
        cfg["token"] = "******"
    return {
        "id": s.id, "kb_id": s.kb_id, "name": s.name, "type": s.type,
        "config": cfg, "enabled": s.enabled, "auto_sync": s.auto_sync,
        "sync_interval_min": s.sync_interval_min,
        "last_sync_at": s.last_sync_at.isoformat() if s.last_sync_at else None,
        "last_status": s.last_status, "last_message": s.last_message,
    }


@router.get("/bases/{kb_id}/sources")
async def list_sources(
    kb_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user),
):
    rows = (await db.execute(
        select(KBDataSource).where(KBDataSource.kb_id == kb_id).order_by(KBDataSource.id.desc())
    )).scalars().all()
    return [_source_out(s) for s in rows]


@router.post("/bases/{kb_id}/sources", status_code=201)
async def create_source(
    kb_id: int, payload: dict,
    db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user),
):
    kb = await db.get(KnowledgeBase, kb_id)
    if not kb:
        raise HTTPException(404, "知识库不存在")
    if not _can_write(user):
        raise HTTPException(403, "无权限")
    stype = payload.get("type") or "canvas"
    if stype not in ("canvas", "http_json", "local_dir"):
        raise HTTPException(400, "type 支持 canvas / http_json / local_dir")
    s = KBDataSource(
        kb_id=kb_id, name=payload.get("name") or stype,
        type=stype, config=payload.get("config") or {},
        auto_sync=bool(payload.get("auto_sync")), sync_interval_min=int(payload.get("sync_interval_min") or 60),
    )
    db.add(s)
    await db.commit()
    await db.refresh(s)
    return _source_out(s)


@router.patch("/sources/{source_id}")
async def update_source(
    source_id: int, payload: dict,
    db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user),
):
    s = await db.get(KBDataSource, source_id)
    if not s:
        raise HTTPException(404, "数据源不存在")
    for f in ("name", "enabled", "auto_sync", "sync_interval_min"):
        if f in payload:
            setattr(s, f, payload[f])
    if "config" in payload and payload["config"]:
        cfg = dict(s.config or {})
        cfg.update(payload["config"])
        s.config = cfg
    await db.commit()
    return _source_out(s)


@router.delete("/sources/{source_id}")
async def delete_source(
    source_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user),
):
    s = await db.get(KBDataSource, source_id)
    if not s:
        raise HTTPException(404, "数据源不存在")
    await db.delete(s)
    await db.commit()
    return {"ok": True}


@router.post("/sources/{source_id}/sync")
async def sync_source_endpoint(
    source_id: int, background: BackgroundTasks,
    db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user),
):
    s = await db.get(KBDataSource, source_id)
    if not s:
        raise HTTPException(404, "数据源不存在")
    kb = await db.get(KnowledgeBase, s.kb_id)
    if not kb:
        raise HTTPException(404, "知识库不存在")
    try:
        return await sync_source(db, s, kb, user.id, background)
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        s.last_status = "error"
        s.last_message = f"{type(e).__name__}: {e}"[:300]
        s.last_sync_at = datetime.utcnow()
        await db.commit()
        raise HTTPException(502, f"同步失败：{e}")
