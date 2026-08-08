from datetime import datetime

from pydantic import BaseModel


class CollegeCreate(BaseModel):
    name: str
    description: str = ""


class CollegeUpdate(BaseModel):
    name: str | None = None
    description: str | None = None


class CollegeResponse(BaseModel):
    id: int
    name: str
    description: str
    created_at: datetime

    model_config = {"from_attributes": True}
