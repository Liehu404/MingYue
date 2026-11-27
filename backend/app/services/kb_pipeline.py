"""知识库数据流水线：解析 → 抽取文本 → 版本比对 → 冲突登记。

设计要点（对应需求文档）：
- 上传即入流水线（job 记录阶段与进度）
- 抽取支持 PDF / Word / PPT / Excel / 纯文本；视频与图片记录元数据
- 版本不覆盖：新文件永远是新记录，旧版本文件保留，只做状态切换
- 冲突识别：同文档版本差异、同库重复文件、同库同标题
"""
from __future__ import annotations

import asyncio
import difflib
import hashlib
import json
import os
import re
from datetime import datetime
from typing import Any

from sqlalchemy import select

from app.config import settings
from app.database import async_session
from app.models.kb import (
    KBDocument, KBDocumentVersion, KBConflict, KBIngestionJob, KBKind,
    ConflictKind, ConflictStatus, JobStatus, VersionState,
)


# ---------------------------------------------------------------- 基础工具

def sha256_of(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def normalize_text(text: str) -> str:
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"[ \t\u3000]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _read_text_file(path: str) -> str:
    for enc in ("utf-8", "utf-8-sig", "gb18030", "latin-1"):
        try:
            with open(path, "r", encoding=enc) as f:
                return f.read()
        except (UnicodeDecodeError, LookupError):
            continue
    with open(path, "rb") as f:
        return f.read().decode("utf-8", errors="ignore")


def extract_pdf(path: str) -> tuple[str, dict]:
    from pypdf import PdfReader
    reader = PdfReader(path)
    pages = []
    for p in reader.pages:
        try:
            pages.append(p.extract_text() or "")
        except Exception:
            pages.append("")
    meta = {"pages": len(reader.pages)}
    try:
        if reader.metadata:
            meta["title"] = reader.metadata.get("/Title") or ""
            meta["author"] = reader.metadata.get("/Author") or ""
    except Exception:
        pass
    return "\n\n".join(pages), meta


def extract_docx(path: str) -> tuple[str, dict]:
    import docx
    d = docx.Document(path)
    parts = [p.text for p in d.paragraphs if p.text.strip()]
    for table in d.tables:
        for row in table.rows:
            cells = [c.text.strip() for c in row.cells if c.text.strip()]
            if cells:
                parts.append(" | ".join(cells))
    meta = {"paragraphs": len(d.paragraphs), "tables": len(d.tables)}
    return "\n".join(parts), meta


def extract_pptx(path: str) -> tuple[str, dict]:
    from pptx import Presentation
    prs = Presentation(path)
    parts = []
    for i, slide in enumerate(prs.slides, 1):
        texts = []
        for shape in slide.shapes:
            if hasattr(shape, "text") and shape.text.strip():
                texts.append(shape.text.strip())
        if texts:
            parts.append(f"[第{i}页]\n" + "\n".join(texts))
    return "\n\n".join(parts), {"slides": len(prs.slides)}


def extract_xlsx(path: str) -> tuple[str, dict]:
    import openpyxl
    wb = openpyxl.load_workbook(path, data_only=True, read_only=True)
    parts = []
    for ws in wb.worksheets:
        rows = []
        for row in ws.iter_rows(values_only=True):
            vals = [str(v) for v in row if v is not None]
            if vals:
                rows.append(" | ".join(vals))
            if len(rows) >= 5000:
                break
        if rows:
            parts.append(f"[{ws.title}]\n" + "\n".join(rows))
    wb.close()
    return "\n\n".join(parts), {"sheets": len(wb.worksheets)}


def extract_media_meta(path: str) -> tuple[str, dict]:
    """视频/音频：不转写，仅取元数据（转写是重活，按需另接 ASR）。"""
    meta: dict[str, Any] = {}
    try:
        import subprocess
        out = subprocess.run(
            ["ffprobe", "-v", "quiet", "-print_format", "json",
             "-show_format", "-show_streams", path],
            capture_output=True, timeout=20, text=True,
        )
        if out.returncode == 0:
            data = json.loads(out.stdout or "{}")
            fmt = data.get("format", {})
            meta["duration"] = float(fmt.get("duration") or 0)
            for s in data.get("streams", []):
                if s.get("codec_type") == "video":
                    meta["width"] = s.get("width")
                    meta["height"] = s.get("height")
    except Exception as e:
        meta["probe_error"] = str(e)[:200]
    return "", meta


def extract_text(path: str, doc_type: str) -> tuple[str, dict]:
    dt = (doc_type or "").lower()
    try:
        if dt == "pdf":
            return extract_pdf(path)
        if dt in ("docx", "doc"):
            return extract_docx(path)
        if dt in ("pptx", "ppt"):
            return extract_pptx(path)
        if dt in ("xlsx", "xls", "csv"):
            if dt == "csv":
                return _read_text_file(path), {}
            return extract_xlsx(path)
        if dt in ("txt", "md", "json", "html", "htm"):
            return _read_text_file(path), {}
        if dt in ("mp4", "mov", "avi", "mkv", "webm", "mp3", "wav", "m4a"):
            return extract_media_meta(path)
        if dt in ("png", "jpg", "jpeg", "gif", "webp"):
            return "", {"image": True}
    except Exception as e:  # 解析失败不阻断入库，标记出来
        return "", {"extract_error": str(e)[:300]}
    return "", {}


def diff_stats(old_text: str, new_text: str) -> dict:
    old_lines = [l.strip() for l in normalize_text(old_text).split("\n") if l.strip()]
    new_lines = [l.strip() for l in normalize_text(new_text).split("\n") if l.strip()]
    if not old_lines and not new_lines:
        return {"ratio": 1.0, "added": 0, "removed": 0, "sample": ""}
    # 控制规模，避免超长文档比对拖慢
    a, b = old_lines[:4000], new_lines[:4000]
    sm = difflib.SequenceMatcher(None, a, b, autojunk=False)
    ratio = round(sm.ratio(), 4)
    added = removed = 0
    plus, minus = [], []
    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag in ("replace", "delete"):
            removed += i2 - i1
            minus.extend(a[i1:i2][:5])
        if tag in ("replace", "insert"):
            added += j2 - j1
            plus.extend(b[j1:j2][:5])
    sample_lines = []
    for l in plus[:6]:
        sample_lines.append("+ " + l[:120])
    for l in minus[:6]:
        sample_lines.append("- " + l[:120])
    return {
        "ratio": ratio,
        "added": added,
        "removed": removed,
        "old_lines": len(old_lines),
        "new_lines": len(new_lines),
        "sample": "\n".join(sample_lines),
    }


def severity_of(ratio: float, added: int, removed: int) -> str:
    change = 1 - ratio
    if change >= 0.30:
        return "high"
    if change >= 0.10:
        return "medium"
    if change >= 0.01 or added + removed > 0:
        return "low"
    return "none"


# ---------------------------------------------------------------- 版本状态

async def activate_version(db, version: KBDocumentVersion, user_id: int | None = None) -> KBDocumentVersion:
    doc = await db.get(KBDocument, version.document_id)
    if not doc:
        raise ValueError("文档不存在")
    if doc.active_version_id and doc.active_version_id != version.id:
        old = await db.get(KBDocumentVersion, doc.active_version_id)
        if old:
            old.state = VersionState.superseded
            old.deactivated_at = datetime.utcnow()
    version.state = VersionState.active
    version.activated_at = datetime.utcnow()
    version.deactivated_at = None
    doc.active_version_id = version.id
    doc.updated_at = datetime.utcnow()
    await db.commit()
    return version


# ---------------------------------------------------------------- 主流程

async def run_ingestion(job_id: int) -> None:
    async with async_session() as db:
        job = await db.get(KBIngestionJob, job_id)
        if not job:
            return
        job.status = JobStatus.running
        job.stage = "extracting"
        job.progress = 15
        job.started_at = datetime.utcnow()
        await db.commit()

        version = await db.get(KBDocumentVersion, job.version_id) if job.version_id else None
        doc = await db.get(KBDocument, version.document_id) if version else None
        if not version or not doc:
            job.status = JobStatus.failed
            job.message = "版本或文档记录缺失"
            job.finished_at = datetime.utcnow()
            await db.commit()
            return

        abs_path = os.path.join(settings.UPLOAD_DIR, version.file_path)
        try:
            # 1) 计算哈希（用于重复检测）
            version.sha256 = await asyncio.to_thread(sha256_of, abs_path)

            # 2) 抽取文本
            text, meta = await asyncio.to_thread(extract_text, abs_path, doc.doc_type)
            text = normalize_text(text or "")
            version.extracted_text = text
            version.text_length = len(text)
            version.meta = meta or {}
            job.stage = "diffing"
            job.progress = 55
            await db.commit()

            # 3) 重复文件（同知识库 sha256 相同）
            dup = (await db.execute(
                select(KBDocumentVersion).where(
                    KBDocumentVersion.sha256 == version.sha256,
                    KBDocumentVersion.id != version.id,
                    KBDocumentVersion.document_id.in_(
                        select(KBDocument.id).where(KBDocument.kb_id == doc.kb_id)
                    ),
                ).limit(1)
            )).scalar_one_or_none()
            if dup:
                db.add(KBConflict(
                    kb_id=doc.kb_id, document_id=doc.id,
                    new_version_id=version.id, base_version_id=dup.id,
                    kind=ConflictKind.duplicate, severity="high",
                    summary=f"与已有文件完全一致（sha256 相同，文档 #{dup.document_id} 版本 v{dup.version_no}）",
                    detail={"sha256": version.sha256, "duplicate_document_id": dup.document_id},
                ))

            # 4) 与当前有效版本比对
            base = await db.get(KBDocumentVersion, doc.active_version_id) if doc.active_version_id else None
            if base and base.id != version.id and base.extracted_text:
                stats = await asyncio.to_thread(diff_stats, base.extracted_text, text)
                sev = severity_of(stats["ratio"], stats["added"], stats["removed"])
                if sev != "none":
                    db.add(KBConflict(
                        kb_id=doc.kb_id, document_id=doc.id,
                        new_version_id=version.id, base_version_id=base.id,
                        kind=ConflictKind.content_diff, severity=sev,
                        summary=(f"与 v{base.version_no} 相比相似度 {stats['ratio']:.1%}，"
                                 f"新增 {stats['added']} 段、删除 {stats['removed']} 段"),
                        detail=stats,
                    ))

            # 5) 同库同标题但不同文档
            clash = (await db.execute(
                select(KBDocument).where(
                    KBDocument.kb_id == doc.kb_id,
                    KBDocument.id != doc.id,
                    KBDocument.title == doc.title,
                ).limit(1)
            )).scalar_one_or_none()
            if clash:
                db.add(KBConflict(
                    kb_id=doc.kb_id, document_id=doc.id,
                    new_version_id=version.id, base_version_id=None,
                    kind=ConflictKind.title_clash, severity="medium",
                    summary=f"同库存在同名文档 #{clash.id}「{clash.title}」，建议合并为一个文档的不同版本",
                    detail={"other_document_id": clash.id},
                ))

            await db.commit()

            if job.auto_activate:
                await activate_version(db, version)

            job.status = JobStatus.done
            job.stage = "done"
            job.progress = 100
            job.message = f"解析完成：{len(text)} 字"
            job.finished_at = datetime.utcnow()
            await db.commit()
        except Exception as e:
            await db.rollback()
            job = await db.get(KBIngestionJob, job_id)
            if job:
                job.status = JobStatus.failed
                job.stage = "failed"
                job.message = f"{type(e).__name__}: {e}"[:500]
                job.finished_at = datetime.utcnow()
                await db.commit()


def guess_doc_type(filename: str) -> str:
    ext = os.path.splitext(filename)[1].lower().lstrip(".")
    alias = {"doc": "docx", "ppt": "pptx", "xls": "xlsx", "jpeg": "jpg", "htm": "html"}
    return alias.get(ext, ext or "other")
