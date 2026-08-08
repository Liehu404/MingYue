import random
from datetime import datetime, timedelta

from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import User, TeamMember, VerificationCode
from app.models.base import UserRole
from app.schemas.auth import RegisterRequest, UserResponse
from app.utils.security import hash_password, verify_password, create_access_token


def generate_code() -> str:
    return f"{random.randint(0, 999999):06d}"


async def register_user(db: AsyncSession, data: RegisterRequest) -> User:
    # Check existing username/email
    existing = await db.execute(
        select(User).where((User.username == data.username) | (User.email == data.email))
    )
    if existing.scalar_one_or_none():
        raise ValueError("用户名或邮箱已存在")

    # Phone is mandatory — verify not duplicated
    phone_existing = await db.execute(
        select(User).where(User.phone == data.phone)
    )
    if phone_existing.scalar_one_or_none():
        raise ValueError("手机号已被注册")

    # Student ID check if provided
    if data.student_id:
        sid_existing = await db.execute(
            select(User).where(User.student_id == data.student_id)
        )
        if sid_existing.scalar_one_or_none():
            raise ValueError("学号已被注册")

    # Verify phone code (mandatory)
    await verify_phone_code(db, data.phone, data.code, "register")

    user = User(
        username=data.username,
        email=data.email,
        password_hash=hash_password(data.password),
        display_name=data.display_name,
        real_name=data.real_name,
        student_id=data.student_id or None,
        grade=data.grade or None,
        major=data.major or None,
        phone=data.phone,
        role=UserRole.student,
        is_active=False,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


async def send_verification_code(db: AsyncSession, phone: str, purpose: str) -> str:
    # Rate limit: max 1 per minute per phone
    one_min_ago = datetime.utcnow() - timedelta(minutes=1)
    recent = await db.execute(
        select(VerificationCode).where(
            and_(
                VerificationCode.phone == phone,
                VerificationCode.created_at >= one_min_ago,
            )
        )
    )
    if recent.scalar_one_or_none():
        raise ValueError("验证码发送过于频繁，请稍后再试")

    code = generate_code()
    vc = VerificationCode(
        phone=phone,
        code=code,
        purpose=purpose,
        expires_at=datetime.utcnow() + timedelta(minutes=5),
    )
    db.add(vc)
    await db.commit()

    print(f"\n{'='*60}")
    print(f"  📱 验证码: {code}")
    print(f"  手机号: {phone}")
    print(f"  用途: {purpose}")
    print(f"  有效期: 5分钟")
    print(f"{'='*60}\n")

    return code


async def verify_phone_code(db: AsyncSession, phone: str, code: str, purpose: str) -> VerificationCode:
    result = await db.execute(
        select(VerificationCode).where(
            and_(
                VerificationCode.phone == phone,
                VerificationCode.code == code,
                VerificationCode.purpose == purpose,
                VerificationCode.used == False,
                VerificationCode.expires_at > datetime.utcnow(),
            )
        )
    )
    vc = result.scalar_one_or_none()
    if not vc:
        raise ValueError("验证码无效或已过期")

    vc.used = True
    await db.commit()
    return vc


async def authenticate(db: AsyncSession, username: str, password: str) -> dict | None:
    result = await db.execute(select(User).where(User.username == username))
    user = result.scalar_one_or_none()
    if not user or not verify_password(password, user.password_hash):
        return None
    if not user.is_active:
        raise ValueError("账户尚未激活，请等待管理员审核")

    return await _build_token_response(db, user)


async def authenticate_by_phone(db: AsyncSession, phone: str, code: str) -> dict | None:
    await verify_phone_code(db, phone, code, "login")

    result = await db.execute(select(User).where(User.phone == phone))
    user = result.scalar_one_or_none()
    if not user:
        raise ValueError("手机号未注册")
    if not user.is_active:
        raise ValueError("账户尚未激活，请等待管理员审核")

    return await _build_token_response(db, user)


async def _build_token_response(db: AsyncSession, user: User) -> dict:
    token = create_access_token({"sub": str(user.id)})

    memberships = await db.execute(
        select(TeamMember).where(TeamMember.user_id == user.id)
    )
    team_memberships = [
        {"team_id": m.team_id, "team_role": m.team_role.value, "tech_partition_id": m.tech_partition_id}
        for m in memberships.scalars().all()
    ]

    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "phone": user.phone,
            "display_name": user.display_name,
            "real_name": user.real_name,
            "student_id": user.student_id,
            "grade": user.grade,
            "major": user.major,
            "role": user.role.value,
            "college_id": user.college_id,
            "team_memberships": team_memberships,
        },
    }


async def get_user_profile(db: AsyncSession, user: User) -> dict:
    memberships = await db.execute(
        select(TeamMember).where(TeamMember.user_id == user.id)
    )
    team_memberships = [
        {"team_id": m.team_id, "team_role": m.team_role.value, "tech_partition_id": m.tech_partition_id}
        for m in memberships.scalars().all()
    ]

    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "phone": user.phone,
        "display_name": user.display_name,
        "real_name": user.real_name,
        "student_id": user.student_id,
        "grade": user.grade,
        "major": user.major,
        "role": user.role.value,
        "college_id": user.college_id,
        "team_memberships": team_memberships,
    }
