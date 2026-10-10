from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select

from app import models  # noqa: F401
from app.api import router
from app.core.config import settings
from app.core.security import hash_password
from app.database import Base, SessionLocal, engine
from app.models import User


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(bind=engine)
    email = settings.onboardx_admin_email.strip().lower()
    password = settings.onboardx_admin_password
    if bool(email) != bool(password):
        raise RuntimeError("Set both ONBOARDX_ADMIN_EMAIL and ONBOARDX_ADMIN_PASSWORD to create the admin account.")
    if email:
        if "@" not in email or len(password) < 12:
            raise RuntimeError("ONBOARDX_ADMIN_EMAIL must be a valid email and ONBOARDX_ADMIN_PASSWORD must be at least 12 characters.")
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
            else:
                admin.password_hash = hash_password(password)
                admin.access_role = "admin"
            db.commit()
    yield


app = FastAPI(title=settings.app_name, version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)
app.include_router(router, prefix="/api")


@app.get("/health")
def health():
    return {"status": "ok", "service": settings.app_name}
