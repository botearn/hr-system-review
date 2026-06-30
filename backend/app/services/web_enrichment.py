"""候选人网络画像（Web Profile Enrichment）。

从搜索引擎、GitHub 等公开渠道搜集候选人信息，LLM 汇总生成结构化报告，
写入 candidate.web_profile (JSONB)。

对外暴露 `enrich_candidate(candidate_id)` — 设计为后台线程调用。
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Any

import httpx

from app.core.config import settings
from app.db.session import SessionLocal
from app.models.candidate import Candidate
from app.services.resume.llm_client import LLMError, chat_json

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# 公开入口
# ---------------------------------------------------------------------------


def enrich_candidate(candidate_id: int) -> None:
    """后台任务入口：搜集网络信息 → LLM 汇总 → 写入 DB。"""
    if not settings.web_enrichment_enabled:
        return
    db = SessionLocal()
    try:
        cand = db.get(Candidate, candidate_id)
        if not cand or cand.is_deleted:
            return
        try:
            profile = _run_enrichment(cand)
            cand.web_profile = profile
            cand.web_profile_updated_at = datetime.now(UTC)
            db.commit()
        except Exception as e:
            logger.warning("web enrichment failed for candidate %s: %s", candidate_id, e)
            cand.web_profile = {"error": f"{type(e).__name__}: {e}", "enriched_at": datetime.now(UTC).isoformat()}
            cand.web_profile_updated_at = datetime.now(UTC)
            db.commit()
    finally:
        db.close()


# ---------------------------------------------------------------------------
# 主流程
# ---------------------------------------------------------------------------


def _run_enrichment(cand: Candidate) -> dict[str, Any]:
    """执行多渠道搜索 → LLM 汇总。"""
    search_keywords = _build_search_keywords(cand)
    sources: list[dict[str, Any]] = []

    # 1) 通用搜索引擎
    if settings.serp_api_key:
        try:
            results = _serp_search(search_keywords["general_query"])
            sources.extend(results)
        except Exception as e:
            logger.warning("serp search failed: %s", e)

        # 技术社区 site-scoped 搜索
        for site, label in [("juejin.cn", "掘金"), ("zhihu.com", "知乎"), ("csdn.net", "CSDN")]:
            try:
                site_results = _serp_search(f'"{cand.name}" site:{site}', num=5)
                for r in site_results:
                    r["type"] = "tech_community"
                    r["platform"] = label
                sources.extend(site_results)
            except Exception as e:
                logger.warning("site search %s failed: %s", site, e)

    # 2) GitHub
    try:
        gh = _github_search(cand)
        if gh:
            sources.append(gh)
    except Exception as e:
        logger.warning("github search failed: %s", e)

    # 3) LLM 汇总
    profile = _llm_summarize(cand, sources)
    profile["sources"] = sources
    profile["enriched_at"] = datetime.now(UTC).isoformat()
    return profile


# ---------------------------------------------------------------------------
# 搜索关键词构建
# ---------------------------------------------------------------------------


def _build_search_keywords(cand: Candidate) -> dict[str, str]:
    """从候选人信息构造搜索 query。"""
    parts = [f'"{cand.name}"']
    # 取最近的公司名
    if cand.experiences:
        latest = sorted(cand.experiences, key=lambda e: e.start_date or datetime.min.date(), reverse=True)
        if latest:
            parts.append(f'"{latest[0].company_name}"')
    # 高频技能
    if cand.skills:
        parts.append(" ".join(cand.skills[:3]))

    general_query = " ".join(parts)
    return {"general_query": general_query, "name": cand.name}


# ---------------------------------------------------------------------------
# SerpAPI 搜索
# ---------------------------------------------------------------------------


def _serp_search(query: str, num: int = 10) -> list[dict[str, Any]]:
    """调用 SerpAPI Google Search，返回搜索结果列表。"""
    with httpx.Client(timeout=30) as client:
        resp = client.get(
            "https://serpapi.com/search",
            params={
                "q": query,
                "api_key": settings.serp_api_key,
                "engine": "google",
                "num": num,
                "hl": "zh-CN",
            },
        )
        resp.raise_for_status()
        data = resp.json()

    results: list[dict[str, Any]] = []
    for item in data.get("organic_results", []):
        results.append(
            {
                "type": "search",
                "title": item.get("title", ""),
                "url": item.get("link", ""),
                "snippet": item.get("snippet", ""),
            }
        )
    return results


# ---------------------------------------------------------------------------
# GitHub 搜索
# ---------------------------------------------------------------------------


def _github_search(cand: Candidate) -> dict[str, Any] | None:
    """搜索 GitHub 用户，匹配后拉取 profile 信息。"""
    # 搜索候选词：姓名 + 邮箱前缀
    queries = [cand.name]
    if cand.email and "@" in cand.email:
        prefix = cand.email.split("@")[0]
        if prefix and prefix != cand.name:
            queries.append(prefix)

    headers: dict[str, str] = {"Accept": "application/vnd.github.v3+json"}
    if settings.github_token:
        headers["Authorization"] = f"Bearer {settings.github_token}"

    for q in queries:
        try:
            user = _gh_find_user(q, headers)
            if user:
                return _gh_build_profile(user, headers)
        except Exception as e:
            logger.warning("github search for %r failed: %s", q, e)

    return None


def _gh_find_user(query: str, headers: dict[str, str]) -> dict[str, Any] | None:
    """通过 GitHub Search API 找到最匹配的用户。"""
    with httpx.Client(timeout=20) as client:
        resp = client.get(
            "https://api.github.com/search/users",
            params={"q": query, "per_page": 3},
            headers=headers,
        )
        if resp.status_code != 200:
            return None
        items = resp.json().get("items", [])
        return items[0] if items else None


def _gh_build_profile(user: dict[str, Any], headers: dict[str, str]) -> dict[str, Any]:
    """拉取用户详情 + 热门仓库，组装 GitHub 画像数据。"""
    username = user["login"]
    with httpx.Client(timeout=20) as client:
        # 用户详情
        detail_resp = client.get(f"https://api.github.com/users/{username}", headers=headers)
        detail = detail_resp.json() if detail_resp.status_code == 200 else {}

        # 热门仓库（按 star 排序）
        repos_resp = client.get(
            f"https://api.github.com/users/{username}/repos",
            params={"sort": "stars", "direction": "desc", "per_page": 10},
            headers=headers,
        )
        repos = repos_resp.json() if repos_resp.status_code == 200 else []

    # 语言统计
    lang_count: dict[str, int] = {}
    notable: list[dict[str, Any]] = []
    if isinstance(repos, list):
        for repo in repos:
            lang = repo.get("language")
            if lang:
                lang_count[lang] = lang_count.get(lang, 0) + 1
            stars = repo.get("stargazers_count", 0)
            if stars >= 1 or len(notable) < 5:
                notable.append(
                    {
                        "name": repo.get("full_name", ""),
                        "stars": stars,
                        "description": (repo.get("description") or "")[:200],
                        "language": lang,
                    }
                )

    # 活跃度判断
    public_repos = detail.get("public_repos", 0)
    if public_repos >= 30:
        level = "very_active"
    elif public_repos >= 10:
        level = "active"
    elif public_repos >= 1:
        level = "moderate"
    else:
        level = "minimal"

    return {
        "type": "github",
        "url": detail.get("html_url", f"https://github.com/{username}"),
        "username": username,
        "public_repos": public_repos,
        "followers": detail.get("followers", 0),
        "top_languages": lang_count,
        "notable_repos": notable[:5],
        "contribution_level": level,
        "bio": (detail.get("bio") or "")[:300],
    }


# ---------------------------------------------------------------------------
# LLM 汇总
# ---------------------------------------------------------------------------

_SUMMARIZE_SYSTEM = (
    "你是一名资深猎头顾问，擅长从公开网络信息中提炼候选人的技术实力和行业影响力。"
    "请基于提供的搜索结果，生成一份简洁的网络画像报告。"
    "输出 JSON，包含 summary(一段话概述，80-200字)、highlights(亮点数组，每条一句话)、"
    "risk_flags(风险提示数组，如有负面信息；没有则为空数组)。"
    "不要编造搜索结果中没有的信息。如果信息不足，如实说明。"
)


def _llm_summarize(cand: Candidate, sources: list[dict[str, Any]]) -> dict[str, Any]:
    """将搜索结果交给 LLM 汇总成结构化报告。"""
    if not sources:
        return {
            "summary": "未找到该候选人的公开网络信息。",
            "highlights": [],
            "risk_flags": [],
        }

    # 构造 prompt
    source_text_parts: list[str] = []
    for i, s in enumerate(sources[:20], 1):
        stype = s.get("type", "search")
        if stype == "github":
            source_text_parts.append(
                f"[{i}] GitHub @{s.get('username', '?')} — "
                f"repos: {s.get('public_repos', 0)}, followers: {s.get('followers', 0)}, "
                f"languages: {s.get('top_languages', {})}, bio: {s.get('bio', '')}"
            )
        else:
            source_text_parts.append(
                f"[{i}] {s.get('title', '无标题')} — {s.get('url', '')}\n"
                f"    {s.get('snippet', '')}"
            )

    prompt = f"""候选人: {cand.name}
当前公司/岗位: {_latest_job(cand)}
技能: {', '.join(cand.skills[:10]) if cand.skills else '未知'}

以下是从网络搜集到的公开信息:

{chr(10).join(source_text_parts)}

请生成该候选人的网络画像报告（JSON 格式）。"""

    try:
        result = chat_json(prompt, system=_SUMMARIZE_SYSTEM)
    except LLMError as e:
        logger.warning("LLM summarize failed: %s", e)
        return {
            "summary": "AI 汇总失败，请查看原始搜索结果。",
            "highlights": [],
            "risk_flags": [],
        }

    return {
        "summary": result.get("summary", ""),
        "highlights": result.get("highlights", []),
        "risk_flags": result.get("risk_flags", []),
    }


def _latest_job(cand: Candidate) -> str:
    if not cand.experiences:
        return "未知"
    latest = sorted(cand.experiences, key=lambda e: e.start_date or datetime.min.date(), reverse=True)
    e = latest[0]
    return f"{e.company_name} · {e.position_title}"
