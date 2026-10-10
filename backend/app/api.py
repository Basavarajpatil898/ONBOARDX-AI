from datetime import datetime, timezone
from pathlib import Path
import string
import secrets

import jwt
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from google.genai.errors import APIError
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import (
    create_access_token,
    decrypt_admin_credential,
    encrypt_admin_credential,
    hash_password,
    verify_password,
)
from app.database import get_db
from app.models import (
    AssistantHistory,
    AssessmentAttempt,
    AssessmentQuestion,
    AdminEmployeeCredential,
    Document,
    DocumentChunk,
    EmployeeSkill,
    JobRole,
    LearningModule as LearningModuleRecord,
    LearningPathItem,
    PracticalSubmission,
    PracticalTask,
    RoleSkillRequirement,
    Skill,
    User,
    WorkAssignment,
)
from app.schemas import (
    AdminEmployeeCreate,
    AssessmentSubmission,
    AssessmentQuestionCreate,
    AuthResponse,
    JobRoleCreate,
    LearningModuleCreate,
    LoginRequest,
    PracticalTaskCreate,
    PracticalTaskSubmissionRequest,
    ProfileUpdate,
    RagQuestion,
    RoleRequirementUpdate,
    SkillCreate,
    SkillLevelUpdate,
    WorkAssignmentCreate,
)
from app.services.onboarding import (
    LearningModule,
    SkillRequirement,
    analyze_skill_gaps,
    assessment_action,
    build_learning_path,
    calculate_role_readiness,
    prioritize_learning_skills,
)


router = APIRouter()
bearer = HTTPBearer(auto_error=False)


def employee_temporary_password(full_name: str) -> str:
    name_parts = full_name.upper().split()
    initials = "".join(part[0] for part in name_parts if part and part[0] in string.ascii_uppercase + string.digits)
    name_characters = "".join(char for char in full_name.upper() if char in string.ascii_uppercase + string.digits)
    prefix = (initials + name_characters + "XX")[:2]
    alphabet = string.ascii_letters + string.digits + "!@#$%"
    random_characters = [
        secrets.choice(string.ascii_lowercase),
        secrets.choice(string.ascii_uppercase),
        secrets.choice(string.digits),
        secrets.choice("!@#$%"),
        *(secrets.choice(alphabet) for _ in range(6)),
    ]
    secrets.SystemRandom().shuffle(random_characters)
    return prefix + "".join(random_characters)


def current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: Session = Depends(get_db),
) -> User:
    if credentials is None:
        raise HTTPException(status_code=401, detail="Authentication required.")
    try:
        payload = jwt.decode(credentials.credentials, settings.jwt_secret, algorithms=["HS256"])
        user_id = int(payload["sub"])
    except (jwt.InvalidTokenError, KeyError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid or expired access token.") from None
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=401, detail="Account no longer exists.")
    return user


def require_admin(user: User = Depends(current_user)) -> User:
    if user.access_role != "admin":
        raise HTTPException(status_code=403, detail="Administrator access is required.")
    return user


def mark_work_assignment_complete(db: Session, user_id: int, assignment_type: str, target_id: int) -> None:
    assignments = db.scalars(
        select(WorkAssignment).where(
            WorkAssignment.user_id == user_id,
            WorkAssignment.assignment_type == assignment_type,
            WorkAssignment.target_id == target_id,
            WorkAssignment.status != "completed",
        )
    ).all()
    for assignment in assignments:
        assignment.status = "completed"
        assignment.completed_at = datetime.now(timezone.utc)


@router.post("/auth/register", status_code=403)
def register_disabled():
    raise HTTPException(status_code=403, detail="Employee accounts must be created by an administrator.")


@router.post("/auth/login")
@router.post("/auth/login", response_model=AuthResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == payload.email.strip().lower()))
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Email or password is incorrect.")
    return {"access_token": create_access_token(str(user.id)), "token_type": "bearer", "user": user}


@router.post("/auth/admin/login", response_model=AuthResponse)
def admin_login(payload: LoginRequest, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == payload.email.strip().lower()))
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Email or password is incorrect.")
    if user.access_role != "admin":
        raise HTTPException(status_code=403, detail="This account does not have administrator access.")
    return {"access_token": create_access_token(str(user.id)), "token_type": "bearer", "user": user}


@router.get("/me")
def me(user: User = Depends(current_user)):
    return {"id": user.id, "full_name": user.full_name, "email": user.email, "access_role": user.access_role}


@router.put("/me/profile")
def update_my_profile(
    payload: ProfileUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    full_name = payload.full_name.strip()
    email = payload.email.strip().lower()
    if len(full_name) < 2 or "@" not in email or email.startswith("@") or email.endswith("@"):
        raise HTTPException(status_code=422, detail="Enter a valid name and email address.")
    duplicate = db.scalar(select(User).where(User.email == email, User.id != user.id))
    if duplicate is not None:
        raise HTTPException(status_code=409, detail="An account with this email already exists.")
    user.full_name = full_name
    user.email = email
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="An account with this email already exists.") from None
    return {"id": user.id, "full_name": user.full_name, "email": user.email, "access_role": user.access_role}


def employee_gaps(db: Session, user: User):
    if user.job_role_id is None:
        return []
    requirement_rows = db.execute(
        select(RoleSkillRequirement, Skill)
        .join(Skill, Skill.id == RoleSkillRequirement.skill_id)
        .where(RoleSkillRequirement.job_role_id == user.job_role_id)
    ).all()
    employee_rows = db.execute(
        select(EmployeeSkill, Skill.name).join(Skill).where(EmployeeSkill.user_id == user.id)
    ).all()
    employee_levels = {skill_name: item.level for item, skill_name in employee_rows}
    requirements = [
        SkillRequirement(skill.name, item.required_level, item.priority)
        for item, skill in requirement_rows
    ]
    return analyze_skill_gaps(requirements, employee_levels)
    
def employee_readiness(db: Session, user: User) -> dict:
    if user.job_role_id is None:
        return calculate_role_readiness([], {})
    
    requirement_rows = db.execute(
        select(RoleSkillRequirement, Skill)
        .join(Skill, Skill.id == RoleSkillRequirement.skill_id)
        .where(RoleSkillRequirement.job_role_id == user.job_role_id)
    ).all()
    requirements = [
        SkillRequirement(skill.name, requirement.required_level, requirement.priority)
        for requirement, skill in requirement_rows
    ]
    skill_names = {skill.id: skill.name for _, skill in requirement_rows}
    skill_ids = list(skill_names)
    if not skill_ids:
        return calculate_role_readiness([], {})
    
    employee_levels = {
        skill_names[item.skill_id]: item.level
        for item in db.scalars(
            select(EmployeeSkill).where(
                EmployeeSkill.user_id == user.id, EmployeeSkill.skill_id.in_(skill_ids)
            )
        ).all()
    }
    
    latest_assessments = {}
    for attempt in db.scalars(
        select(AssessmentAttempt)
        .where(AssessmentAttempt.user_id == user.id, AssessmentAttempt.skill_id.in_(skill_ids))
        .order_by(AssessmentAttempt.created_at.desc())
    ).all():
        latest_assessments.setdefault(attempt.skill_id, attempt.score_percent)
    
    latest_task_scores = {}
    for submission, skill_id in db.execute(
        select(PracticalSubmission, PracticalTask.skill_id)
        .join(PracticalTask, PracticalTask.id == PracticalSubmission.task_id)
        .where(
            PracticalSubmission.user_id == user.id,
            PracticalTask.skill_id.in_(skill_ids),
        )
        .order_by(PracticalSubmission.created_at.desc())
    ).all():
        latest_task_scores.setdefault(submission.task_id, (skill_id, submission.score_percent))
    
    practical_by_skill: dict[str, list[float]] = {}
    for skill_id, score in latest_task_scores.values():
        practical_by_skill.setdefault(skill_names[skill_id], []).append(score)
    
    return calculate_role_readiness(
        requirements,
        employee_levels,
        {skill_names[skill_id]: score for skill_id, score in latest_assessments.items()},
        {
            skill: sum(scores) / len(scores)
            for skill, scores in practical_by_skill.items()
        },
    )


@router.get("/dashboard")
def dashboard(db: Session = Depends(get_db), user: User = Depends(current_user)):
    gaps = employee_gaps(db, user)
    readiness = employee_readiness(db, user)
    readiness_skills = readiness["skills"]
    latest_attempt = db.scalar(
        select(AssessmentAttempt)
        .where(AssessmentAttempt.user_id == user.id)
        .order_by(AssessmentAttempt.created_at.desc())
        .limit(1)
    )
    completed = db.scalar(
        select(LearningPathItem).where(
            LearningPathItem.user_id == user.id, LearningPathItem.status == "completed"
        )
    )
    all_items = db.scalars(select(LearningPathItem).where(LearningPathItem.user_id == user.id)).all()
    done_count = sum(item.status == "completed" for item in all_items)
    orientation = db.get(JobRole, user.job_role_id) if user.job_role_id else None
    weak_assessments = sorted(
        (item for item in readiness_skills if item["assessment_percent"] is not None and item["assessment_percent"] < 50),
        key=lambda item: (-item["priority"], item["assessment_percent"], item["skill"].casefold()),
    )
    weak_practicals = sorted(
        (item for item in readiness_skills if item["practical_percent"] is not None and item["practical_percent"] < 80),
        key=lambda item: (-item["priority"], item["practical_percent"], item["skill"].casefold()),
    )
    assessment_practice = sorted(
        (item for item in readiness_skills if item["assessment_percent"] is not None and 50 <= item["assessment_percent"] <= 80),
        key=lambda item: (-item["priority"], item["assessment_percent"], item["skill"].casefold()),
    )
    if weak_assessments:
        target = weak_assessments[0]
        next_action = f"Review {target['skill']}: your latest assessment score was {target['assessment_percent']:.0f}%."
        next_action_view = "assessments"
    elif weak_practicals:
        target = weak_practicals[0]
        next_action = f"Practice {target['skill']}: your latest practical score was {target['practical_percent']:.0f}%."
        next_action_view = "practical"
    elif assessment_practice:
        target = assessment_practice[0]
        next_action = f"Strengthen {target['skill']} with a practical task after your {target['assessment_percent']:.0f}% assessment."
        next_action_view = "practical"
    elif gaps and any(gap.category != "strong" for gap in gaps):
        next_action = f"Start with {next(gap.skill for gap in gaps if gap.category != 'strong')} to address your highest-priority gap."
        next_action_view = "path"
    elif readiness["status"] == "ready":
        next_action = "Your recorded evidence meets the assigned role requirements."
        next_action_view = "path"
    elif user.job_role_id is None:
        next_action = "Ask your administrator to assign a job role to begin your learning path."
        next_action_view = "path"
    else:
        next_action = "Take an assessment to add objective evidence to your skill profile."
        next_action_view = "assessments"
    return {
        "user": {"full_name": user.full_name, "role": orientation.name if orientation else None},
        "orientation": orientation.description if orientation else "Your role orientation will appear here once assigned.",
        "progress_percent": round(done_count / len(all_items) * 100) if all_items else 0,
        "completed_modules": done_count,
        "assigned_modules": len(all_items),
        "skill_gaps": [gap.__dict__ for gap in gaps],
        "readiness": readiness,
        "latest_assessment": latest_attempt.score_percent if latest_attempt else None,
        "next_action": next_action,
        "next_action_view": next_action_view,
        "has_completed_learning": completed is not None,
    }


@router.put("/skills/{skill_id}")
def update_my_skill(
    skill_id: int,
    payload: SkillLevelUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    if db.get(Skill, skill_id) is None:
        raise HTTPException(status_code=404, detail="Skill not found.")
    record = db.scalar(
        select(EmployeeSkill).where(EmployeeSkill.user_id == user.id, EmployeeSkill.skill_id == skill_id)
    )
    if record is None:
        record = EmployeeSkill(user_id=user.id, skill_id=skill_id, level=payload.level)
        db.add(record)
    else:
        record.level = payload.level
        record.updated_at = datetime.now(timezone.utc)
    db.commit()
    return {"skill_id": skill_id, "level": payload.level}


@router.get("/learning/path")
def learning_path(db: Session = Depends(get_db), user: User = Depends(current_user)):
    gaps = employee_gaps(db, user)
    readiness = employee_readiness(db, user)
    readiness_by_skill = {item["skill"]: item for item in readiness["skills"]}
    skill_order = prioritize_learning_skills(gaps, readiness)
    skill_by_name = {skill.name: skill.id for skill in db.scalars(select(Skill)).all()}
    explicitly_assigned_modules = db.scalars(
        select(LearningModuleRecord)
        .join(WorkAssignment, WorkAssignment.target_id == LearningModuleRecord.id)
        .where(
            WorkAssignment.user_id == user.id,
            WorkAssignment.assignment_type == "module",
            WorkAssignment.status != "completed",
        )
    ).all()
    for assigned_module in explicitly_assigned_modules:
        assigned_skill = next((name for name, identifier in skill_by_name.items() if identifier == assigned_module.skill_id), None)
        if assigned_skill and assigned_skill not in skill_order:
            skill_order.append(assigned_skill)
    records = db.scalars(select(LearningModuleRecord)).all()
    modules = [
        LearningModule(
            module_id=str(record.id),
            title=record.title,
            skill=next((name for name, identifier in skill_by_name.items() if identifier == record.skill_id), ""),
            prerequisites=tuple(str(identifier) for identifier in record.prerequisites),
        )
        for record in records
    ]
    completed_ids = {
        str(item.module_id)
        for item in db.scalars(
            select(LearningPathItem).where(
                LearningPathItem.user_id == user.id, LearningPathItem.status == "completed"
            )
        ).all()
    }
    try:
        ordered = build_learning_path(modules, skill_order, completed_ids)
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    response = []
    for index, module in enumerate(ordered, 1):
        record = db.get(LearningModuleRecord, int(module.module_id))
        state = db.scalar(
            select(LearningPathItem).where(
                LearningPathItem.user_id == user.id, LearningPathItem.module_id == record.id
            )
        )
        if state is None:
            state = LearningPathItem(user_id=user.id, module_id=record.id)
            db.add(state)
        response.append(
            {
                "id": record.id,
                "title": record.title,
                "description": record.description,
                "content": record.content,
                "skill": module.skill,
                "estimated_minutes": record.estimated_minutes,
                "position": index,
                "status": state.status,
                "is_available": set(record.prerequisites).issubset(
                    {int(identifier) for identifier in completed_ids}
                ),
                "prerequisites": record.prerequisites,
                "recommendation_reason": (
                    f"Assessment score {readiness_by_skill[module.skill]['assessment_percent']:.0f}% indicates revision would help."
                    if module.skill in readiness_by_skill
                    and readiness_by_skill[module.skill]["assessment_percent"] is not None
                    and readiness_by_skill[module.skill]["assessment_percent"] < 50
                    else f"Practical score {readiness_by_skill[module.skill]['practical_percent']:.0f}% indicates more practice would help."
                    if module.skill in readiness_by_skill
                    and readiness_by_skill[module.skill]["practical_percent"] is not None
                    and readiness_by_skill[module.skill]["practical_percent"] < 80
                    else next(
                        (gap.explanation for gap in gaps if gap.skill == module.skill),
                        "This module is included to satisfy a learning prerequisite.",
                    )
                ),
            }
        )
    db.commit()
    return response


@router.post("/learning/{module_id}/complete")
def complete_module(
    module_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    module = db.get(LearningModuleRecord, module_id)
    if module is None:
        raise HTTPException(status_code=404, detail="Learning module not found.")
    completed_ids = {
        item.module_id
        for item in db.scalars(
            select(LearningPathItem).where(
                LearningPathItem.user_id == user.id, LearningPathItem.status == "completed"
            )
        ).all()
    }
    if not set(module.prerequisites).issubset(completed_ids):
        raise HTTPException(status_code=409, detail="Complete prerequisite modules before this one.")
    item = db.scalar(
        select(LearningPathItem).where(
            LearningPathItem.user_id == user.id, LearningPathItem.module_id == module_id
        )
    )
    if item is None:
        item = LearningPathItem(user_id=user.id, module_id=module_id)
        db.add(item)
    item.status = "completed"
    item.completed_at = datetime.now(timezone.utc)
    mark_work_assignment_complete(db, user.id, "module", module_id)
    db.commit()
    return {"module_id": module_id, "status": "completed"}


@router.get("/assessments/{skill_id}/questions")
def assessment_questions(skill_id: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    questions = db.scalars(
        select(AssessmentQuestion).where(AssessmentQuestion.skill_id == skill_id)
    ).all()
    return [
        {"id": item.id, "topic": item.topic, "difficulty": item.difficulty, "prompt": item.prompt, "options": item.options}
        for item in questions
    ]


@router.get("/admin/assessment-questions")
def admin_assessment_questions(db: Session = Depends(get_db), user: User = Depends(require_admin)):
    del user
    rows = db.execute(
        select(AssessmentQuestion, Skill.name)
        .join(Skill, Skill.id == AssessmentQuestion.skill_id)
        .order_by(Skill.name, AssessmentQuestion.topic, AssessmentQuestion.id)
    ).all()
    return [
        {
            "id": question.id,
            "skill_id": question.skill_id,
            "skill": skill_name,
            "topic": question.topic,
            "difficulty": question.difficulty,
            "prompt": question.prompt,
            "options": question.options,
            "correct_index": question.correct_index,
            "explanation": question.explanation,
        }
        for question, skill_name in rows
    ]


@router.post("/admin/assessment-questions", status_code=201)
def create_assessment_question(
    payload: AssessmentQuestionCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_admin),
):
    del user
    if db.get(Skill, payload.skill_id) is None:
        raise HTTPException(status_code=404, detail="Skill not found.")
    question = AssessmentQuestion(**payload.model_dump())
    db.add(question)
    db.commit()
    db.refresh(question)
    return {"id": question.id, "skill_id": question.skill_id, "topic": question.topic}


@router.post("/assessments/{skill_id}/attempt")
def submit_assessment(
    skill_id: int,
    payload: AssessmentSubmission,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    if not payload.answers:
        raise HTTPException(status_code=422, detail="Submit at least one answer.")
    questions = db.scalars(
        select(AssessmentQuestion).where(AssessmentQuestion.skill_id == skill_id)
    ).all()
    if not questions:
        raise HTTPException(status_code=404, detail="No assessment questions are configured for this skill.")
    if {item.id for item in questions} != set(payload.answers):
        raise HTTPException(status_code=422, detail="Answer every question in the assessment exactly once.")
    if any(not 0 <= payload.answers[item.id] < len(item.options) for item in questions):
        raise HTTPException(status_code=422, detail="An answer option is outside the valid range.")
    score = sum(payload.answers[item.id] == item.correct_index for item in questions) / len(questions) * 100
    action = assessment_action(score)
    attempt = AssessmentAttempt(
        user_id=user.id,
        skill_id=skill_id,
        score_percent=round(score, 2),
        action=action,
        answers={str(key): value for key, value in payload.answers.items()},
    )
    db.add(attempt)
    mark_work_assignment_complete(db, user.id, "assessment", skill_id)
    db.commit()
    return {
        "score_percent": attempt.score_percent,
        "action": action,
        "explanation": {
            "revision": "Your score is below 50%, so review the module before trying again.",
            "practice": "Your score is between 50% and 80%, so another practice activity is recommended.",
            "advanced": "Your score is above 80%, so advanced content is available.",
        }[action],
    }


@router.post("/documents/upload", status_code=201)
async def upload_document(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(require_admin),
):
    from app.services.rag import ingest_document

    if Path(file.filename or "").suffix.lower() not in {".pdf", ".docx", ".txt"}:
        raise HTTPException(status_code=415, detail="Upload a PDF, DOCX, or TXT document.")
    content = await file.read(settings.max_upload_bytes + 1)
    if len(content) > settings.max_upload_bytes:
        raise HTTPException(status_code=413, detail="Document exceeds the 10 MB upload limit.")
    try:
        document = ingest_document(db, Path(file.filename or "document").name, content, user.id)
    except (RuntimeError, ValueError) as error:
        db.rollback()
        raise HTTPException(status_code=503 if isinstance(error, RuntimeError) else 422, detail=str(error)) from error
    return {"id": document.id, "filename": document.filename, "status": document.status, "chunks": document.chunk_count}


@router.post("/rag/ask")
def ask_knowledge_base(
    payload: RagQuestion,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    from app.services.rag import answer_question

    try:
        employee_context = build_authorized_employee_context(db, user)
        result = answer_question(
            db,
            payload.question,
            conversation=[turn.model_dump() for turn in payload.conversation],
            employee_context=employee_context,
        )
        if user.access_role == "admin":
            db.add(AssistantHistory(user_id=user.id, question=payload.question, answer=result["answer"], sources=result["sources"]))
            db.commit()
        return result
    except RuntimeError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    except APIError as error:
        status = getattr(error, "code", None)
        if status == 429:
            detail = "The AI service quota is currently exhausted. Check your Gemini API quota and try again."
        elif status in {500, 502, 503, 504} or getattr(error, "status", None) in {"UNAVAILABLE", "INTERNAL"}:
            detail = "Gemini is temporarily busy. Please try your question again shortly."
        else:
            detail = "The AI service is temporarily unavailable. Check the Gemini model and API configuration, then try again."
        raise HTTPException(status_code=503, detail=detail) from None


def build_authorized_employee_context(db: Session, user: User, limit: int = 40) -> str:
    if user.access_role == "admin":
        query = select(User).where(User.access_role == "employee").order_by(User.full_name).limit(limit)
        scope = "all employees (admin access)"
    elif user.access_role == "manager":
        query = select(User).where(User.access_role == "employee", User.manager_id == user.id).order_by(User.full_name).limit(limit)
        scope = "employees assigned to this manager"
    else:
        query = select(User).where(User.id == user.id, User.access_role == "employee")
        scope = "the signed-in employee only"

    employees = db.scalars(query).all()
    if not employees:
        return f"No employee records are available within {scope}."

    records = [f"Authorized employee records for {scope}:"]
    for employee in employees:
        report = progress_report(db, employee)
        readiness = report["readiness"]
        role = db.get(JobRole, employee.job_role_id) if employee.job_role_id else None
        readiness_score = readiness.get("score_percent")
        summary = (
            f"{employee.full_name}: role={role.name if role else 'unassigned'}; "
            f"learning={report['overall_progress_percent']}% "
            f"({report['completed_modules']}/{report['assigned_modules']} modules); "
            f"readiness={readiness_score if readiness_score is not None else 'not scored'} "
            f"({readiness.get('status', 'unassigned')}); next step={report['next_action']}"
        )
        records.append(summary)
        for skill in readiness.get("skills", []):
            level = skill.get("current_level")
            records.append(
                f"  Skill {skill['skill']}: level {level if level is not None else 'not recorded'}/5, "
                f"target {skill['required_level']}/5, status {skill['category']}, "
                f"assessment={skill.get('assessment_percent') if skill.get('assessment_percent') is not None else 'none'}, "
                f"practical={skill.get('practical_percent') if skill.get('practical_percent') is not None else 'none'}."
            )
    return "\n".join(records)



@router.get("/admin/documents")
def admin_document_history(db: Session = Depends(get_db), user: User = Depends(require_admin)):
    del user
    rows = db.execute(
        select(Document, User.full_name)
        .join(User, User.id == Document.uploaded_by)
        .order_by(Document.created_at.desc(), Document.id.desc())
    ).all()
    return [
        {"id": document.id, "filename": document.filename, "status": document.status,
         "chunk_count": document.chunk_count, "uploaded_by": uploader, "created_at": document.created_at.isoformat()}
        for document, uploader in rows
    ]


@router.get("/admin/assistant-history")
def admin_assistant_history(db: Session = Depends(get_db), user: User = Depends(require_admin)):
    del user
    entries = db.scalars(select(AssistantHistory).order_by(AssistantHistory.created_at.desc(), AssistantHistory.id.desc()).limit(100)).all()
    return [
        {"id": entry.id, "question": entry.question, "answer": entry.answer,
         "sources": entry.sources, "created_at": entry.created_at.isoformat()}
        for entry in entries
    ]


@router.get("/policies")
def company_policies(db: Session = Depends(get_db), user: User = Depends(current_user)):
    del user
    documents = db.scalars(
        select(Document).where(Document.status == "ready").order_by(Document.filename)
    ).all()
    return [
        {
            "id": document.id,
            "filename": document.filename,
            "chunk_count": document.chunk_count,
            "sections": [
                {"title": chunk.source_section or f"Section {chunk.chunk_index + 1}", "content": chunk.content}
                for chunk in db.scalars(
                    select(DocumentChunk)
                    .where(DocumentChunk.document_id == document.id)
                    .order_by(DocumentChunk.chunk_index)
                ).all()
            ],
        }
        for document in documents
    ]


@router.get("/admin/users")
def list_users(db: Session = Depends(get_db), user: User = Depends(require_admin)):
    del user
    users = db.scalars(select(User).order_by(User.full_name)).all()
    return [
        {"id": item.id, "full_name": item.full_name, "email": item.email,
         "access_role": item.access_role, "job_role_id": item.job_role_id}
        for item in users
    ]


@router.post("/admin/users", status_code=201)
def create_employee_account(
    payload: AdminEmployeeCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_admin),
):
    del user
    role = db.get(JobRole, payload.job_role_id)
    if role is None:
        raise HTTPException(status_code=404, detail="Learning role not found.")
    employee = User(
        full_name=payload.full_name.strip(),
        email=payload.email.strip().lower(),
        password_hash=hash_password(payload.password),
        access_role="employee",
        job_role_id=role.id,
    )
    db.add(employee)
    try:
        db.flush()
        db.add(AdminEmployeeCredential(
            user_id=employee.id,
            encrypted_password=encrypt_admin_credential(payload.password),
        ))
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="An account with this email already exists.") from None
    db.refresh(employee)
    return {
        "id": employee.id,
        "full_name": employee.full_name,
        "email": employee.email,
        "access_role": employee.access_role,
        "job_role_id": employee.job_role_id,
    }


@router.get("/admin/users/credentials")
def get_employee_credentials(
    db: Session = Depends(get_db),
    user: User = Depends(require_admin),
):
    del user
    rows = db.execute(
        select(User, AdminEmployeeCredential)
        .join(AdminEmployeeCredential, AdminEmployeeCredential.user_id == User.id)
        .where(User.access_role == "employee")
        .order_by(User.full_name, User.id)
    ).all()
    return {"employees": [
        {
            "id": employee.id,
            "full_name": employee.full_name,
            "email": employee.email,
            "job_role_id": employee.job_role_id,
            "temporary_password": decrypt_admin_credential(credential.encrypted_password),
        }
        for employee, credential in rows
    ]}


@router.post("/admin/users/reset-passwords")
def reset_employee_passwords(
    db: Session = Depends(get_db),
    user: User = Depends(require_admin),
):
    del user
    employees = db.scalars(
        select(User).where(User.access_role == "employee").order_by(User.full_name, User.id)
    ).all()
    if not employees:
        raise HTTPException(status_code=409, detail="There are no employee accounts to reset.")
    issued_credentials = []
    for employee in employees:
        temporary_password = employee_temporary_password(employee.full_name)
        employee.password_hash = hash_password(temporary_password)
        credential = db.get(AdminEmployeeCredential, employee.id)
        if credential is None:
            credential = AdminEmployeeCredential(user_id=employee.id, encrypted_password="")
            db.add(credential)
        credential.encrypted_password = encrypt_admin_credential(temporary_password)
        issued_credentials.append({
            "id": employee.id,
            "full_name": employee.full_name,
            "email": employee.email,
            "job_role_id": employee.job_role_id,
            "temporary_password": temporary_password,
        })
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise
    return {"employees": issued_credentials}


@router.get("/admin/job-roles")
def list_admin_job_roles(db: Session = Depends(get_db), user: User = Depends(require_admin)):
    del user
    roles = db.scalars(select(JobRole).order_by(JobRole.name)).all()
    result = []
    for role in roles:
        requirements = db.execute(
            select(RoleSkillRequirement, Skill.name)
            .join(Skill, Skill.id == RoleSkillRequirement.skill_id)
            .where(RoleSkillRequirement.job_role_id == role.id)
            .order_by(Skill.name)
        ).all()
        result.append({
            "id": role.id,
            "name": role.name,
            "description": role.description,
            "skills": [
                {"id": requirement.skill_id, "name": skill_name,
                 "required_level": requirement.required_level, "priority": requirement.priority}
                for requirement, skill_name in requirements
            ],
        })
    return result


@router.put("/admin/users/{user_id}/job-role/{job_role_id}")
def assign_job_role(
    user_id: int,
    job_role_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_admin),
):
    del user
    employee = db.get(User, user_id)
    if employee is None or employee.access_role != "employee" or db.get(JobRole, job_role_id) is None:
        raise HTTPException(status_code=404, detail="Employee or job role not found.")
    employee.job_role_id = job_role_id
    db.commit()
    return {"user_id": user_id, "job_role_id": job_role_id}


def assignment_target(db: Session, assignment_type: str, target_id: int) -> tuple[str, str]:
    if assignment_type == "module":
        target = db.get(LearningModuleRecord, target_id)
        if target:
            skill = db.get(Skill, target.skill_id)
            return target.title, skill.name if skill else ""
    elif assignment_type == "assessment":
        skill = db.get(Skill, target_id)
        question_count = db.scalar(
            select(AssessmentQuestion.id).where(AssessmentQuestion.skill_id == target_id).limit(1)
        )
        if skill and question_count is not None:
            return f"{skill.name} quiz", skill.name
    elif assignment_type == "practical":
        target = db.get(PracticalTask, target_id)
        if target:
            skill = db.get(Skill, target.skill_id)
            return target.title, skill.name if skill else ""
    raise HTTPException(status_code=404, detail="That work item is unavailable. Check the selected module, quiz, or practical task.")


def serialize_assignment(db: Session, assignment: WorkAssignment, employee: User | None = None) -> dict:
    title, skill = assignment_target(db, assignment.assignment_type, assignment.target_id)
    return {
        "id": assignment.id,
        "employee_id": assignment.user_id,
        "employee_name": employee.full_name if employee else None,
        "assignment_type": assignment.assignment_type,
        "target_id": assignment.target_id,
        "title": title,
        "skill": skill,
        "due_at": assignment.due_at,
        "note": assignment.note,
        "status": assignment.status,
        "created_at": assignment.created_at,
    }


@router.post("/admin/assignments", status_code=201)
def assign_work(
    payload: WorkAssignmentCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_admin),
):
    assignment_target(db, payload.assignment_type, payload.target_id)
    employees = db.scalars(select(User).where(User.id.in_(payload.employee_ids))).all()
    if len(employees) != len(payload.employee_ids) or any(employee.access_role != "employee" for employee in employees):
        raise HTTPException(status_code=404, detail="One or more selected employee accounts were not found.")
    saved = []
    for employee in employees:
        assignment = db.scalar(
            select(WorkAssignment).where(
                WorkAssignment.user_id == employee.id,
                WorkAssignment.assignment_type == payload.assignment_type,
                WorkAssignment.target_id == payload.target_id,
            )
        )
        if assignment is None:
            assignment = WorkAssignment(
                user_id=employee.id,
                assigned_by=user.id,
                assignment_type=payload.assignment_type,
                target_id=payload.target_id,
            )
            db.add(assignment)
        assignment.assigned_by = user.id
        assignment.due_at = payload.due_at
        assignment.note = payload.note.strip()
        db.flush()
        saved.append(serialize_assignment(db, assignment, employee))
    db.commit()
    return {"assignments": saved, "assigned_count": len(saved)}


@router.get("/admin/assignments")
def list_admin_assignments(db: Session = Depends(get_db), user: User = Depends(require_admin)):
    del user
    rows = db.execute(
        select(WorkAssignment, User)
        .join(User, User.id == WorkAssignment.user_id)
        .order_by(WorkAssignment.status, WorkAssignment.due_at, User.full_name)
        .limit(300)
    ).all()
    return [serialize_assignment(db, assignment, employee) for assignment, employee in rows]


@router.get("/my/assignments")
def list_my_assignments(db: Session = Depends(get_db), user: User = Depends(current_user)):
    assignments = db.scalars(
        select(WorkAssignment)
        .where(WorkAssignment.user_id == user.id)
        .order_by(WorkAssignment.status, WorkAssignment.due_at, WorkAssignment.created_at.desc())
    ).all()
    return [serialize_assignment(db, assignment) for assignment in assignments]


@router.get("/catalog")
def catalog(db: Session = Depends(get_db), user: User = Depends(current_user)):
    del user
    roles = db.scalars(select(JobRole).order_by(JobRole.name)).all()
    skills = db.scalars(select(Skill).order_by(Skill.name)).all()
    return {
        "roles": [{"id": role.id, "name": role.name, "description": role.description} for role in roles],
        "skills": [{"id": skill.id, "name": skill.name} for skill in skills],
    }


@router.post("/admin/job-roles", status_code=201)
def create_job_role(
    payload: JobRoleCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_admin),
):
    del user
    role = JobRole(name=payload.name.strip(), description=payload.description.strip())
    db.add(role)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="That job role already exists.") from None
    db.refresh(role)
    return {"id": role.id, "name": role.name, "description": role.description}


@router.post("/admin/skills", status_code=201)
def create_skill(
    payload: SkillCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_admin),
):
    del user
    skill = Skill(name=payload.name.strip(), description=payload.description.strip())
    db.add(skill)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="That skill already exists.") from None
    db.refresh(skill)
    return {"id": skill.id, "name": skill.name, "description": skill.description}


@router.put("/admin/job-roles/{job_role_id}/skills/{skill_id}")
def set_role_requirement(
    job_role_id: int,
    skill_id: int,
    payload: RoleRequirementUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_admin),
):
    del user
    if db.get(JobRole, job_role_id) is None or db.get(Skill, skill_id) is None:
        raise HTTPException(status_code=404, detail="Job role or skill not found.")
    requirement = db.scalar(
        select(RoleSkillRequirement).where(
            RoleSkillRequirement.job_role_id == job_role_id,
            RoleSkillRequirement.skill_id == skill_id,
        )
    )
    if requirement is None:
        requirement = RoleSkillRequirement(job_role_id=job_role_id, skill_id=skill_id)
        db.add(requirement)
    requirement.required_level = payload.required_level
    requirement.priority = payload.priority
    db.commit()
    return {"job_role_id": job_role_id, "skill_id": skill_id, "required_level": payload.required_level, "priority": payload.priority}


@router.post("/admin/modules", status_code=201)
def create_learning_module(
    payload: LearningModuleCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_admin),
):
    del user
    if db.get(Skill, payload.skill_id) is None:
        raise HTTPException(status_code=404, detail="Skill not found.")
    if len(set(payload.prerequisites)) != len(payload.prerequisites):
        raise HTTPException(status_code=422, detail="A prerequisite can only be listed once.")
    if any(db.get(LearningModuleRecord, item) is None for item in payload.prerequisites):
        raise HTTPException(status_code=404, detail="One or more prerequisite modules were not found.")
    module = LearningModuleRecord(**payload.model_dump())
    db.add(module)
    db.commit()
    db.refresh(module)
    return {"id": module.id, "title": module.title, "skill_id": module.skill_id}


@router.get("/admin/modules")
def admin_learning_modules(db: Session = Depends(get_db), user: User = Depends(require_admin)):
    del user
    rows = db.execute(
        select(LearningModuleRecord, Skill.name)
        .join(Skill, Skill.id == LearningModuleRecord.skill_id)
        .order_by(Skill.name, LearningModuleRecord.title)
    ).all()
    return [
        {
            "id": module.id,
            "title": module.title,
            "description": module.description,
            "content": module.content,
            "skill_id": module.skill_id,
            "skill": skill_name,
            "estimated_minutes": module.estimated_minutes,
            "prerequisites": module.prerequisites,
        }
        for module, skill_name in rows
    ]


@router.post("/admin/practical-tasks", status_code=201)
def create_practical_task(
    payload: PracticalTaskCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_admin),
):
    del user
    if db.get(Skill, payload.skill_id) is None:
        raise HTTPException(status_code=404, detail="Skill not found.")
    from app.services.practical_tasks import evaluate_practical_task

    try:
        evaluate_practical_task({}, payload.checks)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    task = PracticalTask(**payload.model_dump())
    db.add(task)
    db.commit()
    db.refresh(task)
    return {"id": task.id, "title": task.title}


@router.get("/admin/practical-tasks")
def admin_practical_tasks(db: Session = Depends(get_db), user: User = Depends(require_admin)):
    del user
    rows = db.execute(
        select(PracticalTask, Skill.name)
        .join(Skill, Skill.id == PracticalTask.skill_id)
        .order_by(PracticalTask.title)
    ).all()
    return [
        {
            "id": task.id,
            "title": task.title,
            "description": task.description,
            "instructions": task.instructions,
            "skill_id": task.skill_id,
            "skill": skill_name,
            "checks": task.checks,
        }
        for task, skill_name in rows
    ]


@router.get("/practical-tasks")
def practical_tasks(db: Session = Depends(get_db), user: User = Depends(current_user)):
    tasks = db.scalars(select(PracticalTask).order_by(PracticalTask.id)).all()
    return [
        {
            "id": task.id,
            "title": task.title,
            "description": task.description,
            "instructions": task.instructions,
            "skill_id": task.skill_id,
            "checks": [{"label": check.get("label", check.get("path", "Check"))} for check in task.checks],
            "latest_submission": db.scalar(
                select(PracticalSubmission)
                .where(PracticalSubmission.user_id == user.id, PracticalSubmission.task_id == task.id)
                .order_by(PracticalSubmission.created_at.desc())
                .limit(1)
            ),
        }
        for task in tasks
    ]


@router.post("/practical-tasks/{task_id}/submissions")
def submit_practical_task(
    task_id: int,
    payload: PracticalTaskSubmissionRequest,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    task = db.get(PracticalTask, task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="Practical task not found.")
    from app.services.practical_tasks import evaluate_practical_task

    try:
        result = evaluate_practical_task(payload.output, task.checks)
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    submission = PracticalSubmission(
        user_id=user.id,
        task_id=task.id,
        submitted_output=payload.output,
        check_results=result["checks"],
        score_percent=result["score_percent"],
        passed=result["passed"],
    )
    db.add(submission)
    mark_work_assignment_complete(db, user.id, "practical", task.id)
    db.commit()
    return {"score_percent": submission.score_percent, "passed": submission.passed, "checks": submission.check_results}


@router.get("/manager/employees")
def manager_employees(db: Session = Depends(get_db), user: User = Depends(current_user)):
    if user.access_role not in {"manager", "admin"}:
        raise HTTPException(status_code=403, detail="Manager access is required.")
    query = select(User).order_by(User.full_name)
    if user.access_role == "manager":
        query = query.where(User.manager_id == user.id)
    employees = db.scalars(query).all()
    result = []
    for employee in employees:
        if employee.access_role != "employee":
            continue
        path = db.scalars(select(LearningPathItem).where(LearningPathItem.user_id == employee.id)).all()
        attempts = db.scalars(
            select(AssessmentAttempt)
            .where(AssessmentAttempt.user_id == employee.id)
            .order_by(AssessmentAttempt.created_at.desc())
            .limit(1)
        ).first()
        role = db.get(JobRole, employee.job_role_id) if employee.job_role_id else None
        result.append(
            {
                "id": employee.id,
                "full_name": employee.full_name,
                "email": employee.email,
                "job_role": role.name if role else None,
                "progress_percent": round(sum(item.status == "completed" for item in path) / len(path) * 100) if path else 0,
                "latest_assessment": attempts.score_percent if attempts else None,
            }
        )
    return result


@router.get("/progress/report")
def progress_report(db: Session = Depends(get_db), user: User = Depends(current_user)):
    gaps = employee_gaps(db, user)
    readiness = employee_readiness(db, user)
    attempts = db.scalars(
        select(AssessmentAttempt).where(AssessmentAttempt.user_id == user.id).order_by(AssessmentAttempt.created_at.desc())
    ).all()
    practical = db.scalars(
        select(PracticalSubmission).where(PracticalSubmission.user_id == user.id).order_by(PracticalSubmission.created_at.desc())
    ).all()
    path_items = db.scalars(select(LearningPathItem).where(LearningPathItem.user_id == user.id)).all()
    return {
        "employee": {"id": user.id, "name": user.full_name},
        "overall_progress_percent": round(sum(item.status == "completed" for item in path_items) / len(path_items) * 100) if path_items else 0,
        "skills": [gap.__dict__ for gap in gaps],
            "readiness": readiness,
        "assessments": [
            {"skill_id": item.skill_id, "score_percent": item.score_percent, "action": item.action, "created_at": item.created_at}
            for item in attempts
        ],
        "practical_tasks": [
            {"task_id": item.task_id, "score_percent": item.score_percent, "passed": item.passed, "checks": item.check_results}
            for item in practical
        ],
        "completed_modules": sum(item.status == "completed" for item in path_items),
        "assigned_modules": len(path_items),
        "next_action": dashboard(db, user)["next_action"],
    }


@router.get("/manager/employees/{employee_id}/progress")
def employee_progress_report(
    employee_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    employee = db.get(User, employee_id)
    if employee is None or employee.access_role != "employee":
        raise HTTPException(status_code=404, detail="Employee not found.")
    if user.access_role == "manager" and employee.manager_id != user.id:
        raise HTTPException(status_code=403, detail="This employee is not assigned to you.")
    if user.access_role not in {"manager", "admin"}:
        raise HTTPException(status_code=403, detail="Manager access is required.")
    return progress_report(db, employee)
