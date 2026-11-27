"""站点配置接口：各页面背景配图等。

背景：管理端「图片素材 → 区域配置」原先只把结果写进浏览器的 localStorage，
访客根本看不到，换台电脑/清缓存就丢。这里补一个真正的服务端存储，
让配置全站生效。

- GET  /site-config   公开读（访客端渲染背景需要）
- PUT  /site-config   仅超管写

数据管理：写入时会把仍然指向 uploads/temp/ 的图片归档到 uploads/site/，
返回的 URL 同步改写，避免临时目录无限堆积。
"""
import json
import os
import shutil
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models import User
from app.models.base import SiteConfig
from app.utils.dependencies import get_current_user

router = APIRouter(prefix="/site-config", tags=["site-config"])

KEY = "backgrounds"
ARCHIVE_SUBDIR = "site"


async def _read(db: AsyncSession) -> dict:
    res = await db.execute(select(SiteConfig).where(SiteConfig.key == KEY))
    row = res.scalar_one_or_none()
    if not row or not row.value:
        return {"backgrounds": {}, "images": []}
    try:
        data = json.loads(row.value)
    except Exception:
        return {"backgrounds": {}, "images": []}
    if not isinstance(data, dict):
        return {"backgrounds": {}, "images": []}
    data.setdefault("backgrounds", {})
    data.setdefault("images", [])
    return data


def _archive_temp_url(url: str, cache: dict | None = None) -> str:
    """把 /uploads/temp/xxx 归档到 /uploads/site/xxx，返回新 URL。

    cache: 单次请求内的 原URL -> 新URL 映射，保证同一张图被背景与图片库
    同时引用时都指向归档后的同一个文件。
    """
    if not isinstance(url, str) or "/uploads/temp/" not in url:
        return url
    cache = cache if cache is not None else {}
    if url in cache:
        return cache[url]
    rel = url.split("/uploads/", 1)[-1]          # temp/xxx.png
    src = os.path.join(settings.UPLOAD_DIR, rel)
    if not os.path.isfile(src):
        return url
    ext = os.path.splitext(rel)[1]
    new_rel = f"{ARCHIVE_SUBDIR}/{uuid.uuid4().hex}{ext}"
    dest = os.path.join(settings.UPLOAD_DIR, new_rel)
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    try:
        shutil.move(src, dest)
    except Exception:
        return url
    new_url = "/uploads/" + new_rel
    cache[url] = new_url
    return new_url


def _normalize_images(raw, cache: dict | None = None) -> list:
    out = []
    if not isinstance(raw, list):
        return out
    for item in raw[:200]:
        if not isinstance(item, dict):
            continue
        url = _archive_temp_url(str(item.get("url", "")), cache)
        if not url:
            continue
        out.append({
            "id": str(item.get("id") or uuid.uuid4().hex),
            "url": url,
            "name": str(item.get("name") or os.path.basename(url))[:200],
            "size": int(item.get("size") or 0),
            "uploadedAt": item.get("uploadedAt") or "",
        })
    return out


def _normalize_backgrounds(raw, cache: dict | None = None) -> dict:
    out = {}
    if not isinstance(raw, dict):
        return out
    for k, v in list(raw.items())[:50]:
        if not isinstance(k, str) or not k:
            continue
        if not v:
            continue
        out[k[:64]] = _archive_temp_url(str(v), cache)
    return out


@router.get("")
async def get_site_config(db: AsyncSession = Depends(get_db)):
    return await _read(db)


@router.put("")
async def update_site_config(
    data: dict,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if current_user.role.value != "super_admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="仅超级管理员可操作")

    cache = {}
    payload = {
        "backgrounds": _normalize_backgrounds(data.get("backgrounds"), cache),
        "images": _normalize_images(data.get("images"), cache),
    }
    res = await db.execute(select(SiteConfig).where(SiteConfig.key == KEY))
    row = res.scalar_one_or_none()
    if row is None:
        row = SiteConfig(key=KEY, value=json.dumps(payload, ensure_ascii=False))
        db.add(row)
    else:
        row.value = json.dumps(payload, ensure_ascii=False)
    await db.commit()
    return {"message": "站点配置已保存", **payload}
