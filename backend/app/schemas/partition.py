from datetime import datetime

from pydantic import BaseModel


class PartitionCreate(BaseModel):
    name: str
    description: str = ""
    parent_id: int | None = None
    sort_order: int = 0


class PartitionUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    parent_id: int | None = None
    sort_order: int | None = None


class PartitionResponse(BaseModel):
    id: int
    name: str
    description: str
    parent_id: int | None
    sort_order: int
    created_at: datetime
    children: list["PartitionResponse"] = []

    model_config = {"from_attributes": True}
