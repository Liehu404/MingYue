from abc import ABC, abstractmethod


class StorageBackend(ABC):
    @abstractmethod
    async def save(self, file_data: bytes, path: str) -> str:
        ...

    @abstractmethod
    async def delete(self, path: str) -> bool:
        ...

    @abstractmethod
    def get_url(self, path: str) -> str:
        ...
