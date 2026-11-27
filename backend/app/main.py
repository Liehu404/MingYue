from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import select

from app.api.v1 import router as v1_router
from app.config import settings
from app.database import init_db, async_session
from app.models.base import User, UserRole
from app.utils.security import hash_password


async def seed_super_admin():
    async with async_session() as db:
        result = await db.execute(select(User).where(User.role == UserRole.super_admin))
        if result.scalar_one_or_none() is None:
            admin = User(
                username="admin",
                email="admin@mingyue.com",
                password_hash=hash_password("admin123"),
                display_name="超级管理员",
                role=UserRole.super_admin,
            )
            db.add(admin)
            await db.commit()


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    await seed_super_admin()

    # 数据管理：数据源自动同步调度器（可通过 KB_SCHEDULER_ENABLED 关闭）
    import asyncio
    stop_event = asyncio.Event()
    scheduler_task = None
    if settings.KB_SCHEDULER_ENABLED:
        from app.services.kb_scheduler import scheduler_loop
        scheduler_task = asyncio.create_task(scheduler_loop(stop_event))
    try:
        yield
    finally:
        stop_event.set()
        if scheduler_task is not None:
            scheduler_task.cancel()


app = FastAPI(title="明月学术交流平台", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(v1_router)

import os
os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=settings.UPLOAD_DIR), name="uploads")


@app.get("/api/health")
async def health_check():
    return {"status": "ok", "version": "0.1.0"}
