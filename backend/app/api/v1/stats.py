from fastapi import APIRouter, Depends
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import User, Team, MediaResource
from app.models.resource import ResourceStatus
from app.utils.dependencies import get_current_user

router = APIRouter(prefix="/stats", tags=["stats"])


@router.get("/overview")
async def overview(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if current_user.role.value != "super_admin":
        return {"error": "仅超级管理员可查看"}

    user_count = (await db.execute(select(func.count(User.id)))).scalar()
    team_count = (await db.execute(select(func.count(Team.id)))).scalar()
    resource_count = (await db.execute(select(func.count(MediaResource.id)))).scalar()
    pending_count = (await db.execute(
        select(func.count(MediaResource.id)).where(
            MediaResource.status.in_([ResourceStatus.pending_review, ResourceStatus.reviewed])
        )
    )).scalar()

    return {
        "user_count": user_count,
        "team_count": team_count,
        "resource_count": resource_count,
        "pending_count": pending_count,
    }


@router.get("/my")
async def my_stats(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    my_resources = (await db.execute(
        select(func.count(MediaResource.id)).where(MediaResource.uploader_id == current_user.id)
    )).scalar()

    return {
        "my_resources": my_resources,
    }
