from datetime import datetime

from pydantic import BaseModel, field_validator


class CollegeCreate(BaseModel):
    name: str
    description: str = ""


class CollegeUpdate(BaseModel):
    name: str | None = None
    description: str | None = None


class CollegeResponse(BaseModel):
    id: int
    name: str
    description: str = ""
    created_at: datetime

    model_config = {"from_attributes": True}

    @field_validator("description", mode="before")
    @classmethod
    def _coerce_description(cls, v):
        # 历史数据中可能存在 NULL，避免因此导致整个接口 500
        return "" if v is None else v
