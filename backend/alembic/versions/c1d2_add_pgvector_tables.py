"""add pgvector tables for candidate/position vectors

Revision ID: c1d2a0b0c0d0
Revises: 8e5bd01fe8d0
Create Date: 2026-04-20 00:00:00.000000

"""

from collections.abc import Sequence

from alembic import op

revision: str = "c1d2a0b0c0d0"
down_revision: str | None = "8e5bd01fe8d0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

VECTOR_DIM = 1024  # bge-m3


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    op.execute(
        f"""
        CREATE TABLE IF NOT EXISTS candidate_vectors (
            candidate_id INTEGER PRIMARY KEY,
            owner_id INTEGER,
            is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
            years INTEGER,
            city TEXT,
            industry TEXT,
            education_level TEXT,
            expected_salary_min NUMERIC,
            expected_salary_max NUMERIC,
            resume_quality_score NUMERIC,
            skill_vec vector({VECTOR_DIM}),
            capability_vec vector({VECTOR_DIM}),
            project_vec vector({VECTOR_DIM}),
            experience_vec vector({VECTOR_DIM}),
            summary_vec vector({VECTOR_DIM}),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """
    )

    op.execute(
        f"""
        CREATE TABLE IF NOT EXISTS position_vectors (
            position_id INTEGER PRIMARY KEY,
            owner_id INTEGER,
            company_id INTEGER,
            status TEXT,
            min_years INTEGER,
            max_years INTEGER,
            city TEXT,
            remote_ok BOOLEAN NOT NULL DEFAULT FALSE,
            skill_vec vector({VECTOR_DIM}),
            capability_vec vector({VECTOR_DIM}),
            responsibility_vec vector({VECTOR_DIM}),
            summary_vec vector({VECTOR_DIM}),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """
    )

    # Filter indexes (vector indexes are optional; for <100k rows, sequential scan is fine)
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_candidate_vectors_owner_deleted "
        "ON candidate_vectors (owner_id, is_deleted)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_candidate_vectors_years ON candidate_vectors (years)"
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS position_vectors")
    op.execute("DROP TABLE IF EXISTS candidate_vectors")
