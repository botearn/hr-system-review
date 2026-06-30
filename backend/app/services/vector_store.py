"""pgvector-based vector store (Supabase / any Postgres with pgvector extension).

Two tables:
- candidate_vectors : one row per candidate, multiple named vector columns
- position_vectors  : one row per position, multiple named vector columns

Schema is created by the Alembic migration 0d0a_add_pgvector_tables.py.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import psycopg
from pgvector.psycopg import register_vector

from app.core.config import settings

CANDIDATE_COLLECTION = "candidate_vectors"
POSITION_COLLECTION = "position_vectors"

CANDIDATE_VECTORS = ("skill_vec", "capability_vec", "project_vec", "experience_vec", "summary_vec")
POSITION_VECTORS = ("skill_vec", "capability_vec", "responsibility_vec", "summary_vec")


@dataclass
class ScoredPoint:
    """Minimal drop-in replacement for qdrant_client.http.models.ScoredPoint."""

    id: int
    score: float
    payload: dict[str, Any]


# ---------------------------------------------------------------------------
# Connection
# ---------------------------------------------------------------------------


def _raw_conninfo() -> str:
    url = settings.database_url
    if url.startswith("postgresql+psycopg://"):
        url = "postgresql://" + url[len("postgresql+psycopg://") :]
    return url


def _connect() -> psycopg.Connection:
    conn = psycopg.connect(_raw_conninfo())
    register_vector(conn)
    return conn


def ensure_collections() -> None:
    """No-op: schema is created via Alembic migration."""
    return


# ---------------------------------------------------------------------------
# Upsert
# ---------------------------------------------------------------------------


def upsert_candidate(
    candidate_id: int,
    vectors: dict[str, list[float]],
    payload: dict[str, Any],
) -> None:
    cols = [
        "candidate_id",
        "owner_id",
        "is_deleted",
        "years",
        "city",
        "industry",
        "education_level",
        "expected_salary_min",
        "expected_salary_max",
        "resume_quality_score",
        *CANDIDATE_VECTORS,
    ]
    values = [
        candidate_id,
        payload.get("owner_id"),
        bool(payload.get("is_deleted") or False),
        payload.get("years"),
        payload.get("city"),
        payload.get("industry"),
        payload.get("education_level"),
        payload.get("expected_salary_min"),
        payload.get("expected_salary_max"),
        payload.get("resume_quality_score"),
        *[vectors.get(name) for name in CANDIDATE_VECTORS],
    ]
    _upsert(CANDIDATE_COLLECTION, "candidate_id", cols, values)


def upsert_position(
    position_id: int,
    vectors: dict[str, list[float]],
    payload: dict[str, Any],
) -> None:
    cols = [
        "position_id",
        "owner_id",
        "company_id",
        "status",
        "min_years",
        "max_years",
        "city",
        "remote_ok",
        *POSITION_VECTORS,
    ]
    values = [
        position_id,
        payload.get("owner_id"),
        payload.get("company_id"),
        payload.get("status"),
        payload.get("min_years"),
        payload.get("max_years"),
        payload.get("city"),
        bool(payload.get("remote_ok") or False),
        *[vectors.get(name) for name in POSITION_VECTORS],
    ]
    _upsert(POSITION_COLLECTION, "position_id", cols, values)


def get_position_vectors(position_id: int) -> dict[str, list[float]]:
    """Read pre-computed position vectors from pgvector.

    Returns {vec_name: vector} for whatever vectors are stored. Missing names
    are simply absent. Empty dict if no row exists.
    """
    cols = ",".join(POSITION_VECTORS)
    sql = f"SELECT {cols} FROM {POSITION_COLLECTION} WHERE position_id = %s"
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, (position_id,))
            row = cur.fetchone()
    if not row:
        return {}
    out: dict[str, list[float]] = {}
    for name, value in zip(POSITION_VECTORS, row, strict=False):
        if value is None:
            continue
        out[name] = list(value) if not isinstance(value, list) else value
    return out


def _upsert(table: str, pk: str, cols: list[str], values: list[Any]) -> None:
    placeholders = ",".join("%s" for _ in cols)
    updates = ",".join(f"{c}=EXCLUDED.{c}" for c in cols if c != pk)
    sql = (
        f"INSERT INTO {table} ({','.join(cols)}) VALUES ({placeholders}) "
        f"ON CONFLICT ({pk}) DO UPDATE SET {updates}, updated_at=NOW()"
    )
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, values)
        conn.commit()


def delete_candidate(candidate_id: int) -> None:
    try:
        with _connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    f"DELETE FROM {CANDIDATE_COLLECTION} WHERE candidate_id = %s",
                    (candidate_id,),
                )
            conn.commit()
    except Exception:
        pass


# ---------------------------------------------------------------------------
# Search
# ---------------------------------------------------------------------------

_CANDIDATE_PAYLOAD_COLS = (
    "owner_id",
    "is_deleted",
    "years",
    "city",
    "industry",
    "education_level",
    "expected_salary_min",
    "expected_salary_max",
    "resume_quality_score",
)


def search_candidates(
    query_vector: list[float],
    using_vector: str,
    top_k: int = 50,
    *,
    owner_id: int | None = None,
    min_years: int | None = None,
    include_deleted: bool = False,
) -> list[ScoredPoint]:
    if using_vector not in CANDIDATE_VECTORS:
        raise ValueError(f"invalid vector name: {using_vector}")

    where_clauses: list[str] = [f"{using_vector} IS NOT NULL"]
    params: list[Any] = []
    if not include_deleted:
        where_clauses.append("is_deleted = false")
    if owner_id is not None:
        where_clauses.append("owner_id = %s")
        params.append(owner_id)
    if min_years is not None:
        where_clauses.append("(years IS NULL OR years >= %s)")
        params.append(min_years)

    where_sql = " AND ".join(where_clauses)
    payload_select = ", ".join(_CANDIDATE_PAYLOAD_COLS)

    sql = (
        f"SELECT candidate_id, "
        f"1 - ({using_vector} <=> %s::vector) AS score, "
        f"{payload_select} "
        f"FROM {CANDIDATE_COLLECTION} "
        f"WHERE {where_sql} "
        f"ORDER BY {using_vector} <=> %s::vector "
        f"LIMIT %s"
    )

    final_params: list[Any] = [query_vector, *params, query_vector, top_k]
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, final_params)
            rows = cur.fetchall()

    results: list[ScoredPoint] = []
    for row in rows:
        cand_id = row[0]
        score = float(row[1])
        payload: dict[str, Any] = {
            name: row[2 + idx] for idx, name in enumerate(_CANDIDATE_PAYLOAD_COLS)
        }
        payload["candidate_id"] = cand_id
        results.append(ScoredPoint(id=int(cand_id), score=score, payload=payload))
    return results
