"""activity events

Revision ID: 0803ac4ac8e4
Revises: e3b0f7c21d45
Create Date: 2026-09-16 01:25:08.910059

Note: autogenerate produced an empty diff for this revision because
`Base.metadata.create_all()` (run on every app startup, see main.py) had
already created `activity_events` directly against the configured database
by the time this was generated. The table is additive-only and this
migration is hand-written to match backend/db/models.py's ActivityEvent
exactly, so `alembic upgrade head` still reproduces the same schema on any
database that hasn't had the app started against it yet (CI, a fresh branch,
a teammate's machine).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0803ac4ac8e4'
down_revision: Union[str, Sequence[str], None] = 'e3b0f7c21d45'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table('activity_events',
    sa.Column('id', sa.String(length=32), nullable=False),
    sa.Column('user_id', sa.String(length=32), nullable=False),
    sa.Column('action_type', sa.String(length=50), nullable=False),
    sa.Column('entity_type', sa.String(length=50), nullable=True),
    sa.Column('entity_id', sa.String(length=255), nullable=True),
    sa.Column('detail', sa.Text(), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_activity_events_created_at'), 'activity_events', ['created_at'], unique=False)
    op.create_index(op.f('ix_activity_events_user_id'), 'activity_events', ['user_id'], unique=False)
    op.create_index('ix_activity_events_user_created_at', 'activity_events', ['user_id', 'created_at'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index('ix_activity_events_user_created_at', table_name='activity_events')
    op.drop_index(op.f('ix_activity_events_user_id'), table_name='activity_events')
    op.drop_index(op.f('ix_activity_events_created_at'), table_name='activity_events')
    op.drop_table('activity_events')
