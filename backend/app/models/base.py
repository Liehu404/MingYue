import enum
from datetime import datetime

from sqlalchemy import (
    Column, Integer, String, Text, Boolean, DateTime, ForeignKey, Enum, UniqueConstraint, JSON,
)
from sqlalchemy.orm import relationship

from app.database import Base


class UserRole(str, enum.Enum):
    super_admin = "super_admin"
    advisor_teacher = "advisor_teacher"
    team_captain = "team_captain"
    team_pm = "team_pm"
    tech_lead = "tech_lead"
    student = "student"


class TeamRole(str, enum.Enum):
    captain = "captain"
    pm = "pm"
    tech_lead = "tech_lead"
    student = "student"


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String(100), unique=True, nullable=False, index=True)
    email = Column(String(255), unique=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    display_name = Column(String(100), nullable=False)
    real_name = Column(String(100), nullable=False, default="")
    student_id = Column(String(50), unique=True, nullable=True)
    grade = Column(String(20), nullable=True)
    major = Column(String(100), nullable=True)
    phone = Column(String(20), unique=True, nullable=True)
    avatar_url = Column(String(500), default="")
    role = Column(Enum(UserRole), nullable=False, default=UserRole.student)
    college_id = Column(Integer, ForeignKey("colleges.id", ondelete="SET NULL"), nullable=True)
    is_active = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    college = relationship("College", back_populates="users")
    team_memberships = relationship("TeamMember", back_populates="user")
    uploaded_resources = relationship("MediaResource", back_populates="uploader", foreign_keys="MediaResource.uploader_id")
    notices = relationship("Notice", back_populates="author")
    reviews = relationship("Review", back_populates="reviewer", foreign_keys="Review.reviewer_id")


class College(Base):
    __tablename__ = "colleges"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(200), nullable=False)
    description = Column(Text, default="")
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    users = relationship("User", back_populates="college")
    teams = relationship("Team", back_populates="college")


class Partition(Base):
    __tablename__ = "partitions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(200), nullable=False)
    description = Column(Text, default="")
    parent_id = Column(Integer, ForeignKey("partitions.id", ondelete="CASCADE"), nullable=True)
    sort_order = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    parent = relationship("Partition", remote_side=[id], back_populates="children")
    children = relationship("Partition", back_populates="parent", cascade="all, delete-orphan")
    resources = relationship("MediaResource", back_populates="partition")


class Team(Base):
    __tablename__ = "teams"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(200), nullable=False)
    description = Column(Text, default="")
    college_id = Column(Integer, ForeignKey("colleges.id", ondelete="CASCADE"), nullable=False)
    advisor_teacher_id = Column(Integer, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    avatar_url = Column(String(500), default="")
    tags = Column(String(500), default="")
    category = Column(String(100), default="")
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
    decoration = Column(JSON, nullable=True, default=None)
    role_definitions = Column(JSON, nullable=True, default=None)

    college = relationship("College", back_populates="teams")
    advisor_teacher = relationship("User", foreign_keys=[advisor_teacher_id])
    members = relationship("TeamMember", back_populates="team", cascade="all, delete-orphan")
    resources = relationship("MediaResource", back_populates="team", cascade="all, delete-orphan")
    notices = relationship("Notice", back_populates="team", cascade="all, delete-orphan")


class TeamMember(Base):
    __tablename__ = "team_members"

    id = Column(Integer, primary_key=True, autoincrement=True)
    team_id = Column(Integer, ForeignKey("teams.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    team_role = Column(Enum(TeamRole), nullable=False, default=TeamRole.student)
    tech_partition_id = Column(Integer, ForeignKey("partitions.id", ondelete="SET NULL"), nullable=True)
    position_title = Column(String(100), nullable=True)
    parent_member_id = Column(Integer, ForeignKey("team_members.id", ondelete="SET NULL"), nullable=True)
    joined_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    __table_args__ = (UniqueConstraint("team_id", "user_id"),)

    team = relationship("Team", back_populates="members")
    user = relationship("User", back_populates="team_memberships")
    parent = relationship("TeamMember", remote_side=[id], back_populates="children")
    children = relationship("TeamMember", back_populates="parent")


class TeamJoinRequest(Base):
    __tablename__ = "team_join_requests"

    id = Column(Integer, primary_key=True, autoincrement=True)
    team_id = Column(Integer, ForeignKey("teams.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    message = Column(Text, default="")
    status = Column(String(20), nullable=False, default="pending")
    reviewed_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    reviewed_at = Column(DateTime, nullable=True)


    team = relationship("Team")
    user = relationship("User", foreign_keys=[user_id])
    reviewer = relationship("User", foreign_keys=[reviewed_by])


class VerificationCode(Base):
    __tablename__ = "verification_codes"

    id = Column(Integer, primary_key=True, autoincrement=True)
    phone = Column(String(20), nullable=False)
    code = Column(String(6), nullable=False)
    purpose = Column(String(20), nullable=False)
    expires_at = Column(DateTime, nullable=False)
    used = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
