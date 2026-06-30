import threading
from datetime import UTC, datetime
from threading import Thread
from urllib.parse import quote

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel
from sqlalchemy import or_, text
from sqlalchemy.orm import Session

from app.core.deps import forbid_interviewee, get_current_user
from app.db.session import get_db
from app.models.candidate import (
    Candidate,
    CandidateEducation,
    CandidateExperience,
    CandidateProject,
)
from app.models.follow_up import FollowUp, StatusChange
from app.models.user import User
from app.schemas.candidate import (
    CandidateCreate,
    CandidateDetailOut,
    CandidateOut,
    CandidateUpdate,
)
from app.schemas.common import Page
from app.services.exporter import export_candidates_xlsx
from app.services.resume.llm_client import LLMError, chat_json, chat_text

router = APIRouter(prefix="/candidates", tags=["candidates"])


def _visible_query(db: Session, user: User):
    q = db.query(Candidate).filter(Candidate.is_deleted.is_(False))
    if user.role.name != "admin":
        q = q.filter(Candidate.owner_id == user.id)
    return q


def _apply_candidate_filters(
    q,
    *,
    name: str | None,
    city: str | None,
    industry: str | None,
    job_status: str | None,
    min_years: int | None,
    max_years: int | None,
    keyword: str | None,
    skills: list[str] | None,
    capabilities: list[str] | None,
):
    if name:
        q = q.filter(Candidate.name.ilike(f"%{name}%"))
    if city:
        q = q.filter(Candidate.city == city)
    if industry:
        q = q.filter(Candidate.industry == industry)
    if job_status:
        q = q.filter(Candidate.job_status == job_status)
    if min_years is not None:
        q = q.filter(Candidate.years_of_experience >= min_years)
    if max_years is not None:
        q = q.filter(Candidate.years_of_experience <= max_years)
    if keyword:
        like = f"%{keyword}%"
        q = q.filter(
            or_(
                Candidate.name.ilike(like),
                Candidate.resume_text.ilike(like),
                Candidate.notes.ilike(like),
            )
        )
    if skills:
        # Postgres ARRAY 交集: skills && ARRAY[...]
        q = q.filter(Candidate.skills.op("&&")(skills))
    if capabilities:
        # JSONB: derived_capabilities 里任一条 capability/name 命中
        q = q.filter(
            text(
                """
                EXISTS (
                    SELECT 1
                    FROM jsonb_array_elements(
                        COALESCE(candidate.derived_capabilities, '[]'::jsonb)
                    ) AS cap
                    WHERE COALESCE(cap->>'capability', cap->>'name') = ANY(:cap_names)
                )
                """
            ).bindparams(cap_names=capabilities)
        )
    return q


@router.get("", response_model=Page[CandidateOut])
def list_candidates(
    name: str | None = None,
    city: str | None = None,
    industry: str | None = None,
    job_status: str | None = None,
    min_years: int | None = None,
    max_years: int | None = None,
    keyword: str | None = None,
    skills: list[str] | None = Query(default=None),
    capabilities: list[str] | None = Query(default=None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    user: User = Depends(forbid_interviewee),
) -> Page[CandidateOut]:
    q = _apply_candidate_filters(
        _visible_query(db, user),
        name=name,
        city=city,
        industry=industry,
        job_status=job_status,
        min_years=min_years,
        max_years=max_years,
        keyword=keyword,
        skills=skills,
        capabilities=capabilities,
    )

    total = q.count()
    items = (
        q.order_by(Candidate.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    # 一次性查这一页候选人的跟进概览（最近一次 follow_up + 当前状态）
    last_fu_map: dict[int, object] = {}
    last_st_map: dict[int, str] = {}
    if items:
        ids = [c.id for c in items]
        fu_rows = db.execute(
            text(
                """
                SELECT DISTINCT ON (candidate_id) candidate_id, occurred_at
                FROM follow_up
                WHERE is_deleted = false AND candidate_id = ANY(:ids)
                ORDER BY candidate_id, occurred_at DESC
                """
            ).bindparams(ids=ids)
        ).fetchall()
        last_fu_map = {r[0]: r[1] for r in fu_rows}

        st_rows = db.execute(
            text(
                """
                SELECT DISTINCT ON (candidate_id) candidate_id, to_status
                FROM status_change
                WHERE candidate_id = ANY(:ids)
                ORDER BY candidate_id, changed_at DESC
                """
            ).bindparams(ids=ids)
        ).fetchall()
        last_st_map = {r[0]: r[1] for r in st_rows}

    out: list[CandidateOut] = []
    for it in items:
        co = CandidateOut.model_validate(it)
        co.last_follow_at = last_fu_map.get(it.id)
        co.last_follow_status = last_st_map.get(it.id)
        out.append(co)

    return Page(
        items=out,
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/facets")
def candidate_facets(
    db: Session = Depends(get_db),
    user: User = Depends(forbid_interviewee),
) -> dict:
    """可选筛选项: 行业/城市/求职状态的 distinct 值,用于前端下拉。"""
    q = _visible_query(db, user)
    industries = sorted(
        {
            r[0]
            for r in q.filter(Candidate.industry.isnot(None))
            .with_entities(Candidate.industry)
            .all()
            if r[0]
        }
    )
    cities = sorted(
        {
            r[0]
            for r in q.filter(Candidate.city.isnot(None)).with_entities(Candidate.city).all()
            if r[0]
        }
    )
    return {
        "industries": industries,
        "cities": cities,
        "job_statuses": [
            {"value": "active", "label": "积极求职"},
            {"value": "watching", "label": "观望中"},
            {"value": "onboarded", "label": "已入职"},
        ],
    }


@router.post("", response_model=CandidateOut, status_code=status.HTTP_201_CREATED)
def create_candidate(
    payload: CandidateCreate,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
    user: User = Depends(forbid_interviewee),
) -> CandidateOut:
    candidate = Candidate(
        owner_id=user.id,
        name=payload.name,
        phone=payload.phone,
        email=payload.email,
        wechat=payload.wechat,
        city=payload.city,
        industry=payload.industry,
        years_of_experience=payload.years_of_experience,
        education_level=payload.education_level,
        job_status=payload.job_status,
        current_salary_min=payload.current_salary_min,
        current_salary_max=payload.current_salary_max,
        expected_salary_min=payload.expected_salary_min,
        expected_salary_max=payload.expected_salary_max,
        skills=payload.skills,
        notes=payload.notes,
        source="manual",
    )
    for exp in payload.experiences:
        candidate.experiences.append(CandidateExperience(**exp.model_dump()))
    for prj in payload.projects:
        candidate.projects.append(CandidateProject(**prj.model_dump()))
    for edu in payload.educations:
        candidate.educations.append(CandidateEducation(**edu.model_dump()))

    db.add(candidate)
    db.commit()
    db.refresh(candidate)

    from app.services.vectorize import vectorize_candidate

    background.add_task(vectorize_candidate, candidate.id)
    return CandidateOut.model_validate(candidate)


@router.get("/export")
def export_candidates(
    name: str | None = None,
    city: str | None = None,
    industry: str | None = None,
    job_status: str | None = None,
    min_years: int | None = None,
    max_years: int | None = None,
    keyword: str | None = None,
    skills: list[str] | None = Query(default=None),
    capabilities: list[str] | None = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(forbid_interviewee),
) -> Response:
    q = _apply_candidate_filters(
        _visible_query(db, user),
        name=name,
        city=city,
        industry=industry,
        job_status=job_status,
        min_years=min_years,
        max_years=max_years,
        keyword=keyword,
        skills=skills,
        capabilities=capabilities,
    )
    candidates = q.order_by(Candidate.created_at.desc()).all()
    content = export_candidates_xlsx(candidates)

    filename = f"candidates_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
    return Response(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": f"attachment; filename=\"{filename}\"; filename*=UTF-8''{quote(filename)}",
        },
    )


@router.get("/{candidate_id}", response_model=CandidateDetailOut)
def get_candidate(
    candidate_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(forbid_interviewee),
) -> CandidateDetailOut:
    candidate = _visible_query(db, user).filter(Candidate.id == candidate_id).first()
    if not candidate:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="candidate not found")
    out = CandidateDetailOut.model_validate(candidate)

    # last_follow_at + last_follow_status: detail 也需要,前端用它显示"当前阶段"
    last_fu = (
        db.query(FollowUp)
        .filter(FollowUp.candidate_id == candidate.id, FollowUp.is_deleted.is_(False))
        .order_by(FollowUp.occurred_at.desc())
        .first()
    )
    if last_fu:
        out.last_follow_at = last_fu.occurred_at
    last_sc = (
        db.query(StatusChange)
        .filter(StatusChange.candidate_id == candidate.id)
        .order_by(StatusChange.changed_at.desc())
        .first()
    )
    if last_sc:
        out.last_follow_status = last_sc.to_status

    # 原简历入口: 文件走 attachment, URL 源头走 resume_task
    from app.models.attachment import Attachment
    from app.models.resume_task import ResumeTask

    # Self-heal: candidates imported by the agent before resume persistence
    # shipped have resume_file_id=NULL even though the original PDF still
    # sits in storage as an "agent_upload" Attachment. Auto-link when we can
    # name a unique match (uploaded by the same user, filename contains the
    # candidate's name, not yet bound to another candidate).
    if not candidate.resume_file_id and candidate.name:
        already_bound = db.query(Candidate.resume_file_id).filter(
            Candidate.resume_file_id.is_not(None)
        )
        match = (
            db.query(Attachment)
            .filter(
                Attachment.uploader_id == candidate.owner_id,
                Attachment.owner_type == "agent_upload",
                Attachment.filename.ilike(f"%{candidate.name}%"),
                ~Attachment.id.in_(already_bound),
            )
            .order_by(Attachment.created_at.desc())
            .first()
        )
        if match:
            candidate.resume_file_id = match.id
            db.commit()

    if candidate.resume_file_id:
        att = db.get(Attachment, candidate.resume_file_id)
        if att:
            out.resume_file_id = att.id
            out.resume_file_name = att.filename
    task = (
        db.query(ResumeTask)
        .filter(ResumeTask.candidate_id == candidate.id, ResumeTask.source_type == "url")
        .order_by(ResumeTask.created_at.desc())
        .first()
    )
    if task and task.source_url:
        out.resume_source_url = task.source_url
    return out


@router.get("/{candidate_id}/resume")
def download_resume(
    candidate_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(forbid_interviewee),
) -> Response:
    candidate = _visible_query(db, user).filter(Candidate.id == candidate_id).first()
    if not candidate:
        raise HTTPException(status_code=404, detail="candidate not found")
    if not candidate.resume_file_id:
        raise HTTPException(status_code=404, detail="no resume file attached")

    from app.models.attachment import Attachment
    from app.services import storage

    att = db.get(Attachment, candidate.resume_file_id)
    if not att:
        raise HTTPException(status_code=404, detail="attachment not found")

    try:
        data = storage.read(att.storage_path)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"storage error: {e}") from e

    filename = att.filename or "resume"
    mime = att.mime or "application/octet-stream"
    # HTTP headers must be latin-1; non-ASCII filenames have to go in the
    # RFC 5987 filename* slot, with an ASCII-safe fallback in plain filename=.
    ascii_fallback = filename.encode("ascii", errors="replace").decode("ascii").replace("?", "_")
    return Response(
        content=data,
        media_type=mime,
        headers={
            "Content-Disposition": (
                f'inline; filename="{ascii_fallback}"; filename*=UTF-8\'\'{quote(filename)}'
            ),
        },
    )


@router.patch("/{candidate_id}", response_model=CandidateOut)
def update_candidate(
    candidate_id: int,
    payload: CandidateUpdate,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
    user: User = Depends(forbid_interviewee),
) -> CandidateOut:
    candidate = _visible_query(db, user).filter(Candidate.id == candidate_id).first()
    if not candidate:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="candidate not found")
    patch = payload.model_dump(exclude_unset=True)
    need_rerun = any(
        k in patch
        for k in (
            "skills",
            "industry",
            "city",
            "years_of_experience",
            "education_level",
            "expected_salary_min",
            "expected_salary_max",
            "experiences",
            "projects",
            "educations",
        )
    )

    # 嵌套字段: 若传入则整体替换
    experiences = patch.pop("experiences", None)
    projects = patch.pop("projects", None)
    educations = patch.pop("educations", None)

    for field, value in patch.items():
        setattr(candidate, field, value)

    if experiences is not None:
        candidate.experiences.clear()
        db.flush()
        for e in experiences:
            candidate.experiences.append(CandidateExperience(**e))
    if projects is not None:
        candidate.projects.clear()
        db.flush()
        for p in projects:
            candidate.projects.append(CandidateProject(**p))
    if educations is not None:
        candidate.educations.clear()
        db.flush()
        for edu in educations:
            candidate.educations.append(CandidateEducation(**edu))

    db.commit()
    db.refresh(candidate)

    if need_rerun:
        from app.services.vectorize import vectorize_candidate

        background.add_task(vectorize_candidate, candidate.id)
    return CandidateOut.model_validate(candidate)


@router.post("/{candidate_id}/void", response_model=CandidateOut)
def void_candidate(
    candidate_id: int,
    background: BackgroundTasks,
    reason: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(forbid_interviewee),
) -> CandidateOut:
    candidate = _visible_query(db, user).filter(Candidate.id == candidate_id).first()
    if not candidate:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="candidate not found")
    candidate.is_deleted = True
    candidate.deleted_at = datetime.now(UTC)
    candidate.deleted_reason = reason
    db.commit()
    db.refresh(candidate)

    from app.services.vectorize import vectorize_candidate

    background.add_task(vectorize_candidate, candidate.id)
    return CandidateOut.model_validate(candidate)


@router.post("/{candidate_id}/restore", response_model=CandidateOut)
def restore_candidate(
    candidate_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(forbid_interviewee),
) -> CandidateOut:
    q = db.query(Candidate).filter(Candidate.id == candidate_id)
    if user.role.name != "admin":
        q = q.filter(Candidate.owner_id == user.id)
    candidate = q.first()
    if not candidate:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="candidate not found")
    candidate.is_deleted = False
    candidate.deleted_at = None
    candidate.deleted_reason = None
    db.commit()
    db.refresh(candidate)
    return CandidateOut.model_validate(candidate)


# ─── Web Profile Enrichment ──────────────────────────────────────────────────


@router.post("/{candidate_id}/enrich", status_code=status.HTTP_202_ACCEPTED)
def enrich_candidate(
    candidate_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(forbid_interviewee),
) -> dict:
    """手动触发候选人网络画像调研（异步执行）。"""
    candidate = _visible_query(db, user).filter(Candidate.id == candidate_id).first()
    if not candidate:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="candidate not found")

    from app.services.web_enrichment import enrich_candidate as _enrich

    Thread(target=_enrich, args=(candidate.id,), daemon=True).start()
    return {"detail": "enrichment started"}


@router.get("/{candidate_id}/web-profile")
def get_web_profile(
    candidate_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(forbid_interviewee),
) -> dict:
    """获取候选人网络画像报告。"""
    candidate = _visible_query(db, user).filter(Candidate.id == candidate_id).first()
    if not candidate:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="candidate not found")
    return {
        "web_profile": candidate.web_profile,
        "web_profile_updated_at": candidate.web_profile_updated_at,
    }


# ─── Capability deep-dive (LLM-elaborated evidence) ──────────────────────────


class CapabilityExplainIn(BaseModel):
    capability: str
    evidence_ref: str | None = None
    evidence_detail: str | None = None


class CapabilityExplainOut(BaseModel):
    analysis: str


_EXPLAIN_CACHE: dict[tuple[int, str], str] = {}
_EXPLAIN_CACHE_MAX = 512
_EXPLAIN_LOCK = threading.Lock()


def _format_experiences(cand: Candidate) -> str:
    chunks: list[str] = []
    for i, e in enumerate(cand.experiences, 1):
        period = f"{(e.start_date or '?')} ~ {(e.end_date or '至今')}"
        chunks.append(
            f"经历#{i} | {e.company_name} · {e.position_title} · {period}\n"
            f"  {e.description or '(无描述)'}"
        )
    for i, p in enumerate(cand.projects, 1):
        period = f"{(p.start_date or '?')} ~ {(p.end_date or '?')}"
        tech = ", ".join(p.tech_stack or []) or "-"
        chunks.append(
            f"项目#{i} | {p.project_name} · {p.role or '-'} · {period}\n"
            f"  技术栈: {tech}\n"
            f"  {p.description or '(无描述)'}"
        )
    return "\n\n".join(chunks) if chunks else "(无经历)"


_EXPLAIN_SYSTEM = (
    "你是一名资深技术招聘顾问，擅长把简历里的能力点回溯到具体经历，"
    "用 80-180 字、不夸张、不堆形容词的方式说清楚：这个人为什么具备这条能力，"
    "证据落在哪段经历的什么动作 / 产出 / 规模上。直接输出分析正文，不要分点编号。"
)


@router.post("/{candidate_id}/capabilities/explain", response_model=CapabilityExplainOut)
def explain_capability(
    candidate_id: int,
    payload: CapabilityExplainIn,
    db: Session = Depends(get_db),
    user: User = Depends(forbid_interviewee),
) -> CapabilityExplainOut:
    """LLM-deepen the evidence behind one derived capability.

    Cached in-process by (candidate_id, capability) so repeated expansions are free.
    """
    cand = _visible_query(db, user).filter(Candidate.id == candidate_id).first()
    if not cand:
        raise HTTPException(status_code=404, detail="candidate not found")

    cache_key = (candidate_id, payload.capability)
    with _EXPLAIN_LOCK:
        cached = _EXPLAIN_CACHE.get(cache_key)
    if cached is not None:
        return CapabilityExplainOut(analysis=cached)

    prompt = f"""候选人姓名: {cand.name}
候选人能力: {payload.capability}
原始证据指引: {payload.evidence_ref or '(无)'}
原始证据摘要: {payload.evidence_detail or '(无)'}

候选人完整工作 / 项目经历:
{_format_experiences(cand)}

请基于以上经历，写一段对这条能力的深度解读：
- 锚定到具体的经历或项目（用原文里出现的公司 / 项目名称）
- 提炼出这条能力体现在哪个具体动作、技术选择、产出指标或团队规模上
- 如果证据偏弱，诚实指出"证据有限"，不要编造
- 80-180 字，平实陈述句"""

    try:
        analysis = chat_text(prompt, system=_EXPLAIN_SYSTEM, temperature=0.2).strip()
    except LLMError as e:
        raise HTTPException(status_code=502, detail=f"AI 调用失败：{e}") from e

    if not analysis:
        raise HTTPException(status_code=502, detail="AI 返回为空，请稍后重试")

    with _EXPLAIN_LOCK:
        if len(_EXPLAIN_CACHE) >= _EXPLAIN_CACHE_MAX:
            _EXPLAIN_CACHE.pop(next(iter(_EXPLAIN_CACHE)))
        _EXPLAIN_CACHE[cache_key] = analysis

    return CapabilityExplainOut(analysis=analysis)


class CapabilityDeriveOut(BaseModel):
    capabilities: list


@router.post("/{candidate_id}/capabilities/derive", response_model=CapabilityDeriveOut)
def derive_capabilities(
    candidate_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(forbid_interviewee),
) -> CapabilityDeriveOut:
    """Re-run the capability-derivation LLM call for one candidate and persist
    the result. Used to recover candidates whose async derivation failed
    (e.g. agent-imported before the fix shipped, LLM transient errors)."""
    from app.services.resume import prompts as resume_prompts

    cand = _visible_query(db, user).filter(Candidate.id == candidate_id).first()
    if not cand:
        raise HTTPException(status_code=404, detail="candidate not found")

    experiences = [
        {
            "company_name": e.company_name,
            "position_title": e.position_title,
            "description": e.description,
        }
        for e in (cand.experiences or [])
    ]
    projects = [
        {
            "project_name": p.project_name,
            "role": p.role,
            "description": p.description,
            "tech_stack": p.tech_stack,
        }
        for p in (cand.projects or [])
    ]
    if not experiences and not projects:
        raise HTTPException(status_code=400, detail="该候选人没有可用的工作或项目经历")

    try:
        result = chat_json(
            resume_prompts.derive_capability_prompt(experiences, projects),
            system=resume_prompts.DERIVE_CAPABILITY_SYSTEM,
        )
    except LLMError as e:
        raise HTTPException(status_code=502, detail=f"AI 调用失败：{e}") from e

    caps = result.get("capabilities", []) if isinstance(result, dict) else []
    if not caps:
        raise HTTPException(status_code=502, detail="AI 未返回能力列表，请稍后重试")

    cand.derived_capabilities = caps
    db.commit()
    return CapabilityDeriveOut(capabilities=caps)
