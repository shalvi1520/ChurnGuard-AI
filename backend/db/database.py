"""
SQLAlchemy engine/session setup for ChurnGuard's persistent store: user
accounts, dataset upload history, and trained-model records (so a dataset
that's already been trained doesn't get trained again). Everything else --
the active dataset's raw data, customer scores, SHAP caches, outreach drafts
-- stays in backend/api/store.py's in-memory store; only what needs to
survive a restart or be scoped to a user lives here.

DATABASE_URL is required (no silent fallback): a missing or wrong DB URL
should fail loudly at startup, not quietly serve requests against the wrong
store. Both Postgres and SQLite URLs are accepted -- see IS_SQLITE below for
why that is a deliberate capability rather than a convenience.
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

# The deliberate-override channel, and the one exception to the rule above.
#
# `override=True` is right for DATABASE_URL (see the comment above), but it is
# indiscriminate: it also clobbers a value a caller set *on purpose*, moments
# earlier, in the same process. That silently broke the one caller that most
# needed it -- backend/tests/conftest.py sets DATABASE_URL to a throwaway test
# database precisely so the suite never touches the shared Neon instance, and
# .env overwrote it right back on import. The tests were running against
# production data while reporting that they were not.
#
# CHURNGUARD_DATABASE_URL fixes that without weakening the stale-shell-variable
# protection: it is not a name any .env file here defines, so load_dotenv can
# never overwrite it, and anything that sets it is doing so knowingly.
DATABASE_URL = os.getenv("CHURNGUARD_DATABASE_URL") or os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError(
        "DATABASE_URL is not set. Add it to backend/.env, e.g. "
        "postgresql://user:password@localhost:5432/churnguard "
        "(or sqlite:///./churnguard.db for a local file-backed store)"
    )

# Postgres is what this project actually runs on: a shared Neon instance
# holding real accounts, dataset history and encrypted CRM tokens. Every
# pooling/timeout argument in _POSTGRES_ENGINE_KWARGS below exists because of
# Neon's autosuspend behaviour specifically, and none of them are valid for
# SQLite -- which has no network connection to time out and no server-side
# pool to exhaust. Passing them to a SQLite engine is a TypeError at creation
# time, not a warning, so the dialect is detected once here and the two
# engines are configured separately.
#
# SQLite is supported deliberately, not incidentally. It is what the test
# suite falls back to when no local Postgres is running (see
# backend/tests/conftest.py), and it makes `DATABASE_URL=sqlite:///./churnguard.db`
# a genuine one-line swap for anyone running this without a Postgres to point
# at. models.py stays on portable column types for the same reason, so the
# same schema builds on either backend.
IS_SQLITE = DATABASE_URL.startswith("sqlite")

# Printed once at startup so it's obvious from the terminal alone which store
# is actually in use -- "-pooler" in the hostname or not -- instead of having
# to trust that an .env edit took effect. Credentials are stripped; only the
# host ever needs checking here.
if IS_SQLITE:
    print(f"[database] Connecting to SQLite file: {DATABASE_URL.split('///')[-1] or '(memory)'}")
else:
    _visible_host = DATABASE_URL.split("@")[-1].split("/")[0] if "@" in DATABASE_URL else "(unparsed)"
    print(f"[database] Connecting to Postgres host: {_visible_host}")

_POSTGRES_ENGINE_KWARGS = dict(
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

# SQLite: `check_same_thread=False` because FastAPI runs sync endpoints on a
# worker thread pool (see main.py's _widen_sync_threadpool), so a connection
# opened on one thread is routinely used from another. StaticPool keeps an
# in-memory database alive across sessions, which is what makes
# `sqlite:///:memory:` usable at all -- a file-backed URL is left on the
# default pool.
if IS_SQLITE:
    _engine_kwargs = {"connect_args": {"check_same_thread": False}}
    if ":memory:" in DATABASE_URL:
        from sqlalchemy.pool import StaticPool

        _engine_kwargs["poolclass"] = StaticPool
else:
    _engine_kwargs = _POSTGRES_ENGINE_KWARGS

engine = create_engine(DATABASE_URL, **_engine_kwargs)

# SQLite does not enforce foreign keys unless asked to, per connection. The
# auth tables below (oauth_accounts, user_sessions, password_reset_tokens)
# all cascade from users, so silently ignoring FKs would let a SQLite-backed
# run accumulate orphaned sessions that Postgres would have rejected -- a
# difference in behaviour between the two backends is exactly what this
# module exists to avoid.
if IS_SQLITE:
    from sqlalchemy import event

    @event.listens_for(engine, "connect")
    def _enable_sqlite_foreign_keys(dbapi_connection, _connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()


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
