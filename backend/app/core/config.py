from pathlib import Path
from typing import Literal

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "ONBOARDX AI"
    app_env: Literal["development", "production"] = "development"
    database_url: str
    jwt_secret: str = "development-only-change-me-please-set-a-32-byte-secret"
    jwt_expiry_minutes: int = 60
    gemini_api_key: str | None = None
    gemini_model: str = "gemini-3.8-flash"
    gemini_web_search_enabled: bool = True
    gemini_embedding_model: str = "gemini-embedding-001"
    embedding_dimensions: int = 768
    frontend_origins: str = "http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174"
    max_upload_bytes: int = 10_485_760
    onboardx_admin_email: str = ""
    onboardx_admin_password: str = ""

    model_config = SettingsConfigDict(
        env_file=Path(__file__).resolve().parents[2] / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @model_validator(mode="after")
    def validate_deployment_settings(self):
        if self.jwt_expiry_minutes < 5 or self.jwt_expiry_minutes > 1440:
            raise ValueError("JWT_EXPIRY_MINUTES must be between 5 and 1440.")
        if self.max_upload_bytes < 1 or self.max_upload_bytes > 50_000_000:
            raise ValueError("MAX_UPLOAD_BYTES must be between 1 byte and 50 MB.")
        if self.app_env.strip().lower() == "production":
            if self.jwt_secret == "development-only-change-me-please-set-a-32-byte-secret" or len(self.jwt_secret) < 32:
                raise ValueError("Production requires a unique JWT_SECRET of at least 32 characters.")
            if any("localhost" in origin or "127.0.0.1" in origin for origin in self.allowed_origins):
                raise ValueError("Production FRONTEND_ORIGINS must not contain localhost addresses.")
        return self

    @field_validator("database_url")
    @classmethod
    def require_postgresql(cls, value: str) -> str:
        if value.startswith("postgresql://"):
            return value.replace("postgresql://", "postgresql+psycopg://", 1)
        if not value.startswith("postgresql+psycopg://"):
            raise ValueError("DATABASE_URL must use PostgreSQL with the psycopg driver.")
        return value

    @property
    def allowed_origins(self) -> list[str]:
        return [origin.strip() for origin in self.frontend_origins.split(",") if origin.strip()]


settings = Settings()
