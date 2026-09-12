"""
Alembic environment for ChurnGuard.

Two deliberate departures from the generated template:

1. The database URL is NEVER read from alembic.ini. That file is tracked in
   git, and the real URL carries credentials (the shared Neon instance).
   It comes from the environment instead, via the same explicit-path .env
   load backend/db/database.py uses -- alembic.ini's `sqlalchemy.url` is
   left at its meaningless placeholder on purpose.

2. `ALEMBIC_DATABASE_URL` overrides `DATABASE_URL` when set. That is how a
   throwaway local database is targeted for generating a from-scratch
   baseline, without pointing anything at (or creating anything on) the
   shared Neon database.

`target_metadata` is Base.metadata with the models module imported for its
side effect: SQLAlchemy only knows about tables whose classes have actually
been imported, and an unimported model silently autogenerates as "drop this
table".
"""
import os
import sys
from logging.config import fileConfig
from pathlib import Path

from alembic import context
from dotenv import load_dotenv
from sqlalchemy import engine_from_config, pool

# Repo root on sys.path so `backend.*` imports resolve regardless of where
# alembic was invoked from.
REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

load_dotenv(REPO_ROOT / "backend" / ".env")

from backend.db.database import Base  # noqa: E402
from backend.db import models  # noqa: E402,F401 -- import registers tables on Base

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def _database_url() -> str:
    url = os.getenv("ALEMBIC_DATABASE_URL") or os.getenv("DATABASE_URL")
    if not url:
        raise RuntimeError(
            "No database URL. Set DATABASE_URL in backend/.env (or "
            "ALEMBIC_DATABASE_URL to target a different database for this "
            "command only)."
        )
    return url


def run_migrations_offline() -> None:
    context.configure(
        url=_database_url(),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    section = config.get_section(config.config_ini_section, {}) or {}
    section["sqlalchemy.url"] = _database_url()

    connectable = engine_from_config(section, prefix="sqlalchemy.", poolclass=pool.NullPool)

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            # Without this, a changed column type autogenerates as no-op.
            compare_type=True,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
