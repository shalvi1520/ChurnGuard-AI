"""
SQLAlchemy engine/session setup for ChurnGuard's persistent store: user
accounts, dataset upload history, and trained-model records (so a dataset
that's already been trained doesn't get trained again). Everything else --
the active dataset's raw data, customer scores, SHAP caches, outreach drafts
-- stays in backend/api/store.py's in-memory store; only what needs to
survive a restart or be scoped to a user lives here.

DATABASE_URL is required (no silent fallback to sqlite): a missing or wrong
DB URL should fail loudly at startup, not quietly serve requests against the
wrong store.
"""
import os
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

# An explicit path, not load_dotenv()'s frame-guessing default: that walks up
# from whichever file happens to be on top of the call stack when this runs,
# which depends on *how* this module got imported (directly vs. nested inside
# main.py's optional-router loaders) -- inconsistent in practice, and it can
# resolve to the frontend's root .env (no DATABASE_URL) instead of this one.
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError(
        "DATABASE_URL is not set. Add it to backend/.env, e.g. "
        "postgresql://user:password@localhost:5432/churnguard"
    )

engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


class Base(DeclarativeBase):
    pass


def get_db():
    """FastAPI dependency: one session per request, always closed."""
    db: Session = SessionLocal()
    try:
        yield db
    finally:
        db.close()
