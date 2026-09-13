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
#
# override=True matters just as much: without it, a DATABASE_URL that was
# ever set as a real Windows/shell environment variable -- from an earlier
# `set DATABASE_URL=...`, a launch config, or a previous terminal session --
# silently wins over whatever is in this .env file. Editing .env then looks
# like it does nothing, because it isn't actually being read at all.
load_dotenv(Path(__file__).resolve().parent.parent / ".env", override=True)

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError(
        "DATABASE_URL is not set. Add it to backend/.env, e.g. "
        "postgresql://user:password@localhost:5432/churnguard"
    )

# Printed once at startup so it's obvious from the terminal alone which host
# is actually in use -- "-pooler" in the hostname or not -- instead of having
# to trust that an .env edit took effect. Credentials are stripped; only the
# host ever needs checking here.
_visible_host = DATABASE_URL.split("@")[-1].split("/")[0] if "@" in DATABASE_URL else "(unparsed)"
print(f"[database] Connecting to Postgres host: {_visible_host}")

engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    # Without this, a connection attempt that gets silently dropped by the
    # network (rather than cleanly refused) has no default timeout at all --
    # psycopg2 will hang for however long the OS takes to give up on the TCP
    # handshake, which can run well past a 45s frontend timeout with no error
    # ever raised for the retry logic in auth_routes.py/dataset_routes.py to
    # catch. A 5s connect timeout turns a silent, unbounded hang into a fast,
    # visible OperationalError instead -- something the app can actually
    # react to.
    connect_args={"connect_timeout": 5},
    # A slow request (Optuna retrain, SHAP, an LLM outreach draft) used to
    # hold a connection checked out from this pool for its entire duration
    # via get_current_user's FastAPI dependency -- see auth_routes.py's fix
    # for the real cause. This higher ceiling is just headroom on top of
    # that fix, not a substitute for it: a few slow requests overlapping
    # (or the frontend firing a GET twice, which it does) could still
    # exhaust a pool this small before the fix.
    pool_size=10,
    max_overflow=20,
    # Neon's direct (non-pooled) endpoint will drop a connection that's sat
    # idle across an autosuspend cycle -- exactly what happens while a 1-2
    # minute training run holds one open without querying anything. pre_ping
    # catches most of that (a quick throwaway query before handing the
    # connection back out), but Neon can still kill it in the gap between
    # that ping and the real query. Recycling every 280s -- under Neon's own
    # ~300s-class idle/suspend windows -- means SQLAlchemy proactively closes
    # and reopens a connection before it gets old enough to be at risk,
    # rather than reacting to it after the fact.
    pool_recycle=280,
)
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