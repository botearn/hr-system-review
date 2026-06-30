"""add skill_pool_item and capability_pool_item

Revision ID: d3e4a0b0c0d0
Revises: c1d2a0b0c0d0
Create Date: 2026-04-21 14:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "d3e4a0b0c0d0"
down_revision: str | None = "c1d2a0b0c0d0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "skill_pool_item",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("is_custom", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_by_id", sa.Integer(), sa.ForeignKey("user.id"), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint("name", name="uq_skill_pool_item_name"),
    )
    op.create_index("ix_skill_pool_item_name", "skill_pool_item", ["name"])

    op.create_table(
        "capability_pool_item",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("is_custom", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_by_id", sa.Integer(), sa.ForeignKey("user.id"), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint("name", name="uq_capability_pool_item_name"),
    )
    op.create_index("ix_capability_pool_item_name", "capability_pool_item", ["name"])


def downgrade() -> None:
    op.drop_index("ix_capability_pool_item_name", table_name="capability_pool_item")
    op.drop_table("capability_pool_item")
    op.drop_index("ix_skill_pool_item_name", table_name="skill_pool_item")
    op.drop_table("skill_pool_item")
