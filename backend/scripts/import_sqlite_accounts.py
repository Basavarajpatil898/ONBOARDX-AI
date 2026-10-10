"""Copy missing employee login accounts from the legacy local SQLite DB.

Run from backend with the project virtual environment:
    python -m scripts.import_sqlite_accounts --apply

Without --apply, the script only reports how many accounts would be added.
Existing PostgreSQL accounts are never overwritten.
"""

import argparse
import sqlite3
from pathlib import Path

from sqlalchemy import select

from app.core.config import settings
from app.database import SessionLocal
from app.models import JobRole, RoleSkillRequirement, Skill, User


def read_source(source: Path) -> tuple[list[dict], list[dict], list[dict], list[dict]]:
    if not source.is_file():
        raise FileNotFoundError(f"SQLite source database not found: {source}")
    connection = sqlite3.connect(f"file:{source.resolve().as_posix()}?mode=ro", uri=True)
    connection.row_factory = sqlite3.Row
    try:
        users = [dict(row) for row in connection.execute(
            "SELECT email, full_name, password_hash, access_role, job_role_id FROM users WHERE access_role = 'employee'"
        )]
        roles = [dict(row) for row in connection.execute("SELECT id, name, description FROM job_roles")]
        skills = [dict(row) for row in connection.execute("SELECT id, name, description FROM skills")]
        requirements = [dict(row) for row in connection.execute(
            "SELECT job_role_id, skill_id, required_level, priority FROM role_skill_requirements"
        )]
        return users, roles, skills, requirements
    finally:
        connection.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Import missing employee accounts from the local SQLite database.")
    parser.add_argument("--source", type=Path, default=Path(__file__).resolve().parents[1] / "onboardx.db")
    parser.add_argument("--apply", action="store_true", help="Apply the import. Omit to run a dry run.")
    args = parser.parse_args()

    if settings.database_url.startswith("sqlite"):
        raise RuntimeError("DATABASE_URL points to SQLite; configure the active PostgreSQL database before importing.")

    users, source_roles, source_skills, source_requirements = read_source(args.source)
    with SessionLocal() as db:
        existing_emails = {
            email.strip().casefold()
            for email in db.scalars(select(User.email)).all()
        }
        missing_users = [row for row in users if row["email"].strip().casefold() not in existing_emails]
        print(f"Employee accounts found in SQLite: {len(users)}")
        print(f"Accounts already present in PostgreSQL: {len(users) - len(missing_users)}")
        print(f"Missing accounts to add: {len(missing_users)}")
        if not args.apply or not missing_users:
            print("Dry run only. No PostgreSQL data was changed." if not args.apply else "Nothing to import.")
            return

        pg_roles = {row.name.casefold(): row for row in db.scalars(select(JobRole)).all()}
        role_ids: dict[int, int] = {}
        for row in source_roles:
            key = row["name"].strip().casefold()
            role = pg_roles.get(key)
            if role is None:
                role = JobRole(name=row["name"].strip(), description=row["description"] or "")
                db.add(role)
                db.flush()
                pg_roles[key] = role
            role_ids[row["id"]] = role.id

        pg_skills = {row.name.casefold(): row for row in db.scalars(select(Skill)).all()}
        skill_ids: dict[int, int] = {}
        for row in source_skills:
            key = row["name"].strip().casefold()
            skill = pg_skills.get(key)
            if skill is None:
                skill = Skill(name=row["name"].strip(), description=row["description"] or "")
                db.add(skill)
                db.flush()
                pg_skills[key] = skill
            skill_ids[row["id"]] = skill.id

        existing_requirements = {
            (row.job_role_id, row.skill_id)
            for row in db.scalars(select(RoleSkillRequirement)).all()
        }
        for row in source_requirements:
            role_id = role_ids.get(row["job_role_id"])
            skill_id = skill_ids.get(row["skill_id"])
            if role_id is None or skill_id is None or (role_id, skill_id) in existing_requirements:
                continue
            db.add(RoleSkillRequirement(
                job_role_id=role_id,
                skill_id=skill_id,
                required_level=row["required_level"],
                priority=row["priority"],
            ))
            existing_requirements.add((role_id, skill_id))

        for row in missing_users:
            if not row["password_hash"].startswith("$argon2id$"):
                raise ValueError("A source employee password hash is not in the expected Argon2id format; import stopped.")
            db.add(User(
                email=row["email"].strip().lower(),
                full_name=row["full_name"],
                password_hash=row["password_hash"],
                access_role="employee",
                job_role_id=role_ids.get(row["job_role_id"]),
            ))
        db.commit()
        print(f"Imported {len(missing_users)} employee accounts and their job role requirements.")
        print("Existing PostgreSQL account records were left unchanged.")


if __name__ == "__main__":
    main()
