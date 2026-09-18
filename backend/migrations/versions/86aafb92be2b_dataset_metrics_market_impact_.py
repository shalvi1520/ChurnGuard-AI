"""dataset_metrics: replace market_impact_score with market_impact_severity/explanation

Revision ID: 86aafb92be2b
Revises: fb60d34b3937
Create Date: 2026-09-19 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '86aafb92be2b'
down_revision: Union[str, Sequence[str], None] = 'fb60d34b3937'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.drop_column('dataset_metrics', 'market_impact_score')
    op.add_column('dataset_metrics', sa.Column('market_impact_severity', sa.String(length=20), nullable=True))
    op.add_column('dataset_metrics', sa.Column('market_impact_explanation', sa.Text(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('dataset_metrics', 'market_impact_explanation')
    op.drop_column('dataset_metrics', 'market_impact_severity')
    op.add_column('dataset_metrics', sa.Column('market_impact_score', sa.Float(), nullable=True))
