"""
Real user accounts: signup, login, and the current-user lookup every other
authenticated endpoint depends on. Replaces the frontend's local-only mock
(src/services/api.js's old authService, which accepted any email/password)
-- the frontend already sends `Authorization: Bearer <token>` on every
request (see src/services/api.js's axios interceptor), so this is the
backend finally answering a header it was already receiving.
"""
import datetime
import re
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, field_validator
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

from ..db import security
from ..db.database import SessionLocal, get_db
from ..db.models import User


def _get_user_resilient(user_id: str) -> Optional[User]:
    """db.get(User, user_id) with one retry on a fresh connection.

    Neon can drop a pooled connection out from under a request that's been
    sitting idle for a while (a 1-2 minute training run with no DB activity
    in between, for instance) -- `pool_pre_ping` and `pool_recycle` (see
    database.py) cut this down a lot, but Neon can still kill a connection
    in the narrow gap between the pre-ping check and the real query. Since
    this lookup runs on every single authenticated request, one transient
    `OperationalError` here used to take down whatever the user was actually
    trying to do (predict, history, outreach...) with an unrelated-looking
    500. A fresh SessionLocal() is a fresh connection from the pool, so
    retrying once is enough to ride out the one-in-a-while drop instead of
    surfacing it as a broken request.
    """
    for attempt in (1, 2):
        db = SessionLocal()
        try:
            return db.get(User, user_id)
        except OperationalError:
            if attempt == 2:
                raise
        finally:
            db.close()
    return None  # unreachable; keeps type checkers happy

router = APIRouter(prefix="/api/auth", tags=["auth"])

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _user_out(user: User) -> dict:
    return {"id": user.id, "email": user.email, "name": user.name, "company": user.company}


class SignupRequest(BaseModel):
    email: str
    password: str
    name: str
    company: Optional[str] = None

    @field_validator("email")
    @classmethod
    def _valid_email(cls, v: str) -> str:
        v = v.strip().lower()
        if not _EMAIL_RE.match(v):
            raise ValueError("That doesn't look like a valid email address.")
        return v

    @field_validator("password")
    @classmethod
    def _valid_password(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters.")
        return v

    @field_validator("name")
    @classmethod
    def _valid_name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Name is required.")
        return v


class LoginRequest(BaseModel):
    email: str
    password: str


@router.post("/signup")
def signup(body: SignupRequest, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == body.email).first():
        raise HTTPException(409, "An account with that email already exists.")

    user = User(
        email=body.email,
        password_hash=security.hash_password(body.password),
        name=body.name,
        company=body.company or None,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = security.create_access_token(user.id)
    return {"token": token, "user": _user_out(user)}


@router.post("/login")
def login(body: LoginRequest, db: Session = Depends(get_db)):
    email = body.email.strip().lower()
    user = db.query(User).filter(User.email == email).first()
    if not user or not security.verify_password(body.password, user.password_hash):
        raise HTTPException(401, "Incorrect email or password.")

    user.last_login_at = datetime.datetime.utcnow()
    db.commit()

    token = security.create_access_token(user.id)
    return {"token": token, "user": _user_out(user)}


def get_current_user(authorization: Optional[str] = Header(None)) -> User:
    """Required auth: raises 401 if there's no valid session.

    Deliberately does NOT take `db: Session = Depends(get_db)`. A FastAPI
    dependency's session is only closed after the whole request finishes --
    not after this function returns -- so every route behind this dependency
    was holding a Neon connection checked out for as long as the route body
    took to run: a full Optuna retrain, a SHAP pass, an LLM outreach draft,
    sometimes minutes. A handful of those in flight at once (including the
    frontend's habit of firing some GETs twice) was enough to exhaust the
    pool (size 5 + overflow 10 = 15) and make every other request -- even a
    plain, otherwise-instant GET /datasets/history -- queue for the full 30s
    pool timeout and then fail with `QueuePool limit ... connection timed
    out`. Opening and closing a session just for this one id lookup returns
    the connection to the pool immediately, before the route's real work
    (which never touches the DB again) even starts.
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Sign in required.")
    user_id = security.decode_access_token(authorization.removeprefix("Bearer ").strip())
    if not user_id:
        raise HTTPException(401, "Your session has expired. Please sign in again.")
    user = _get_user_resilient(user_id)
    if not user:
        raise HTTPException(401, "Your session is no longer valid. Please sign in again.")
    return user


def get_current_user_optional(authorization: Optional[str] = Header(None)) -> Optional[User]:
    """Same as get_current_user, but returns None instead of raising --
    used by dataset routes so the upload/train/predict pipeline keeps working
    exactly as before for a signed-out session; being signed in only adds
    persisted history and skips retraining an already-seen dataset. See
    get_current_user's docstring for why this manages its own short-lived
    session instead of taking one as a FastAPI dependency."""
    if not authorization or not authorization.startswith("Bearer "):
        return None
    user_id = security.decode_access_token(authorization.removeprefix("Bearer ").strip())
    if not user_id:
        return None
    return _get_user_resilient(user_id)


@router.get("/me")
def me(user: User = Depends(get_current_user)):
    return _user_out(user)