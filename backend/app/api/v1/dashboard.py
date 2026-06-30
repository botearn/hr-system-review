"""Dashboard 聚合 API。

设计原则参考 Stripe / Linear / Posthog 2026 dashboard:
- 顶部 KPI strip: 数字 + 30 天 sparkline + 环比
- 横条柱图(不用饼图)
- 5 秒读完核心指标

AI insight 单独走 /dashboard/ai-insight, 缓存 1 小时避免每开看板都耗 token。
"""

from __future__ import annotations

import json
import time
from datetime import UTC, date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.deps import forbid_interviewee, get_current_user
from app.db.session import get_db
from app.models.candidate import Candidate
from app.models.follow_up import FollowUp, StatusChange
from app.models.user import User
from app.schemas.dashboard import (
    AIInsight,
    BreakdownItem,
    DashboardOverview,
    DayActivity,
    FunnelStage,
    KPISpark,
)
from app.services.resume.llm_client import LLMError, chat_json

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


# ---------------------------------------------------------------------------
# Funnel stage definitions — single source of truth shared by /overview and
# /funnel/{stage_key}/candidates so they always agree.
# ---------------------------------------------------------------------------

# Funnel = current-stage snapshot (not historical reach). Each candidate
# falls into exactly one bucket — whichever to_status their latest
# status_change row points at. Stages here are listed in the order they
# render (left-to-right in the bar list).
#
# Buckets defined as families of status_change.to_status values:
#   面试中  — interview_scheduled / interview_1_passed / interview_2_passed
#   等 Offer — offer_sent
#   已入职  — onboarded
#   流失   — rejected_1 / rejected_2 / declined_offer / dropped
# Candidates with only initial_contact / resume_pushed (or no status
# change at all) are counted as "未推送" so we don't lose them.
_FUNNEL_STAGES: list[tuple[str, str]] = [
    ("not_pushed", "正在沟通"),
    ("interviewing", "正在面试"),
    ("awaiting_offer", "正在等 Offer"),
    ("onboarded", "已入职"),
    ("lost", "已流失"),
]
_FUNNEL_LABELS = dict(_FUNNEL_STAGES)

# Map every concrete to_status to the bucket it lands in.
_STATUS_TO_BUCKET: dict[str, str] = {
    "initial_contact": "not_pushed",
    "resume_pushed": "not_pushed",
    "interview_scheduled": "interviewing",
    "interview_1_passed": "interviewing",
    "interview_2_passed": "interviewing",
    "offer_sent": "awaiting_offer",
    "onboarded": "onboarded",
    "rejected_1": "lost",
    "rejected_2": "lost",
    "declined_offer": "lost",
    "dropped": "lost",
}


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------


def _scope_candidate_ids(db: Session, user: User) -> tuple[list[int], str]:
    """返回 (用户能看到的候选人 id 列表, 'self' 或 'org')。"""
    q = db.query(Candidate.id).filter(Candidate.is_deleted.is_(False))
    if user.role.name != "admin":
        q = q.filter(Candidate.owner_id == user.id)
        scope = "self"
    else:
        scope = "org"
    return [r[0] for r in q.all()], scope


def _sparkline_30d(db: Session, table_attr, cand_ids: list[int]) -> list[int]:
    """取最近 30 天每日计数。table_attr 是某表的 candidate_id 列。

    例: _sparkline_30d(db, FollowUp, ids) -> 30 个数字
    """
    if not cand_ids:
        return [0] * 30

    today = date.today()
    start = today - timedelta(days=29)

    rows = (
        db.query(
            func.date(table_attr.created_at).label("d"),
            func.count(table_attr.id).label("c"),
        )
        .filter(
            table_attr.created_at >= datetime.combine(start, datetime.min.time()),
            table_attr.candidate_id.in_(cand_ids),
        )
        .group_by(func.date(table_attr.created_at))
        .all()
    )
    by_day: dict[date, int] = {r.d: int(r.c) for r in rows}
    return [by_day.get(start + timedelta(days=i), 0) for i in range(30)]


def _candidate_sparkline_30d(db: Session, cand_ids: list[int]) -> list[int]:
    """候选人新增的 sparkline。candidate 表有 is_deleted, 用 created_at 过滤。"""
    if not cand_ids:
        return [0] * 30
    today = date.today()
    start = today - timedelta(days=29)

    rows = (
        db.query(
            func.date(Candidate.created_at).label("d"),
            func.count(Candidate.id).label("c"),
        )
        .filter(
            Candidate.id.in_(cand_ids),
            Candidate.created_at >= datetime.combine(start, datetime.min.time()),
        )
        .group_by(func.date(Candidate.created_at))
        .all()
    )
    by_day: dict[date, int] = {r.d: int(r.c) for r in rows}
    return [by_day.get(start + timedelta(days=i), 0) for i in range(30)]


def _current_bucket_per_candidate(db: Session, cand_ids: list[int]) -> dict[int, str]:
    """Map each candidate to the bucket implied by their *latest*
    status_change row. Candidates with no row default to 'not_pushed'.
    Single source of truth for both /overview and the drill-down."""
    by_cand: dict[int, str] = {cid: "not_pushed" for cid in cand_ids}
    if not cand_ids:
        return by_cand
    # PostgreSQL DISTINCT ON would be cleaner, but stay portable: pull all
    # rows and reduce in Python (small per-user volumes).
    rows = (
        db.query(
            StatusChange.candidate_id,
            StatusChange.to_status,
            StatusChange.changed_at,
        )
        .filter(StatusChange.candidate_id.in_(cand_ids))
        .all()
    )
    latest_at: dict[int, datetime] = {}
    for cid, st, when in rows:
        prev = latest_at.get(cid)
        if prev is None or when > prev:
            latest_at[cid] = when
            bucket = _STATUS_TO_BUCKET.get(st, "not_pushed")
            by_cand[cid] = bucket
    return by_cand


def _funnel_sets(db: Session, cand_ids: list[int]) -> dict[str, set[int]]:
    """Group candidates by their current bucket. Shared by /overview and
    the drill-down so the two never disagree."""
    out: dict[str, set[int]] = {k: set() for k, _ in _FUNNEL_STAGES}
    for cid, bucket in _current_bucket_per_candidate(db, cand_ids).items():
        if bucket in out:
            out[bucket].add(cid)
    return out


def _delta_pct(curr: int, prev: int) -> float | None:
    if prev == 0:
        return None if curr == 0 else 100.0
    return round((curr - prev) / prev * 100, 1)


# ---------------------------------------------------------------------------
# overview
# ---------------------------------------------------------------------------


@router.get("/overview", response_model=DashboardOverview)
def get_overview(
    db: Session = Depends(get_db),
    user: User = Depends(forbid_interviewee),
) -> DashboardOverview:
    cand_ids, scope = _scope_candidate_ids(db, user)
    today = date.today()
    week_start = today - timedelta(days=6)
    prev_week_start = today - timedelta(days=13)
    prev_week_end = today - timedelta(days=7)

    # ---------------- KPIs ----------------
    total_candidates = len(cand_ids)

    # 本周新增跟进
    fu_this_week = (
        db.query(func.count(FollowUp.id))
        .filter(
            FollowUp.is_deleted.is_(False),
            FollowUp.candidate_id.in_(cand_ids) if cand_ids else False,
            FollowUp.occurred_at >= datetime.combine(week_start, datetime.min.time()),
        )
        .scalar()
        or 0
    )
    fu_prev_week = (
        db.query(func.count(FollowUp.id))
        .filter(
            FollowUp.is_deleted.is_(False),
            FollowUp.candidate_id.in_(cand_ids) if cand_ids else False,
            FollowUp.occurred_at >= datetime.combine(prev_week_start, datetime.min.time()),
            FollowUp.occurred_at < datetime.combine(prev_week_end, datetime.min.time()),
        )
        .scalar()
        or 0
    )

    # 待跟进: 复用 reminders 接口的 overdue + due_today + stale 三类聚合,
    # 保证 KPI 数字 = 上方提醒条数字, 不再两边各算一份导致偏差
    from app.api.v1.follow_ups import get_reminders

    reminders = get_reminders(db=db, user=user)
    overdue_count = len(reminders.overdue)
    today_due_count = len(reminders.due_today)
    stale_count = len(reminders.stale)
    pending_total = reminders.total

    # 本周匹配 / status_change 数(粗略代表用户活跃)
    sc_this_week = (
        db.query(func.count(StatusChange.id))
        .filter(
            StatusChange.candidate_id.in_(cand_ids) if cand_ids else False,
            StatusChange.changed_at >= datetime.combine(week_start, datetime.min.time()),
        )
        .scalar()
        or 0
    )
    sc_prev_week = (
        db.query(func.count(StatusChange.id))
        .filter(
            StatusChange.candidate_id.in_(cand_ids) if cand_ids else False,
            StatusChange.changed_at >= datetime.combine(prev_week_start, datetime.min.time()),
            StatusChange.changed_at < datetime.combine(prev_week_end, datetime.min.time()),
        )
        .scalar()
        or 0
    )

    scope_zh = "全公司" if scope == "org" else "我的候选人"
    kpis = [
        KPISpark(
            value=total_candidates,
            label="候选人总数",
            sparkline=_candidate_sparkline_30d(db, cand_ids),
            delta_pct=None,
            source=f"{scope_zh}里的全部候选人，曲线为最近 30 天每日新增",
        ),
        KPISpark(
            value=fu_this_week,
            label="本周跟进",
            sparkline=_sparkline_30d(db, FollowUp, cand_ids),
            delta_pct=_delta_pct(fu_this_week, fu_prev_week),
            source="最近 7 天与你的候选人产生的所有沟通记录数；环比对比上一周",
        ),
        KPISpark(
            value=pending_total,
            label="待跟进",
            sparkline=[],
            delta_pct=None,
            source=(
                f"逾期 {overdue_count} 项 + 今天到期 {today_due_count} 项 + "
                f"长期未联系 {stale_count} 项；点击查看完整名单"
            ),
        ),
        KPISpark(
            value=sc_this_week,
            label="本周状态变更",
            sparkline=_sparkline_30d(db, StatusChange, cand_ids) if cand_ids else [0] * 30,
            delta_pct=_delta_pct(sc_this_week, sc_prev_week),
            source="最近 7 天候选人在流程上的阶段变更次数；环比对比上一周",
        ),
    ]

    # ---------------- 候选人入职状态 ----------------
    # Each candidate sits in exactly one bucket — their current pipeline
    # stage. Conversion-between-stages is no longer meaningful (these are
    # peers, not parent/child), so conversion_pct is omitted.
    per_stage_sets = _funnel_sets(db, cand_ids)
    funnel: list[FunnelStage] = [
        FunnelStage(
            key=key,
            label=label,
            count=len(per_stage_sets.get(key, set())),
            conversion_pct=None,
        )
        for key, label in _FUNNEL_STAGES
    ]

    # ---------------- 行业 / 流程状态分布 ----------------
    industry_breakdown: list[BreakdownItem] = []
    job_status_breakdown: list[BreakdownItem] = []
    if cand_ids:
        ind_rows = (
            db.query(Candidate.industry, func.count(Candidate.id))
            .filter(Candidate.id.in_(cand_ids))
            .group_by(Candidate.industry)
            .order_by(func.count(Candidate.id).desc())
            .limit(5)
            .all()
        )
        industry_breakdown = [
            BreakdownItem(key=ind or "未知", label=ind or "未知", count=int(c))
            for ind, c in ind_rows
        ]

        # Replaces the old "active / watching / onboarded" donut. Same
        # bucket scheme as the funnel above so the two never disagree.
        bucket_counts: dict[str, int] = dict.fromkeys((k for k, _ in _FUNNEL_STAGES), 0)
        for bucket in _current_bucket_per_candidate(db, cand_ids).values():
            if bucket in bucket_counts:
                bucket_counts[bucket] += 1
        job_status_breakdown = [
            BreakdownItem(key=k, label=lbl, count=bucket_counts[k])
            for k, lbl in _FUNNEL_STAGES
            if bucket_counts[k] > 0
        ]

    # ---------------- 7 天活动 ----------------
    activity_7d: list[DayActivity] = []
    for i in range(7):
        d = week_start + timedelta(days=i)
        d_start = datetime.combine(d, datetime.min.time())
        d_end = d_start + timedelta(days=1)
        fu_count = 0
        sc_count = 0
        if cand_ids:
            fu_count = (
                db.query(func.count(FollowUp.id))
                .filter(
                    FollowUp.is_deleted.is_(False),
                    FollowUp.candidate_id.in_(cand_ids),
                    FollowUp.occurred_at >= d_start,
                    FollowUp.occurred_at < d_end,
                )
                .scalar()
                or 0
            )
            sc_count = (
                db.query(func.count(StatusChange.id))
                .filter(
                    StatusChange.candidate_id.in_(cand_ids),
                    StatusChange.changed_at >= d_start,
                    StatusChange.changed_at < d_end,
                )
                .scalar()
                or 0
            )
        activity_7d.append(DayActivity(day=d, follow_ups=fu_count, status_changes=sc_count))

    return DashboardOverview(
        kpis=kpis,
        funnel=funnel,
        industry_breakdown=industry_breakdown,
        job_status_breakdown=job_status_breakdown,
        activity_7d=activity_7d,
        scope=scope,
        generated_at=datetime.now(UTC).isoformat(),
    )


# ---------------------------------------------------------------------------
# Recent-activity drill-down — used by KPI card click-through
# ---------------------------------------------------------------------------


from pydantic import BaseModel  # noqa: E402  (kept local to this section)


class RecentFollowUp(BaseModel):
    id: int
    candidate_id: int
    candidate_name: str
    occurred_at: datetime
    channel: str
    content_excerpt: str


class RecentStatusChange(BaseModel):
    id: int
    candidate_id: int
    candidate_name: str
    changed_at: datetime
    from_status: str | None
    to_status: str


class RecentActivityOut(BaseModel):
    follow_ups: list[RecentFollowUp]
    status_changes: list[RecentStatusChange]


@router.get("/recent-activity", response_model=RecentActivityOut)
def get_recent_activity(
    days: int = 7,
    limit: int = 50,
    db: Session = Depends(get_db),
    user: User = Depends(forbid_interviewee),
) -> RecentActivityOut:
    """Recent follow-ups + status changes within the last `days` days.

    Backs the KPI card click-through (本周跟进 / 本周状态变更) so the user
    can see *which* records make up the headline number.
    """
    cand_ids, _ = _scope_candidate_ids(db, user)
    if not cand_ids:
        return RecentActivityOut(follow_ups=[], status_changes=[])
    since = datetime.combine(date.today() - timedelta(days=days - 1), datetime.min.time())

    fu_rows = (
        db.query(FollowUp)
        .filter(
            FollowUp.is_deleted.is_(False),
            FollowUp.candidate_id.in_(cand_ids),
            FollowUp.occurred_at >= since,
        )
        .order_by(FollowUp.occurred_at.desc())
        .limit(limit)
        .all()
    )
    sc_rows = (
        db.query(StatusChange)
        .filter(
            StatusChange.candidate_id.in_(cand_ids),
            StatusChange.changed_at >= since,
        )
        .order_by(StatusChange.changed_at.desc())
        .limit(limit)
        .all()
    )

    cand_ids_in_view = {r.candidate_id for r in fu_rows} | {r.candidate_id for r in sc_rows}
    name_map: dict[int, str] = {}
    if cand_ids_in_view:
        for c in db.query(Candidate).filter(Candidate.id.in_(cand_ids_in_view)).all():
            name_map[c.id] = c.name

    fus = [
        RecentFollowUp(
            id=r.id,
            candidate_id=r.candidate_id,
            candidate_name=name_map.get(r.candidate_id, "未知候选人"),
            occurred_at=r.occurred_at,
            channel=r.channel,
            content_excerpt=(r.content or "")[:120],
        )
        for r in fu_rows
    ]
    scs = [
        RecentStatusChange(
            id=r.id,
            candidate_id=r.candidate_id,
            candidate_name=name_map.get(r.candidate_id, "未知候选人"),
            changed_at=r.changed_at,
            from_status=r.from_status,
            to_status=r.to_status,
        )
        for r in sc_rows
    ]
    return RecentActivityOut(follow_ups=fus, status_changes=scs)


# ---------------------------------------------------------------------------
# Funnel drill-down — list candidates who ever reached a given stage
# ---------------------------------------------------------------------------


class FunnelStageCandidate(BaseModel):
    candidate_id: int
    candidate_name: str
    reached_at: datetime
    current_status: str | None = None


class FunnelStageCandidatesOut(BaseModel):
    stage_key: str
    stage_label: str
    candidates: list[FunnelStageCandidate]


@router.get("/funnel/{stage_key}/candidates", response_model=FunnelStageCandidatesOut)
def get_funnel_stage_candidates(
    stage_key: str,
    limit: int = 50,
    db: Session = Depends(get_db),
    user: User = Depends(forbid_interviewee),
) -> FunnelStageCandidatesOut:
    """Return candidates whose *current* bucket equals `stage_key`. Same
    semantics as the dashboard funnel — each candidate appears in exactly
    one bucket, so the drawer count matches the bar the user clicked.
    """
    if stage_key not in _FUNNEL_LABELS:
        raise HTTPException(status_code=400, detail=f"unknown stage: {stage_key}")

    cand_ids, _ = _scope_candidate_ids(db, user)
    stage_label = _FUNNEL_LABELS[stage_key]
    empty = FunnelStageCandidatesOut(stage_key=stage_key, stage_label=stage_label, candidates=[])
    if not cand_ids:
        return empty

    bucket_by_cand = _current_bucket_per_candidate(db, cand_ids)
    target_ids = [cid for cid, b in bucket_by_cand.items() if b == stage_key]
    if not target_ids:
        return empty

    # Latest status_change per candidate gives us the current to_status
    # (also the "reached_at" timestamp the row sorts on).
    last_at: dict[int, datetime] = {}
    last_st: dict[int, str] = {}
    rows = (
        db.query(StatusChange.candidate_id, StatusChange.to_status, StatusChange.changed_at)
        .filter(StatusChange.candidate_id.in_(target_ids))
        .all()
    )
    for cid, st, when in rows:
        prev = last_at.get(cid)
        if prev is None or when > prev:
            last_at[cid] = when
            last_st[cid] = st

    cand_map = {c.id: c for c in db.query(Candidate).filter(Candidate.id.in_(target_ids)).all()}

    out: list[FunnelStageCandidate] = []
    for cid in target_ids:
        cand = cand_map.get(cid)
        if not cand:
            continue
        out.append(
            FunnelStageCandidate(
                candidate_id=cid,
                candidate_name=cand.name,
                # If the candidate has no status_change at all (default
                # bucket = not_pushed), fall back to the candidate's
                # creation time so the drawer still has something.
                reached_at=last_at.get(cid) or cand.created_at,
                current_status=last_st.get(cid),
            )
        )
    out.sort(key=lambda c: c.reached_at, reverse=True)
    return FunnelStageCandidatesOut(
        stage_key=stage_key, stage_label=stage_label, candidates=out[:limit]
    )


# ---------------------------------------------------------------------------
# AI insight (cached 1h per user)
# ---------------------------------------------------------------------------

# 内存级缓存: {(user_id, scope): (ts, text)}
_INSIGHT_CACHE: dict[tuple[int, str], tuple[float, str]] = {}
_INSIGHT_TTL = 3600  # 1 小时


@router.get("/ai-insight", response_model=AIInsight)
def get_ai_insight(
    force: bool = False,
    db: Session = Depends(get_db),
    user: User = Depends(forbid_interviewee),
) -> AIInsight:
    cand_ids, scope = _scope_candidate_ids(db, user)
    cache_key = (user.id, scope)

    if not force:
        cached = _INSIGHT_CACHE.get(cache_key)
        if cached and time.time() - cached[0] < _INSIGHT_TTL:
            ts, text = cached
            return AIInsight(
                text=text,
                cached=True,
                generated_at=datetime.fromtimestamp(ts, UTC).isoformat(),
            )

    # 拼一个简短上下文给 LLM
    overview = get_overview(db=db, user=user)
    snapshot = {
        "scope": overview.scope,
        "kpis": [
            {"label": k.label, "value": k.value, "delta_pct": k.delta_pct} for k in overview.kpis
        ],
        "funnel": [
            {"label": f.label, "count": f.count, "conversion_pct": f.conversion_pct}
            for f in overview.funnel
        ],
        "industries_top": [
            {"label": b.label, "count": b.count} for b in overview.industry_breakdown[:5]
        ],
        "activity_7d_total_followups": sum(a.follow_ups for a in overview.activity_7d),
    }

    system = (
        "你是猎头团队的资深运营分析师。基于给定的看板数据快照,"
        "给一段不超过 80 字的中文观察,聚焦最值得关注的 1-2 个信号"
        "(异常下降/上升、卡点、转化率问题)。语气干练,不要客套,"
        '不要重复数字本身,而要解读趋势。输出 JSON: {"text": "..."}'
    )
    prompt = f"看板数据:\n{json.dumps(snapshot, ensure_ascii=False)}\n\n请给出观察。"

    try:
        resp = chat_json(prompt, system=system, temperature=0.4, timeout=20)
        text = (resp.get("text") or "").strip()
        if not text:
            text = "数据看起来正常,无特别需要关注的信号。"
    except LLMError as e:
        raise HTTPException(status_code=503, detail=f"AI 暂不可用：{e}") from e

    now = time.time()
    _INSIGHT_CACHE[cache_key] = (now, text)
    return AIInsight(
        text=text,
        cached=False,
        generated_at=datetime.fromtimestamp(now, UTC).isoformat(),
    )
