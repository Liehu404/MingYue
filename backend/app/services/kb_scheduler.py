"""定时自动同步调度器（随 FastAPI lifespan 启动）"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime

from sqlalchemy import select

from app.database import async_session
from app.models.kb import KBDataSource, KnowledgeBase
from app.services.kb_canvas import maybe_auto_sync
from app.services.kb_sync import sync_source

log = logging.getLogger("mingyue.kb.scheduler")
TICK_SECONDS = 60
CANVAS_INTERVAL_SEC = 1800  # Windows 跳板在线时，每 30 分钟自动同步一次 Canvas


async def _tick() -> None:
    async with async_session() as db:
        rows = (await db.execute(
            select(KBDataSource).where(
                KBDataSource.auto_sync == True,  # noqa: E712
                KBDataSource.enabled == True,    # noqa: E712
            )
        )).scalars().all()
        now = datetime.utcnow()
        for s in rows:
            interval = max(5, int(s.sync_interval_min or 60)) * 60
            if s.last_sync_at and (now - s.last_sync_at).total_seconds() < interval:
                continue
            # 先占位，避免多 worker 同时拉同一个数据源
            s.last_sync_at = now
            s.last_status = "syncing"
            await db.commit()
            kb = await db.get(KnowledgeBase, s.kb_id)
            if not kb or not kb.is_active:
                continue
            try:
                res = await sync_source(db, s, kb, None, None)
                log.info("auto-sync source=%s kb=%s created=%s skipped=%s",
                         s.id, kb.id, res.get("created"), res.get("skipped"))
            except Exception as e:  # noqa: BLE001
                log.warning("auto-sync failed source=%s: %s", s.id, e)
                await db.rollback()
                s2 = await db.get(KBDataSource, s.id)
                if s2:
                    s2.last_status = "error"
                    s2.last_message = f"{type(e).__name__}: {e}"[:300]
                    s2.last_sync_at = datetime.utcnow()
                    await db.commit()


async def _maybe_canvas() -> None:
    """Windows 反向隧道在线时自动同步 Canvas；离线则静默跳过。"""
    from fastapi.concurrency import run_in_threadpool

    try:
        res = await run_in_threadpool(maybe_auto_sync, CANVAS_INTERVAL_SEC)
        if res:
            log.info("canvas auto-sync done: %s", res)
    except Exception as e:  # noqa: BLE001
        log.warning("canvas auto-sync failed: %s", e)


async def scheduler_loop(stop_event: asyncio.Event) -> None:
    while not stop_event.is_set():
        try:
            await _tick()
        except Exception:  # noqa: BLE001
            log.exception("scheduler tick failed")
        await _maybe_canvas()
        try:
            await asyncio.wait_for(stop_event.wait(), timeout=TICK_SECONDS)
        except asyncio.TimeoutError:
            pass
