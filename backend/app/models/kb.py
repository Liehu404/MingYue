"""数据管理 / 知识库 模块（2026-11 新增）

对应需求：多源数据接入、自动同步、数据源对接、上传自动进入处理流水线、
多版本数据管理、数据冲突识别与处理、按课程绑定知识库检索。
所有表均为新增，不改动既有业务表。
"""
import enum
from datetime import datetime

from sqlalchemy import (
    Column, Integer, String, Text, Boolean, DateTime, ForeignKey, Enum, BigInteger,
    JSON,
)
from sqlalchemy.orm import relationship

from app.database import Base


class KBKind(str, enum.Enum):
    course = "course"        # 课程知识库（检索默认纳入）
    shared = "shared"        # 共享知识库（课程级共享，检索默认纳入）
    personal = "personal"    # 个人知识库（需用户勾选才并入）


class DocSource(str, enum.Enum):
    upload = "upload"        # 网页/接口上传
    canvas = "canvas"        # Canvas 数据收集平台
    api = "api"              # 通用 HTTP 数据源
    local = "local"          # 服务器本地目录
    manual = "manual"        # 手动新建


class VersionState(str, enum.Enum):
    pending = "pending"          # 已上传，处理中/待启用
    active = "active"            # 当前有效版本（检索只取它）
    superseded = "superseded"    # 已被新版本替代（停用，文件保留）
    archived = "archived"        # 手动停用


class JobStatus(str, enum.Enum):
    queued = "queued"
    running = "running"
    done = "done"
    failed = "failed"


class ConflictKind(str, enum.Enum):
    content_diff = "content_diff"   # 同一文档不同版本内容差异
    duplicate = "duplicate"         # 文件完全相同（sha256）
    title_clash = "title_clash"     # 同库同标题但不同文件
    version_clash = "version_clash" # 同版本号


class ConflictStatus(str, enum.Enum):
    open = "open"
    resolved = "resolved"
    ignored = "ignored"


class KnowledgeBase(Base):
    __tablename__ = "kb_bases"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(200), nullable=False)
    kind = Column(Enum(KBKind), nullable=False, default=KBKind.course)
    code = Column(String(80), default="")          # 课程代码 / 编号
    description = Column(Text, default="")
    term = Column(String(40), default="")          # 学期，如 2026-秋
    class_count = Column(Integer, default=0)        # Canvas 班级数
    knowledge_count = Column(Integer, default=0)    # 知识点数
    sync_source = Column(String(30), default="")    # canvas / local
    owner_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    team_id = Column(Integer, ForeignKey("teams.id", ondelete="SET NULL"), nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    documents = relationship("KBDocument", back_populates="kb", cascade="all, delete-orphan")
    sources = relationship("KBDataSource", back_populates="kb", cascade="all, delete-orphan")
    owner = relationship("User", foreign_keys=[owner_id])


class KBDocument(Base):
    __tablename__ = "kb_documents"

    id = Column(Integer, primary_key=True, autoincrement=True)
    kb_id = Column(Integer, ForeignKey("kb_bases.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String(400), nullable=False)
    topic = Column(String(200), default="")        # 知识点 / 章节
    doc_type = Column(String(40), default="other") # pdf/docx/pptx/video/report/txt...
    source = Column(Enum(DocSource), nullable=False, default=DocSource.upload)
    source_ref = Column(String(1000), default="")  # 原始地址 / canvas file id
    active_version_id = Column(Integer, nullable=True)
    external_id = Column(String(120), default="")   # 外部文档 id（Canvas/FastGPT doc_id）
    dataset_id = Column(String(80), default="")     # FastGPT dataset id
    owner_username = Column(String(80), default="") # 上传者学号/账号
    file_status = Column(String(20), default="")    # ready / processing / failed
    is_shared = Column(Boolean, default=False)      # 是否共享到课程库
    chunk_count = Column(Integer, default=0)
    folder_id = Column(String(80), nullable=True)
    collection_id = Column(String(80), nullable=True)
    name_synced = Column(Boolean, default=False)
    uploaded_at = Column(DateTime, nullable=True)
    processed_at = Column(DateTime, nullable=True)
    unshared_at = Column(DateTime, nullable=True)
    created_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    kb = relationship("KnowledgeBase", back_populates="documents")
    versions = relationship(
        "KBDocumentVersion", back_populates="document", cascade="all, delete-orphan",
        order_by="KBDocumentVersion.version_no.desc()",
        foreign_keys="KBDocumentVersion.document_id",
    )
    conflicts = relationship("KBConflict", back_populates="document", cascade="all, delete-orphan")


class KBDocumentVersion(Base):
    __tablename__ = "kb_document_versions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    document_id = Column(Integer, ForeignKey("kb_documents.id", ondelete="CASCADE"), nullable=False, index=True)
    version_no = Column(Integer, nullable=False, default=1)
    filename = Column(String(400), default="")
    file_path = Column(String(600), default="")     # 相对 UPLOAD_DIR
    file_size = Column(BigInteger, default=0)
    mime = Column(String(200), default="")
    sha256 = Column(String(80), default="", index=True)
    extracted_text = Column(Text, default="")
    text_length = Column(Integer, default=0)
    meta = Column(JSON, default=dict)               # 页数/时长/作者等
    state = Column(Enum(VersionState), nullable=False, default=VersionState.pending)
    note = Column(Text, default="")                 # 变更说明
    created_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    activated_at = Column(DateTime, nullable=True)
    deactivated_at = Column(DateTime, nullable=True)

    document = relationship("KBDocument", back_populates="versions", foreign_keys=[document_id])


class KBClass(Base):
    """Canvas 教学班（一个课程代码下可有多个班）"""
    __tablename__ = "kb_classes"

    id = Column(Integer, primary_key=True, autoincrement=True)
    course_code = Column(String(80), nullable=False, index=True)
    course_name = Column(String(200), default="")
    sis_course_id = Column(String(120), default="")
    class_id = Column(Integer, default=0)
    term_id = Column(Integer, default=0)
    student_count = Column(Integer, default=0)
    teacher_count = Column(Integer, default=0)
    student_list = Column(JSON, default=list)
    teacher_list = Column(JSON, default=list)


class KnowledgePoint(Base):
    """课程知识点（对应 education2.knowledges 的成熟结构）"""
    __tablename__ = "kb_knowledge_points"

    id = Column(Integer, primary_key=True, autoincrement=True)
    course_code = Column(String(80), nullable=False, index=True)
    course_name = Column(String(200), default="")
    knowledge_id = Column(Integer, default=0)
    name = Column(String(300), nullable=False)
    doc_count = Column(Integer, default=0)


class KBConflict(Base):
    __tablename__ = "kb_conflicts"

    id = Column(Integer, primary_key=True, autoincrement=True)
    kb_id = Column(Integer, ForeignKey("kb_bases.id", ondelete="CASCADE"), nullable=False, index=True)
    document_id = Column(Integer, ForeignKey("kb_documents.id", ondelete="CASCADE"), nullable=False)
    new_version_id = Column(Integer, nullable=True)
    base_version_id = Column(Integer, nullable=True)
    kind = Column(Enum(ConflictKind), nullable=False, default=ConflictKind.content_diff)
    severity = Column(String(20), default="low")    # low / medium / high
    summary = Column(Text, default="")
    detail = Column(JSON, default=dict)             # diff 片段、统计
    status = Column(Enum(ConflictStatus), nullable=False, default=ConflictStatus.open)
    resolution = Column(String(40), default="")     # keep_new / keep_old / merge / ignored
    resolution_note = Column(Text, default="")
    resolved_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    resolved_at = Column(DateTime, nullable=True)

    document = relationship("KBDocument", back_populates="conflicts")


class KBIngestionJob(Base):
    __tablename__ = "kb_ingestion_jobs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    kb_id = Column(Integer, ForeignKey("kb_bases.id", ondelete="CASCADE"), nullable=False, index=True)
    document_id = Column(Integer, nullable=True)
    version_id = Column(Integer, nullable=True)
    filename = Column(String(400), default="")
    source = Column(String(30), default="upload")
    status = Column(Enum(JobStatus), nullable=False, default=JobStatus.queued)
    stage = Column(String(40), default="queued")    # queued/saving/extracting/diffing/done
    progress = Column(Integer, default=0)
    auto_activate = Column(Boolean, default=False)
    message = Column(Text, default="")
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    started_at = Column(DateTime, nullable=True)
    finished_at = Column(DateTime, nullable=True)


class KBDataSource(Base):
    __tablename__ = "kb_data_sources"

    id = Column(Integer, primary_key=True, autoincrement=True)
    kb_id = Column(Integer, ForeignKey("kb_bases.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(200), nullable=False)
    type = Column(String(30), nullable=False, default="canvas")  # canvas / http_json / local_dir
    config = Column(JSON, default=dict)   # base_url/token/course_id 或 url/path
    enabled = Column(Boolean, default=True)
    auto_sync = Column(Boolean, default=False)
    sync_interval_min = Column(Integer, default=60)
    last_sync_at = Column(DateTime, nullable=True)
    last_status = Column(String(30), default="")
    last_message = Column(Text, default="")
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    kb = relationship("KnowledgeBase", back_populates="sources")
