import os

from dotenv import load_dotenv
from sqlalchemy import select

from app.core.security import hash_password
from app.database import Base, SessionLocal, engine
from app.models import (
    AssessmentQuestion,
    EmployeeSkill,
    JobRole,
    LearningModule,
    PracticalTask,
    RoleSkillRequirement,
    Skill,
    User,
)


def main() -> None:
    load_dotenv()
    email = os.environ.get("ONBOARDX_ADMIN_EMAIL", "").strip().lower()
    password = os.environ.get("ONBOARDX_ADMIN_PASSWORD", "")
    if not email or len(password) < 12:
        raise SystemExit("Set ONBOARDX_ADMIN_EMAIL and ONBOARDX_ADMIN_PASSWORD (12+ characters) first.")

    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        admin = db.scalar(select(User).where(User.email == email))
        if admin is None:
            admin = User(
                email=email,
                full_name="Onboarding Admin",
                password_hash=hash_password(password),
                access_role="admin",
            )
            db.add(admin)
            db.flush()
        else:
            admin.access_role = "admin"
            admin.password_hash = hash_password(password)

        role = db.scalar(select(JobRole).where(JobRole.name == "AI/ML Engineer"))
        if role is None:
            role = JobRole(
                name="AI/ML Engineer",
                description="Build and operate reliable machine-learning services, APIs, and retrieval systems.",
            )
            db.add(role)
            db.flush()

        catalog = [
            ("Python", 4, 4),
            ("SQL", 3, 3),
            ("Machine Learning", 4, 3),
            ("FastAPI", 3, 3),
            ("Docker", 3, 2),
            ("RAG", 3, 2),
        ]
        skill_ids: dict[str, int] = {}
        for name, required, priority in catalog:
            skill = db.scalar(select(Skill).where(Skill.name == name))
            if skill is None:
                skill = Skill(name=name)
                db.add(skill)
                db.flush()
            skill_ids[name] = skill.id
            requirement = db.scalar(
                select(RoleSkillRequirement).where(
                    RoleSkillRequirement.job_role_id == role.id,
                    RoleSkillRequirement.skill_id == skill.id,
                )
            )
            if requirement is None:
                db.add(
                    RoleSkillRequirement(
                        job_role_id=role.id,
                        skill_id=skill.id,
                        required_level=required,
                        priority=priority,
                    )
                )

        employee_email = "rahul@example.com"
        employee = db.scalar(select(User).where(User.email == employee_email))
        if employee is None:
            employee = User(
                email=employee_email,
                full_name="Rahul Sharma",
                password_hash=hash_password(password),
                access_role="employee",
                job_role_id=role.id,
            )
            db.add(employee)
            db.flush()
        else:
            employee.job_role_id = role.id

        for name, level in {"Python": 4, "SQL": 3, "Machine Learning": 3, "FastAPI": 1}.items():
            existing = db.scalar(
                select(EmployeeSkill).where(
                    EmployeeSkill.user_id == employee.id,
                    EmployeeSkill.skill_id == skill_ids[name],
                )
            )
            if existing is None:
                db.add(EmployeeSkill(user_id=employee.id, skill_id=skill_ids[name], level=level))

        module_specs = [
            ("FastAPI Fundamentals", "Build typed HTTP endpoints and validate requests.", "FastAPI", []),
            ("Docker Fundamentals", "Create repeatable containers and understand image layers.", "Docker", []),
            ("RAG Foundations", "Trace ingestion, chunking, embedding, retrieval, and grounded generation.", "RAG", []),
            ("SQL Query Practice", "Practice joins, constraints, and safe parameterized queries.", "SQL", []),
            ("Machine Learning Evaluation", "Choose metrics and inspect model errors before deployment.", "Machine Learning", []),
        ]
        module_ids: dict[str, int] = {}
        for title, description, skill_name, prerequisites in module_specs:
            module = db.scalar(select(LearningModule).where(LearningModule.title == title))
            if module is None:
                module = LearningModule(
                    title=title,
                    description=description,
                    content=(
                        f"## {title}\n\n{description}\n\n"
                        "### Apply it\nExplain the trade-offs you would consider before using this in a production service."
                    ),
                    skill_id=skill_ids[skill_name],
                    prerequisites=prerequisites,
                    estimated_minutes=25,
                )
                db.add(module)
                db.flush()
            module_ids[title] = module.id

        questions = [
            ("FastAPI", "Request validation", "foundation", "What should validate an incoming JSON request?", ["Pydantic schema", "CSS selector", "SQL index", "JWT signature"], 0, "Pydantic models validate and parse request data."),
            ("FastAPI", "HTTP semantics", "foundation", "Which status code represents a newly created resource?", ["200", "201", "302", "404"], 1, "201 Created is appropriate after resource creation."),
            ("Docker", "Images and containers", "foundation", "What is a container image?", ["A running process", "A template used to create containers", "A database row", "A network port"], 1, "An image is the packaged template from which containers are created."),
            ("RAG", "Retrieval", "foundation", "What does semantic retrieval compare?", ["Embedding vectors", "File extensions", "Password hashes", "HTTP status codes"], 0, "Semantic retrieval compares query and chunk embeddings."),
            ("SQL", "Relational queries", "foundation", "What does a foreign key enforce?", ["Referential integrity", "Text formatting", "Model training", "Request caching"], 0, "A foreign key constrains references to related records."),
            ("Machine Learning", "Evaluation", "foundation", "Why keep a test set separate?", ["To estimate generalization on unseen data", "To tune every parameter", "To increase training size", "To avoid recording metrics"], 0, "A held-out test set estimates performance on unseen examples."),
        ]
        for skill_name, topic, difficulty, prompt, options, correct_index, explanation in questions:
            exists = db.scalar(
                select(AssessmentQuestion).where(
                    AssessmentQuestion.skill_id == skill_ids[skill_name],
                    AssessmentQuestion.prompt == prompt,
                )
            )
            if exists is None:
                db.add(
                    AssessmentQuestion(
                        skill_id=skill_ids[skill_name],
                        topic=topic,
                        difficulty=difficulty,
                        prompt=prompt,
                        options=options,
                        correct_index=correct_index,
                        explanation=explanation,
                    )
                )
        task_title = "FastAPI response contract"
        if db.scalar(select(PracticalTask).where(PracticalTask.title == task_title)) is None:
            db.add(
                PracticalTask(
                    title=task_title,
                    description="Return a successful create response with the expected resource shape.",
                    instructions=(
                        'Submit a JSON response with status 201 and body {"name":"Example", "active":true}. '
                        "The evaluator checks the response contract, not executable code."
                    ),
                    skill_id=skill_ids["FastAPI"],
                    checks=[
                        {"label": "Created status", "path": "status", "operator": "equals", "value": 201},
                        {"label": "Resource name", "path": "body.name", "operator": "equals", "value": "Example"},
                        {"label": "Active flag", "path": "body.active", "operator": "type_is", "value": "bool"},
                    ],
                )
            )
        db.commit()
    print(f"Demo data ready. Admin: {email}; employee: rahul@example.com (same configured password).")


if __name__ == "__main__":
    main()
