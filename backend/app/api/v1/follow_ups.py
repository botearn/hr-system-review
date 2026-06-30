from datetime import UTC, date, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, func
from sqlalchemy.orm import Session

from app.core.deps import forbid_interviewee, get_current_user
from app.db.session import get_db
from app.models.candidate import Candidate
from app.models.follow_up import (
    CHANNEL_LABEL,
    CHANNELS,
    STATUS_LABEL,
    STATUSES,
    FollowUp,
    StatusChange,
)
from app.models.user import User
from app.schemas.common import Page
from app.schemas.follow_up import (
    ChannelOption,
    FollowUpCreate,
    FollowUpEnumsOut,
    FollowUpOut,
    FollowUpUpdate,
    ReminderOverdueItem,
    RemindersOut,
    ReminderStaleItem,
    StatusChangeIn,
    StatusChangeOut,
    StatusOption,
)

router = APIRouter(prefix="/follow-ups", tags=["follow-ups"])


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------


def _ensure_candidate_access(db: Session, candidate_id: int, user: User) -> Candidate:
    cand = db.get(Candidate, candidate_id)
    if not cand or cand.is_deleted:
        raise HTTPException(status_code=404, detail="candidate not found")
    if user.role.name != "admin" and cand.owner_id != user.id:
        raise HTTPException(status_code=403, detail="forbidden")
    return cand


def _to_out(fu: FollowUp) -> FollowUpOut:
    data = FollowUpOut.model_validate(fu)
    return data


# ---------------------------------------------------------------------------
# enums (前端下拉用)
# ---------------------------------------------------------------------------


@router.get("/enums", response_model=FollowUpEnumsOut)
def get_enums(_: User = Depends(forbid_interviewee)) -> FollowUpEnumsOut:
    return FollowUpEnumsOut(
        statuses=[StatusOption(value=v, label=label) for v, label in STATUSES],
        channels=[ChannelOption(value=v, label=label) for v, label in CHANNELS],
    )


# ---------------------------------------------------------------------------
# follow-ups CRUD
# ---------------------------------------------------------------------------


@router.get("", response_model=Page[FollowUpOut])
def list_follow_ups(
    candidate_id: int | None = None,
    position_id: int | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    user: User = Depends(forbid_interviewee),
) -> Page[FollowUpOut]:
    if candidate_id:
        _ensure_candidate_access(db, candidate_id, user)

    q = db.query(FollowUp).filter(FollowUp.is_deleted.is_(False))

    if user.role.name != "admin":
        # 顾问只能看到自己负责候选人的跟进记录
        q = q.join(Candidate, Candidate.id == FollowUp.candidate_id).filter(
            Candidate.owner_id == user.id
        )

    if candidate_id is not None:
        q = q.filter(FollowUp.candidate_id == candidate_id)
    if position_id is not None:
        q = q.filter(FollowUp.position_id == position_id)

    total = q.count()
    items = (
        q.order_by(FollowUp.occurred_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    return Page(
        items=[_to_out(it) for it in items],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("", response_model=FollowUpOut, status_code=status.HTTP_201_CREATED)
def create_follow_up(
    payload: FollowUpCreate,
    db: Session = Depends(get_db),
    user: User = Depends(forbid_interviewee),
) -> FollowUpOut:
    _ensure_candidate_access(db, payload.candidate_id, user)
    fu = FollowUp(
        candidate_id=payload.candidate_id,
        position_id=payload.position_id,
        user_id=user.id,
        occurred_at=payload.occurred_at,
        channel=payload.channel,
        content=payload.content,
        next_plan=payload.next_plan,
        next_plan_due=payload.next_plan_due,
        attachments=[a.model_dump() for a in payload.attachments] or None,
    )
    db.add(fu)
    db.commit()
    db.refresh(fu)
    return _to_out(fu)


@router.patch("/{follow_up_id}", response_model=FollowUpOut)
def update_follow_up(
    follow_up_id: int,
    payload: FollowUpUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(forbid_interviewee),
) -> FollowUpOut:
    fu = db.get(FollowUp, follow_up_id)
    if not fu or fu.is_deleted:
        raise HTTPException(status_code=404, detail="follow-up not found")
    _ensure_candidate_access(db, fu.candidate_id, user)
    if user.role.name != "admin" and fu.user_id != user.id:
        raise HTTPException(status_code=403, detail="not your follow-up")

    patch = payload.model_dump(exclude_unset=True)
    if "attachments" in patch and patch["attachments"] is not None:
        patch["attachments"] = [
            a if isinstance(a, dict) else a.model_dump() for a in patch["attachments"]
        ]
    for k, v in patch.items():
        setattr(fu, k, v)
    db.commit()
    db.refresh(fu)
    return _to_out(fu)


@router.delete("/{follow_up_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_follow_up(
    follow_up_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(forbid_interviewee),
) -> None:
    fu = db.get(FollowUp, follow_up_id)
    if not fu or fu.is_deleted:
        raise HTTPException(status_code=404, detail="follow-up not found")
    _ensure_candidate_access(db, fu.candidate_id, user)
    if user.role.name != "admin" and fu.user_id != user.id:
        raise HTTPException(status_code=403, detail="not your follow-up")
    fu.is_deleted = True
    db.commit()
    return None


# ---------------------------------------------------------------------------
# status changes
# ---------------------------------------------------------------------------


def _resync_landed(db: Session, candidate_id: int) -> None:
    """重算 candidate.landed_company / landed_role。

    规则: 若该候选人**最近一条** status_change 的 to_status='onboarded',
    则把它的 outcome_* 同步到候选人; 否则清空。
    """
    cand = db.get(Candidate, candidate_id)
    if not cand:
        return
    last = (
        db.query(StatusChange)
        .filter(StatusChange.candidate_id == candidate_id)
        .order_by(StatusChange.changed_at.desc())
        .first()
    )
    if last and last.to_status == "onboarded":
        cand.landed_company = last.outcome_company
        cand.landed_role = last.outcome_role
    else:
        cand.landed_company = None
        cand.landed_role = None


@router.post("/status-changes", response_model=StatusChangeOut, status_code=status.HTTP_201_CREATED)
def create_status_change(
    payload: StatusChangeIn,
    db: Session = Depends(get_db),
    user: User = Depends(forbid_interviewee),
) -> StatusChangeOut:
    _ensure_candidate_access(db, payload.candidate_id, user)

    # 入职必须填去向
    if payload.to_status == "onboarded":
        if not (payload.outcome_company and payload.outcome_company.strip()):
            raise HTTPException(status_code=422, detail="入职去向：公司必填")
        if not (payload.outcome_role and payload.outcome_role.strip()):
            raise HTTPException(status_code=422, detail="入职去向：岗位必填")

    # outcome 字段仅在 onboarded / dropped / declined_offer 三个终态有意义
    if payload.to_status in {"onboarded", "dropped", "declined_offer"}:
        outcome_company = (payload.outcome_company or "").strip() or None
        outcome_role = (payload.outcome_role or "").strip() or None
    else:
        outcome_company = None
        outcome_role = None

    last = (
        db.query(StatusChange)
        .filter(
            StatusChange.candidate_id == payload.candidate_id,
            StatusChange.position_id == payload.position_id,
        )
        .order_by(StatusChange.changed_at.desc())
        .first()
    )
    from_status = last.to_status if last else None

    sc = StatusChange(
        candidate_id=payload.candidate_id,
        position_id=payload.position_id,
        from_status=from_status,
        to_status=payload.to_status,
        reason=payload.reason,
        outcome_company=outcome_company,
        outcome_role=outcome_role,
        changed_by=user.id,
        changed_at=datetime.now(UTC),
    )
    db.add(sc)

    # 跟进状态 -> 求职状态的自动推导
    # 详见 backend/app/models/candidate.py 顶部 STATUS_RELATIONSHIP
    cand = db.get(Candidate, payload.candidate_id)
    if cand:
        if payload.to_status == "onboarded":
            cand.job_status = "onboarded"
        elif payload.to_status in {"dropped", "declined_offer"}:
            # 流失 / 拒 offer 后,候选人重新可推送
            if cand.job_status == "onboarded":
                cand.job_status = "active"

    db.flush()  # 确保 sc 在 _resync_landed 的查询里能被看到
    _resync_landed(db, payload.candidate_id)

    db.commit()
    db.refresh(sc)
    return StatusChangeOut.model_validate(sc)


@router.get("/status-changes", response_model=list[StatusChangeOut])
def list_status_changes(
    candidate_id: int = Query(..., description="必填：查询哪个候选人的状态历史"),
    position_id: int | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(forbid_interviewee),
) -> list[StatusChangeOut]:
    _ensure_candidate_access(db, candidate_id, user)
    q = db.query(StatusChange).filter(StatusChange.candidate_id == candidate_id)
    if position_id is not None:
        q = q.filter(StatusChange.position_id == position_id)
    items = q.order_by(StatusChange.changed_at.desc()).all()
    return [StatusChangeOut.model_validate(it) for it in items]


@router.delete("/status-changes/{status_change_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_status_change(
    status_change_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(forbid_interviewee),
) -> None:
    sc = db.get(StatusChange, status_change_id)
    if not sc:
        raise HTTPException(status_code=404, detail="status change not found")
    _ensure_candidate_access(db, sc.candidate_id, user)
    if user.role.name != "admin" and sc.changed_by != user.id:
        raise HTTPException(status_code=403, detail="not your status change")
    cand_id = sc.candidate_id
    db.delete(sc)
    db.flush()
    _resync_landed(db, cand_id)
    db.commit()
    return None


# ---------------------------------------------------------------------------
# reminders 顶部铃铛用
# ---------------------------------------------------------------------------

# 跟进状态进入这些后,就不再算"久未跟进" (流程已结束)
_TERMINAL_FU_STATUSES = {
    "onboarded",
    "dropped",
    "declined_offer",
    "rejected_1",
    "rejected_2",
}

_STALE_DAYS = 3


@router.get("/reminders", response_model=RemindersOut)
def get_reminders(
    db: Session = Depends(get_db),
    user: User = Depends(forbid_interviewee),
) -> RemindersOut:
    """聚合三类提醒,顶部铃铛红点用。

    overdue   : 最近一次跟进里 next_plan_due 已过期且未被新的跟进覆盖
    due_today : 同上,但截止日==今天
    stale     : 最近一次跟进 > 3 天前,且当前跟进状态非终态
    """
    today = date.today()

    # 当前用户能看到的候选人 (admin 看全部)
    cand_q = db.query(Candidate).filter(Candidate.is_deleted.is_(False))
    if user.role.name != "admin":
        cand_q = cand_q.filter(Candidate.owner_id == user.id)
    cand_ids = [c.id for c in cand_q.all()]
    if not cand_ids:
        return RemindersOut(overdue=[], due_today=[], stale=[], total=0)

    cand_map = {c.id: c for c in cand_q.all()}

    # 每个候选人最近一次跟进 (occurred_at 最大的那条)
    latest_subq = (
        db.query(
            FollowUp.candidate_id,
            func.max(FollowUp.occurred_at).label("latest_at"),
        )
        .filter(
            FollowUp.is_deleted.is_(False),
            FollowUp.candidate_id.in_(cand_ids),
        )
        .group_by(FollowUp.candidate_id)
        .subquery()
    )
    latest_fus: list[FollowUp] = (
        db.query(FollowUp)
        .join(
            latest_subq,
            and_(
                FollowUp.candidate_id == latest_subq.c.candidate_id,
                FollowUp.occurred_at == latest_subq.c.latest_at,
            ),
        )
        .filter(FollowUp.is_deleted.is_(False))
        .all()
    )

    # 每个候选人最新状态
    latest_status_subq = (
        db.query(
            StatusChange.candidate_id,
            func.max(StatusChange.changed_at).label("latest_at"),
        )
        .filter(StatusChange.candidate_id.in_(cand_ids))
        .group_by(StatusChange.candidate_id)
        .subquery()
    )
    latest_statuses: list[StatusChange] = (
        db.query(StatusChange)
        .join(
            latest_status_subq,
            and_(
                StatusChange.candidate_id == latest_status_subq.c.candidate_id,
                StatusChange.changed_at == latest_status_subq.c.latest_at,
            ),
        )
        .all()
    )
    status_by_cand: dict[int, str] = {s.candidate_id: s.to_status for s in latest_statuses}

    overdue: list[ReminderOverdueItem] = []
    due_today: list[ReminderOverdueItem] = []
    stale: list[ReminderStaleItem] = []

    now = datetime.now(UTC)

    for fu in latest_fus:
        cand = cand_map.get(fu.candidate_id)
        if not cand:
            continue

        excerpt = (fu.content or "")[:80]
        if fu.content and len(fu.content) > 80:
            excerpt += "…"

        # 1. next_plan_due 类提醒(更具体,优先级高于 stale)
        # A candidate that's already in overdue / due_today shouldn't also
        # surface as "long time no contact" — that double-counts the same
        # person. We bucket each follow-up into at most one reminder.
        bucketed = False
        if fu.next_plan_due is not None:
            delta = (today - fu.next_plan_due).days
            if delta == 0:
                due_today.append(
                    ReminderOverdueItem(
                        candidate_id=cand.id,
                        candidate_name=cand.name,
                        next_plan=fu.next_plan,
                        next_plan_due=fu.next_plan_due,
                        days_overdue=0,
                        last_follow_channel=fu.channel,
                        last_follow_content_excerpt=excerpt or None,
                    )
                )
                bucketed = True
            elif delta > 0:
                overdue.append(
                    ReminderOverdueItem(
                        candidate_id=cand.id,
                        candidate_name=cand.name,
                        next_plan=fu.next_plan,
                        next_plan_due=fu.next_plan_due,
                        days_overdue=delta,
                        last_follow_channel=fu.channel,
                        last_follow_content_excerpt=excerpt or None,
                    )
                )
                bucketed = True

        # 2. stale 类提醒 (流程未结束 + 最近一次 > N 天)
        if not bucketed:
            cur_status = status_by_cand.get(cand.id)
            if cur_status not in _TERMINAL_FU_STATUSES:
                days_since = (now - fu.occurred_at).days
                if days_since >= _STALE_DAYS:
                    stale.append(
                        ReminderStaleItem(
                            candidate_id=cand.id,
                            candidate_name=cand.name,
                            last_follow_at=fu.occurred_at,
                            days_since=days_since,
                            last_follow_status=cur_status,
                            last_follow_channel=fu.channel,
                            last_follow_content_excerpt=excerpt or None,
                        )
                    )

    overdue.sort(key=lambda x: -x.days_overdue)
    stale.sort(key=lambda x: -x.days_since)

    total = len(overdue) + len(due_today) + len(stale)
    return RemindersOut(overdue=overdue, due_today=due_today, stale=stale, total=total)


# 暴露常量给前端做 fallback
__all__ = ["router", "STATUS_LABEL", "CHANNEL_LABEL"]
