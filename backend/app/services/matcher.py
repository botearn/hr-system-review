"""匹配引擎：硬过滤 → 向量召回 → 六维度重排 → 匹配点/差异点。"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from sqlalchemy.orm import Session

from app.models.candidate import Candidate
from app.models.position import Position
from app.services import embedding, vector_store

DEFAULT_WEIGHTS: dict[str, float] = {
    "capability": 0.40,
    "skill": 0.20,
    "salary": 0.15,
    "industry": 0.10,
    "education": 0.10,
    "city": 0.05,
    "resume_quality": 0.0,  # kept for backward compat but excluded from UI
}

EDU_LEVELS = {"高中": 1, "专科": 2, "本科": 3, "硕士": 4, "博士": 5}


@dataclass
class MatchResult:
    candidate_id: int
    candidate_name: str
    score: float
    sub_scores: dict[str, float]
    matched_points: list[dict[str, str]] = field(default_factory=list)
    gap_points: list[dict[str, str]] = field(default_factory=list)
    # 结构化的标签数据(UI 用绿色/灰色 tag 渲染)
    capability_breakdown: dict[str, list[dict[str, Any]]] = field(default_factory=dict)
    skill_breakdown: dict[str, list[dict[str, Any]]] = field(default_factory=dict)
    # 给 HR 看的两段文字
    analysis: str = ""  # 匹配情况: 综合先, 核心命中
    interview_advice: list[str] = field(default_factory=list)  # 面试建议: 逐条 bullet
    rank_reason: str = ""  # 一句话卡片标签, 如 "能力全覆盖，薪资偏高可谈"


# ---------------------------------------------------------------------------
# Recall
# ---------------------------------------------------------------------------


def _recall(db: Session, pos: Position, top_k: int, owner_id: int | None) -> dict[int, dict]:
    """多路召回。返回 {candidate_id: {vec_name: score, payload}}。"""
    from app.services.vectorize import _position_texts

    texts = _position_texts(pos)
    vec_names = list(texts.keys())

    cached = vector_store.get_position_vectors(pos.id)
    missing = [n for n in vec_names if n not in cached]
    if missing:
        fresh = embedding.embed([texts[n] for n in missing])
        for name, vec in zip(missing, fresh, strict=False):
            cached[name] = vec
    pos_vectors = {n: cached[n] for n in vec_names if n in cached}

    pool: dict[int, dict[str, Any]] = {}
    recall_plan = [
        ("skill_vec", "skill_vec"),
        ("capability_vec", "capability_vec"),
        ("responsibility_vec", "project_vec"),
        ("responsibility_vec", "experience_vec"),
        ("summary_vec", "summary_vec"),
    ]

    for pos_v, cand_v in recall_plan:
        if pos_v not in pos_vectors:
            continue
        hits = vector_store.search_candidates(
            query_vector=pos_vectors[pos_v],
            using_vector=cand_v,
            top_k=top_k,
            owner_id=owner_id,
            min_years=pos.min_years,
        )
        for h in hits:
            entry = pool.setdefault(
                int(h.id),
                {"vec_sims": {}, "payload": dict(h.payload or {})},
            )
            entry["vec_sims"][cand_v] = max(entry["vec_sims"].get(cand_v, 0.0), float(h.score))

    return pool


# ---------------------------------------------------------------------------
# Scoring
# ---------------------------------------------------------------------------


def _norm(s: str) -> str:
    return (s or "").strip().lower().replace(" ", "")


def _set_hit_rate(target: list[str], candidate: list[str]) -> float:
    if not target:
        return 1.0
    cand_norm = {_norm(x) for x in candidate}
    hit = sum(1 for t in target if _norm(t) in cand_norm)
    return hit / len(target)


def _score_skill(
    pos: Position, cand: Candidate, vec_sim: float
) -> tuple[float, str, str, dict[str, list[dict[str, Any]]]]:
    required = list(pos.required_skills or [])
    nice = list(pos.nice_to_have_skills or [])
    cand_skills = list(cand.skills or [])
    req_hit = _set_hit_rate(required, cand_skills)
    nice_hit = _set_hit_rate(nice, cand_skills) if nice else 0.0
    score = 100 * (0.6 * req_hit + 0.2 * nice_hit + 0.2 * max(0.0, vec_sim))

    cand_norm = {_norm(x) for x in cand_skills}
    hit_skills = [s for s in required if _norm(s) in cand_norm]
    miss_skills = [s for s in required if _norm(s) not in cand_norm]
    mp = f"命中 {len(hit_skills)}/{max(len(required), 1)} 项硬性技能: " + (
        ", ".join(hit_skills) if hit_skills else "无"
    )
    gp = "缺少硬性技能: " + (", ".join(miss_skills) if miss_skills else "无")

    breakdown = {
        "required": [{"name": s, "matched": _norm(s) in cand_norm} for s in required],
        "nice_to_have": [{"name": s, "matched": _norm(s) in cand_norm} for s in nice],
    }
    return round(score, 2), mp, gp, breakdown


_CAP_SIM_THRESHOLD = 0.72  # 能力语义命中阈值（cosine 相似度）


def _score_capability(
    pos: Position, cand: Candidate, vec_sim: float
) -> tuple[float, str, str, dict[str, list[dict[str, Any]]]]:
    """用 bge-m3 语义相似度判断能力命中，而不是字符串包含。

    对每条 must/nice 能力，计算它与候选人能力列表的最高余弦相似度，
    >= _CAP_SIM_THRESHOLD 即视为命中。
    """
    caps = pos.required_capabilities or []
    must = [c for c in caps if (isinstance(c, dict) and c.get("priority") == "must")]
    nice = [c for c in caps if (isinstance(c, dict) and c.get("priority") == "nice")]

    def _name(c: Any) -> str:
        if isinstance(c, dict):
            return str(c.get("capability") or c.get("name") or "")
        return str(c)

    cand_cap_names = [_name(c) for c in (cand.derived_capabilities or [])]
    cand_cap_names = [x for x in cand_cap_names if x]

    def _cap_hit_semantic(list_: list) -> tuple[int, list[str]]:
        if not list_ or not cand_cap_names:
            return 0, []
        names = [_name(it) for it in list_]
        from app.services import embedding

        texts = names + cand_cap_names
        vecs = embedding.embed(texts)
        n_req = len(names)
        req_vecs = vecs[:n_req]
        cand_vecs = vecs[n_req:]

        import numpy as np

        R = np.array(req_vecs)
        C = np.array(cand_vecs)
        sims = R @ C.T  # 已归一化，点积即 cosine

        hit: list[str] = []
        for i, name in enumerate(names):
            if sims[i].max() >= _CAP_SIM_THRESHOLD:
                hit.append(name)
        return len(hit), hit

    must_total = len(must) or 1
    nice_total = max(len(nice), 1)
    must_hit_count, must_hit_names = _cap_hit_semantic(must)
    nice_hit_count, nice_hit_names = _cap_hit_semantic(nice)
    must_rate = must_hit_count / must_total
    nice_rate = nice_hit_count / nice_total

    score = 100 * (0.55 * must_rate + 0.20 * nice_rate + 0.25 * max(0.0, vec_sim))

    mp_parts: list[str] = []
    if must_hit_names:
        mp_parts.append(
            f"命中 {must_hit_count}/{len(must)} 项必备能力：{', '.join(must_hit_names[:3])}"
            + (" 等" if len(must_hit_names) > 3 else "")
        )
    if nice_hit_names:
        mp_parts.append(f"命中 {nice_hit_count}/{len(nice)} 项加分能力")
    mp = "；".join(mp_parts) or (f"能力向量相似度 {vec_sim:.2f}" if vec_sim >= 0.5 else "")

    miss_must = [n for n in [_name(c) for c in must] if n not in must_hit_names]
    gp = f"缺少必备能力：{', '.join(miss_must[:3])}" if miss_must else ""

    must_hit_set = set(must_hit_names)
    nice_hit_set = set(nice_hit_names)
    breakdown = {
        "must": [{"name": _name(c), "matched": _name(c) in must_hit_set} for c in must],
        "nice": [{"name": _name(c), "matched": _name(c) in nice_hit_set} for c in nice],
    }
    return round(score, 2), mp, gp, breakdown


def _score_salary(pos: Position, cand: Candidate) -> tuple[float, str, str]:
    if pos.salary_min is None or pos.salary_max is None:
        return 70.0, "岗位未明确薪资区间", ""
    exp_min = cand.expected_salary_min
    exp_max = cand.expected_salary_max
    if not exp_min or not exp_max:
        if cand.current_salary_max:
            exp_max = float(cand.current_salary_max) * 1.2
            exp_min = float(cand.current_salary_max)
        else:
            return 60.0, "候选人未填期望薪资", "建议确认期望薪资"
    p_min = float(pos.salary_min)
    p_max = float(pos.salary_max)
    e_min = float(exp_min)
    e_max = float(exp_max)

    overlap = max(0.0, min(p_max, e_max) - max(p_min, e_min))
    union = max(p_max, e_max) - min(p_min, e_min)
    if union <= 0:
        score = 0.0
    else:
        score = 100 * overlap / union

    mp = f"期望 {e_min:.0f}-{e_max:.0f}k，岗位 {p_min:.0f}-{p_max:.0f}k，重叠度 {score:.0f}%"
    gp = "薪资预期偏差较大" if score < 40 else ""
    return round(score, 2), mp, gp


def _score_industry(
    pos_company_industry: list[str], cand_industry: str | None, vec_sim: float
) -> tuple[float, str, str]:
    tag_overlap = 0.0
    if pos_company_industry:
        cand_tags = {_norm(cand_industry)} if cand_industry else set()
        hit = sum(1 for t in pos_company_industry if _norm(t) in cand_tags)
        tag_overlap = hit / len(pos_company_industry)
    score = 100 * (0.7 * max(0.0, vec_sim) + 0.3 * tag_overlap)
    mp = f"行业相关度 {score:.0f}（候选人行业：{cand_industry or '未知'}）"
    gp = "行业经验相关度较低" if score < 40 else ""
    return round(score, 2), mp, gp


def _score_education(pos: Position, cand: Candidate) -> tuple[float, str, str]:
    if not pos.required_education:
        return 80.0, "岗位未指定学历要求", ""
    req = EDU_LEVELS.get(pos.required_education, 0)
    c_level = EDU_LEVELS.get(cand.education_level or "", 0)
    diff = c_level - req
    if diff >= 0:
        return 100.0, f"学历 {cand.education_level} 满足要求（{pos.required_education}）", ""
    score = max(0.0, 100 + diff * 30)
    return (
        round(score, 2),
        "",
        f"学历 {cand.education_level or '未知'} 低于岗位要求（{pos.required_education}）",
    )


def _score_resume_quality(cand: Candidate) -> tuple[float, str, str]:
    if cand.resume_quality_score is None:
        return 70.0, "", "候选人未做简历质量评估"
    score = float(cand.resume_quality_score)
    mp = f"简历书写评分 {score:.0f}" if score >= 75 else ""
    gp = f"简历书写偏弱（{score:.0f}分），建议核实" if score < 60 else ""
    return score, mp, gp


def _score_city(pos: Position, cand: Candidate) -> tuple[float, str, str]:
    if not pos.city:
        return 80.0, "", ""
    if cand.city and _norm(cand.city) == _norm(pos.city):
        return 100.0, f"同城（{pos.city}）", ""
    if pos.remote_ok:
        return 85.0, "岗位接受远程", ""
    return 40.0, "", f"城市不符（岗位 {pos.city} / 候选人 {cand.city or '未知'}）"


# ---------------------------------------------------------------------------
# Orchestrator
# ---------------------------------------------------------------------------


def run_matching(
    db: Session,
    position_id: int,
    *,
    top_k: int = 50,
    limit: int = 20,
    weights: dict[str, float] | None = None,
    scope_owner_id: int | None = None,
) -> list[MatchResult]:
    pos = db.get(Position, position_id)
    if not pos:
        raise ValueError(f"position {position_id} not found")

    from app.models.company import Company

    company = db.get(Company, pos.company_id)
    pos_industry = list(company.industry_tags or []) if company else []

    weights = {**DEFAULT_WEIGHTS, **(weights or {})}
    # 归一化: 允许用户拨成 "相对重要度", 总和不为 1 也能跑
    total_w = sum(max(0.0, float(v)) for v in weights.values())
    if total_w > 0:
        weights = {k: max(0.0, float(v)) / total_w for k, v in weights.items()}
    else:
        # 全 0 则退回默认
        weights = dict(DEFAULT_WEIGHTS)

    pool = _recall(db, pos, top_k=top_k, owner_id=scope_owner_id)
    if not pool:
        return []

    candidate_ids = list(pool.keys())
    candidates = (
        db.query(Candidate)
        .filter(Candidate.id.in_(candidate_ids), Candidate.is_deleted.is_(False))
        .all()
    )
    cand_map = {c.id: c for c in candidates}

    results: list[MatchResult] = []
    for cid, info in pool.items():
        cand = cand_map.get(cid)
        if not cand:
            continue
        sims: dict[str, float] = info["vec_sims"]

        cap_score, cap_mp, cap_gp, cap_break = _score_capability(
            pos, cand, sims.get("capability_vec", 0.0)
        )
        sk_score, sk_mp, sk_gp, sk_break = _score_skill(pos, cand, sims.get("skill_vec", 0.0))
        sal_score, sal_mp, sal_gp = _score_salary(pos, cand)
        ind_score, ind_mp, ind_gp = _score_industry(
            pos_industry, cand.industry, sims.get("experience_vec", sims.get("project_vec", 0.0))
        )
        edu_score, edu_mp, edu_gp = _score_education(pos, cand)
        rq_score, rq_mp, rq_gp = _score_resume_quality(cand)
        ct_score, ct_mp, ct_gp = _score_city(pos, cand)

        subs = {
            "capability": cap_score,
            "skill": sk_score,
            "salary": sal_score,
            "industry": ind_score,
            "education": edu_score,
            "resume_quality": rq_score,
            "city": ct_score,
        }
        total = sum(weights.get(k, 0.0) * v for k, v in subs.items())

        mps: list[dict[str, str]] = []
        gps: list[dict[str, str]] = []
        for dim, mp, gp in [
            ("capability", cap_mp, cap_gp),
            ("skill", sk_mp, sk_gp),
            ("salary", sal_mp, sal_gp),
            ("industry", ind_mp, ind_gp),
            ("education", edu_mp, edu_gp),
            ("resume_quality", rq_mp, rq_gp),
            ("city", ct_mp, ct_gp),
        ]:
            if mp:
                mps.append({"dim": dim, "detail": mp})
            if gp:
                gps.append({"dim": dim, "detail": gp})

        overview = _compose_match_overview(
            cand_name=cand.name,
            total=total,
            subs=subs,
            cap_break=cap_break,
            sk_break=sk_break,
            edu_gp=edu_gp,
            ct_gp=ct_gp,
        )
        advice = _compose_interview_advice(
            cand=cand,
            pos=pos,
            subs=subs,
            cap_break=cap_break,
            sk_break=sk_break,
        )
        rank_reason = _compose_rank_reason(
            total=total,
            subs=subs,
            cap_break=cap_break,
            sk_break=sk_break,
        )

        results.append(
            MatchResult(
                candidate_id=cand.id,
                candidate_name=cand.name,
                score=round(total, 2),
                sub_scores=subs,
                matched_points=mps,
                gap_points=gps,
                capability_breakdown=cap_break,
                skill_breakdown=sk_break,
                analysis=overview,
                interview_advice=advice,
                rank_reason=rank_reason,
            )
        )

    results.sort(key=lambda r: r.score, reverse=True)
    return results[:limit]


def _hit_ratio(items: list[dict]) -> tuple[int, int]:
    total_n = len(items)
    hit_n = sum(1 for it in items if it.get("matched"))
    return hit_n, total_n


def _compose_match_overview(
    *,
    cand_name: str,
    total: float,
    subs: dict[str, float],
    cap_break: dict,
    sk_break: dict,
    edu_gp: str,
    ct_gp: str,
) -> str:
    """第一块:匹配情况。综合先,再补 2-3 个关键事实,避免流水账。"""
    parts: list[str] = [f"{cand_name} 与该岗位综合 {total:.0f} 分,{_verdict_of(total)}。"]

    must_hit, must_total = _hit_ratio(cap_break.get("must", []))
    nice_hit, nice_total = _hit_ratio(cap_break.get("nice", []))
    req_hit, req_total = _hit_ratio(sk_break.get("required", []))

    bucket: list[str] = []
    if must_total > 0:
        seg = f"必备能力 {must_hit}/{must_total}"
        if nice_total > 0:
            seg += f",加分 {nice_hit}/{nice_total}"
        bucket.append(seg)
    if req_total > 0:
        bucket.append(f"硬性技能 {req_hit}/{req_total}")
    if bucket:
        parts.append("、".join(bucket) + "。")

    # 只说异常的维度,常规满足不啰嗦
    anomalies: list[str] = []
    if subs.get("education", 100) < 100 and edu_gp:
        anomalies.append(edu_gp)
    if subs.get("salary", 100) < 40:
        anomalies.append("薪资预期偏差较大")
    if subs.get("city", 100) < 50 and ct_gp:
        anomalies.append(ct_gp)
    if anomalies:
        parts.append("需要注意:" + "、".join(anomalies) + "。")

    return "".join(parts)


def _compose_interview_advice(
    *,
    cand: Candidate,
    pos: Position,
    subs: dict[str, float],
    cap_break: dict,
    sk_break: dict,
) -> list[str]:
    """第二块:面试建议。结合缺口给 HR 几条可执行动作。"""
    advice: list[str] = []

    miss_must = [it["name"] for it in cap_break.get("must", []) if not it.get("matched")]
    if miss_must:
        advice.append(
            f"核心能力可能有缺口({'、'.join(miss_must[:2])}"
            f"{'等' if len(miss_must) > 2 else ''}),"
            f"面试时请候选人具体讲对应项目细节,判断是否主导过类似情景"
        )

    miss_skills = [it["name"] for it in sk_break.get("required", []) if not it.get("matched")]
    if miss_skills:
        advice.append(
            f"缺少硬性技能({'、'.join(miss_skills[:3])}"
            f"{'等' if len(miss_skills) > 3 else ''}),"
            "电话筛选时核实掌握深度和最近一次使用时间"
        )

    # 年限偏差
    if pos.min_years is not None and cand.years_of_experience is not None:
        if cand.years_of_experience < pos.min_years:
            advice.append(
                f"工作年限 {cand.years_of_experience} 年低于岗位下限 {pos.min_years} 年,"
                "核对项目深度与角色是否能补齐经验差距"
            )

    if subs.get("salary", 100) < 40:
        advice.append("薪资预期差距较大,一面前主动对齐预算区间,避免走完流程再谈崩")
    if subs.get("city", 100) < 50:
        advice.append("城市不匹配,询问是否接受远程或搬迁,以及搬迁时间点")

    # 经历连贯性: 多段短经历时提示
    exp_count = len(getattr(cand, "experiences", []) or [])
    if exp_count >= 4 and cand.years_of_experience and cand.years_of_experience <= 6:
        advice.append("简历中经历段数较多,面试时请候选人梳理每段离职原因,关注稳定性")

    return advice


def _verdict_of(score: float) -> str:
    if score >= 80:
        return "整体高度匹配"
    if score >= 65:
        return "整体匹配良好"
    if score >= 50:
        return "整体中等匹配"
    if score >= 35:
        return "匹配度偏低"
    return "整体不建议推进"


def _compose_rank_reason(
    *,
    total: float,
    subs: dict[str, float],
    cap_break: dict,
    sk_break: dict,
) -> str:
    """一句话卡片标签，点出最大亮点和最大风险，供列表卡片直接展示。"""
    strengths: list[str] = []
    risks: list[str] = []

    # 能力
    must_hit, must_total = _hit_ratio(cap_break.get("must", []))
    if must_total > 0:
        if must_hit == must_total:
            strengths.append("必备能力全覆盖")
        elif must_hit >= must_total * 0.7:
            strengths.append(f"必备能力 {must_hit}/{must_total}")
        else:
            risks.append(f"必备能力仅 {must_hit}/{must_total}")

    # 技能
    req_hit, req_total = _hit_ratio(sk_break.get("required", []))
    if req_total > 0:
        if req_hit == req_total:
            strengths.append("技能完全匹配")
        elif req_hit < req_total * 0.5:
            risks.append(f"技能缺口较大 ({req_hit}/{req_total})")

    # 薪资
    sal = subs.get("salary", 100)
    if sal >= 85:
        strengths.append("薪资契合")
    elif sal < 40:
        risks.append("薪资差距较大")
    elif sal < 65:
        risks.append("薪资偏高可谈")

    # 城市
    if subs.get("city", 100) < 50:
        risks.append("异地")

    parts: list[str] = []
    if strengths:
        parts.append("、".join(strengths[:2]))
    if risks:
        parts.append("；".join(risks[:2]))

    if not parts:
        return _verdict_of(total)
    return "，".join(parts)
