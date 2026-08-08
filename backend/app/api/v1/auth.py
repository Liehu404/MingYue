from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import User
from app.schemas.auth import RegisterRequest, LoginRequest, SendCodeRequest, TokenResponse, UserResponse
from app.services.auth_service import (
    register_user, authenticate, authenticate_by_phone, get_user_profile,
    send_verification_code,
)
from app.utils.dependencies import get_current_user

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", status_code=status.HTTP_201_CREATED)
async def register(data: RegisterRequest, db: AsyncSession = Depends(get_db)):
    try:
        user = await register_user(db, data)
        return {
            "message": "注册成功，请等待管理员审核",
            "user": {
                "id": user.id,
                "username": user.username,
                "email": user.email,
                "phone": user.phone,
                "display_name": user.display_name,
                "role": user.role.value,
                "college_id": user.college_id,
            },
        }
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e))


@router.post("/send-code")
async def send_code(data: SendCodeRequest, db: AsyncSession = Depends(get_db)):
    # Basic phone validation (China mainland: 11 digits starting with 1)
    phone = data.phone.strip()
    if not phone.isdigit() or len(phone) != 11 or not phone.startswith("1"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="请输入有效的手机号")

    if data.purpose not in ("register", "login"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="无效的验证码用途")

    try:
        code = await send_verification_code(db, phone, data.purpose)
        return {"message": "验证码已发送", "code": code}
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=str(e))


@router.post("/login", response_model=TokenResponse)
async def login(data: LoginRequest, db: AsyncSession = Depends(get_db)):
    try:
        # phone+code login
        if data.phone and data.code:
            result = await authenticate_by_phone(db, data.phone, data.code)
        elif data.username and data.password:
            result = await authenticate(db, data.username, data.password)
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="请提供用户名+密码 或 手机号+验证码",
            )

        if not result:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="用户名或密码错误")
        return result
    except ValueError as e:
        msg = str(e)
        if "尚未激活" in msg:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=msg)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=msg)


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await get_user_profile(db, current_user)
