from datetime import datetime, timedelta, timezone
import base64
import hashlib

import jwt
from cryptography.fernet import Fernet
from pwdlib import PasswordHash

from app.core.config import settings


password_hash = PasswordHash.recommended()
ALGORITHM = "HS256"


def _credential_cipher() -> Fernet:
    key_material = hashlib.sha256(("onboardx-admin-credential-vault:" + settings.jwt_secret).encode("utf-8")).digest()
    return Fernet(base64.urlsafe_b64encode(key_material))


def encrypt_admin_credential(value: str) -> str:
    return _credential_cipher().encrypt(value.encode("utf-8")).decode("ascii")


def decrypt_admin_credential(value: str) -> str:
    return _credential_cipher().decrypt(value.encode("ascii")).decode("utf-8")


def hash_password(password: str) -> str:
    return password_hash.hash(password)


def verify_password(password: str, stored_hash: str) -> bool:
    return password_hash.verify(password, stored_hash)


def create_access_token(subject: str) -> str:
    expires = datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_expiry_minutes)
    return jwt.encode({"sub": subject, "exp": expires}, settings.jwt_secret, algorithm=ALGORITHM)
