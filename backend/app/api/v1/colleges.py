from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import User, College
from app.schemas.college import CollegeCreate, CollegeUpdate, CollegeResponse
from app.utils.dependencies import get_current_user

router = APIRouter(prefix="/colleges", tags=["colleges"])


@router.get("", response_model=list[CollegeResponse])
async def list_colleges(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(College).order_by(College.id))
    return result.scalars().all()


@router.post("", response_model=CollegeResponse, status_code=status.HTTP_201_CREATED)
async def create_college(
    data: CollegeCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if current_user.role.value != "super_admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="仅超级管理员可操作")
    college = College(**data.model_dump())
    db.add(college)
    await db.commit()
    await db.refresh(college)
    return college


@router.get("/{college_id}", response_model=CollegeResponse)
async def get_college(college_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(College).where(College.id == college_id))
    college = result.scalar_one_or_none()
    if not college:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="学院不存在")
    return college


@router.put("/{college_id}", response_model=CollegeResponse)
async def update_college(
    college_id: int,
    data: CollegeUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if current_user.role.value != "super_admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="仅超级管理员可操作")
    result = await db.execute(select(College).where(College.id == college_id))
    college = result.scalar_one_or_none()
    if not college:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="学院不存在")
    for key, val in data.model_dump(exclude_unset=True).items():
        setattr(college, key, val)
    await db.commit()
    await db.refresh(college)
    return college


@router.delete("/{college_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_college(
    college_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if current_user.role.value != "super_admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="仅超级管理员可操作")
    result = await db.execute(select(College).where(College.id == college_id))
    college = result.scalar_one_or_none()
    if not college:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="学院不存在")
    await db.delete(college)
    await db.commit()
