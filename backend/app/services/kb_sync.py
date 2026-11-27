"""数据源同步：Canvas / 通用 HTTP JSON / 本地目录"""
from __future__ import annotations

import os
import shutil
import uuid
from datetime import datetime
from typing import Optional

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.kb import DocSource, KBDataSource, KBDocument, KnowledgeBase
from app.services.kb_ingest import create_doc_from_file


async def sync_source(
    db: AsyncSession, source: KBDataSource, kb: KnowledgeBase,
    user_id: Optional[int], background=None,
) -> dict:
    cfg = source.config or {}
    created, skipped, errors = 0, 0, []
    tmpdir = os.path.join(settings.UPLOAD_DIR, "tmp", uuid.uuid4().hex)
    os.makedirs(tmpdir, exist_ok=True)
    try:
        if source.type == "fastgpt":
            from fastapi.concurrency import run_in_threadpool

            from app.services.kb_canvas import sync_fastgpt_dataset

            ds_id = str(cfg.get("dataset_id") or "")
            if not ds_id:
                raise ValueError("FastGPT 数据源需要 dataset_id")
            res = await run_in_threadpool(
                sync_fastgpt_dataset, kb.id, ds_id, cfg.get("name") or "")
            created = int(res.get("docs") or 0)

        elif source.type == "local_dir":
            path = cfg.get("path") or ""
            if not os.path.isdir(path):
                raise ValueError(f"目录不存在：{path}")
            for fn in sorted(os.listdir(path)):
                fp = os.path.join(path, fn)
                if not os.path.isfile(fp):
                    continue
                tmp = os.path.join(tmpdir, fn)
                shutil.copy2(fp, tmp)
                did = await create_doc_from_file(
                    db, kb, user_id, tmp, fn, fn, DocSource.local, f"local:{fp}", background)
                created += 1 if did else 0
                skipped += 0 if did else 1

        elif source.type == "canvas":
            base_url = (cfg.get("base_url") or "").rstrip("/")
            token = cfg.get("token") or ""
            course_id = str(cfg.get("course_id") or "")
            if not base_url or not course_id:
                raise ValueError("Canvas 数据源需要 base_url 与 course_id")
            headers = {"Authorization": f"Bearer {token}"} if token else {}
            async with httpx.AsyncClient(timeout=60, follow_redirects=True) as client:
                page, files = 1, []
                while page <= 20:
                    r = await client.get(
                        f"{base_url}/api/v1/courses/{course_id}/files",
                        headers=headers, params={"per_page": 100, "page": page})
                    if r.status_code != 200:
                        raise ValueError(f"Canvas 返回 {r.status_code}: {r.text[:200]}")
                    batch = r.json() or []
                    files.extend(batch)
                    if len(batch) < 100:
                        break
                    page += 1
                for f in files:
                    file_id = f.get("id")
                    name = f.get("display_name") or f.get("filename") or f"canvas-{file_id}"
                    dl = f.get("url")
                    if not dl:
                        continue
                    ref = f"canvas:{course_id}:{file_id}"
                    if (await db.execute(select(KBDocument).where(
                            KBDocument.kb_id == kb.id, KBDocument.source_ref == ref))).scalar_one_or_none():
                        skipped += 1
                        continue
                    rr = await client.get(dl, headers=headers)
                    if rr.status_code != 200:
                        errors.append(f"{name}: HTTP {rr.status_code}")
                        continue
                    tmp = os.path.join(tmpdir, f"{file_id}-{name}")
                    with open(tmp, "wb") as fh:
                        fh.write(rr.content)
                    did = await create_doc_from_file(
                        db, kb, user_id, tmp, name, name, DocSource.canvas, ref, background)
                    created += 1 if did else 0
                    skipped += 0 if did else 1

        else:  # http_json
            url = cfg.get("url") or ""
            if not url:
                raise ValueError("HTTP 数据源需要 url")
            headers = {"Authorization": f"Bearer {cfg['token']}"} if cfg.get("token") else {}
            async with httpx.AsyncClient(timeout=60, follow_redirects=True) as client:
                r = await client.get(url, headers=headers)
                if r.status_code != 200:
                    raise ValueError(f"数据源返回 {r.status_code}")
                data = r.json()
                items = data if isinstance(data, list) else (data.get(cfg.get("items_key") or "items") or [])
                for it in items:
                    if not isinstance(it, dict):
                        continue
                    name = it.get("title") or it.get("name") or "untitled"
                    link = it.get("url") or it.get("file_url")
                    if not link:
                        continue
                    ref = f"http:{it.get('id') or link}"
                    if (await db.execute(select(KBDocument).where(
                            KBDocument.kb_id == kb.id, KBDocument.source_ref == ref))).scalar_one_or_none():
                        skipped += 1
                        continue
                    rr = await client.get(link, headers=headers)
                    if rr.status_code != 200:
                        errors.append(f"{name}: HTTP {rr.status_code}")
                        continue
                    ext = os.path.splitext(name)[1] or ".bin"
                    tmp = os.path.join(tmpdir, f"{uuid.uuid4().hex}{ext}")
                    with open(tmp, "wb") as fh:
                        fh.write(rr.content)
                    did = await create_doc_from_file(
                        db, kb, user_id, tmp, name, name, DocSource.api, ref, background)
                    created += 1 if did else 0
                    skipped += 0 if did else 1

        source.last_sync_at = datetime.utcnow()
        source.last_status = "ok" if not errors else "partial"
        source.last_message = f"新增 {created}，跳过 {skipped}，失败 {len(errors)}" + (
            "；" + "；".join(errors[:3]) if errors else "")
        await db.commit()
        return {"ok": True, "created": created, "skipped": skipped, "errors": errors}
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)
