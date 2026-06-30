"""简历解析流水线：文本提取 → LLM结构化 → 能力提炼 → 简历质量评分。

对外暴露 `run_pipeline(task_id)`，由 FastAPI BackgroundTasks 调用。
"""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models.attachment import Attachment
from app.models.resume_task import ResumeTask
from app.services import storage
from app.services.resume import prompts
from app.services.resume.candidate_builder import (
    build_candidate,
    find_duplicates_for_user,
)
from app.services.resume.llm_client import chat_json
from app.services.resume.text_extract import extract as extract_text
from app.services.resume.url_fetch import URLFetchError, fetch_resume


def run_pipeline(task_id: int) -> None:
    """BackgroundTasks 入口。独立 DB session，不依赖请求上下文。"""
    db: Session = SessionLocal()
    try:
        task = db.get(ResumeTask, task_id)
        if not task:
            return
        try:
            _run(db, task)
        except Exception as e:
            task.status = "failed"
            task.error_msg = f"{type(e).__name__}: {e}"
            task.finished_at = datetime.now(UTC)
            db.commit()
    finally:
        db.close()


def _run(db: Session, task: ResumeTask) -> None:
    task.started_at = datetime.now(UTC)
    db.commit()

    # 1. 文本提取
    task.status = "parsing"
    db.commit()
    resume_text = _extract_text_for(db, task)
    if not resume_text or len(resume_text) < 50:
        raise ValueError(f"resume text too short: {len(resume_text)} chars")
    task.resume_text = resume_text
    db.commit()

    # 2. 结构化抽取
    task.status = "extracting"
    db.commit()
    extracted = chat_json(
        prompts.extract_prompt(resume_text),
        system=prompts.EXTRACT_SYSTEM,
    )
    task.extracted = extracted
    db.commit()

    # 3. 能力提炼
    task.status = "deriving_capabilities"
    db.commit()
    cap_result = chat_json(
        prompts.derive_capability_prompt(
            extracted.get("experiences", []) or [],
            extracted.get("projects", []) or [],
        ),
        system=prompts.DERIVE_CAPABILITY_SYSTEM,
    )
    task.derived_capabilities = cap_result.get("capabilities", [])
    db.commit()

    # 4. 简历质量评分
    task.status = "scoring_quality"
    db.commit()
    quality = chat_json(
        prompts.quality_prompt(resume_text),
        system=prompts.QUALITY_SYSTEM,
    )
    dims = quality.get("dimensions") or {}
    scores = [(dims.get(k) or {}).get("score") for k in ("detail", "causality", "evidence")]
    valid = [s for s in scores if isinstance(s, (int, float))]
    overall = round(sum(valid) / len(valid), 2) if valid else None
    quality["score"] = overall
    task.resume_quality = quality
    db.commit()

    # 5. 自动入库 or 等待人工去重
    duplicates = find_duplicates_for_user(db, task)
    if duplicates:
        # 有疑似重复 → 让人工确认 (走 /confirm 接口选合并或新建)
        task.status = "ready_to_confirm"
        task.finished_at = datetime.now(UTC)
        db.commit()
        return

    # 无重复 → 直接入库，跳过"待确认"
    extracted = dict(task.extracted or {})
    candidate = build_candidate(task.user_id, task, extracted)
    db.add(candidate)
    db.flush()
    task.candidate_id = candidate.id
    task.status = "confirmed"
    task.finished_at = datetime.now(UTC)
    db.commit()

    # 同步向量化（pipeline 已经在后台线程，无需再 BackgroundTasks）
    try:
        from app.services.vectorize import vectorize_candidate

        vectorize_candidate(candidate.id)
    except Exception:
        # 向量化失败不影响入库本身——候选人可后续重试
        pass

    # 6. 网络画像（后台异步，不阻塞入库）
    try:
        from threading import Thread

        from app.services.web_enrichment import enrich_candidate

        Thread(target=enrich_candidate, args=(candidate.id,), daemon=True).start()
    except Exception:
        pass


def _extract_text_for(db: Session, task: ResumeTask) -> str:
    if task.source_type == "upload":
        if not task.file_id:
            raise ValueError("upload task missing file_id")
        att = db.get(Attachment, task.file_id)
        if not att:
            raise ValueError("attachment not found")
        raw = storage.read(att.storage_path)
        return extract_text(att.filename, raw)

    if task.source_type in ("url_pdf", "url_html", "url"):
        if not task.source_url:
            raise ValueError("url task missing source_url")
        try:
            result = fetch_resume(task.source_url)
        except URLFetchError as e:
            raise ValueError(str(e)) from e
        # 如果之前 source_type=='url' 占位，现在更新为具体类型
        task.source_type = result.source_type
        return result.text

    raise ValueError(f"unsupported source_type: {task.source_type}")
