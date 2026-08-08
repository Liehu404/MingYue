from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models import User, Team, TeamMember, TeamJoinRequest, Notice
from app.models.base import TeamRole
from app.schemas.team import (
    TeamCreate, TeamUpdate, TeamResponse,
    TeamMemberAdd, TeamMemberUpdate, TeamMemberResponse,
    TeamDecorationUpdate,
)
from app.utils.dependencies import get_current_user

router = APIRouter(prefix="/teams", tags=["teams"])


async def _get_team_or_404(db: AsyncSession, team_id: int) -> Team:
    result = await db.execute(
        select(Team).where(Team.id == team_id).options(
            selectinload(Team.members).selectinload(TeamMember.user)
        )
    )
    team = result.scalar_one_or_none()
    if not team:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="战队不存在")
    return team


@router.get("")
async def list_teams(
    college_id: int | None = None,
    db: AsyncSession = Depends(get_db),
):
    query = select(Team).options(
        selectinload(Team.members).selectinload(TeamMember.user)
    )
    if college_id:
        query = query.where(Team.college_id == college_id)
    result = await db.execute(query.order_by(Team.id))
    teams = result.unique().scalars().all()
    return [
        {
            "id": t.id, "name": t.name, "description": t.description,
            "college_id": t.college_id, "advisor_teacher_id": t.advisor_teacher_id,
            "avatar_url": t.avatar_url or "", "tags": t.tags or "",
            "category": t.category or "",
            "decoration": t.decoration,
            "created_at": t.created_at.isoformat() if t.created_at else None,
            "updated_at": t.updated_at.isoformat() if t.updated_at else None,
            "members": [
                {
                    "id": m.id, "team_id": m.team_id, "user_id": m.user_id,
                    "team_role": m.team_role.value,
                    "tech_partition_id": m.tech_partition_id,
                    "position_title": m.position_title or "",
                    "parent_member_id": m.parent_member_id,
                    "joined_at": m.joined_at.isoformat() if m.joined_at else None,
                    "user": {
                        "id": m.user.id, "username": m.user.username,
                        "display_name": m.user.display_name,
                        "role": m.user.role.value,
                    } if m.user else None,
                }
                for m in t.members
            ],
        }
        for t in teams
    ]


@router.get("/overview")
async def team_overview(db: AsyncSession = Depends(get_db)):
    """Return per-team statistics for the overview dashboard."""
    from sqlalchemy import func as sqlfunc
    from app.models.resource import MediaResource

    teams_result = await db.execute(
        select(Team).options(selectinload(Team.members).selectinload(TeamMember.user))
    )
    teams = teams_result.unique().scalars().all()

    from datetime import datetime as dt, timedelta
    thirty_days_ago = dt.utcnow() - timedelta(days=30)

    # Total counts
    total_teams = len(teams)
    total_members = sum(len(t.members or []) for t in teams)

    total_resources_result = await db.execute(select(sqlfunc.count(MediaResource.id)))
    total_resources = total_resources_result.scalar() or 0

    recent_uploads_result = await db.execute(
        select(sqlfunc.count(MediaResource.id)).where(
            MediaResource.created_at >= thirty_days_ago
        )
    )
    recent_uploads = recent_uploads_result.scalar() or 0

    # Per-team breakdown
    team_stats = []
    for t in teams:
        members = t.members or []

        # Role breakdown for this team
        role_counts: dict[str, int] = {}
        for m in members:
            role = m.team_role.value
            role_counts[role] = role_counts.get(role, 0) + 1

        # Resource uploads for this team (30 days + all time)
        recent_team_uploads = await db.execute(
            select(sqlfunc.count(MediaResource.id)).where(
                MediaResource.team_id == t.id,
                MediaResource.created_at >= thirty_days_ago,
            )
        )
        total_team_uploads = await db.execute(
            select(sqlfunc.count(MediaResource.id)).where(
                MediaResource.team_id == t.id,
            )
        )

        # Notice count for this team (30 days)
        recent_team_notices = await db.execute(
            select(sqlfunc.count(Notice.id)).where(
                Notice.team_id == t.id,
                Notice.created_at >= thirty_days_ago,
            )
        )

        team_stats.append({
            "team_id": t.id,
            "team_name": t.name,
            "description": t.description or "",
            "category": t.category or "",
            "tags": t.tags or "",
            "member_count": len(members),
            "role_distribution": role_counts,
            "recent_uploads": recent_team_uploads.scalar() or 0,
            "total_uploads": total_team_uploads.scalar() or 0,
            "recent_notices": recent_team_notices.scalar() or 0,
        })

    return {
        "total_teams": total_teams,
        "total_members": total_members,
        "total_resources": total_resources,
        "recent_uploads": recent_uploads,
        "team_stats": team_stats,
    }


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_team(
    data: TeamCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if current_user.role.value != "super_admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="仅超级管理员可操作")

    team = Team(**data.model_dump())
    db.add(team)
    await db.commit()
    await db.refresh(team)
    return {
        "id": team.id, "name": team.name, "description": team.description,
        "college_id": team.college_id, "advisor_teacher_id": team.advisor_teacher_id,
        "avatar_url": team.avatar_url or "", "tags": team.tags or "",
        "category": team.category or "",
        "decoration": team.decoration,
        "created_at": team.created_at.isoformat(),
        "updated_at": team.updated_at.isoformat() if team.updated_at else None,
        "members": [],
    }


@router.get("/{team_id}")
async def get_team(team_id: int, db: AsyncSession = Depends(get_db)):
    team = await _get_team_or_404(db, team_id)
    return {
        "id": team.id, "name": team.name, "description": team.description,
        "college_id": team.college_id, "advisor_teacher_id": team.advisor_teacher_id,
        "avatar_url": team.avatar_url or "", "tags": team.tags or "",
        "category": team.category or "",
        "decoration": team.decoration,
        "created_at": team.created_at.isoformat() if team.created_at else None,
        "updated_at": team.updated_at.isoformat() if team.updated_at else None,
        "members": [
            {
                "id": m.id, "team_id": m.team_id, "user_id": m.user_id,
                "team_role": m.team_role.value,
                "tech_partition_id": m.tech_partition_id,
                "position_title": m.position_title or "",
                "parent_member_id": m.parent_member_id,
                "joined_at": m.joined_at.isoformat() if m.joined_at else None,
                "user": {
                    "id": m.user.id, "username": m.user.username,
                    "display_name": m.user.display_name,
                    "role": m.user.role.value,
                } if m.user else None,
            }
            for m in team.members
        ],
    }


@router.put("/{team_id}", response_model=TeamResponse)
async def update_team(
    team_id: int,
    data: TeamUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    team = await _get_team_or_404(db, team_id)

    is_admin = current_user.role.value == "super_admin"
    is_advisor = team.advisor_teacher_id == current_user.id
    member_result = await db.execute(
        select(TeamMember).where(
            TeamMember.team_id == team_id,
            TeamMember.user_id == current_user.id,
        )
    )
    member = member_result.scalar_one_or_none()
    is_captain_or_pm = member and member.team_role.value in ("captain", "pm")

    if not (is_admin or is_advisor or is_captain_or_pm):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权限")

    for key, val in data.model_dump(exclude_unset=True).items():
        setattr(team, key, val)
    await db.commit()
    await db.refresh(team)
    return team


@router.get("/{team_id}/decoration")
async def get_team_decoration(team_id: int, db: AsyncSession = Depends(get_db)):
    """Get a team's decoration settings. Public endpoint."""
    team = await _get_team_or_404(db, team_id)
    return team.decoration or {}


@router.put("/{team_id}/decoration")
async def update_team_decoration(
    team_id: int,
    data: TeamDecorationUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update a team's decoration settings. Requires captain/PM/admin/advisor permission."""
    team = await _get_team_or_404(db, team_id)

    is_admin = current_user.role.value == "super_admin"
    is_advisor = team.advisor_teacher_id == current_user.id
    member_result = await db.execute(
        select(TeamMember).where(
            TeamMember.team_id == team_id,
            TeamMember.user_id == current_user.id,
        )
    )
    member = member_result.scalar_one_or_none()
    is_captain_or_pm = member and member.team_role.value in ("captain", "pm")

    if not (is_admin or is_advisor or is_captain_or_pm):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权限")

    # Merge with existing decoration to allow partial updates
    existing = team.decoration or {}
    existing.update(data.decoration.model_dump(exclude_none=True))
    team.decoration = existing
    await db.commit()
    return {"message": "装饰设置已保存", "decoration": team.decoration}


@router.delete("/{team_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_team(
    team_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if current_user.role.value != "super_admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="仅超级管理员可操作")
    team = await _get_team_or_404(db, team_id)
    await db.delete(team)
    await db.commit()


# Team Members
@router.get("/{team_id}/members", response_model=list[TeamMemberResponse])
async def list_team_members(team_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(TeamMember).where(TeamMember.team_id == team_id).options(selectinload(TeamMember.user))
    )
    members = result.scalars().all()
    return [
        {
            "id": m.id, "team_id": m.team_id, "user_id": m.user_id,
            "team_role": m.team_role.value,
            "tech_partition_id": m.tech_partition_id,
            "position_title": m.position_title or "",
            "parent_member_id": m.parent_member_id,
            "joined_at": m.joined_at,
            "user": {
                "id": m.user.id, "username": m.user.username,
                "display_name": m.user.display_name, "role": m.user.role.value,
            } if m.user else None,
        }
        for m in members
    ]


@router.post("/{team_id}/members", status_code=status.HTTP_201_CREATED)
async def add_team_member(
    team_id: int,
    data: TeamMemberAdd,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    team = await _get_team_or_404(db, team_id)
    is_admin = current_user.role.value == "super_admin"
    is_advisor = team.advisor_teacher_id == current_user.id
    member_result = await db.execute(
        select(TeamMember).where(
            TeamMember.team_id == team_id,
            TeamMember.user_id == current_user.id,
        )
    )
    member = member_result.scalar_one_or_none()
    can_manage = is_admin or is_advisor or (member and member.team_role.value in ("captain", "pm"))
    if not can_manage:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权限")

    existing = await db.execute(
        select(TeamMember).where(
            TeamMember.team_id == team_id,
            TeamMember.user_id == data.user_id,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="该用户已在战队中")

    tm = TeamMember(
        team_id=team_id,
        user_id=data.user_id,
        team_role=TeamRole(data.team_role),
        tech_partition_id=data.tech_partition_id,
        position_title=data.position_title,
        parent_member_id=data.parent_member_id,
    )
    db.add(tm)
    await db.commit()
    await db.refresh(tm)
    return tm


@router.put("/{team_id}/members/{user_id}")
async def update_team_member(
    team_id: int,
    user_id: int,
    data: TeamMemberUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    team = await _get_team_or_404(db, team_id)
    is_admin = current_user.role.value == "super_admin"
    is_advisor = team.advisor_teacher_id == current_user.id
    member_result = await db.execute(
        select(TeamMember).where(
            TeamMember.team_id == team_id,
            TeamMember.user_id == current_user.id,
        )
    )
    member = member_result.scalar_one_or_none()
    can_manage = is_admin or is_advisor or (member and member.team_role.value in ("captain", "pm"))
    if not can_manage:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权限")

    target = await db.execute(
        select(TeamMember).where(
            TeamMember.team_id == team_id,
            TeamMember.user_id == user_id,
        )
    )
    tm = target.scalar_one_or_none()
    if not tm:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="成员不存在")

    if data.team_role:
        tm.team_role = TeamRole(data.team_role)
    if data.tech_partition_id is not None:
        tm.tech_partition_id = data.tech_partition_id
    if data.position_title is not None:
        tm.position_title = data.position_title
    if data.parent_member_id is not None:
        tm.parent_member_id = data.parent_member_id
    await db.commit()
    return {"message": "更新成功"}


@router.delete("/{team_id}/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_team_member(
    team_id: int,
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    team = await _get_team_or_404(db, team_id)
    is_admin = current_user.role.value == "super_admin"
    is_advisor = team.advisor_teacher_id == current_user.id
    member_result = await db.execute(
        select(TeamMember).where(
            TeamMember.team_id == team_id,
            TeamMember.user_id == current_user.id,
        )
    )
    member = member_result.scalar_one_or_none()
    can_manage = is_admin or is_advisor or (member and member.team_role.value in ("captain", "pm"))
    if not can_manage:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权限")

    target = await db.execute(
        select(TeamMember).where(
            TeamMember.team_id == team_id,
            TeamMember.user_id == user_id,
        )
    )
    tm = target.scalar_one_or_none()
    if not tm:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="成员不存在")
    await db.delete(tm)
    await db.commit()


# Notices
@router.get("/{team_id}/notices")
async def list_notices(team_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Notice).where(Notice.team_id == team_id).order_by(Notice.is_pinned.desc(), Notice.created_at.desc())
    )
    return result.scalars().all()


@router.post("/{team_id}/notices", status_code=status.HTTP_201_CREATED)
async def create_notice(
    team_id: int,
    data: dict,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    team = await _get_team_or_404(db, team_id)
    is_admin = current_user.role.value == "super_admin"
    is_advisor = team.advisor_teacher_id == current_user.id
    member_result = await db.execute(
        select(TeamMember).where(
            TeamMember.team_id == team_id,
            TeamMember.user_id == current_user.id,
        )
    )
    member = member_result.scalar_one_or_none()
    can_post = is_admin or is_advisor or (member and member.team_role.value in ("captain", "pm"))
    if not can_post:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权限")

    notice = Notice(
        team_id=team_id,
        author_id=current_user.id,
        title=data.get("title", ""),
        content=data.get("content", ""),
        is_pinned=data.get("is_pinned", False),
    )
    db.add(notice)
    await db.commit()
    await db.refresh(notice)
    return notice


# Join Requests
@router.post("/{team_id}/join-request")
async def request_join_team(
    team_id: int,
    data: dict,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    team = await _get_team_or_404(db, team_id)

    # Check if already a member
    existing_member = await db.execute(
        select(TeamMember).where(
            TeamMember.team_id == team_id,
            TeamMember.user_id == current_user.id,
        )
    )
    if existing_member.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="你已经是该战队成员")

    # Check if there's a pending request
    existing_request = await db.execute(
        select(TeamJoinRequest).where(
            TeamJoinRequest.team_id == team_id,
            TeamJoinRequest.user_id == current_user.id,
            TeamJoinRequest.status == "pending",
        )
    )
    if existing_request.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="你已提交过入队申请，请等待审核")

    join_req = TeamJoinRequest(
        team_id=team_id,
        user_id=current_user.id,
        message=data.get("message", ""),
        status="pending",
    )
    db.add(join_req)
    await db.commit()
    await db.refresh(join_req)
    return {"id": join_req.id, "message": "申请已提交", "status": "pending"}


@router.get("/{team_id}/join-requests")
async def list_join_requests(
    team_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    team = await _get_team_or_404(db, team_id)

    # Check permission
    is_admin = current_user.role.value == "super_admin"
    is_advisor = team.advisor_teacher_id == current_user.id
    member_result = await db.execute(
        select(TeamMember).where(
            TeamMember.team_id == team_id,
            TeamMember.user_id == current_user.id,
        )
    )
    member = member_result.scalar_one_or_none()
    can_review = is_admin or is_advisor or (member and member.team_role.value in ("captain", "pm"))
    if not can_review:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权限")

    result = await db.execute(
        select(TeamJoinRequest).where(
            TeamJoinRequest.team_id == team_id,
            TeamJoinRequest.status == "pending",
        ).order_by(TeamJoinRequest.created_at.desc())
    )
    requests = result.scalars().all()
    return [
        {
            "id": r.id, "team_id": r.team_id, "user_id": r.user_id,
            "message": r.message, "status": r.status,
            "created_at": r.created_at.isoformat() if r.created_at else None,
            "user": {
                "id": r.user.id, "username": r.user.username,
                "display_name": r.user.display_name, "role": r.user.role.value,
            } if r.user else None,
        }
        for r in requests
    ]


@router.put("/{team_id}/join-requests/{request_id}")
async def review_join_request(
    team_id: int,
    request_id: int,
    data: dict,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    team = await _get_team_or_404(db, team_id)

    is_admin = current_user.role.value == "super_admin"
    is_advisor = team.advisor_teacher_id == current_user.id
    member_result = await db.execute(
        select(TeamMember).where(
            TeamMember.team_id == team_id,
            TeamMember.user_id == current_user.id,
        )
    )
    member = member_result.scalar_one_or_none()
    can_review = is_admin or is_advisor or (member and member.team_role.value in ("captain", "pm"))
    if not can_review:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权限")

    result = await db.execute(
        select(TeamJoinRequest).where(
            TeamJoinRequest.id == request_id,
            TeamJoinRequest.team_id == team_id,
            TeamJoinRequest.status == "pending",
        )
    )
    join_req = result.scalar_one_or_none()
    if not join_req:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="申请不存在或已处理")

    decision = data.get("decision")
    if decision not in ("approved", "rejected"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="decision 必须为 approved 或 rejected")

    join_req.status = decision
    join_req.reviewed_by = current_user.id
    join_req.reviewed_at = __import__("datetime").datetime.utcnow()

    if decision == "approved":
        # Check if already a member (race condition guard)
        existing_member = await db.execute(
            select(TeamMember).where(
                TeamMember.team_id == team_id,
                TeamMember.user_id == join_req.user_id,
            )
        )
        if not existing_member.scalar_one_or_none():
            tm = TeamMember(
                team_id=team_id,
                user_id=join_req.user_id,
                team_role=TeamRole.student,
            )
            db.add(tm)

    await db.commit()
    return {"message": f"已{decision == 'approved' and '通过' or '拒绝'}申请"}


@router.get("/my-requests")
async def my_join_requests(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(TeamJoinRequest).where(
            TeamJoinRequest.user_id == current_user.id,
        ).order_by(TeamJoinRequest.created_at.desc())
    )
    requests = result.scalars().all()
    return [
        {
            "id": r.id, "team_id": r.team_id, "user_id": r.user_id,
            "message": r.message, "status": r.status,
            "created_at": r.created_at.isoformat() if r.created_at else None,
            "reviewed_at": r.reviewed_at.isoformat() if r.reviewed_at else None,
        }
        for r in requests
    ]
