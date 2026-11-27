from pydantic import BaseModel, EmailStr


class RegisterRequest(BaseModel):
    username: str
    email: str
    password: str
    display_name: str
    real_name: str
    phone: str
    code: str
    student_id: str = ""
    grade: str = ""
    major: str = ""


class LoginRequest(BaseModel):
    username: str = ""
    password: str = ""
    phone: str = ""
    code: str = ""


class SendCodeRequest(BaseModel):
    phone: str
    purpose: str = "register"


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: "UserResponse"


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


class TeamMembershipInfo(BaseModel):
    team_id: int
    team_role: str
    tech_partition_id: int | None = None


class MeResponse(BaseModel):
    """当前用户资料（含所属团队），供 /auth/me 使用。"""
    id: int
    username: str
    email: str
    display_name: str
    real_name: str = ""
    student_id: str | None = None
    grade: str | None = None
    major: str | None = None
    role: str
    phone: str | None = None
    college_id: int | None = None
    team_memberships: list[TeamMembershipInfo] = []


class UserResponse(BaseModel):
    id: int
    username: str
    email: str
    display_name: str
    real_name: str = ""
    student_id: str | None = None
    grade: str | None = None
    major: str | None = None
    role: str
    phone: str | None = None
    college_id: int | None = None

    model_config = {"from_attributes": True}
