"""AI Agent endpoint — ReAct-style tool loop, non-streaming MVP."""

from __future__ import annotations

import json
import logging
import re
from typing import Any

import os

logger = logging.getLogger(__name__)

from datetime import date, datetime, timezone
from threading import Thread

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy import func, or_, select, text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.deps import forbid_interviewee, get_current_user
from app.db.session import get_db
from app.models.candidate import (
    Candidate,
    CandidateEducation,
    CandidateExperience,
    CandidateProject,
)
from app.models.company import Company
from app.models.follow_up import FollowUp
from app.models.position import Position
from app.models.user import User
from app.services.resume.llm_client import LLMError, chat_text

router = APIRouter(prefix="/agent", tags=["agent"])


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------


class Message(BaseModel):
    role: str  # "user" | "assistant"
    content: str


class AgentRequest(BaseModel):
    messages: list[Message]
    # File the user just uploaded via /agent/parse-file. The frontend keeps it
    # alive across chat turns until the agent commits a create_candidate, so a
    # multi-turn confirmation flow can still attach the original PDF to the
    # candidate row when import finally fires.
    pending_resume_file_id: int | None = None
    # Snapshot of what the user is currently seeing on screen (route, selected
    # position, visible candidates with scores, etc.). Frontend opt-in per
    # page; lets the LLM resolve "this one" / "推荐最佳匹配" against the
    # actual UI rather than blindly keyword-searching the DB.
    page_context: dict[str, Any] | None = None


class ToolCall(BaseModel):
    tool: str
    args: dict[str, Any]
    result: Any


class AgentResponse(BaseModel):
    reply: str
    tool_calls: list[ToolCall] = []


# ---------------------------------------------------------------------------
# Tool implementations
# ---------------------------------------------------------------------------


def _search_candidates(db: Session, owner_id: int, args: dict) -> dict:
    keyword = args.get("keyword", "")
    limit = min(int(args.get("limit", 10)), 20)
    q = select(Candidate).where(
        Candidate.owner_id == owner_id,
        Candidate.is_deleted.is_(False),
    )
    if keyword:
        pattern = f"%{keyword}%"
        q = q.where(
            or_(
                Candidate.name.ilike(pattern),
                Candidate.industry.ilike(pattern),
                Candidate.city.ilike(pattern),
            )
        )
    q = q.order_by(Candidate.updated_at.desc()).limit(limit)
    rows = db.scalars(q).all()
    return {
        "total": len(rows),
        "candidates": [
            {
                "id": r.id,
                "name": r.name,
                "city": r.city,
                "industry": r.industry,
                "years_of_experience": r.years_of_experience,
                "job_status": r.job_status,
                "skills": r.skills[:5] if r.skills else [],
            }
            for r in rows
        ],
    }


def _get_candidate(db: Session, owner_id: int, args: dict) -> dict:
    cid = int(args.get("id", 0))
    c = db.get(Candidate, cid)
    if not c or c.owner_id != owner_id or c.is_deleted:
        return {"error": f"candidate {cid} not found"}

    last_status = db.execute(
        text(
            """
            SELECT to_status
            FROM status_change
            WHERE candidate_id = :cid
            ORDER BY changed_at DESC
            LIMIT 1
            """
        ),
        {"cid": cid},
    ).scalar()
    return {
        "id": c.id,
        "name": c.name,
        "phone": c.phone,
        "email": c.email,
        "city": c.city,
        "industry": c.industry,
        "years_of_experience": c.years_of_experience,
        "education_level": c.education_level,
        "job_status": c.job_status,
        "skills": c.skills,
        "source": c.source,
        "last_follow_status": last_status,
    }


def _search_positions(db: Session, owner_id: int, args: dict) -> dict:
    keyword = args.get("keyword", "")
    status = args.get("status")
    limit = min(int(args.get("limit", 10)), 20)
    q = select(Position).where(Position.owner_id == owner_id)
    if keyword:
        pattern = f"%{keyword}%"
        q = q.where(
            or_(
                Position.title.ilike(pattern),
                Position.type.ilike(pattern),
            )
        )
    if status:
        q = q.where(Position.status == status)
    q = q.order_by(Position.updated_at.desc()).limit(limit)
    rows = db.scalars(q).all()
    return {
        "total": len(rows),
        "positions": [
            {
                "id": r.id,
                "title": r.title,
                "company_id": r.company_id,
                "type": r.type,
                "status": r.status,
                "city": r.city,
            }
            for r in rows
        ],
    }


def _query_stats(db: Session, owner_id: int, args: dict) -> dict:
    metric = args.get("metric", "overview")

    if metric == "overview":
        total_candidates = (
            db.scalar(
                select(func.count(Candidate.id)).where(
                    Candidate.owner_id == owner_id, Candidate.is_deleted.is_(False)
                )
            )
            or 0
        )
        total_positions = (
            db.scalar(
                select(func.count(Position.id)).where(
                    Position.owner_id == owner_id,
                    Position.status == "open",
                )
            )
            or 0
        )
        total_companies = (
            db.scalar(
                select(func.count(Company.id)).where(
                    Company.owner_id == owner_id, Company.is_archived.is_(False)
                )
            )
            or 0
        )
        total_follows = (
            db.scalar(
                select(func.count(FollowUp.id)).where(
                    FollowUp.user_id == owner_id, FollowUp.is_deleted.is_(False)
                )
            )
            or 0
        )
        return {
            "candidates": total_candidates,
            "open_positions": total_positions,
            "companies": total_companies,
            "follow_ups": total_follows,
        }

    if metric == "pipeline":
        rows = db.execute(
            text(
                """
                SELECT COALESCE(sc.to_status, 'unknown') AS stage, COUNT(*) AS cnt
                FROM candidate c
                LEFT JOIN LATERAL (
                    SELECT to_status
                    FROM status_change
                    WHERE candidate_id = c.id
                    ORDER BY changed_at DESC
                    LIMIT 1
                ) sc ON true
                WHERE c.owner_id = :uid AND c.is_deleted = false
                GROUP BY stage
                """
            ),
            {"uid": owner_id},
        ).fetchall()
        return {"pipeline": {r[0]: r[1] for r in rows}}

    return {"error": f"unknown metric: {metric}"}


def _list_follow_ups(db: Session, owner_id: int, args: dict) -> dict:
    candidate_id = args.get("candidate_id")
    limit = min(int(args.get("limit", 5)), 10)
    q = select(FollowUp).where(
        FollowUp.user_id == owner_id,
        FollowUp.is_deleted.is_(False),
    )
    if candidate_id:
        q = q.where(FollowUp.candidate_id == int(candidate_id))
    q = q.order_by(FollowUp.created_at.desc()).limit(limit)
    rows = db.scalars(q).all()

    # Resolve candidate names in one query so the LLM can address candidates
    # by name instead of falling back to "候选人ID 3".
    cand_ids = [r.candidate_id for r in rows]
    name_map: dict[int, str] = {}
    if cand_ids:
        for c in db.scalars(select(Candidate).where(Candidate.id.in_(cand_ids))).all():
            name_map[c.id] = c.name

    return {
        "follow_ups": [
            {
                "candidate_name": name_map.get(r.candidate_id) or "未知候选人",
                "channel": r.channel,
                "content": (r.content or "")[:120],
                "occurred_at": str(r.occurred_at)[:10] if r.occurred_at else None,
            }
            for r in rows
        ]
    }


def _create_follow_up(db: Session, owner_id: int, args: dict) -> dict:
    candidate_id = args.get("candidate_id")
    content = args.get("content", "").strip()
    channel = args.get("channel", "other")
    next_plan = args.get("next_plan")

    if not candidate_id:
        return {"error": "candidate_id is required"}
    if not content:
        return {"error": "content is required"}
    if channel not in ("phone", "wechat", "email", "in_person", "other"):
        channel = "other"

    c = db.get(Candidate, int(candidate_id))
    if not c or c.owner_id != owner_id or c.is_deleted:
        return {"error": f"candidate {candidate_id} not found"}

    fu = FollowUp(
        candidate_id=int(candidate_id),
        user_id=owner_id,
        occurred_at=datetime.now(timezone.utc),
        channel=channel,
        content=content,
        next_plan=next_plan or None,
    )
    db.add(fu)
    db.commit()
    db.refresh(fu)
    return {
        "success": True,
        "follow_up_id": fu.id,
        "candidate_name": c.name,
        "message": f"已为候选人「{c.name}」创建跟进记录",
    }


def _parse_date_loose(val: Any) -> date | None:
    if not val:
        return None
    if isinstance(val, date):
        return val
    if not isinstance(val, str):
        return None
    s = val.strip().replace("/", "-").replace(".", "-").replace("年", "-").replace("月", "-").replace("日", "")
    s = s.rstrip("-").strip()
    if not s or s in ("至今", "now", "present", "current"):
        return None
    parts = [p for p in s.split("-") if p]
    try:
        if len(parts) == 1:
            return date(int(parts[0]), 1, 1)
        if len(parts) == 2:
            return date(int(parts[0]), int(parts[1]), 1)
        return date(int(parts[0]), int(parts[1]), int(parts[2]))
    except (ValueError, TypeError):
        return None


def _coerce_int(v: Any) -> int | None:
    if v in (None, ""):
        return None
    try:
        return int(float(v))
    except (TypeError, ValueError):
        return None


def _coerce_float(v: Any) -> float | None:
    if v in (None, ""):
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _coerce_str_list(v: Any) -> list[str]:
    if isinstance(v, list):
        return [str(x).strip() for x in v if str(x).strip()]
    if isinstance(v, str):
        return [s.strip() for s in re.split(r"[,，、;；]", v) if s.strip()]
    return []


def _create_candidate(db: Session, owner_id: int, args: dict) -> dict:
    """Create a candidate record from parsed-resume fields supplied by the agent."""
    name = (args.get("name") or "").strip()
    if not name:
        return {"error": "name is required"}

    job_status = (args.get("job_status") or "active").strip()
    if job_status not in ("active", "watching", "onboarded"):
        job_status = "active"

    resume_file_id = _coerce_int(args.get("resume_file_id"))

    candidate = Candidate(
        owner_id=owner_id,
        name=name,
        phone=(args.get("phone") or "").strip() or None,
        email=(args.get("email") or "").strip() or None,
        wechat=(args.get("wechat") or "").strip() or None,
        city=(args.get("city") or "").strip() or None,
        industry=(args.get("industry") or "").strip() or None,
        years_of_experience=_coerce_int(args.get("years_of_experience")),
        education_level=(args.get("education_level") or "").strip() or None,
        job_status=job_status,
        current_salary_min=_coerce_float(args.get("current_salary_min")),
        current_salary_max=_coerce_float(args.get("current_salary_max")),
        expected_salary_min=_coerce_float(args.get("expected_salary_min")),
        expected_salary_max=_coerce_float(args.get("expected_salary_max")),
        skills=_coerce_str_list(args.get("skills")),
        notes=(args.get("notes") or "").strip() or None,
        resume_file_id=resume_file_id,
        source="agent_upload" if resume_file_id else "agent",
    )

    for exp in args.get("experiences") or []:
        if not isinstance(exp, dict):
            continue
        company = (exp.get("company_name") or exp.get("company") or "").strip()
        title = (exp.get("position_title") or exp.get("title") or "").strip()
        if not company and not title:
            continue
        candidate.experiences.append(
            CandidateExperience(
                company_name=company or "未知公司",
                position_title=title or "未知岗位",
                start_date=_parse_date_loose(exp.get("start_date")),
                end_date=_parse_date_loose(exp.get("end_date")),
                description=(exp.get("description") or None),
            )
        )

    for prj in args.get("projects") or []:
        if not isinstance(prj, dict):
            continue
        proj_name = (prj.get("project_name") or prj.get("name") or "").strip()
        if not proj_name:
            continue
        candidate.projects.append(
            CandidateProject(
                project_name=proj_name,
                role=(prj.get("role") or None),
                start_date=_parse_date_loose(prj.get("start_date")),
                end_date=_parse_date_loose(prj.get("end_date")),
                description=(prj.get("description") or None),
                tech_stack=_coerce_str_list(prj.get("tech_stack")),
            )
        )

    for edu in args.get("educations") or []:
        if not isinstance(edu, dict):
            continue
        school = (edu.get("school") or "").strip()
        if not school:
            continue
        candidate.educations.append(
            CandidateEducation(
                school=school,
                degree=(edu.get("degree") or None),
                major=(edu.get("major") or None),
                start_date=_parse_date_loose(edu.get("start_date")),
                end_date=_parse_date_loose(edu.get("end_date")),
            )
        )

    db.add(candidate)
    db.commit()
    db.refresh(candidate)

    try:
        from app.services.vectorize import vectorize_candidate

        Thread(target=vectorize_candidate, args=(candidate.id,), daemon=True).start()
    except Exception:
        pass

    # Best-effort capability derivation in the background. The standard
    # resume-upload pipeline runs this LLM step (pipeline.py:63-74) and the
    # detail page's "AI 能力画像" reads from candidate.derived_capabilities.
    # Without it, agent-imported candidates show "尚未提取到能力画像" forever.
    try:
        Thread(
            target=_derive_capabilities_for_agent_import,
            args=(candidate.id,),
            daemon=True,
        ).start()
    except Exception:
        pass

    # Web enrichment (网络画像)
    try:
        from app.services.web_enrichment import enrich_candidate as _enrich_web

        Thread(target=_enrich_web, args=(candidate.id,), daemon=True).start()
    except Exception:
        pass

    return {
        "success": True,
        "candidate_id": candidate.id,
        "candidate_name": candidate.name,
        "message": f"已创建候选人「{candidate.name}」",
    }


def _derive_capabilities_for_agent_import(candidate_id: int) -> None:
    """Run the same capability-derivation LLM call the resume pipeline uses,
    so agent-imported candidates get a populated 'AI 能力画像'. Best-effort —
    failures are swallowed; vectorization still happens in a separate thread."""
    from app.db.session import SessionLocal
    from app.services.resume import prompts as resume_prompts
    from app.services.resume.llm_client import chat_json

    db = SessionLocal()
    try:
        c = db.get(Candidate, candidate_id)
        if not c or c.is_deleted:
            return
        experiences = [
            {
                "company_name": e.company_name,
                "position_title": e.position_title,
                "description": e.description,
            }
            for e in (c.experiences or [])
        ]
        projects = [
            {
                "project_name": p.project_name,
                "role": p.role,
                "description": p.description,
                "tech_stack": p.tech_stack,
            }
            for p in (c.projects or [])
        ]
        if not experiences and not projects:
            return  # nothing to derive from

        result = chat_json(
            resume_prompts.derive_capability_prompt(experiences, projects),
            system=resume_prompts.DERIVE_CAPABILITY_SYSTEM,
        )
        caps = result.get("capabilities", []) if isinstance(result, dict) else []
        if not caps:
            return
        c.derived_capabilities = caps
        db.commit()
    except Exception:
        # Don't crash the daemon thread on transient LLM errors
        db.rollback()
    finally:
        db.close()


def _recommend_candidates(db: Session, owner_id: int, args: dict) -> dict:
    position_id = args.get("position_id")
    keyword = args.get("keyword", "")
    limit = min(int(args.get("limit", 5)), 10)

    pos = None
    if position_id:
        pos = db.get(Position, int(position_id))
        if not pos or pos.owner_id != owner_id:
            return {"error": f"position {position_id} not found"}

    q = select(Candidate).where(
        Candidate.owner_id == owner_id,
        Candidate.is_deleted.is_(False),
        Candidate.job_status != "onboarded",
    )

    # 用岗位的 city / type 做简单匹配（type 是岗位类别，如 AI算法/AI产品/数据/工程）
    if pos:
        filters = []
        if pos.city:
            filters.append(Candidate.city.ilike(f"%{pos.city}%"))
        if pos.type:
            filters.append(Candidate.industry.ilike(f"%{pos.type}%"))
        if filters:
            from sqlalchemy import or_ as _or
            q = q.where(_or(*filters))
    elif keyword:
        pattern = f"%{keyword}%"
        q = q.where(
            or_(
                Candidate.industry.ilike(pattern),
                Candidate.city.ilike(pattern),
                Candidate.name.ilike(pattern),
            )
        )

    q = q.order_by(Candidate.updated_at.desc()).limit(limit)
    rows = db.scalars(q).all()

    return {
        "for_position": pos.title if pos else keyword,
        "total": len(rows),
        "candidates": [
            {
                "id": r.id,
                "name": r.name,
                "city": r.city,
                "industry": r.industry,
                "years_of_experience": r.years_of_experience,
                "job_status": r.job_status,
                "skills": (r.skills or [])[:5],
            }
            for r in rows
        ],
    }


def _web_search_candidate(db: Session, owner_id: int, args: dict) -> dict:
    """触发候选人网络画像调研，返回已有画像或启动异步任务。"""
    candidate_id = args.get("candidate_id")
    if not candidate_id:
        return {"error": "candidate_id is required"}
    c = db.get(Candidate, int(candidate_id))
    if not c or c.owner_id != owner_id or c.is_deleted:
        return {"error": f"candidate {candidate_id} not found"}

    # 如果已有较新的画像，直接返回摘要
    if c.web_profile and not c.web_profile.get("error"):
        profile = c.web_profile
        return {
            "candidate_name": c.name,
            "has_profile": True,
            "summary": profile.get("summary", ""),
            "highlights": profile.get("highlights", []),
            "updated_at": str(c.web_profile_updated_at) if c.web_profile_updated_at else None,
        }

    # 否则启动异步调研
    from app.services.web_enrichment import enrich_candidate as _enrich_web

    Thread(target=_enrich_web, args=(c.id,), daemon=True).start()
    return {
        "candidate_name": c.name,
        "has_profile": False,
        "message": f"已启动对「{c.name}」的网络画像调研，结果将在几秒后可用，可稍后通过详情页查看。",
    }


TOOLS: dict[str, Any] = {
    "search_candidates": _search_candidates,
    "get_candidate": _get_candidate,
    "search_positions": _search_positions,
    "query_stats": _query_stats,
    "list_follow_ups": _list_follow_ups,
    "create_follow_up": _create_follow_up,
    "create_candidate": _create_candidate,
    "recommend_candidates": _recommend_candidates,
    "web_search_candidate": _web_search_candidate,
}

TOOL_SCHEMAS = """
Available tools (call by returning JSON with "tool" and "args" keys):

1. search_candidates(keyword?: str, limit?: int=10)
   → Search candidates by name/industry/city. Returns list with id, name, city, industry, years_of_experience, job_status, skills.

2. get_candidate(id: int)
   → Get full details for one candidate by id.

3. search_positions(keyword?: str, status?: str, limit?: int=10)
   → Search open positions by title/type (岗位类别如 AI算法/AI产品/数据/工程). status can be "open"/"closed"/"paused".

4. query_stats(metric: "overview"|"pipeline")
   → Get recruitment statistics. "overview" = totals; "pipeline" = candidate count by stage.

5. list_follow_ups(candidate_id?: int, limit?: int=5)
   → List recent follow-up records, optionally filtered by candidate.

6. create_follow_up(candidate_id: int, content: str, channel?: str="other", next_plan?: str)
   → Create a follow-up record for a candidate. channel: phone/wechat/email/in_person/other.
   → Use this when the user says they contacted/spoke with/followed up with a candidate.
   → IMPORTANT: Always confirm candidate name before creating. Ask user to confirm if unsure.

7. create_candidate(name: str, phone?: str, email?: str, wechat?: str, city?: str,
                    industry?: str, years_of_experience?: int, education_level?: str,
                    job_status?: "active"|"watching"|"onboarded"="active",
                    expected_salary_min?: float, expected_salary_max?: float,
                    current_salary_min?: float, current_salary_max?: float,
                    skills?: list[str], notes?: str,
                    experiences?: list[{company_name, position_title, start_date?, end_date?, description?}],
                    projects?: list[{project_name, role?, start_date?, end_date?, description?, tech_stack?}],
                    educations?: list[{school, degree?, major?, start_date?, end_date?}],
                    resume_file_id?: int)
   → Create a new candidate from parsed-resume fields. Returns candidate_id.
   → resume_file_id: leave unset — the runtime auto-injects the file id of the
     PDF the user just uploaded in this conversation, so don't make one up.
   → Dates accept "YYYY-MM-DD" / "YYYY-MM" / "YYYY.MM" / "至今". Salary unit: 万/年 (ten-thousand RMB per year).
   → IMPORTANT: Only call this AFTER you have shown the user the parsed key fields and the user has confirmed (e.g. "录入"/"创建"/"保存"/"对的，建吧"). Do NOT auto-create on the first turn — always confirm first.
   → **MUST pass the full structured data**: when the resume contains work history / projects / education, you must populate `experiences`, `projects`, and `educations` arrays — not just `name` and a few top-level fields. A candidate created without these will look empty in the UI and is considered an incomplete import.
   → If a single field is unclear in the resume, omit just that field rather than guessing — but do not skip whole arrays for that reason.

8. recommend_candidates(position_id?: int, keyword?: str, limit?: int=5)
   → Recommend suitable candidates for a position (by city/industry match).
   → Use position_id if known, otherwise use keyword to describe the role.

9. web_search_candidate(candidate_id: int)
   → 触发候选人网络画像调研（搜索引擎 + GitHub + 技术社区）。
   → 如果已有画像则返回摘要；否则启动异步调研任务。
   → Use when the user asks to research / investigate a candidate's online presence.

To call a tool, respond ONLY with JSON:
{"tool": "<name>", "args": {...}}

To give a final answer, respond with JSON:
{"reply": "<your answer in Chinese>"}
"""

SYSTEM_PROMPT = (
    """你是一名专业的招聘顾问/HR 助手 AI，为猎头团队服务（面向顾问/HR 这一侧）。你熟悉候选人、职位、企业和跟进记录。

身份与边界（非常重要）：
- 你永远以“猎头/HR 助手”的身份回答，不要与候选人互换角色
- 不要扮演候选人/求职者，不要用“我作为候选人/我正在找工作/我的简历”等候选人第一人称视角
- 如果用户让你扮演候选人，也要拒绝角色扮演，并改为站在 HR 视角给建议（如：如何与候选人沟通、如何评估、如何推进流程）

当用户问你招聘相关问题时，你可以调用数据库工具查询真实数据，然后用中文给出专业、简洁的回答。

规则：
- 优先用工具查询真实数据，不要凭空猜测
- 回答简洁、专业，适当用数字和列表
- 如果数据不足，如实说明
- 每次只能调用一个工具，等工具返回结果后再决定下一步
- 执行写操作（create_follow_up / create_candidate）前，必须先向用户确认关键信息（候选人姓名、关键字段），避免误操作
- 创建跟进记录成功后，告知用户已记录，并简述内容
- 简历解析场景：用户上传简历后，**用 markdown 列表完整展示**解析出的所有结构化信息，分组呈现，比如：
  - **基本信息**：姓名、职位/方向、电话、邮箱、所在地、经验年限
  - **教育背景**：学校、学位、专业（多段就列多条）
  - **技能**：把技能 stack 列成 inline 列表
  - **工作经历**：每段一行，含公司、职位、起止时间
  - **项目经历**：项目名、角色、时间、要点
  - **薪资期望**
  - 简历末尾若有自我评价/总结，也带上一段
  展示完之后**单独起一行问"是否录入这位候选人？"**。用户明确确认（"录入/创建/保存/对的"等）后，再调用 create_candidate；用户只是问问题、要点评简历时，**不要**调用 create_candidate
- 不要为了"简洁"擅自把简历裁成 6 个字段——展示要尽量完整，因为这正是用户上传简历的目的

写操作的严格隔离规则（极其重要，违反会造成严重数据错误）：
- **create_candidate 和 create_follow_up 是两个完全独立的动作**。"录入候选人/导入简历/添加候选人/把他加进库"等指令只触发 create_candidate，**绝对不要**在创建候选人后顺手再调用 create_follow_up，除非用户在同一句话里**明确**让你"建立联系记录/记一笔跟进/记一条沟通"等
- "录入候选人库" 不是"跟进事件"，它是数据导入操作；**不要**把它写成 follow_up 的 content
- create_follow_up 的 candidate_id 必须来自**用户当前对话中明确指代的那位候选人**——通常是刚刚 search_candidates / get_candidate 命中的那个 id；**绝对不允许**把跟进挂到名字相近、姓氏相同但不是同一个人的候选人身上（例如：用户说的是"张明远"，就不能挂到"张三"或"张伟"上）
- 如果你刚通过 create_candidate 新建了候选人，那条候选人的 id 已经在工具结果里返回了；后续若**确实**需要建跟进，必须用那个新 id，不可使用更早搜索结果里的其他 id
- 当用户的指令模糊或你不确定 candidate_id 是哪个人时，**先停下来问用户**，不要先动作后道歉

输出格式（极其重要）：
- 拿到工具返回结果后，必须把数据"翻译"成给用户看的中文叙述，再用 {"reply": "..."} 返回
- 严禁把工具返回的原始 JSON / 字典 / 列表直接当作 reply（如 [{'id':1,'title':...}]、记录ID：3、候选人ID：3）
- reply 中不要出现 id 字段、字段名 (title/department/etc.) 或字典原文。请用候选人姓名、岗位标题、公司名称等可读信息
- **绝对不要**把回复（或回复的任何一部分）包在 ` ```markdown ` / ` ``` ` 之类的代码栅栏（fenced code block）里——**包括只把简历结构化内容包起来、把"是否录入"留在外面**这种部分包裹也不行。前端已经默认按 markdown 渲染你的回复，套 fence 反而会让 `**加粗**` 和 `- 列表` 都失效成原始字符。
- 代码栅栏（` ``` `）只在你**真要展示一段代码/JSON/SQL** 时才使用，并且要带具体语言（如 ` ```python ` / ` ```json `）。简历内容、列表、说明性文字一律**不要**用 fence。
- 如果某条数据缺少姓名只能拿到 id，可以在工具列表中找到对应字段；如果实在没有，说"某位候选人/岗位"，不要直接说"候选人ID 3"
- 数量较多时用 markdown 列表（- 项目1\\n- 项目2），并按重要性挑 3-5 条；用户要详情时再展开

"""
    + TOOL_SCHEMAS
)


# ---------------------------------------------------------------------------
# Robust LLM call: no JSON mode, parse output ourselves
# ---------------------------------------------------------------------------


def _format_page_context(ctx: dict[str, Any]) -> str:
    """Render the frontend's page-state snapshot as a Chinese block to append
    to the system prompt. Keep it short — we send it on every loop iteration."""
    lines = [
        "=== 用户当前页面状态（重要：用户说「这个/这条/推荐最佳匹配」等指代时，优先用下面的内容，不要再去 DB 关键词搜索）==="
    ]
    if route := ctx.get("route"):
        lines.append(f"页面路由: {route}")
    if desc := ctx.get("description"):
        lines.append(f"页面摘要: {desc}")
    if pos := ctx.get("selectedPosition"):
        lines.append(f"用户已选中的岗位: 「{pos.get('title')}」 (position_id={pos.get('id')})")
    cands = ctx.get("visibleCandidates") or []
    if cands:
        lines.append(f"页面上已渲染的候选人匹配结果（共 {len(cands)} 条，按分数倒序）:")
        for c in cands:
            score = c.get("score")
            verdict = c.get("verdict") or ""
            score_str = f" {score}/100" if score is not None else ""
            lines.append(
                f"  - {c.get('name')} (candidate_id={c.get('id')}) {verdict}{score_str}"
            )
    lines.append("=== 页面状态结束 ===")
    return "\n".join(lines)


def _llm_call(prompt: str, *, page_context: dict[str, Any] | None = None) -> dict[str, Any]:
    """Call LLM in text mode and parse the output into a dict.

    GLM-4-flash with forced response_format=json_object sometimes returns
    plain Chinese text anyway (causing JSON parse failures). Using text mode
    lets the model reply freely; we then:
      1. Try to parse the whole output as JSON → {"tool":...} or {"reply":...}
      2. Try to extract any JSON block from the text
      3. Treat the raw text as a plain reply → {"reply": "<text>"}
    """
    system = SYSTEM_PROMPT
    if page_context:
        system = f"{SYSTEM_PROMPT}\n\n{_format_page_context(page_context)}"
    # No hardcoded timeout — fall back to settings.llm_timeout_seconds (180s
    # default). DeepSeek v4-pro is a reasoner: it generates long internal
    # reasoning_content before the user-visible content, so 60s frequently
    # times out once the system prompt grows (TOOL_SCHEMAS + page context).
    raw = chat_text(prompt, system=system, temperature=0.2)

    raw_stripped = raw.strip()

    def _normalize(parsed: Any) -> dict[str, Any] | None:
        """Coerce a parsed JSON value into a {tool|reply} shape, or None if it
        isn't a recognizable agent control message."""
        if isinstance(parsed, dict):
            if "tool" in parsed or "reply" in parsed:
                return parsed
            # The model returned a raw data dict (e.g. a candidate record) —
            # treat the original raw text as a plain reply rather than leak
            # internal fields back to the user.
            return None
        # Lists / strings / numbers from the model are never valid control
        # messages; let the caller fall back to plain text.
        return None

    # Attempt 1: whole output is JSON
    try:
        normalized = _normalize(json.loads(raw_stripped))
        if normalized is not None:
            return normalized
    except json.JSONDecodeError:
        pass

    # Attempt 2: find an embedded JSON object (greedy, but only matches { ... })
    json_match = re.search(r"\{[\s\S]*\}", raw_stripped)
    if json_match:
        try:
            normalized = _normalize(json.loads(json_match.group()))
            if normalized is not None:
                return normalized
        except json.JSONDecodeError:
            pass

    # Fallback: plain text reply
    return {"reply": raw_stripped}


# ---------------------------------------------------------------------------
# ReAct loop (max 5 iterations)
# ---------------------------------------------------------------------------


def run_agent(
    messages: list[Message],
    db: Session,
    owner_id: int,
    pending_resume_file_id: int | None = None,
    page_context: dict[str, Any] | None = None,
) -> AgentResponse:
    tool_calls: list[ToolCall] = []
    history: list[dict] = [{"role": m.role, "content": m.content} for m in messages]

    for _ in range(5):
        prompt = "\n\n".join(f"[{m['role']}]: {m['content']}" for m in history)
        try:
            result = _llm_call(prompt, page_context=page_context)
        except LLMError as e:
            # Surface the real cause in Render logs — the user-facing fallback
            # is intentionally generic, but if we don't log here we have no
            # way to diagnose recurring failures (timeout? auth? rate limit?).
            logger.exception("agent LLM call failed: %s", e)
            return AgentResponse(
                reply=f"AI 暂不可用：{e}",
                tool_calls=tool_calls,
            )

        if "reply" in result:
            return AgentResponse(reply=result["reply"], tool_calls=tool_calls)

        if "tool" in result:
            tool_name = result.get("tool", "")
            tool_args = result.get("args", {}) or {}
            # Auto-inject the in-flight uploaded resume file id when the agent
            # is creating a candidate, so the original PDF gets attached to
            # the new row and shows up in the detail page's "原简历" card.
            # The LLM doesn't have to know about file ids.
            if (
                tool_name == "create_candidate"
                and pending_resume_file_id is not None
                and not tool_args.get("resume_file_id")
            ):
                tool_args = {**tool_args, "resume_file_id": pending_resume_file_id}
            fn = TOOLS.get(tool_name)
            if not fn:
                tool_result = {"error": f"unknown tool: {tool_name}"}
            else:
                try:
                    tool_result = fn(db, owner_id, tool_args)
                except Exception as e:
                    tool_result = {"error": str(e)}

            tool_calls.append(ToolCall(tool=tool_name, args=tool_args, result=tool_result))
            history.append({"role": "assistant", "content": json.dumps(result, ensure_ascii=False)})
            history.append(
                {
                    "role": "user",
                    "content": f"[tool_result]: {json.dumps(tool_result, ensure_ascii=False)}",
                }
            )
            continue

        # Unexpected dict shape — re-prompt the model to produce a proper reply.
        # Don't str(result) here: that would surface raw internal fields like
        # {'id':1,'title':...} to the user.
        history.append({"role": "assistant", "content": json.dumps(result, ensure_ascii=False)})
        history.append(
            {
                "role": "user",
                "content": (
                    "[system]: 你刚才返回的 JSON 既不是 {\"tool\":...} 也不是 "
                    "{\"reply\":...}。请基于已有信息，用中文给出一段面向用户的"
                    "自然语言回答，并严格用 {\"reply\": \"...\"} JSON 形式返回。"
                    "回答中不要出现 id、字段名或字典原文，必要时用候选人姓名 / 岗位"
                    "标题等可读字段。"
                ),
            }
        )
        continue

    return AgentResponse(
        reply="处理超时，请换个更具体的问题试试。",
        tool_calls=tool_calls,
    )


# ---------------------------------------------------------------------------
# Route
# ---------------------------------------------------------------------------


@router.post("/chat", response_model=AgentResponse)
def agent_chat(
    body: AgentRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(forbid_interviewee),
):
    return run_agent(
        body.messages,
        db,
        current_user.id,
        pending_resume_file_id=body.pending_resume_file_id,
        page_context=body.page_context,
    )


class ParseFileResponse(BaseModel):
    filename: str
    text: str
    char_count: int
    # Attachment row id for the persisted upload, or null when the file type
    # isn't a resume-style document (e.g. a plain image we don't want to
    # treat as a resume original).
    file_id: int | None = None


_AGENT_ALLOWED_EXT = {".pdf", ".docx", ".txt", ".md", ".html", ".htm"}
_AGENT_IMAGE_EXT = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
_AGENT_MAX_BYTES = 10 * 1024 * 1024  # 10MB
_AGENT_MAX_CHARS = 8000  # 截断：避免超 context


def _extract_image_text(filename: str, raw: bytes) -> str:
    """Send image to GLM-4V vision API and return extracted text description."""
    import base64

    ext = os.path.splitext(filename.lower())[1].lstrip(".")
    mime_map = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png",
                "webp": "image/webp", "gif": "image/gif"}
    mime = mime_map.get(ext, "image/jpeg")
    b64 = base64.b64encode(raw).decode()

    # 这里写死走智谱 glm-4v-flash 的 endpoint，所以要用智谱的 key。
    # 当 LLM 已切到非智谱供应商（如 DeepSeek）时，智谱 key 会留在
    # EMBEDDING_API_KEY 里；老的单 key 配置也兼容（fallback 到 llm_api_key）。
    api_key = settings.embedding_api_key or settings.llm_api_key
    if not api_key:
        raise ValueError("智谱视觉 key 未配置（EMBEDDING_API_KEY 或 LLM_API_KEY），无法解析图片")

    messages = [
        {
            "role": "user",
            "content": [
                {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{b64}"}},
                {"type": "text", "text": (
                    "请提取并整理这张图片中的所有文字内容，"
                    "如果是简历，请按结构输出（姓名、联系方式、教育经历、工作经历、技能等）；"
                    "如果是其他图片，请描述图片内容并提取所有可见文字。"
                    "请用中文回答。"
                )},
            ],
        }
    ]
    body = {"model": "glm-4v-flash", "messages": messages, "temperature": 0.1}
    url = "https://open.bigmodel.cn/api/paas/v4/chat/completions"
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}

    import httpx
    try:
        with httpx.Client(timeout=60.0) as c:
            resp = c.post(url, json=body, headers=headers)
            if resp.status_code >= 400:
                raise ValueError(f"Vision API 错误 {resp.status_code}: {resp.text[:300]}")
            data = resp.json()
        return data["choices"][0]["message"]["content"]
    except httpx.HTTPError as e:
        raise ValueError(f"Vision API 请求失败: {e}") from e


@router.post("/parse-file", response_model=ParseFileResponse)
async def parse_file_for_agent(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(forbid_interviewee),
) -> ParseFileResponse:
    """提取文件文本供 AI 助手使用。除了返回文本，还会把文件持久化为 Attachment，
    返回 file_id；后续 /agent/chat 携带 pending_resume_file_id，run_agent 在
    create_candidate 时会自动把它挂到候选人 resume_file_id 上，详情页就能查看
    原 PDF。图片走 vision 模型，不持久化（避免存大量截图）。"""
    import hashlib

    from app.models.attachment import Attachment
    from app.services import storage
    from app.services.resume.text_extract import extract as extract_text

    if not file.filename:
        raise HTTPException(status_code=400, detail="missing filename")
    ext = os.path.splitext(file.filename.lower())[1]

    is_image = ext in _AGENT_IMAGE_EXT
    if not is_image and ext not in _AGENT_ALLOWED_EXT:
        raise HTTPException(status_code=400, detail=f"不支持的文件类型: {ext}")

    raw = await file.read()
    if len(raw) > _AGENT_MAX_BYTES:
        raise HTTPException(status_code=413, detail="文件过大（最大 10MB）")
    if not raw:
        raise HTTPException(status_code=400, detail="空文件")

    try:
        if is_image:
            text = _extract_image_text(file.filename, raw)
        else:
            text = extract_text(file.filename, raw)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"文件解析失败: {e}") from e

    if len(text) > _AGENT_MAX_CHARS:
        text = text[:_AGENT_MAX_CHARS] + "\n\n[内容过长，已截断]"

    # Persist the original document so it can be reattached to a candidate
    # later if the agent commits an import. Skip for images (rarely a real
    # resume original) and on storage failure (we still want the parse to
    # succeed even if storage is misconfigured).
    file_id: int | None = None
    if not is_image:
        try:
            storage_path = storage.save(file.filename, raw)
            att = Attachment(
                uploader_id=current_user.id,
                filename=file.filename,
                storage_path=storage_path,
                mime=file.content_type,
                size_bytes=len(raw),
                sha256=hashlib.sha256(raw).hexdigest(),
                owner_type="agent_upload",
            )
            db.add(att)
            db.commit()
            db.refresh(att)
            file_id = att.id
        except Exception:
            db.rollback()
            file_id = None

    return ParseFileResponse(
        filename=file.filename,
        text=text,
        char_count=len(text),
        file_id=file_id,
    )

