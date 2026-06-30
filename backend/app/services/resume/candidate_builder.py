"""候选人构建 / 去重的共享逻辑。

抽自 app.api.v1.resumes 与 app.scripts.batch_import 的重复实现，
供 FastAPI 路由、后台 pipeline、批量导入脚本三处共用。
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.models.candidate import (
    Candidate,
    CandidateEducation,
    CandidateExperience,
    CandidateProject,
)
from app.models.resume_task import ResumeTask
from app.models.user import User


def _int(v):
    try:
        return int(v) if v is not None and v != "" else None
    except (TypeError, ValueError):
        return None


def _num(v):
    try:
        return float(v) if v is not None and v != "" else None
    except (TypeError, ValueError):
        return None


def _parse_date(s):
    if not s:
        return None
    for fmt in ("%Y-%m-%d", "%Y-%m", "%Y/%m/%d", "%Y/%m", "%Y"):
        try:
            return datetime.strptime(str(s), fmt).date()
        except ValueError:
            continue
    return None


def build_candidate(owner_id: int, task: ResumeTask, extracted: dict) -> Candidate:
    """根据 task + extracted 构造一个未持久化的 Candidate（含子表）。"""
    source_type = "url_upload" if task.source_type.startswith("url") else "import"

    candidate = Candidate(
        owner_id=owner_id,
        name=(extracted.get("name") or "未命名").strip()[:64],
        phone=(extracted.get("phone") or None),
        email=(extracted.get("email") or None),
        wechat=(extracted.get("wechat") or None),
        city=(extracted.get("city") or None),
        industry=(extracted.get("industry") or None),
        years_of_experience=_int(extracted.get("years_of_experience")),
        education_level=(extracted.get("education_level") or None),
        current_salary_min=_num(extracted.get("current_salary_min")),
        current_salary_max=_num(extracted.get("current_salary_max")),
        expected_salary_min=_num(extracted.get("expected_salary_min")),
        expected_salary_max=_num(extracted.get("expected_salary_max")),
        skills=list(extracted.get("skills") or []),
        derived_capabilities=task.derived_capabilities,
        resume_quality=task.resume_quality,
        resume_quality_score=(task.resume_quality or {}).get("score"),
        resume_text=task.resume_text,
        resume_file_id=task.file_id,
        raw_extracted=task.extracted,
        source=source_type,
    )

    for exp in extracted.get("experiences") or []:
        candidate.experiences.append(
            CandidateExperience(
                company_name=(exp.get("company_name") or "")[:128] or "未知公司",
                position_title=(exp.get("position_title") or "")[:128] or "未知岗位",
                start_date=_parse_date(exp.get("start_date")),
                end_date=_parse_date(exp.get("end_date")),
                description=exp.get("description"),
            )
        )
    for prj in extracted.get("projects") or []:
        candidate.projects.append(
            CandidateProject(
                project_name=(prj.get("project_name") or "")[:128] or "未命名项目",
                role=prj.get("role"),
                start_date=_parse_date(prj.get("start_date")),
                end_date=_parse_date(prj.get("end_date")),
                description=prj.get("description"),
                tech_stack=list(prj.get("tech_stack") or []),
            )
        )
    for edu in extracted.get("educations") or []:
        candidate.educations.append(
            CandidateEducation(
                school=(edu.get("school") or "")[:128] or "未知学校",
                degree=edu.get("degree"),
                major=edu.get("major"),
                start_date=_parse_date(edu.get("start_date")),
                end_date=_parse_date(edu.get("end_date")),
            )
        )
    return candidate


def find_duplicate_candidate_ids(
    db: Session, owner_id: int, owner_is_admin: bool, extracted: dict
) -> list[int]:
    """返回与 extracted 中 phone/email 命中的现有候选人 id 列表。

    用于 pipeline 决定是否自动入库——只要 phone 或 email 任一命中就视为有重复。
    比 _find_duplicates 简版：不返回详情字段。
    """
    phone = (extracted.get("phone") or "").strip() or None
    email = (extracted.get("email") or "").strip() or None
    if not phone and not email:
        return []

    conditions = []
    if phone:
        conditions.append(Candidate.phone == phone)
    if email:
        conditions.append(Candidate.email == email)

    q = db.query(Candidate.id).filter(Candidate.is_deleted.is_(False)).filter(or_(*conditions))
    if not owner_is_admin:
        q = q.filter(Candidate.owner_id == owner_id)
    return [row[0] for row in q.limit(10).all()]


def find_duplicates_for_user(db: Session, task: ResumeTask) -> list[int]:
    """给 pipeline 用的便捷封装：基于 task.user_id 查重复。"""
    extracted = task.extracted or {}
    owner = db.get(User, task.user_id)
    if not owner:
        return []
    is_admin = owner.role.name == "admin" if owner.role else False
    return find_duplicate_candidate_ids(db, owner.id, is_admin, extracted)
