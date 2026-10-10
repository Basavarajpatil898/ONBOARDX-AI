from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.security import create_access_token, hash_password
from app.database import Base, get_db
from app.main import app
from app.models import (
    AssessmentAttempt,
    AssessmentQuestion,
    EmployeeSkill,
    JobRole,
    LearningModule,
    PracticalSubmission,
    PracticalTask,
    RoleSkillRequirement,
    Skill,
    User,
)


@pytest.fixture
def api_client() -> Generator[tuple[TestClient, sessionmaker[Session]], None, None]:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    test_session = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

    def override_get_db() -> Generator[Session, None, None]:
        with test_session() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db
    yield TestClient(app), test_session
    app.dependency_overrides.pop(get_db, None)
    Base.metadata.drop_all(bind=engine)
    engine.dispose()


def test_auth_response_never_contains_password_hash(api_client) -> None:
    client, _ = api_client

    response = client.post(
        "/api/auth/register",
        json={"full_name": "Ada Employee", "email": "ada@example.com", "password": "long-password-123"},
    )

    assert response.status_code == 201
    assert "password_hash" not in response.json()["user"]


def test_assessment_requires_all_questions_and_accepts_complete_answers(api_client) -> None:
    client, test_session = api_client
    with test_session() as session:
        skill = Skill(name="FastAPI")
        user = User(
            email="employee@example.com",
            full_name="Test Employee",
            password_hash=hash_password("long-password-123"),
        )
        session.add_all([skill, user])
        session.flush()
        questions = [
            AssessmentQuestion(
                skill_id=skill.id,
                topic="HTTP",
                difficulty="foundation",
                prompt=f"Question {index}",
                options=["Correct", "Incorrect"],
                correct_index=0,
            )
            for index in range(2)
        ]
        session.add_all(questions)
        session.commit()
        skill_id = skill.id
        question_ids = [question.id for question in questions]
        token = create_access_token(str(user.id))

    headers = {"Authorization": f"Bearer {token}"}
    partial = client.post(
        f"/api/assessments/{skill_id}/attempt",
        json={"answers": {str(question_ids[0]): 0}},
        headers=headers,
    )
    assert partial.status_code == 422

    complete = client.post(
        f"/api/assessments/{skill_id}/attempt",
        json={"answers": {str(question_id): 0 for question_id in question_ids}},
        headers=headers,
    )
    assert complete.status_code == 200
    assert complete.json()["score_percent"] == 100
    with test_session() as session:
        assert len(session.scalars(select(AssessmentAttempt)).all()) == 1


def test_dashboard_and_learning_path_use_recorded_employee_evidence(api_client) -> None:
    client, test_session = api_client
    with test_session() as session:
        role = JobRole(name="Backend Developer", description="Build backend services.")
        python = Skill(name="Python")
        docker = Skill(name="Docker")
        user = User(
            email="learner@example.com",
            full_name="Test Learner",
            password_hash=hash_password("long-password-123"),
        )
        session.add_all([role, python, docker, user])
        session.flush()
        user.job_role_id = role.id
        session.add_all(
            [
                RoleSkillRequirement(job_role_id=role.id, skill_id=python.id, required_level=4, priority=1),
                RoleSkillRequirement(job_role_id=role.id, skill_id=docker.id, required_level=3, priority=2),
                EmployeeSkill(user_id=user.id, skill_id=python.id, level=4),
                EmployeeSkill(user_id=user.id, skill_id=docker.id, level=1),
            ]
        )
        docker_basics = LearningModule(
            title="Docker Basics", skill_id=docker.id, prerequisites=[], estimated_minutes=20
        )
        docker_advanced = LearningModule(
            title="Docker Advanced", skill_id=docker.id, prerequisites=[], estimated_minutes=30
        )
        session.add_all([docker_basics, docker_advanced])
        task = PracticalTask(title="Docker Task", skill_id=docker.id, checks=[{"path": "ok", "operator": "exists"}])
        session.add(task)
        session.flush()
        docker_advanced.prerequisites = [docker_basics.id]
        session.add_all(
            [
                AssessmentAttempt(
                    user_id=user.id,
                    skill_id=docker.id,
                    score_percent=20,
                    action="revision",
                    answers={},
                ),
                PracticalSubmission(
                    user_id=user.id,
                    task_id=task.id,
                    submitted_output={"ok": True},
                    check_results=[],
                    score_percent=60,
                    passed=False,
                ),
            ]
        )
        session.commit()
        token = create_access_token(str(user.id))

    headers = {"Authorization": f"Bearer {token}"}
    dashboard = client.get("/api/dashboard", headers=headers)
    assert dashboard.status_code == 200
    body = dashboard.json()
    assert body["readiness"]["status"] == "developing"
    assert body["readiness"]["score_percent"] == 58.5
    docker_evidence = next(item for item in body["readiness"]["skills"] if item["skill"] == "Docker")
    assert docker_evidence["assessment_percent"] == 20
    assert docker_evidence["practical_percent"] == 60
    assert docker_evidence["priority"] == 2
    assert body["next_action_view"] == "assessments"

    path = client.get("/api/learning/path", headers=headers)
    assert path.status_code == 200
    modules = path.json()
    assert [item["title"] for item in modules] == ["Docker Basics", "Docker Advanced"]
    assert "Assessment score 20%" in modules[0]["recommendation_reason"]
    assert modules[0]["is_available"] is True
    assert modules[1]["is_available"] is False