"""
Test-session database setup.

The cache-hit paths in dataset_routes.py are user-scoped: they only engage
for a signed-in user, so characterizing them means creating users, datasets
and trained_models rows. DATABASE_URL points at the shared Neon instance
(which holds real work), so this redirects the whole test session to a local
throwaway database instead.

This MUST run before anything imports backend.db.database, which reads
DATABASE_URL and builds its engine at import time. A root-level conftest is
imported by pytest before any test module, which is exactly that window.
`load_dotenv()` in database.py does not override an already-set variable, so
setting it here wins over backend/.env while still letting JWT_SECRET and
friends load from there normally.

Override the target with CHURNGUARD_TEST_DATABASE_URL if local Postgres
isn't where this expects it.
"""
import os

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.engine.url import make_url

DEFAULT_TEST_DB_URL = "postgresql://postgres:ABC123@localhost:5432/churnguard_test"
TEST_DB_URL = os.getenv("CHURNGUARD_TEST_DATABASE_URL", DEFAULT_TEST_DB_URL)


def _create_database_if_missing(url: str) -> None:
    parsed = make_url(url)
    db_name = parsed.database
    admin_url = parsed.set(database="postgres")
    try:
        admin = create_engine(admin_url, isolation_level="AUTOCOMMIT", connect_args={"connect_timeout": 5})
        with admin.connect() as conn:
            exists = conn.execute(
                text("SELECT 1 FROM pg_database WHERE datname = :n"), {"n": db_name}
            ).scalar()
            if not exists:
                conn.execute(text(f'CREATE DATABASE "{db_name}"'))
    except Exception as exc:  # noqa: BLE001
        raise RuntimeError(
            f"Could not reach a local Postgres to create the test database {db_name!r}.\n"
            f"Tried: {admin_url.render_as_string(hide_password=True)}\n"
            "Start local Postgres, or set CHURNGUARD_TEST_DATABASE_URL to a database you can reach.\n"
            "The test suite deliberately does NOT run against the DATABASE_URL in backend/.env, "
            "which points at the shared Neon instance."
        ) from exc


# Redirect before any backend import sees the real URL.
_create_database_if_missing(TEST_DB_URL)
os.environ["DATABASE_URL"] = TEST_DB_URL

from backend.db.database import Base, engine  # noqa: E402
from backend.db import models  # noqa: E402,F401 -- registers tables on Base

Base.metadata.create_all(bind=engine)


@pytest.fixture(scope="session")
def test_db_url() -> str:
    return TEST_DB_URL
