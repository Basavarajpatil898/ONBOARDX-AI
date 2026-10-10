from datetime import datetime, timezone
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class RegisterRequest(BaseModel):
    full_name: str = Field(min_length=2, max_length=120)
    email: str = Field(min_length=5, max_length=254)
    password: str = Field(min_length=12, max_length=128)


class AdminEmployeeCreate(BaseModel):
    full_name: str = Field(min_length=2, max_length=120)
    email: str = Field(min_length=5, max_length=254, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    password: str = Field(min_length=12, max_length=128)
    job_role_id: int = Field(gt=0)


class WorkAssignmentCreate(BaseModel):
    employee_ids: list[int] = Field(min_length=1, max_length=100)
    assignment_type: Literal["module", "assessment", "practical"]
    target_id: int = Field(gt=0)
    due_at: datetime | None = None
    note: str = Field(default="", max_length=1000)

    @model_validator(mode="after")
    def validate_assignment(self):
        if len(set(self.employee_ids)) != len(self.employee_ids):
            raise ValueError("Choose each employee only once.")
        if self.due_at is not None and self.due_at.tzinfo is None:
            self.due_at = self.due_at.replace(tzinfo=timezone.utc)
        return self


class LoginRequest(BaseModel):
    email: str
    password: str


class ProfileUpdate(BaseModel):
    full_name: str = Field(min_length=2, max_length=120)
    email: str = Field(min_length=5, max_length=254, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class UserResponse(BaseModel):
    id: int
    full_name: str
    email: str
    access_role: str
    model_config = ConfigDict(from_attributes=True)
    
class AuthResponse(BaseModel):
    access_token: str
    token_type: str
    user: UserResponse


class SkillLevelUpdate(BaseModel):
    level: int = Field(ge=0, le=5)


class AssessmentSubmission(BaseModel):
    answers: dict[int, int]


class ChatTurn(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=4000)


class RagQuestion(BaseModel):
    question: str = Field(min_length=3, max_length=2000)
    conversation: list[ChatTurn] = Field(default_factory=list, max_length=8)


class JobRoleCreate(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    description: str = Field(default="", max_length=5000)


class SkillCreate(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    description: str = Field(default="", max_length=2000)


class RoleRequirementUpdate(BaseModel):
    required_level: int = Field(ge=0, le=5)
    priority: int = Field(default=1, ge=1, le=5)


class LearningModuleCreate(BaseModel):
    title: str = Field(min_length=2, max_length=160)
    description: str = Field(default="", max_length=5000)
    content: str = Field(default="", max_length=30000)
    skill_id: int
    prerequisites: list[int] = Field(default_factory=list)
    estimated_minutes: int = Field(default=20, ge=1, le=600)


class AssessmentQuestionCreate(BaseModel):
    skill_id: int
    topic: str = Field(min_length=2, max_length=100)
    difficulty: Literal["foundation", "intermediate", "advanced"] = "foundation"
    prompt: str = Field(min_length=3, max_length=2000)
    options: list[str] = Field(min_length=2, max_length=8)
    correct_index: int = Field(ge=0)
    explanation: str = Field(default="", max_length=2000)

    @model_validator(mode="after")
    def answer_must_match_option(self):
        if self.correct_index >= len(self.options):
            raise ValueError("correct_index must point to one of the answer options.")
        if any(not option.strip() for option in self.options):
            raise ValueError("Answer options cannot be empty.")
        return self


class PracticalTaskSubmissionRequest(BaseModel):
    output: dict


class PracticalTaskCreate(BaseModel):
    title: str = Field(min_length=2, max_length=160)
    description: str = Field(default="", max_length=5000)
    instructions: str = Field(default="", max_length=5000)
    skill_id: int
    checks: list[dict] = Field(min_length=1, max_length=20)
