from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models import User, Team, MediaResource, Review, Urge
from app.models.resource import ResourceStatus, ReviewDecision
from app.utils.dependencies import get_current_user

router = APIRouter(prefix="/reviews", tags=["reviews"])


@router.get("/pending")
async def pending_reviews(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get resources pending review for the current user."""
    if current_user.role.value not in ("super_admin", "advisor_teacher"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无审核权限")

    if current_user.role.value == "super_admin":
        # Admin sees both regular and admin review queues
        query = select(MediaResource).where(
            MediaResource.status.in_([ResourceStatus.pending_review, ResourceStatus.reviewed])
        ).options(
            selectinload(MediaResource.uploader),
            selectinload(MediaResource.urges),
        )
    else:
        # Advisor sees only their teams' pending resources
        team_ids_subq = select(Team.id).where(Team.advisor_teacher_id == current_user.id)
        query = select(MediaResource).where(
            MediaResource.team_id.in_(team_ids_subq),
            MediaResource.status == ResourceStatus.pending_review,
        ).options(
            selectinload(MediaResource.uploader),
            selectinload(MediaResource.urges),
        )

    result = await db.execute(query.order_by(MediaResource.created_at.desc()))
    resources = result.unique().scalars().all()

    return [
        {
            "id": r.id,
            "title": r.title,
            "resource_type": r.resource_type.value,
            "status": r.status.value,
            "uploader": {"id": r.uploader.id, "display_name": r.uploader.display_name} if r.uploader else None,
            "urge_count": len(r.urges),
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in resources
    ]


@router.post("")
async def submit_review(
    data: dict,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    resource_id = data.get("resource_id")
    decision = data.get("decision")  # "approved" or "rejected"
    comment = data.get("comment", "")

    result = await db.execute(select(MediaResource).where(MediaResource.id == resource_id))
    resource = result.scalar_one_or_none()
    if not resource:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="资源不存在")

    # Determine review type
    if current_user.role.value == "super_admin":
        if resource.status == ResourceStatus.reviewed:
            review_type = "admin"
        elif resource.status == ResourceStatus.pending_review:
            review_type = "regular"
        else:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="当前状态不可审核")
    elif current_user.role.value == "advisor_teacher":
        if resource.status != ResourceStatus.pending_review:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="当前状态不可审核")
        # Check advisor manages this team
        team = await db.execute(select(Team).where(Team.id == resource.team_id))
        team_obj = team.scalar_one_or_none()
        if not team_obj or team_obj.advisor_teacher_id != current_user.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="您不管理该战队")
        review_type = "regular"
    else:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无审核权限")

    review = Review(
        resource_id=resource_id,
        reviewer_id=current_user.id,
        review_type=review_type,
        decision=ReviewDecision(decision),
        comment=comment,
    )
    db.add(review)

    if decision == "approved":
        if review_type == "admin":
            resource.status = ResourceStatus.published
        else:
            resource.status = ResourceStatus.reviewed
    else:
        resource.status = ResourceStatus.rejected

    resource.review_comment = comment
    await db.commit()
    return {"message": "审核完成", "review_type": review_type}


@router.get("/reports")
async def list_reports(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if current_user.role.value != "super_admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="仅超级管理员可操作")

    from app.models import Report
    result = await db.execute(
        select(Report).options(
            selectinload(Report.resource),
        ).order_by(Report.created_at.desc())
    )
    reports = result.unique().scalars().all()
    return [
        {
            "id": r.id,
            "resource": {"id": r.resource.id, "title": r.resource.title} if r.resource else None,
            "reason": r.reason,
            "status": r.status,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in reports
    ]


@router.put("/reports/{report_id}/resolve")
async def resolve_report(
    report_id: int,
    data: dict,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if current_user.role.value != "super_admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="仅超级管理员可操作")

    from app.models import Report
    from datetime import datetime
    result = await db.execute(select(Report).where(Report.id == report_id))
    report = result.scalar_one_or_none()
    if not report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="举报不存在")

    report.status = data.get("status", "resolved")
    report.resolved_by = current_user.id
    report.resolved_at = datetime.utcnow()
    await db.commit()
    return {"message": "处理完成"}
