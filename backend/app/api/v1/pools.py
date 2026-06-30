"""技能池 / 能力池 API。
池子独立于候选人自由文本,首次空库时从现有 candidate.skills /
candidate.derived_capabilities 抽取去重灌入。
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.candidate import Candidate
from app.models.pool import CapabilityPoolItem, SkillPoolItem
from app.models.user import User

router = APIRouter(prefix="/pools", tags=["pools"])


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------


class PoolItemOut(BaseModel):
    id: int
    name: str
    is_custom: bool
    candidate_count: int
    aliases: list[str] = []  # 仅能力池非空; 技能池返回空列表


class PoolItemIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=128)


class PoolCandidateBrief(BaseModel):
    candidate_id: int
    name: str
    city: str | None
    industry: str | None
    years_of_experience: int | None


# ---------------------------------------------------------------------------
# Seed helpers
# ---------------------------------------------------------------------------


def _seed_skills_if_empty(db: Session) -> None:
    if db.query(SkillPoolItem).count() > 0:
        return
    seen: set[str] = set()
    for (skills,) in db.query(Candidate.skills).filter(Candidate.is_deleted.is_(False)).all():
        if not skills:
            continue
        for s in skills:
            name = (s or "").strip()
            if name and name not in seen:
                seen.add(name)
    for name in sorted(seen):
        db.add(SkillPoolItem(name=name[:128], is_custom=False))
    db.commit()


CAP_MERGE_THRESHOLD = 0.88  # 能力聚类的余弦相似度阈值 (bge-m3/智谱 embedding 上偏严,避免误合)


def _collect_all_capability_strings(db: Session) -> dict[str, int]:
    """返回 {capability_string: 出现次数} (跨候选人)."""
    counter: dict[str, int] = {}
    rows = db.query(Candidate.derived_capabilities).filter(Candidate.is_deleted.is_(False)).all()
    for (caps,) in rows:
        if not caps:
            continue
        for c in caps:
            if isinstance(c, dict):
                name = str(c.get("capability") or c.get("name") or "").strip()
            else:
                name = str(c).strip()
            if name:
                counter[name] = counter.get(name, 0) + 1
    return counter


def _cluster_capabilities(
    strings_with_counts: dict[str, int],
    threshold: float = CAP_MERGE_THRESHOLD,
) -> list[dict]:
    """
    对能力字符串做语义聚类,返回 [{"canonical": str, "aliases": [str, ...]}, ...]
    算法: 逐个扫描,与已建簇的 canonical 向量比较,cosine >= 阈值则并入;否则开新簇。
    canonical 选取规则: 簇内出现次数最多,次数相同取最短。
    """
    names = list(strings_with_counts.keys())
    if not names:
        return []

    import numpy as np

    from app.services import embedding

    vecs = np.array(embedding.embed(names))  # 已归一化
    clusters: list[dict] = []  # {"members": [(name, count)], "centroid_vec": np.ndarray}
    for idx, name in enumerate(names):
        v = vecs[idx]
        placed = False
        for cl in clusters:
            sim = float(np.dot(v, cl["centroid_vec"]))
            if sim >= threshold:
                cl["members"].append((name, strings_with_counts[name]))
                # 更新 centroid 为平均向量(归一化)
                new_sum = cl["centroid_sum"] + v
                cl["centroid_sum"] = new_sum
                norm = np.linalg.norm(new_sum)
                cl["centroid_vec"] = new_sum / norm if norm > 0 else v
                placed = True
                break
        if not placed:
            clusters.append(
                {
                    "members": [(name, strings_with_counts[name])],
                    "centroid_sum": v.copy(),
                    "centroid_vec": v.copy(),
                }
            )

    out: list[dict] = []
    for cl in clusters:
        # canonical = 出现最多的,平票时取最短
        members = sorted(cl["members"], key=lambda x: (-x[1], len(x[0]), x[0]))
        canonical = members[0][0]
        aliases = [m[0] for m in members]
        out.append({"canonical": canonical, "aliases": aliases})
    return out


def _rebuild_capability_pool(db: Session, threshold: float = CAP_MERGE_THRESHOLD) -> int:
    """重新聚类并覆盖写入池子。返回新簇数。"""
    strings = _collect_all_capability_strings(db)
    if not strings:
        return 0
    clusters = _cluster_capabilities(strings, threshold=threshold)
    # 保留 is_custom 的项不被覆盖(只做自动聚类的部分)
    db.query(CapabilityPoolItem).filter(CapabilityPoolItem.is_custom.is_(False)).delete(
        synchronize_session=False
    )
    db.flush()
    for cl in clusters:
        db.add(
            CapabilityPoolItem(
                name=cl["canonical"][:255],
                aliases=cl["aliases"],
                is_custom=False,
            )
        )
    db.commit()
    return len(clusters)


def _seed_capabilities_if_empty(db: Session) -> None:
    if db.query(CapabilityPoolItem).count() > 0:
        return
    try:
        _rebuild_capability_pool(db)
    except Exception:
        # embedding 服务故障时降级: 按字符串精确去重入池, 不做聚类
        strings = _collect_all_capability_strings(db)
        for name in sorted(strings.keys()):
            if not name:
                continue
            db.add(CapabilityPoolItem(name=name[:255], aliases=[name], is_custom=False))
        db.commit()


# ---------------------------------------------------------------------------
# Count helpers
# ---------------------------------------------------------------------------


def _count_candidates_by_skill(db: Session) -> dict[str, int]:
    """对每个 skill pool name,统计 candidate.skills 里包含它的候选人数。"""

    # 用 Postgres 的 ANY(array) 做包含判断
    rows = db.execute(sa_text_any_skill()).fetchall()
    return {r[0]: r[1] for r in rows}


def sa_text_any_skill():
    """避免在顶层 import sqlalchemy.text 时与别的模块冲突。"""
    from sqlalchemy import text

    return text(
        """
        SELECT p.name AS name, COUNT(DISTINCT c.id) AS cnt
        FROM skill_pool_item p
        LEFT JOIN candidate c
          ON (c.is_deleted = false AND p.name = ANY(c.skills))
        GROUP BY p.name
        """
    )


def _count_candidates_by_capability(db: Session) -> dict[str, int]:
    from sqlalchemy import text

    # 通过 aliases 数组匹配 candidate.derived_capabilities 里的 capability 字符串
    rows = db.execute(
        text(
            """
            SELECT p.name AS name,
                   COUNT(DISTINCT c.id) AS cnt
            FROM capability_pool_item p
            LEFT JOIN candidate c
              ON c.is_deleted = false
              AND EXISTS (
                  SELECT 1
                  FROM jsonb_array_elements(
                      COALESCE(c.derived_capabilities, '[]'::jsonb)
                  ) AS cap
                  WHERE COALESCE(cap->>'capability', cap->>'name') = ANY(p.aliases)
              )
            GROUP BY p.name
            """
        )
    ).fetchall()
    return {r[0]: r[1] for r in rows}


# ---------------------------------------------------------------------------
# Endpoints: skills
# ---------------------------------------------------------------------------


@router.get("/skills", response_model=list[PoolItemOut])
def list_skills(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[PoolItemOut]:
    _seed_skills_if_empty(db)
    items = db.query(SkillPoolItem).order_by(SkillPoolItem.created_at.asc()).all()
    counts = _count_candidates_by_skill(db)
    return [
        PoolItemOut(
            id=it.id,
            name=it.name,
            is_custom=it.is_custom,
            candidate_count=counts.get(it.name, 0),
        )
        for it in items
    ]


@router.post("/skills", response_model=PoolItemOut, status_code=status.HTTP_201_CREATED)
def add_skill(
    payload: PoolItemIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> PoolItemOut:
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="name is empty")
    existing = db.query(SkillPoolItem).filter(SkillPoolItem.name == name).first()
    if existing:
        raise HTTPException(status_code=409, detail="skill already in pool")
    item = SkillPoolItem(name=name, is_custom=True, created_by_id=user.id)
    db.add(item)
    db.commit()
    db.refresh(item)
    counts = _count_candidates_by_skill(db)
    return PoolItemOut(
        id=item.id,
        name=item.name,
        is_custom=item.is_custom,
        candidate_count=counts.get(item.name, 0),
    )


@router.delete("/skills/{item_id}", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
def delete_skill(
    item_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> None:
    item = db.get(SkillPoolItem, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="not found")
    db.delete(item)
    db.commit()


@router.get("/skills/{item_id}/candidates", response_model=list[PoolCandidateBrief])
def skill_candidates(
    item_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[PoolCandidateBrief]:
    item = db.get(SkillPoolItem, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="not found")
    rows = (
        db.query(Candidate)
        .filter(Candidate.is_deleted.is_(False))
        .filter(Candidate.skills.any(item.name))  # Postgres ARRAY .any
        .order_by(Candidate.created_at.desc())
        .all()
    )
    return [
        PoolCandidateBrief(
            candidate_id=c.id,
            name=c.name,
            city=c.city,
            industry=c.industry,
            years_of_experience=c.years_of_experience,
        )
        for c in rows
    ]


# ---------------------------------------------------------------------------
# Endpoints: capabilities
# ---------------------------------------------------------------------------


@router.get("/capabilities", response_model=list[PoolItemOut])
def list_capabilities(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[PoolItemOut]:
    _seed_capabilities_if_empty(db)
    items = db.query(CapabilityPoolItem).order_by(CapabilityPoolItem.created_at.asc()).all()
    counts = _count_candidates_by_capability(db)
    return [
        PoolItemOut(
            id=it.id,
            name=it.name,
            is_custom=it.is_custom,
            candidate_count=counts.get(it.name, 0),
            aliases=list(it.aliases or []),
        )
        for it in items
    ]


class RegroupIn(BaseModel):
    threshold: float | None = None


class RegroupOut(BaseModel):
    clusters: int
    threshold_used: float


@router.post("/capabilities/regroup", response_model=RegroupOut)
def regroup_capabilities(
    payload: RegroupIn | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> RegroupOut:
    """基于 bge-m3 / 智谱 embedding 对池里所有自动抽取的能力做语义聚类.
    保留 is_custom=True 的条目不被覆盖.
    """
    th = payload.threshold if payload and payload.threshold is not None else CAP_MERGE_THRESHOLD
    th = max(0.5, min(0.99, float(th)))
    n = _rebuild_capability_pool(db, threshold=th)
    return RegroupOut(clusters=n, threshold_used=th)


@router.post("/capabilities", response_model=PoolItemOut, status_code=status.HTTP_201_CREATED)
def add_capability(
    payload: PoolItemIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> PoolItemOut:
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="name is empty")
    existing = db.query(CapabilityPoolItem).filter(CapabilityPoolItem.name == name).first()
    if existing:
        raise HTTPException(status_code=409, detail="capability already in pool")
    item = CapabilityPoolItem(name=name, aliases=[name], is_custom=True, created_by_id=user.id)
    db.add(item)
    db.commit()
    db.refresh(item)
    counts = _count_candidates_by_capability(db)
    return PoolItemOut(
        id=item.id,
        name=item.name,
        is_custom=item.is_custom,
        candidate_count=counts.get(item.name, 0),
        aliases=list(item.aliases or []),
    )


@router.delete("/capabilities/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_capability(
    item_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> None:
    item = db.get(CapabilityPoolItem, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="not found")
    db.delete(item)
    db.commit()


@router.get("/capabilities/{item_id}/candidates", response_model=list[PoolCandidateBrief])
def capability_candidates(
    item_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[PoolCandidateBrief]:
    item = db.get(CapabilityPoolItem, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="not found")
    from sqlalchemy import text

    rows = db.execute(
        text(
            """
            SELECT id, name, city, industry, years_of_experience
            FROM candidate
            WHERE is_deleted = false
              AND EXISTS (
                  SELECT 1
                  FROM jsonb_array_elements(
                      COALESCE(derived_capabilities, '[]'::jsonb)
                  ) AS cap
                  WHERE COALESCE(cap->>'capability', cap->>'name') = ANY(:aliases)
              )
            ORDER BY created_at DESC
            """
        ),
        {"aliases": list(item.aliases or [item.name])},
    ).fetchall()
    return [
        PoolCandidateBrief(
            candidate_id=r[0],
            name=r[1],
            city=r[2],
            industry=r[3],
            years_of_experience=r[4],
        )
        for r in rows
    ]
