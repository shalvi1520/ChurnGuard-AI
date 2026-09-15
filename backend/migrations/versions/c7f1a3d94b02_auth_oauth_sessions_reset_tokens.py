"""auth: oauth_accounts, user_sessions, password_reset_tokens, users.is_active/updated_at

Revision ID: c7f1a3d94b02
Revises: a2e481851e6c
Create Date: 2026-09-15

Backs the cookie-session + OAuth authentication system (backend/auth/,
backend/api/auth_routes.py).

Every step here is guarded by an inspector check rather than issued blind,
because these tables can legitimately already exist before this migration
runs. `main.py`'s `_auth_router()` calls `Base.metadata.create_all()` on every
startup -- a deliberate convenience so a fresh checkout works without a
migration step -- which means anyone who started the backend after pulling the
new models already has the three new tables. An unguarded `create_table` would
then fail with "relation already exists" and leave the migration half-applied.

The guards make this migration idempotent in both directions: it brings a
never-started database and an already-started one to the same place.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "c7f1a3d94b02"
down_revision: Union[str, Sequence[str], None] = "a2e481851e6c"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _inspector():
    return sa.inspect(op.get_bind())


def _has_table(name: str) -> bool:
    return name in _inspector().get_table_names()


def _has_column(table: str, column: str) -> bool:
    if not _has_table(table):
        return False
    return column in {c["name"] for c in _inspector().get_columns(table)}


def upgrade() -> None:
    """Upgrade schema."""
    # --- users: OAuth-capable, deactivatable -------------------------------
    #
    # password_hash becomes nullable because an account created by signing in
    # with Google or Microsoft has no password at all. See models.User for why
    # a placeholder hash would be worse than NULL.
    #
    # SQLite cannot ALTER a column's nullability in place; batch_alter_table
    # does the table-rebuild dance there and emits a plain ALTER on Postgres.
    if _has_table("users"):
        with op.batch_alter_table("users") as batch:
            if not _has_column("users", "is_active"):
                batch.add_column(
                    sa.Column(
                        "is_active",
                        sa.Boolean(),
                        nullable=False,
                        # Existing rows predate the column and are all active.
                        #
                        # The server_default is KEPT, not dropped after the
                        # backfill. Dropping it looks tidier -- the application
                        # default becomes the single writer -- but it makes the
                        # schema reject any INSERT that omits the column, which
                        # is exactly what an older build of this app does. In
                        # practice that means the moment this migration runs,
                        # every already-running server process starts failing
                        # signup with a NotNullViolation, surfacing in the
                        # browser as a misleading CORS error (a 500 raised
                        # below the CORS middleware carries no
                        # Access-Control-Allow-Origin header).
                        #
                        # Keeping the default costs nothing semantically -- the
                        # application still sets the value on every insert --
                        # and it turns a hard cutover into a rolling one.
                        server_default=sa.true(),
                    )
                )
            if not _has_column("users", "updated_at"):
                batch.add_column(
                    sa.Column(
                        "updated_at",
                        sa.DateTime(),
                        nullable=False,
                        server_default=sa.func.now(),
                    )
                )
            batch.alter_column("password_hash", existing_type=sa.String(255), nullable=True)

    # --- oauth_accounts ----------------------------------------------------
    if not _has_table("oauth_accounts"):
        op.create_table(
            "oauth_accounts",
            sa.Column("id", sa.String(length=32), nullable=False),
            sa.Column("user_id", sa.String(length=32), nullable=False),
            sa.Column("provider", sa.String(length=50), nullable=False),
            sa.Column("provider_account_id", sa.String(length=255), nullable=False),
            sa.Column("provider_email", sa.String(length=255), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
            # The identity key. Unique on the pair, not on either half: the
            # same subject string from two providers is two different people,
            # and one user may link both Google and Microsoft.
            sa.UniqueConstraint("provider", "provider_account_id", name="uq_oauth_provider_account"),
        )
        op.create_index(op.f("ix_oauth_accounts_user_id"), "oauth_accounts", ["user_id"])

    # --- user_sessions -----------------------------------------------------
    if not _has_table("user_sessions"):
        op.create_table(
            "user_sessions",
            sa.Column("id", sa.String(length=32), nullable=False),
            sa.Column("user_id", sa.String(length=32), nullable=False),
            # SHA-256 hex of the cookie value, never the value itself.
            sa.Column("token_hash", sa.String(length=64), nullable=False),
            sa.Column("expires_at", sa.DateTime(), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("auth_method", sa.String(length=50), nullable=False),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index(op.f("ix_user_sessions_user_id"), "user_sessions", ["user_id"])
        # Unique: this is the lookup key on every authenticated request, and a
        # duplicate would mean two sessions indistinguishable from each other.
        op.create_index(op.f("ix_user_sessions_token_hash"), "user_sessions", ["token_hash"], unique=True)
        op.create_index(op.f("ix_user_sessions_expires_at"), "user_sessions", ["expires_at"])

    # --- password_reset_tokens ---------------------------------------------
    if not _has_table("password_reset_tokens"):
        op.create_table(
            "password_reset_tokens",
            sa.Column("id", sa.String(length=32), nullable=False),
            sa.Column("user_id", sa.String(length=32), nullable=False),
            sa.Column("token_hash", sa.String(length=64), nullable=False),
            sa.Column("expires_at", sa.DateTime(), nullable=False),
            # NULL until spent. Kept rather than deleted on use so a replayed
            # link can be answered "already used" instead of "unknown token".
            sa.Column("used_at", sa.DateTime(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index(op.f("ix_password_reset_tokens_user_id"), "password_reset_tokens", ["user_id"])
        op.create_index(
            op.f("ix_password_reset_tokens_token_hash"),
            "password_reset_tokens",
            ["token_hash"],
            unique=True,
        )


def downgrade() -> None:
    """Downgrade schema.

    Dropping these tables destroys every active session and pending reset --
    users are signed out and outstanding reset links stop working. It does not
    touch accounts themselves. `users.password_hash` goes back to NOT NULL,
    which will fail if any OAuth-only account exists by then; those rows have
    to be given a password or removed first, and failing loudly is the right
    outcome rather than inventing a hash for them.
    """
    for table, indexes in (
        (
            "password_reset_tokens",
            ["ix_password_reset_tokens_token_hash", "ix_password_reset_tokens_user_id"],
        ),
        (
            "user_sessions",
            ["ix_user_sessions_expires_at", "ix_user_sessions_token_hash", "ix_user_sessions_user_id"],
        ),
        ("oauth_accounts", ["ix_oauth_accounts_user_id"]),
    ):
        if _has_table(table):
            for index in indexes:
                op.drop_index(op.f(index), table_name=table)
            op.drop_table(table)

    if _has_table("users"):
        with op.batch_alter_table("users") as batch:
            batch.alter_column("password_hash", existing_type=sa.String(255), nullable=False)
            if _has_column("users", "updated_at"):
                batch.drop_column("updated_at")
            if _has_column("users", "is_active"):
                batch.drop_column("is_active")
