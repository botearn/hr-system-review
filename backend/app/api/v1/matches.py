import json
import threading
import time
from datetime import datetime
from urllib.parse import quote

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Response
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.deps import forbid_interviewee, get_current_user, require_admin
from app.db.session import get_db
from app.models.candidate import Candidate
from app.models.position import Position
from app.models.user import User
from app.services.exporter import export_matches_xlsx
from app.services.matcher import DEFAULT_WEIGHTS, MatchResult, run_matching
from app.services.resume.llm_client import LLMError, chat_json

router = APIRouter(prefix="/matches", tags=["matches"])


class MatchRunIn(BaseModel):
    position_id: int
    top_k: int = 50
    limit: int = 20
    weights: dict[str, float] | None = None


class MatchItemOut(BaseModel):
    candidate_id: int
    candidate_name: str
    score: float
    sub_scores: dict[str, float]
    matched_points: list[dict[str, str]]
    gap_points: list[dict[str, str]]
    # 卡片基本信息
    phone: str | None = None
    email: str | None = None
    wechat: str | None = None
    city: str | None = None
    industry: str | None = None
    years_of_experience: int | None = None
    job_status: str | None = None
    # 上次沟通(用于卡片底部的被动提示)
    last_contact_at: datetime | None = None
    last_contact_channel: str | None = None
    # 结构化标签数据
    capability_breakdown: dict = {}
    skill_breakdown: dict = {}
    # 分析拆成两块
    analysis: str = ""  # 匹配情况
    interview_advice: list[str] = []  # 面试建议
    rank_reason: str = ""  # 一句话卡片标签


class MatchRunOut(BaseModel):
    position_id: int
    weights_used: dict[str, float]
    results: list[MatchItemOut]


@router.post("/run", response_model=MatchRunOut)
def run_match(
    payload: MatchRunIn,
    db: Session = Depends(get_db),
    user: User = Depends(forbid_interviewee),
) -> MatchRunOut:
    pos = db.get(Position, payload.position_id)
    if not pos:
        raise HTTPException(status_code=404, detail="position not found")
    if user.role.name != "admin" and pos.owner_id != user.id:
        raise HTTPException(status_code=403, detail="not your position")

    scope_owner = None if user.role.name == "admin" else user.id
    raw_weights = {**DEFAULT_WEIGHTS, **(payload.weights or {})}
    # 归一化回显: 与 run_matching 内部逻辑保持一致
    total_w = sum(max(0.0, float(v)) for v in raw_weights.values())
    if total_w > 0:
        weights = {k: max(0.0, float(v)) / total_w for k, v in raw_weights.items()}
    else:
        weights = dict(DEFAULT_WEIGHTS)

    results: list[MatchResult] = run_matching(
        db,
        payload.position_id,
        top_k=payload.top_k,
        limit=payload.limit,
        weights=raw_weights,
        scope_owner_id=scope_owner,
    )

    # 批量取候选人基本信息补充到响应
    cand_ids = [r.candidate_id for r in results]
    cand_map = {c.id: c for c in db.query(Candidate).filter(Candidate.id.in_(cand_ids)).all()}

    # 批量取每位候选人的上次沟通(latest follow-up)
    from app.models.follow_up import FollowUp

    last_contact_map: dict[int, FollowUp] = {}
    if cand_ids:
        rows = (
            db.query(FollowUp)
            .filter(FollowUp.candidate_id.in_(cand_ids), FollowUp.is_deleted.is_(False))
            .order_by(FollowUp.candidate_id, FollowUp.occurred_at.desc())
            .all()
        )
        for fu in rows:
            if fu.candidate_id not in last_contact_map:
                last_contact_map[fu.candidate_id] = fu

    def _cand(rid: int) -> Candidate | None:
        return cand_map.get(rid)

    return MatchRunOut(
        position_id=payload.position_id,
        weights_used=weights,
        results=[
            MatchItemOut(
                candidate_id=r.candidate_id,
                candidate_name=r.candidate_name,
                score=r.score,
                sub_scores=r.sub_scores,
                matched_points=r.matched_points,
                gap_points=r.gap_points,
                phone=_cand(r.candidate_id).phone if _cand(r.candidate_id) else None,
                email=_cand(r.candidate_id).email if _cand(r.candidate_id) else None,
                wechat=_cand(r.candidate_id).wechat if _cand(r.candidate_id) else None,
                city=_cand(r.candidate_id).city if _cand(r.candidate_id) else None,
                industry=_cand(r.candidate_id).industry if _cand(r.candidate_id) else None,
                years_of_experience=(
                    _cand(r.candidate_id).years_of_experience if _cand(r.candidate_id) else None
                ),
                job_status=_cand(r.candidate_id).job_status if _cand(r.candidate_id) else None,
                last_contact_at=(
                    last_contact_map[r.candidate_id].occurred_at
                    if r.candidate_id in last_contact_map
                    else None
                ),
                last_contact_channel=(
                    last_contact_map[r.candidate_id].channel
                    if r.candidate_id in last_contact_map
                    else None
                ),
                capability_breakdown=r.capability_breakdown,
                skill_breakdown=r.skill_breakdown,
                analysis=r.analysis,
                interview_advice=r.interview_advice,
                rank_reason=r.rank_reason,
            )
            for r in results
        ],
    )


@router.post("/export")
def export_match(
    payload: MatchRunIn,
    db: Session = Depends(get_db),
    user: User = Depends(forbid_interviewee),
) -> Response:
    pos = db.get(Position, payload.position_id)
    if not pos:
        raise HTTPException(status_code=404, detail="position not found")
    if user.role.name != "admin" and pos.owner_id != user.id:
        raise HTTPException(status_code=403, detail="not your position")

    scope_owner = None if user.role.name == "admin" else user.id
    weights = {**DEFAULT_WEIGHTS, **(payload.weights or {})}

    results = run_matching(
        db,
        payload.position_id,
        top_k=payload.top_k,
        limit=payload.limit,
        weights=weights,
        scope_owner_id=scope_owner,
    )

    content = export_matches_xlsx(
        position_title=pos.title,
        position_city=pos.city,
        results=results,
        weights=weights,
    )
    filename = f"match_{pos.id}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
    return Response(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": f"attachment; filename=\"{filename}\"; filename*=UTF-8''{quote(filename)}",
        },
    )


class PositionOverviewItem(BaseModel):
    position_id: int
    position_title: str
    position_city: str | None
    strong: int   # score >= 80
    good: int     # score 60-79
    weak: int     # score < 60
    top_score: float | None


class PositionOverviewOut(BaseModel):
    items: list[PositionOverviewItem]


_OVERVIEW_CACHE: dict[tuple[int | None, str], tuple[float, list[PositionOverviewItem]]] = {}
_OVERVIEW_TTL_SECONDS = 300  # 5 minutes
_OVERVIEW_LOCK = threading.Lock()


def invalidate_overview_cache() -> None:
    with _OVERVIEW_LOCK:
        _OVERVIEW_CACHE.clear()


def _compute_overview(db: Session, scope_owner: int | None) -> list[PositionOverviewItem]:
    query = db.query(Position).filter(Position.status == "open")
    if scope_owner:
        query = query.filter(Position.owner_id == scope_owner)
    positions = query.all()

    items: list[PositionOverviewItem] = []
    for pos in positions:
        try:
            results = run_matching(
                db,
                pos.id,
                top_k=30,
                limit=30,
                weights=DEFAULT_WEIGHTS,
                scope_owner_id=scope_owner,
            )
        except Exception:
            results = []

        strong = sum(1 for r in results if r.score >= 80)
        good = sum(1 for r in results if 60 <= r.score < 80)
        weak = sum(1 for r in results if r.score < 60)
        top_score = results[0].score if results else None

        items.append(
            PositionOverviewItem(
                position_id=pos.id,
                position_title=pos.title,
                position_city=pos.city,
                strong=strong,
                good=good,
                weak=weak,
                top_score=top_score,
            )
        )

    items.sort(key=lambda x: (x.strong, x.good), reverse=True)
    return items


@router.get("/overview", response_model=PositionOverviewOut)
def positions_overview(
    refresh: bool = Query(False, description="Bypass the 5-min cache and recompute"),
    db: Session = Depends(get_db),
    user: User = Depends(forbid_interviewee),
) -> PositionOverviewOut:
    """Quick match summary for all open positions.

    Computation is heavy (vector recall × open positions, ~tens of seconds on
    first run), so results are memoized in-process for 5 minutes per scope.
    Pass ?refresh=1 or call /matches/reindex to bust the cache.
    """
    scope_owner = None if user.role.name == "admin" else user.id
    cache_key = (scope_owner, "overview")

    if not refresh:
        with _OVERVIEW_LOCK:
            entry = _OVERVIEW_CACHE.get(cache_key)
        if entry and (time.monotonic() - entry[0]) < _OVERVIEW_TTL_SECONDS:
            return PositionOverviewOut(items=entry[1])

    items = _compute_overview(db, scope_owner)

    with _OVERVIEW_LOCK:
        _OVERVIEW_CACHE[cache_key] = (time.monotonic(), items)

    return PositionOverviewOut(items=items)


@router.get("/overview/stream")
def positions_overview_stream(
    refresh: bool = Query(False, description="Bypass the 5-min cache and recompute"),
    db: Session = Depends(get_db),
    user: User = Depends(forbid_interviewee),
) -> StreamingResponse:
    """Stream overview items as NDJSON, one position per line, so the UI can render
    cards as they arrive instead of blocking on the whole batch.

    Cache hits return all items in a single flush (still NDJSON-shaped for client
    parity). On cache miss we compute per position and yield each result; the
    final aggregated list is then memoized into the same in-process cache as the
    plain /overview endpoint.
    """
    scope_owner = None if user.role.name == "admin" else user.id
    cache_key = (scope_owner, "overview")

    cached_items: list[PositionOverviewItem] | None = None
    if not refresh:
        with _OVERVIEW_LOCK:
            entry = _OVERVIEW_CACHE.get(cache_key)
        if entry and (time.monotonic() - entry[0]) < _OVERVIEW_TTL_SECONDS:
            cached_items = entry[1]

    def gen():
        if cached_items is not None:
            yield json.dumps({"type": "meta", "total": len(cached_items), "cached": True}) + "\n"
            for it in cached_items:
                yield json.dumps({"type": "item", "item": it.model_dump()}) + "\n"
            yield json.dumps({"type": "done"}) + "\n"
            return

        query = db.query(Position).filter(Position.status == "open")
        if scope_owner:
            query = query.filter(Position.owner_id == scope_owner)
        positions = query.all()
        yield json.dumps({"type": "meta", "total": len(positions), "cached": False}) + "\n"

        items: list[PositionOverviewItem] = []
        for pos in positions:
            try:
                results = run_matching(
                    db,
                    pos.id,
                    top_k=30,
                    limit=30,
                    weights=DEFAULT_WEIGHTS,
                    scope_owner_id=scope_owner,
                )
            except Exception:
                results = []
            strong = sum(1 for r in results if r.score >= 80)
            good = sum(1 for r in results if 60 <= r.score < 80)
            weak = sum(1 for r in results if r.score < 60)
            top_score = results[0].score if results else None
            item = PositionOverviewItem(
                position_id=pos.id,
                position_title=pos.title,
                position_city=pos.city,
                strong=strong,
                good=good,
                weak=weak,
                top_score=top_score,
            )
            items.append(item)
            yield json.dumps({"type": "item", "item": item.model_dump()}) + "\n"

        items.sort(key=lambda x: (x.strong, x.good), reverse=True)
        with _OVERVIEW_LOCK:
            _OVERVIEW_CACHE[cache_key] = (time.monotonic(), items)
        yield json.dumps({"type": "done"}) + "\n"

    return StreamingResponse(
        gen(),
        media_type="application/x-ndjson",
        headers={
            # Tell nginx / Cloudflare / Render's reverse proxy not to buffer the
            # response — without this, the per-position events arrive in one
            # giant batch at the end and the UI's progressive render is wasted.
            "X-Accel-Buffering": "no",
            "Cache-Control": "no-cache",
        },
    )


class ParseWeightsIn(BaseModel):
    text: str  # natural language preference, e.g. "最看重海外背景和英语能力，薪资可以灵活"


class ParseWeightsOut(BaseModel):
    weights: dict[str, float]
    explanation: str  # one sentence explaining the parsed weights


_PARSE_WEIGHTS_SYSTEM = """你是一个招聘权重解析助手。
用户会用自然语言描述对某个岗位候选人的评估偏好。
你需要输出一个 JSON 对象，包含两个字段：
1. "weights": 包含以下6个维度的权重值（0.0-1.0之间，不需要归一，系统会自动归一化）：
   - capability: 综合能力（如领导力、战略思维、项目管理等）
   - skill: 技术/硬性技能（如编程语言、工具、资质证书等）
   - salary: 薪资匹配
   - industry: 行业背景
   - education: 学历
   - city: 城市/地点
2. "explanation": 一句话中文解释你的权重判断逻辑

规则：
- 如果用户强调某个维度（如"最看重"、"特别重要"），给 0.8-1.0
- 如果用户说某个维度"可以灵活"或"不重要"，给 0.0-0.2
- 未提及的维度给默认值（能力 0.4，技能 0.2，薪资 0.15，行业 0.1，学历 0.1，城市 0.05）
- 只输出 JSON，不要其他内容"""


@router.post("/parse-weights", response_model=ParseWeightsOut)
def parse_weights(
    payload: ParseWeightsIn,
    _: User = Depends(forbid_interviewee),
) -> ParseWeightsOut:
    """Use LLM to parse natural language preference into match weights."""
    if not payload.text.strip():
        raise HTTPException(status_code=422, detail="text cannot be empty")
    try:
        result = chat_json(
            payload.text,
            system=_PARSE_WEIGHTS_SYSTEM,
            temperature=0.1,
        )
        raw_weights: dict = result.get("weights", {})
        explanation: str = result.get("explanation", "")

        # Validate and clamp all 6 dimensions
        dims = ["capability", "skill", "salary", "industry", "education", "city"]
        weights: dict[str, float] = {}
        for d in dims:
            v = float(raw_weights.get(d, DEFAULT_WEIGHTS.get(d, 0.1)))
            weights[d] = max(0.0, min(1.0, v))

        return ParseWeightsOut(weights=weights, explanation=explanation)
    except LLMError as e:
        raise HTTPException(status_code=502, detail=f"AI 调用失败：{e}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"parse failed: {e}")


class ReindexOut(BaseModel):
    candidates: int
    positions: int


@router.post("/reindex", response_model=ReindexOut)
def reindex_all(
    background: BackgroundTasks,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
) -> ReindexOut:
    """触发全量重建向量索引（管理员）。后台执行。"""
    from app.services.vectorize import vectorize_candidate, vectorize_position

    cand_ids = [c.id for c in db.query(Candidate.id).filter(Candidate.is_deleted.is_(False)).all()]
    pos_ids = [p.id for p in db.query(Position.id).all()]

    for cid in cand_ids:
        background.add_task(vectorize_candidate, cid)
    for pid in pos_ids:
        background.add_task(vectorize_position, pid)

    invalidate_overview_cache()
    return ReindexOut(candidates=len(cand_ids), positions=len(pos_ids))
