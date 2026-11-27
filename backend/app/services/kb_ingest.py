"""文件落盘与版本登记（API 与定时同步共用）"""
from __future__ import annotations

import asyncio
import os
import shutil
import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.kb import (
    DocSource, JobStatus, KBDocument, KBDocumentVersion, KBIngestionJob, KnowledgeBase, VersionState,
)
from app.services.kb_pipeline import guess_doc_type, run_ingestion

ALLOWED_EXT = {
    "pdf", "doc", "docx", "ppt", "pptx", "xls", "xlsx", "csv", "txt", "md", "json",
    "html", "htm", "mp4", "mov", "avi", "mkv", "webm", "mp3", "wav", "m4a",
    "png", "jpg", "jpeg", "gif", "webp", "zip", "rar", "7z",
}


def kb_dir(kb_id: int) -> str:
    d = os.path.join(settings.UPLOAD_DIR, "kb", str(kb_id))
    os.makedirs(d, exist_ok=True)
    return d


def _schedule(background, job_id: int) -> None:
    if background is not None:
        background.add_task(run_ingestion, job_id)
    else:
        asyncio.create_task(run_ingestion(job_id))


async def register_version(
    db: AsyncSession, kb: KnowledgeBase, doc: KBDocument, rel_path: str, size: int,
    filename: str, user_id: Optional[int], source: DocSource, source_ref: str,
    note: str, auto_activate: bool, background=None,
) -> dict:
    max_no = (await db.execute(
        select(func.max(KBDocumentVersion.version_no)).where(KBDocumentVersion.document_id == doc.id)
    )).scalar() or 0
    version = KBDocumentVersion(
        document_id=doc.id, version_no=int(max_no) + 1, filename=filename,
        file_path=rel_path, file_size=size, mime="",
        state=VersionState.pending, note=note, created_by=user_id,
    )
    db.add(version)
    await db.flush()
    job = KBIngestionJob(
        kb_id=kb.id, document_id=doc.id, version_id=version.id, filename=filename,
        source=source.value, status=JobStatus.queued, stage="queued", progress=0,
        auto_activate=auto_activate, message="排队中",
    )
    db.add(job)
    doc.updated_at = datetime.utcnow()
    await db.commit()
    _schedule(background, job.id)
    return {"document_id": doc.id, "version_id": version.id, "job_id": job.id}


async def create_doc_from_file(
    db: AsyncSession, kb: KnowledgeBase, user_id: Optional[int], tmp_path: str, filename: str,
    title: str, source: DocSource, source_ref: str, background=None,
) -> Optional[int]:
    """把外部拉取到的文件登记为新文档；同一 source_ref 已存在则跳过。"""
    if source_ref:
        exists = (await db.execute(
            select(KBDocument).where(KBDocument.kb_id == kb.id, KBDocument.source_ref == source_ref)
        )).scalar_one_or_none()
        if exists:
            return None
    ext = os.path.splitext(filename)[1].lower().lstrip(".") or "bin"
    if ext not in ALLOWED_EXT:
        return None
    fname = f"{uuid.uuid4().hex}.{ext}"
    abs_path = os.path.join(kb_dir(kb.id), fname)
    shutil.move(tmp_path, abs_path)
    size = os.path.getsize(abs_path)
    rel_path = os.path.join("kb", str(kb.id), fname).replace(os.sep, "/")
    doc = KBDocument(
        kb_id=kb.id, title=title or os.path.splitext(filename)[0],
        doc_type=guess_doc_type(filename), source=source, source_ref=source_ref, created_by=user_id,
    )
    db.add(doc)
    await db.flush()
    await register_version(
        db, kb, doc, rel_path, size, filename, user_id, source, source_ref,
        "数据源同步", True, background,
    )
    return doc.id
