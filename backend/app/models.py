from datetime import datetime, timezone

from sqlalchemy import JSON, CheckConstraint, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base, EmbeddingVector


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(254), unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(120))
    password_hash: Mapped[str] = mapped_column(String(255))
    access_role: Mapped[str] = mapped_column(String(20), default="employee")
    job_role_id: Mapped[int | None] = mapped_column(ForeignKey("job_roles.id"), nullable=True)
    manager_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(default=utc_now)


class AdminEmployeeCredential(Base):
    __tablename__ = "admin_employee_credentials"
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    encrypted_password: Mapped[str] = mapped_column(String(512))
    updated_at: Mapped[datetime] = mapped_column(default=utc_now, onupdate=utc_now)


class JobRole(Base):
    __tablename__ = "job_roles"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100), unique=True)
    description: Mapped[str] = mapped_column(Text, default="")


class Skill(Base):
    __tablename__ = "skills"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100), unique=True)
    description: Mapped[str] = mapped_column(Text, default="")


class RoleSkillRequirement(Base):
    __tablename__ = "role_skill_requirements"
    __table_args__ = (UniqueConstraint("job_role_id", "skill_id"), CheckConstraint("required_level BETWEEN 0 AND 5"))
    id: Mapped[int] = mapped_column(primary_key=True)
    job_role_id: Mapped[int] = mapped_column(ForeignKey("job_roles.id", ondelete="CASCADE"))
    skill_id: Mapped[int] = mapped_column(ForeignKey("skills.id", ondelete="CASCADE"))
    required_level: Mapped[int]
    priority: Mapped[int] = mapped_column(default=1)


class EmployeeSkill(Base):
    __tablename__ = "employee_skills"
    __table_args__ = (UniqueConstraint("user_id", "skill_id"), CheckConstraint("level BETWEEN 0 AND 5"))
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    skill_id: Mapped[int] = mapped_column(ForeignKey("skills.id", ondelete="CASCADE"))
    level: Mapped[int]
    updated_at: Mapped[datetime] = mapped_column(default=utc_now, onupdate=utc_now)


class LearningModule(Base):
    __tablename__ = "learning_modules"
    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(160))
    description: Mapped[str] = mapped_column(Text, default="")
    content: Mapped[str] = mapped_column(Text, default="")
    skill_id: Mapped[int] = mapped_column(ForeignKey("skills.id"))
    prerequisites: Mapped[list[int]] = mapped_column(JSON, default=list)
    estimated_minutes: Mapped[int] = mapped_column(default=20)


class LearningPathItem(Base):
    __tablename__ = "learning_path_items"
    __table_args__ = (UniqueConstraint("user_id", "module_id"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    module_id: Mapped[int] = mapped_column(ForeignKey("learning_modules.id", ondelete="CASCADE"))
    status: Mapped[str] = mapped_column(String(20), default="assigned")
    completed_at: Mapped[datetime | None] = mapped_column(nullable=True)


class WorkAssignment(Base):
    __tablename__ = "work_assignments"
    __table_args__ = (UniqueConstraint("user_id", "assignment_type", "target_id"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    assigned_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    assignment_type: Mapped[str] = mapped_column(String(20))
    target_id: Mapped[int]
    due_at: Mapped[datetime | None] = mapped_column(nullable=True)
    note: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(20), default="assigned")
    created_at: Mapped[datetime] = mapped_column(default=utc_now)
    completed_at: Mapped[datetime | None] = mapped_column(nullable=True)


class AssessmentQuestion(Base):
    __tablename__ = "assessment_questions"
    id: Mapped[int] = mapped_column(primary_key=True)
    skill_id: Mapped[int] = mapped_column(ForeignKey("skills.id", ondelete="CASCADE"))
    topic: Mapped[str] = mapped_column(String(100))
    difficulty: Mapped[str] = mapped_column(String(20), default="foundation")
    prompt: Mapped[str] = mapped_column(Text)
    options: Mapped[list[str]] = mapped_column(JSON, default=list)
    correct_index: Mapped[int]
    explanation: Mapped[str] = mapped_column(Text, default="")


class AssessmentAttempt(Base):
    __tablename__ = "assessment_attempts"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    skill_id: Mapped[int] = mapped_column(ForeignKey("skills.id", ondelete="CASCADE"))
    score_percent: Mapped[float]
    action: Mapped[str] = mapped_column(String(20))
    answers: Mapped[dict[str, int]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(default=utc_now)


class PracticalTask(Base):
    __tablename__ = "practical_tasks"
    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(160))
    description: Mapped[str] = mapped_column(Text, default="")
    instructions: Mapped[str] = mapped_column(Text, default="")
    skill_id: Mapped[int] = mapped_column(ForeignKey("skills.id", ondelete="CASCADE"))
    checks: Mapped[list[dict]] = mapped_column(JSON, default=list)


class PracticalSubmission(Base):
    __tablename__ = "practical_submissions"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    task_id: Mapped[int] = mapped_column(ForeignKey("practical_tasks.id", ondelete="CASCADE"))
    submitted_output: Mapped[dict] = mapped_column(JSON, default=dict)
    check_results: Mapped[list[dict]] = mapped_column(JSON, default=list)
    score_percent: Mapped[float]
    passed: Mapped[bool]
    created_at: Mapped[datetime] = mapped_column(default=utc_now)


class Document(Base):
    __tablename__ = "documents"
    id: Mapped[int] = mapped_column(primary_key=True)
    filename: Mapped[str] = mapped_column(String(255))
    status: Mapped[str] = mapped_column(String(20), default="processing")
    chunk_count: Mapped[int] = mapped_column(default=0)
    uploaded_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(default=utc_now)


class DocumentChunk(Base):
    __tablename__ = "document_chunks"
    id: Mapped[int] = mapped_column(primary_key=True)
    document_id: Mapped[int] = mapped_column(ForeignKey("documents.id", ondelete="CASCADE"), index=True)
    chunk_index: Mapped[int]
    content: Mapped[str] = mapped_column(Text)
    embedding: Mapped[list[float]] = mapped_column(EmbeddingVector())
    source_section: Mapped[str] = mapped_column(String(120), default="")


class AssistantHistory(Base):
    __tablename__ = "assistant_history"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    question: Mapped[str] = mapped_column(Text)
    answer: Mapped[str] = mapped_column(Text)
    sources: Mapped[list[dict]] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(default=utc_now, index=True)
