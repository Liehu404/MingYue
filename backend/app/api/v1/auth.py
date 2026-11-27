import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models import User
from app.schemas.auth import RegisterRequest, LoginRequest, SendCodeRequest, TokenResponse, UserResponse, MeResponse, ChangePasswordRequest
from app.services.auth_service import (
    register_user, authenticate, authenticate_by_phone, get_user_profile,
    send_verification_code, sso_login, SSOConflictError, SSOInactiveError,
)
from app.utils.dependencies import get_current_user
from app.utils.security import hash_password, verify_password

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


@router.post("/sso")
async def sso(request: Request, db: AsyncSession = Depends(get_db)):
    """用主站 Flask session 单点登录学术平台。

    浏览器与主站同域，请求会带上主站 session cookie；本接口只把 Cookie
    转发给同机主站的 /get_session，不保存、不记录 Cookie。
    """
    if not settings.SSO_ENABLED:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="单点登录暂时关闭")

    cookie = request.headers.get("cookie")
    if not cookie:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"message": "未登录主站", "login_url": "/login"},
        )

    try:
        async with httpx.AsyncClient(timeout=5, trust_env=False) as client:
            resp = await client.get(settings.MODEL_SESSION_URL, headers={"Cookie": cookie})
        session = resp.json() if resp.status_code == 200 else {}
    except Exception:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="主站会话服务不可用")

    username = session.get("username") if isinstance(session, dict) else None
    if not username:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"message": "未登录主站", "login_url": "/login"},
        )

    try:
        return await sso_login(
            db,
            username=str(username),
            role=str(session.get("role") or "student"),
            sis_id=str(session.get("sis_id") or ""),
        )
    except SSOConflictError as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e))
    except SSOInactiveError as e:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e))


@router.get("/me", response_model=MeResponse)
async def get_me(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await get_user_profile(db, current_user)


@router.post("/change-password")
async def change_password(
    data: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """修改当前用户密码（前端个人中心使用）。"""
    if not verify_password(data.current_password, current_user.password_hash):
        raise HTTPException(status_code=400, detail="当前密码不正确")
    if len(data.new_password or "") < 6:
        raise HTTPException(status_code=400, detail="新密码长度不能少于6位")
    current_user.password_hash = hash_password(data.new_password)
    db.add(current_user)
    await db.commit()
    return {"message": "密码修改成功"}
