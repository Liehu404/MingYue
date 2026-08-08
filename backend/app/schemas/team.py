from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class TeamCreate(BaseModel):
    name: str
    description: str = ""
    college_id: int
    advisor_teacher_id: int
    avatar_url: str = ""
    tags: str = ""
    category: str = ""


class TeamUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    advisor_teacher_id: int | None = None
    avatar_url: str | None = None
    tags: str | None = None
    category: str | None = None


class TeamMemberAdd(BaseModel):
    user_id: int
    team_role: str = "student"
    tech_partition_id: int | None = None
    position_title: str | None = None
    parent_member_id: int | None = None


class TeamMemberUpdate(BaseModel):
    team_role: str | None = None
    tech_partition_id: int | None = None
    position_title: str | None = None
    parent_member_id: int | None = None


class TeamMemberResponse(BaseModel):
    id: int
    team_id: int
    user_id: int
    team_role: str
    tech_partition_id: int | None = None
    position_title: str | None = None
    parent_member_id: int | None = None
    joined_at: datetime
    user: dict | None = None

    model_config = {"from_attributes": True}


class DecorationSettings(BaseModel):
    """Per-team customization settings stored as JSON."""
    hero_bg_url: Optional[str] = None
    accent_color: Optional[str] = None
    font_family: Optional[str] = None
    bg_pattern: Optional[str] = None
    glass_intensity: Optional[str] = None
    text_shadow: Optional[str] = None
    section_bg_color: Optional[str] = None


class TeamDecorationUpdate(BaseModel):
    decoration: DecorationSettings


class RoleDefinitionItem(BaseModel):
    """Custom display override for a system role."""
    label: str
    color: str


class RoleDefinitionsUpdate(BaseModel):
    """Request body for updating team role definitions. Keys must be one of: captain, pm, tech_lead, student."""
    role_definitions: dict[str, RoleDefinitionItem]


class TeamResponse(BaseModel):
    id: int
    name: str
    description: str
    college_id: int
    advisor_teacher_id: int
    avatar_url: str = ""
    tags: str = ""
    category: str = ""
    created_at: datetime
    updated_at: datetime | None = None
    members: list[TeamMemberResponse] = []
    decoration: Optional[dict] = None
    role_definitions: Optional[dict] = None

    model_config = {"from_attributes": True}
