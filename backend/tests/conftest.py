"""
Test-session database setup.

The cache-hit paths in dataset_routes.py and all of auth_routes.py are
user-scoped: they only engage for a signed-in user, so exercising them means
creating users, sessions, datasets and trained_models rows. DATABASE_URL
points at the shared Neon instance (which holds real work), so this redirects
the whole test session somewhere disposable.

Two things here were previously broken and are worth stating plainly, because
the file's own docstring used to assert the opposite of what the code did:

1. This redirection did not actually work. It set `os.environ["DATABASE_URL"]`
   and relied on database.py's `load_dotenv()` not overriding an already-set
   variable -- but that call passes `override=True`, so backend/.env won every
   time and the suite ran against production Neon. The redirect now goes
   through CHURNGUARD_DATABASE_URL, which no .env here defines and load_dotenv
   therefore cannot clobber.

2. A missing local Postgres was a hard error, which made the whole backend
   suite unrunnable on a machine without one. It now falls back to a SQLite
   file in the pytest tmp area. Postgres is still preferred and still used
   when reachable -- it is what production runs on, so it is the more faithful
   target -- but "no Postgres" now costs fidelity rather than costing the
   ability to run tests at all.

This MUST run before anything imports backend.db.database, which reads the URL
and builds its engine at import time. A conftest at this level is imported by
pytest before any test module, which is exactly that window.

Override the target explicitly with CHURNGUARD_TEST_DATABASE_URL.
"""
import os
import tempfile
from pathlib import Path

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.engine.url import make_url

DEFAULT_TEST_DB_URL = "postgresql://postgres:ABC123@localhost:5432/churnguard_test"


def _try_postgres(url: str) -> bool:
    """True if a Postgres is reachable and the test database now exists."""
    parsed = make_url(url)
    admin_url = parsed.set(database="postgres")
    try:
        admin = create_engine(
            admin_url, isolation_level="AUTOCOMMIT", connect_args={"connect_timeout": 3}
        )
        with admin.connect() as conn:
            exists = conn.execute(
                text("SELECT 1 FROM pg_database WHERE datname = :n"), {"n": parsed.database}
            ).scalar()
            if not exists:
                conn.execute(text(f'CREATE DATABASE "{parsed.database}"'))
        return True
    except Exception:  # noqa: BLE001 -- any failure means "use the fallback"
        return False


def _resolve_test_db_url() -> str:
    explicit = os.getenv("CHURNGUARD_TEST_DATABASE_URL")
    if explicit:
        # An explicit choice is honoured as given. If it names a Postgres that
        # isn't running, the resulting connection error is the correct and
        # useful outcome -- silently falling back would hide a typo'd URL.
        if explicit.startswith("postgresql"):
            _try_postgres(explicit)
        return explicit

    if _try_postgres(DEFAULT_TEST_DB_URL):
        return DEFAULT_TEST_DB_URL

    # No local Postgres. A file (not :memory:) because the suite opens several
    # independent SessionLocal()s and, in the API tests, a TestClient whose
    # requests run on other threads; they all have to see the same data.
    #
    # Deleting a leftover file is best-effort, not required. On Windows an
    # unlink fails outright while any other process still has the database
    # open -- a concurrent test run, or one that has not fully exited -- and
    # letting that propagate would abort collection for the whole suite before
    # a single test ran. Falling back to a uniquely named file means a second
    # run is merely isolated rather than broken.
    directory = Path(tempfile.gettempdir())
    path = directory / "churnguard_test.db"
    if path.exists():
        try:
            path.unlink()
        except OSError:
            path = directory / f"churnguard_test_{os.getpid()}.db"
    print(f"\n[conftest] No local Postgres reachable — using SQLite at {path}")
    return f"sqlite:///{path.as_posix()}"


TEST_DB_URL = _resolve_test_db_url()

# Redirect before any backend import sees the real URL. Both names are set:
# CHURNGUARD_DATABASE_URL is what database.py actually honours, DATABASE_URL
# keeps anything reading it directly (alembic's env.py, ad-hoc scripts)
# pointed at the same place.
os.environ["CHURNGUARD_DATABASE_URL"] = TEST_DB_URL
os.environ["DATABASE_URL"] = TEST_DB_URL

# auth/security modules refuse to import without these. Defaults only -- a
# real .env value still wins, and nothing here is a credential for anything
# that exists.
os.environ.setdefault("JWT_SECRET", "test-secret-not-used-outside-tests-" + "0" * 32)
os.environ.setdefault("APP_ENV", "development")

from backend.db.database import Base, engine  # noqa: E402
from backend.db import models  # noqa: E402,F401 -- registers tables on Base

Base.metadata.create_all(bind=engine)


@pytest.fixture(autouse=True)
def _reset_rate_limits():
    """Clears the auth rate-limit windows before every test.

    These are module-level, in-process sliding windows (see
    backend/auth/rate_limit.py), so they are shared by every test in the
    session -- and every forgot-password test posts from the same TestClient
    address. Without this, the tenth such test in a run starts getting 429s
    that have nothing to do with what it is asserting, and which test fails
    depends on collection order. That is a property of the limiter working
    correctly, not a bug in it, so the fix belongs here rather than in the
    limiter.

    Imported lazily: this module is imported before the redirect above has
    been applied in some orders, and auth_routes pulls in the database.
    """
    from backend.api import auth_routes

    for window in auth_routes._reset_rate_limiters():
        window.reset()
    yield


@pytest.fixture(scope="session")
def test_db_url() -> str:
    return TEST_DB_URL


@pytest.fixture
def db_session():
    """A session on the test database, rolled back and cleaned after each test.

    Auth tests create real users; leaving them behind would make a second run
    of the same test collide with its own first run on the unique email index.
    """
    from backend.db.database import SessionLocal

    session = SessionLocal()
    try:
        yield session
    finally:
        session.rollback()
        session.close()
