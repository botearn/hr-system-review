"""把 candidate / position 的文本字段转成 embedding 并写入 pgvector 表。"""

from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models.candidate import Candidate
from app.models.position import Position
from app.services import embedding, vector_store


def _cap_to_text(cap: Any) -> str:
    if isinstance(cap, str):
        return cap
    if isinstance(cap, dict):
        return str(cap.get("capability") or cap.get("name") or "")
    return str(cap)


def _join(parts: list[str]) -> str:
    return "\n".join(p for p in parts if p and p.strip())[:4000]


def _candidate_texts(c: Candidate) -> dict[str, str]:
    skills_text = ", ".join(c.skills or [])
    for prj in c.projects or []:
        skills_text += ", " + ", ".join(prj.tech_stack or [])

    capabilities_text = "\n".join(_cap_to_text(x) for x in (c.derived_capabilities or []))

    project_text = _join(
        [f"{p.project_name} / {p.role or ''}: {p.description or ''}" for p in (c.projects or [])]
    )

    experience_text = _join(
        [
            f"{e.company_name} - {e.position_title}: {e.description or ''}"
            for e in (c.experiences or [])
        ]
    )

    summary_src = (
        f"{c.name or ''} {c.industry or ''} {c.years_of_experience or 0}年 "
        f"技能：{skills_text} "
        f"能力：{capabilities_text[:500]} "
        f"{experience_text[:800]}"
    )

    return {
        "skill_vec": skills_text or " ",
        "capability_vec": capabilities_text or " ",
        "project_vec": project_text or " ",
        "experience_vec": experience_text or " ",
        "summary_vec": summary_src[:2000],
    }


def _position_texts(p: Position) -> dict[str, str]:
    req_skills = list(p.required_skills or []) + list(p.nice_to_have_skills or [])
    caps_texts: list[str] = []
    for cap in p.required_capabilities or []:
        if isinstance(cap, dict):
            prio = cap.get("priority") or ""
            name = cap.get("capability") or ""
            caps_texts.append(f"[{prio}] {name}")
        else:
            caps_texts.append(str(cap))

    resp = f"{p.title}\n{p.responsibilities or ''}\n{p.requirements or ''}"
    summary = (
        f"{p.title} 年限:{p.min_years or 0}-{p.max_years or '∞'} 城市:{p.city or ''}\n{resp[:1500]}"
    )

    return {
        "skill_vec": ", ".join(req_skills) or " ",
        "capability_vec": "\n".join(caps_texts) or " ",
        "responsibility_vec": resp[:3000] or " ",
        "summary_vec": summary[:2000],
    }


def vectorize_candidate(candidate_id: int) -> None:
    db: Session = SessionLocal()
    try:
        c = db.get(Candidate, candidate_id)
        if not c or c.is_deleted:
            vector_store.delete_candidate(candidate_id)
            return
        texts = _candidate_texts(c)
        names = list(texts.keys())
        vectors = embedding.embed([texts[n] for n in names])
        payload = {
            "candidate_id": c.id,
            "owner_id": c.owner_id,
            "city": c.city,
            "years": c.years_of_experience,
            "expected_salary_min": float(c.expected_salary_min) if c.expected_salary_min else None,
            "expected_salary_max": float(c.expected_salary_max) if c.expected_salary_max else None,
            "industry": c.industry,
            "education_level": c.education_level,
            "is_deleted": bool(c.is_deleted),
            "resume_quality_score": float(c.resume_quality_score)
            if c.resume_quality_score
            else None,
        }
        vector_store.upsert_candidate(c.id, dict(zip(names, vectors, strict=False)), payload)
    finally:
        db.close()


def vectorize_position(position_id: int) -> None:
    db: Session = SessionLocal()
    try:
        p = db.get(Position, position_id)
        if not p:
            return
        texts = _position_texts(p)
        names = list(texts.keys())
        vectors = embedding.embed([texts[n] for n in names])
        payload = {
            "position_id": p.id,
            "company_id": p.company_id,
            "owner_id": p.owner_id,
            "status": p.status,
            "min_years": p.min_years,
            "max_years": p.max_years,
            "city": p.city,
            "remote_ok": p.remote_ok,
        }
        vector_store.upsert_position(p.id, dict(zip(names, vectors, strict=False)), payload)
    finally:
        db.close()
