"""restore server defaults on users.is_active / users.updated_at

Revision ID: e3b0f7c21d45
Revises: c7f1a3d94b02
Create Date: 2026-09-15

Repairs a foot-gun introduced by c7f1a3d94b02.

That migration added `is_active` and `updated_at` as NOT NULL, backfilled
existing rows with a server_default, and then dropped the default again on the
reasoning that the application default should be the single writer. Tidy in
principle, and wrong in practice: with no default, the schema rejects any
INSERT that omits those columns -- which is precisely what an older build of
this application does, since its model predates them.

The observable failure is worse than it sounds. A running server that has not
been restarted starts raising NotNullViolation on signup; FastAPI turns that
into a 500 raised *below* the CORS middleware, so the response carries no
Access-Control-Allow-Origin header, and the browser reports a CORS policy
error. The actual cause -- a stale process against a migrated schema -- is
invisible from the front end.

Restoring the defaults costs nothing: the application still sets both values
on every insert. It just means an old process degrades to "writes a sensible
default" instead of "fails every signup".

c7f1a3d94b02 has been amended to stop dropping them in the first place, so a
database built from scratch never needs this. It exists for databases where
that migration already ran.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "e3b0f7c21d45"
down_revision: Union[str, Sequence[str], None] = "c7f1a3d94b02"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # SQLite has no `ALTER COLUMN ... SET DEFAULT`; the statement is a syntax
    # error rather than a no-op. It also never lost the defaults -- the drop in
    # c7f1a3d94b02 was already skipped there -- so there is nothing to repair.
    if op.get_bind().dialect.name == "sqlite":
        return

    op.alter_column("users", "is_active", existing_type=sa.Boolean(), server_default=sa.true())
    op.alter_column(
        "users", "updated_at", existing_type=sa.DateTime(), server_default=sa.func.now()
    )


def downgrade() -> None:
    """Downgrade schema.

    Re-drops the defaults, restoring the state this migration exists to fix.
    Provided for completeness; running it reintroduces the hard-cutover
    behaviour described above.
    """
    if op.get_bind().dialect.name == "sqlite":
        return

    op.alter_column("users", "is_active", existing_type=sa.Boolean(), server_default=None)
    op.alter_column("users", "updated_at", existing_type=sa.DateTime(), server_default=None)
