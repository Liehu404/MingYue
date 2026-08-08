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
