import enum
from datetime import datetime

from sqlalchemy import (
    Column, Integer, String, Text, Boolean, DateTime, ForeignKey, Enum, BigInteger, UniqueConstraint,
)
from sqlalchemy.orm import relationship

from app.database import Base


class ResourceType(str, enum.Enum):
    video = "video"
    image = "image"
    document = "document"
    table = "table"
    link = "link"


class ResourceStatus(str, enum.Enum):
    draft = "draft"
    pending_review = "pending_review"
    reviewed = "reviewed"
    published = "published"
    rejected = "rejected"


class Visibility(str, enum.Enum):
    public = "public"
    team_only = "team_only"


class ReviewDecision(str, enum.Enum):
    pending = "pending"
    approved = "approved"
    rejected = "rejected"


class MediaResource(Base):
    __tablename__ = "media_resources"

    id = Column(Integer, primary_key=True, autoincrement=True)
    title = Column(String(300), nullable=False)
    description = Column(Text, default="")
    resource_type = Column(Enum(ResourceType), nullable=False)
    file_path = Column(String(500), nullable=True)
    file_size = Column(BigInteger, default=0)
    thumbnail_path = Column(String(500), nullable=True)
    external_url = Column(String(2000), nullable=True)
    team_id = Column(Integer, ForeignKey("teams.id", ondelete="CASCADE"), nullable=False)
    partition_id = Column(Integer, ForeignKey("partitions.id", ondelete="SET NULL"), nullable=True)
    uploader_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    visibility = Column(Enum(Visibility), nullable=False, default=Visibility.team_only)
    status = Column(Enum(ResourceStatus), nullable=False, default=ResourceStatus.draft)
    review_comment = Column(Text, default="")
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    team = relationship("Team", back_populates="resources")
    partition = relationship("Partition", back_populates="resources")
    uploader = relationship("User", back_populates="uploaded_resources", foreign_keys=[uploader_id])
    reviews = relationship("Review", back_populates="resource", cascade="all, delete-orphan")
    urges = relationship("Urge", back_populates="resource", cascade="all, delete-orphan")
    likes = relationship("Like", back_populates="resource", cascade="all, delete-orphan")
    reports = relationship("Report", back_populates="resource", cascade="all, delete-orphan")
    comments = relationship("Comment", back_populates="resource", cascade="all, delete-orphan")
    images = relationship("ResourceImage", back_populates="resource", cascade="all, delete-orphan")


class ResourceImage(Base):
    __tablename__ = "resource_images"

    id = Column(Integer, primary_key=True, autoincrement=True)
    resource_id = Column(Integer, ForeignKey("media_resources.id", ondelete="CASCADE"), nullable=False)
    file_path = Column(String(500), nullable=False)
    sort_order = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    resource = relationship("MediaResource", back_populates="images")


class Review(Base):
    __tablename__ = "reviews"

    id = Column(Integer, primary_key=True, autoincrement=True)
    resource_id = Column(Integer, ForeignKey("media_resources.id", ondelete="CASCADE"), nullable=False)
    reviewer_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    review_type = Column(String(20), nullable=False, default="regular")
    decision = Column(Enum(ReviewDecision), nullable=False, default=ReviewDecision.pending)
    comment = Column(Text, default="")
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    resource = relationship("MediaResource", back_populates="reviews")
    reviewer = relationship("User", back_populates="reviews", foreign_keys=[reviewer_id])


class Urge(Base):
    __tablename__ = "urges"

    id = Column(Integer, primary_key=True, autoincrement=True)
    resource_id = Column(Integer, ForeignKey("media_resources.id", ondelete="CASCADE"), nullable=False)
    urger_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    __table_args__ = (UniqueConstraint("resource_id", "urger_id"),)

    resource = relationship("MediaResource", back_populates="urges")


class Like(Base):
    __tablename__ = "likes"

    id = Column(Integer, primary_key=True, autoincrement=True)
    resource_id = Column(Integer, ForeignKey("media_resources.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    __table_args__ = (UniqueConstraint("resource_id", "user_id"),)

    resource = relationship("MediaResource", back_populates="likes")


class Report(Base):
    __tablename__ = "reports"

    id = Column(Integer, primary_key=True, autoincrement=True)
    resource_id = Column(Integer, ForeignKey("media_resources.id", ondelete="CASCADE"), nullable=False)
    reporter_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    reason = Column(Text, nullable=False)
    status = Column(String(20), nullable=False, default="pending")
    resolved_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    resolved_at = Column(DateTime, nullable=True)

    resource = relationship("MediaResource", back_populates="reports")


class Notice(Base):
    __tablename__ = "notices"

    id = Column(Integer, primary_key=True, autoincrement=True)
    team_id = Column(Integer, ForeignKey("teams.id", ondelete="CASCADE"), nullable=False)
    author_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    title = Column(String(300), nullable=False)
    content = Column(Text, nullable=False)
    is_pinned = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    team = relationship("Team", back_populates="notices")
    author = relationship("User", back_populates="notices")


class Comment(Base):
    __tablename__ = "comments"

    id = Column(Integer, primary_key=True, autoincrement=True)
    resource_id = Column(Integer, ForeignKey("media_resources.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    resource = relationship("MediaResource", back_populates="comments")
    user = relationship("User")
