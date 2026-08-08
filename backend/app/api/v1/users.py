from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import User
from app.models.base import UserRole
from app.utils.dependencies import get_current_user

router = APIRouter(prefix="/users", tags=["users"])


@router.get("")
async def list_users(
    role: str | None = None,
    college_id: int | None = None,
    is_active: bool | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if current_user.role.value != "super_admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="仅超级管理员可操作")

    query = select(User)
    if role:
        query = query.where(User.role == UserRole(role))
    if college_id:
        query = query.where(User.college_id == college_id)
    if is_active is not None:
        query = query.where(User.is_active == is_active)
    result = await db.execute(query.order_by(User.id))
    users = result.scalars().all()
    return [
        {
            "id": u.id, "username": u.username, "email": u.email,
            "display_name": u.display_name, "role": u.role.value,
            "phone": u.phone,
            "college_id": u.college_id, "is_active": u.is_active,
        }
        for u in users
    ]


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_user(
    data: dict,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if current_user.role.value != "super_admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="仅超级管理员可操作")

    from app.utils.security import hash_password
    existing = await db.execute(
        select(User).where((User.username == data["username"]) | (User.email == data.get("email", "")))
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="用户名或邮箱已存在")

    user = User(
        username=data["username"],
        email=data.get("email", ""),
        password_hash=hash_password(data.get("password", "123456")),
        display_name=data.get("display_name", data["username"]),
        role=UserRole(data.get("role", "student")),
        college_id=data.get("college_id"),
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return {"id": user.id, "username": user.username, "display_name": user.display_name, "role": user.role.value}


@router.get("/{user_id}")
async def get_user(
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="用户不存在")
    return {
        "id": user.id, "username": user.username, "email": user.email,
        "display_name": user.display_name, "role": user.role.value,
        "college_id": user.college_id, "is_active": user.is_active,
    }


@router.put("/{user_id}")
async def update_user(
    user_id: int,
    data: dict,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if current_user.role.value != "super_admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="仅超级管理员可操作")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="用户不存在")

    for key in ["display_name", "email", "college_id"]:
        if key in data:
            setattr(user, key, data[key])
    if "role" in data:
        user.role = UserRole(data["role"])
    if "is_active" in data:
        user.is_active = data["is_active"]

    await db.commit()
    return {"message": "更新成功"}


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def deactivate_user(
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if current_user.role.value != "super_admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="仅超级管理员可操作")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="用户不存在")
    user.is_active = False
    await db.commit()


@router.put("/{user_id}/approve")
async def approve_user(
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if current_user.role.value != "super_admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="仅超级管理员可操作")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="用户不存在")
    if user.is_active:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="用户已激活")

    user.is_active = True
    await db.commit()
    return {"message": f"用户 {user.display_name} 已通过审核"}
