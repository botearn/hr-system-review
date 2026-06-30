"""add candidate destination fields

Revision ID: h9i0a0b0c0d0
Revises: f7g8a0b0c0d0
Create Date: 2026-05-08 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "h9i0a0b0c0d0"
down_revision: str | None = "f7g8a0b0c0d0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "status_change",
        sa.Column("outcome_company", sa.String(length=200), nullable=True),
    )
    op.add_column(
        "status_change",
        sa.Column("outcome_role", sa.String(length=200), nullable=True),
    )
    op.add_column(
        "candidate",
        sa.Column("landed_company", sa.String(length=200), nullable=True),
    )
    op.add_column(
        "candidate",
        sa.Column("landed_role", sa.String(length=200), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("candidate", "landed_role")
    op.drop_column("candidate", "landed_company")
    op.drop_column("status_change", "outcome_role")
    op.drop_column("status_change", "outcome_company")
