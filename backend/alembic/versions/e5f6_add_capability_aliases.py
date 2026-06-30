"""add aliases column to capability_pool_item

Revision ID: e5f6a0b0c0d0
Revises: d3e4a0b0c0d0
Create Date: 2026-04-21 14:40:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "e5f6a0b0c0d0"
down_revision: str | None = "d3e4a0b0c0d0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "capability_pool_item",
        sa.Column(
            "aliases",
            sa.dialects.postgresql.ARRAY(sa.String()),
            nullable=False,
            server_default=sa.text("ARRAY[]::varchar[]"),
        ),
    )
    # 把 name 初值灌进 aliases,保证旧数据匹配不失效
    op.execute("UPDATE capability_pool_item SET aliases = ARRAY[name]")


def downgrade() -> None:
    op.drop_column("capability_pool_item", "aliases")
