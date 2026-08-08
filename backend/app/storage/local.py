import os

import aiofiles

from app.config import settings
from app.storage.base import StorageBackend


class LocalStorage(StorageBackend):
    def __init__(self):
        os.makedirs(settings.UPLOAD_DIR, exist_ok=True)

    def _full_path(self, path: str) -> str:
        return os.path.join(settings.UPLOAD_DIR, path)

    async def save(self, file_data: bytes, path: str) -> str:
        full_path = self._full_path(path)
        os.makedirs(os.path.dirname(full_path), exist_ok=True)
        async with aiofiles.open(full_path, "wb") as f:
            await f.write(file_data)
        return path

    async def delete(self, path: str) -> bool:
        full_path = self._full_path(path)
        if os.path.exists(full_path):
            os.remove(full_path)
            return True
        return False

    def get_url(self, path: str) -> str:
        return f"/uploads/{path}"


local_storage = LocalStorage()
