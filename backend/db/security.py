"""
Password hashing (bcrypt) and JWT session tokens. JWT_SECRET must come from
the environment, never a literal in code -- see backend/.env. There is no
fallback default: a server that can't verify its own tokens should fail to
start, not silently sign with a guessable secret.
"""
import datetime
import os
from pathlib import Path
from typing import Optional

import bcrypt
import jwt
from dotenv import load_dotenv

# See database.py's matching comment: an explicit path, not load_dotenv()'s
# call-depth-dependent frame-guessing default.
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

JWT_SECRET = os.getenv("JWT_SECRET")
if not JWT_SECRET:
    raise RuntimeError(
        "JWT_SECRET is not set. Add a long random value to backend/.env, e.g. "
        "generate one with: python -c \"import secrets; print(secrets.token_hex(32))\""
    )

JWT_ALGORITHM = "HS256"
JWT_EXPIRES_HOURS = 24 * 7


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except ValueError:
        return False


def create_access_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "exp": datetime.datetime.utcnow() + datetime.timedelta(hours=JWT_EXPIRES_HOURS),
        "iat": datetime.datetime.utcnow(),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_access_token(token: str) -> Optional[str]:
    """Returns the user id the token was issued for, or None if the token is
    missing, expired, or doesn't verify -- callers treat None as "not signed
    in", never as an error to surface."""
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.PyJWTError:
        return None
    return payload.get("sub")
