from __future__ import annotations

import hashlib
import os
from datetime import datetime

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    HTTPException,
    Response,
    Query,
    UploadFile,
    status,
)
from pydantic import BaseModel
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.attachment import Attachment
from app.models.candidate import (
    Candidate,
    CandidateEducation,
    CandidateExperience,
    CandidateProject,
)
from app.models.resume_task import ResumeTask
from app.models.user import User
from app.schemas.candidate import CandidateOut
from app.schemas.common import Page
from app.schemas.resume import (
    ResumeConfirmIn,
    ResumeDuplicate,
    ResumeTaskBatchDeleteIn,
    ResumeTaskBatchDeleteOut,
    ResumeTaskBrief,
    ResumeTaskCreated,
    ResumeTaskOut,
    ResumeURLIn,
)
from app.services import storage
from app.services.resume.candidate_builder import build_candidate as _build_candidate
from app.services.resume.pipeline import run_pipeline
from app.services.resume.url_fetch import PlatformNotSupportedError

router = APIRouter(prefix="/resumes", tags=["resumes"])

_ALLOWED_EXT = {".pdf", ".docx", ".txt", ".md", ".html", ".htm"}
_MAX_BYTES = 20 * 1024 * 1024  # 20MB


async def _create_task_from_upload(
    background: BackgroundTasks,
    file: UploadFile,
    db: Session,
    user: User,
) -> ResumeTaskCreated:
    """共用逻辑：校验、存储、建 task、触发 pipeline。"""
    if not file.filename:
        raise HTTPException(status_code=400, detail="missing filename")
    ext = os.path.splitext(file.filename.lower())[1]
    if ext not in _ALLOWED_EXT:
        raise HTTPException(status_code=400, detail=f"unsupported extension: {ext}")

    raw = await file.read()
    if len(raw) > _MAX_BYTES:
        raise HTTPException(status_code=413, detail=f"file too large (>{_MAX_BYTES} bytes)")
    if not raw:
        raise HTTPException(status_code=400, detail="empty file")

    sha = hashlib.sha256(raw).hexdigest()
    try:
        storage_path = storage.save(file.filename, raw)
    except storage.StorageError as e:
        raise HTTPException(status_code=500, detail=f"storage error: {e}") from e

    att = Attachment(
        uploader_id=user.id,
        filename=file.filename,
        storage_path=storage_path,
        mime=file.content_type,
        size_bytes=len(raw),
        sha256=sha,
        owner_type="resume_task",
    )
    db.add(att)
    db.flush()

    task = ResumeTask(
        user_id=user.id,
        file_id=att.id,
        source_type="upload",
        status="pending",
    )
    db.add(task)
    db.commit()
    db.refresh(task)

    background.add_task(run_pipeline, task.id)
    return ResumeTaskCreated(task_id=task.id)


@router.post("/upload", response_model=ResumeTaskCreated, status_code=status.HTTP_201_CREATED)
async def upload_resume(
    background: BackgroundTasks,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ResumeTaskCreated:
    return await _create_task_from_upload(background, file, db, user)


class BatchUploadResult(BaseModel):
    task_ids: list[int]
    failed: list[str] = []


@router.post("/upload/batch", response_model=BatchUploadResult, status_code=status.HTTP_201_CREATED)
async def upload_resumes_batch(
    background: BackgroundTasks,
    files: list[UploadFile] = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> BatchUploadResult:
    """批量上传简历，每份文件独立创建解析任务，最多 20 份。"""
    if len(files) > 20:
        raise HTTPException(status_code=400, detail="最多同时上传 20 份简历")

    task_ids: list[int] = []
    failed: list[str] = []
    for f in files:
        try:
            result = await _create_task_from_upload(background, f, db, user)
            task_ids.append(result.task_id)
        except HTTPException as e:
            failed.append(f"{f.filename}: {e.detail}")
    return BatchUploadResult(task_ids=task_ids, failed=failed)


@router.post("/url", response_model=ResumeTaskCreated, status_code=status.HTTP_201_CREATED)
def submit_url(
    background: BackgroundTasks,
    payload: ResumeURLIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ResumeTaskCreated:
    url_str = str(payload.url)
    # 提前拦截招聘平台
    try:
        from app.services.resume.url_fetch import _check_platform

        _check_platform(url_str)
    except PlatformNotSupportedError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    task = ResumeTask(
        user_id=user.id,
        source_type="url",
        source_url=url_str,
        status="pending",
    )
    db.add(task)
    db.commit()
    db.refresh(task)

    background.add_task(run_pipeline, task.id)
    return ResumeTaskCreated(task_id=task.id)


@router.get("/tasks", response_model=Page[ResumeTaskBrief])
def list_tasks(
    page: int = 1,
    page_size: int = 20,
    status_in: list[str] | None = Query(None, alias="status"),
    source_type: str | None = None,
    q: str | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Page[ResumeTaskBrief]:
    q_base = (
        db.query(ResumeTask, Attachment.filename, Candidate.name)
        .outerjoin(Attachment, Attachment.id == ResumeTask.file_id)
        .outerjoin(Candidate, Candidate.id == ResumeTask.candidate_id)
        .filter(ResumeTask.user_id == user.id)
    )
    if status_in:
        q_base = q_base.filter(ResumeTask.status.in_(status_in))
    if source_type:
        if source_type == "url":
            q_base = q_base.filter(ResumeTask.source_type.like("url%"))
        else:
            q_base = q_base.filter(ResumeTask.source_type == source_type)
    if date_from:
        q_base = q_base.filter(ResumeTask.created_at >= date_from)
    if date_to:
        q_base = q_base.filter(ResumeTask.created_at <= date_to)
    if q:
        kw = f"%{q.strip()}%"
        q_base = q_base.filter(
            or_(
                Candidate.name.ilike(kw),
                Attachment.filename.ilike(kw),
                ResumeTask.source_url.ilike(kw),
            )
        )

    total = q_base.order_by(None).count()
    rows = (
        q_base.order_by(ResumeTask.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    items: list[ResumeTaskBrief] = []
    for task, filename, candidate_name in rows:
        brief = ResumeTaskBrief.model_validate(task)
        brief.filename = filename
        brief.candidate_name = candidate_name
        items.append(brief)

    return Page(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/tasks/{task_id}", response_model=ResumeTaskOut)
def get_task(
    task_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ResumeTaskOut:
    task = _load_task(db, task_id, user)
    out = ResumeTaskOut.model_validate(task)
    out.duplicates = _find_duplicates(db, user, task)
    return out


@router.delete("/tasks/{task_id}", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
def delete_task(
    task_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    """删除一个解析任务。已落库（candidate_id 非空）的任务不允许删除，
    避免误删掉已经入库的候选人关联。"""
    task = _load_task(db, task_id, user)
    if task.candidate_id:
        raise HTTPException(
            status_code=409,
            detail="任务已落库，请先到候选人库删除对应候选人",
        )
    db.delete(task)
    db.commit()


@router.post("/tasks/batch-delete", response_model=ResumeTaskBatchDeleteOut)
def batch_delete_tasks(
    payload: ResumeTaskBatchDeleteIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ResumeTaskBatchDeleteOut:
    """批量删除解析任务。已落库的任务会跳过并在 skipped 中返回原因。"""
    deleted: list[int] = []
    skipped: list[dict] = []
    for tid in payload.ids:
        task = db.get(ResumeTask, tid)
        if not task:
            skipped.append({"id": tid, "reason": "not found"})
            continue
        if task.user_id != user.id and user.role.name != "admin":
            skipped.append({"id": tid, "reason": "forbidden"})
            continue
        if task.candidate_id:
            skipped.append({"id": tid, "reason": "已落库"})
            continue
        db.delete(task)
        deleted.append(tid)
    db.commit()
    return ResumeTaskBatchDeleteOut(deleted=deleted, skipped=skipped)


@router.post("/tasks/{task_id}/retry", response_model=ResumeTaskBrief)
def retry_task(
    task_id: int,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ResumeTaskBrief:
    """重试失败的任务：清理失败状态并重新触发 pipeline。"""
    task = _load_task(db, task_id, user)
    if task.status != "failed":
        raise HTTPException(
            status_code=409,
            detail=f"仅失败任务可重试（当前状态: {task.status}）",
        )
    task.status = "pending"
    task.error_msg = None
    task.started_at = None
    task.finished_at = None
    db.commit()
    db.refresh(task)
    background.add_task(run_pipeline, task.id)
    return ResumeTaskBrief.model_validate(task)


def _find_duplicates(db: Session, user: User, task: ResumeTask) -> list[ResumeDuplicate]:
    """根据 extracted 的 phone/email 找已有候选人(仅当前 owner 可见的范围)."""
    extracted = task.extracted or {}
    phone = (extracted.get("phone") or "").strip() or None
    email = (extracted.get("email") or "").strip() or None
    if not phone and not email:
        return []

    conditions = []
    if phone:
        conditions.append(Candidate.phone == phone)
    if email:
        conditions.append(Candidate.email == email)

    q = db.query(Candidate).filter(Candidate.is_deleted.is_(False)).filter(or_(*conditions))
    if user.role.name != "admin":
        q = q.filter(Candidate.owner_id == user.id)
    # 排除当前 task 已关联的候选人(合并确认后再看重复无意义)
    if task.candidate_id:
        q = q.filter(Candidate.id != task.candidate_id)

    rows = q.order_by(Candidate.created_at.desc()).limit(10).all()
    result: list[ResumeDuplicate] = []
    for c in rows:
        matched: list[str] = []
        if phone and c.phone == phone:
            matched.append("phone")
        if email and c.email == email:
            matched.append("email")
        result.append(
            ResumeDuplicate(
                candidate_id=c.id,
                name=c.name,
                phone=c.phone,
                email=c.email,
                city=c.city,
                matched_by=matched,
                created_at=c.created_at,
            )
        )
    return result


@router.post("/tasks/{task_id}/confirm", response_model=CandidateOut)
def confirm_task(
    task_id: int,
    payload: ResumeConfirmIn,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> CandidateOut:
    task = _load_task(db, task_id, user)
    if task.status not in ("ready_to_confirm", "confirmed"):
        raise HTTPException(
            status_code=409,
            detail=f"task status is {task.status}, not ready_to_confirm",
        )
    if task.candidate_id:
        existing = db.get(Candidate, task.candidate_id)
        if existing:
            return CandidateOut.model_validate(existing)

    extracted = dict(task.extracted or {})
    if payload.overrides:
        extracted.update(payload.overrides)

    if payload.merge_candidate_id:
        candidate = _merge_into_candidate(db, user, task, extracted, payload.merge_candidate_id)
    else:
        candidate = _build_candidate(user.id, task, extracted)
        db.add(candidate)
    db.flush()

    task.candidate_id = candidate.id
    task.status = "confirmed"
    db.commit()
    db.refresh(candidate)

    # 异步生成向量，写入 pgvector
    from app.services.vectorize import vectorize_candidate

    background.add_task(vectorize_candidate, candidate.id)

    return CandidateOut.model_validate(candidate)


def _merge_into_candidate(
    db: Session, user: User, task: ResumeTask, extracted: dict, candidate_id: int
) -> Candidate:
    """把新简历的数据合并进已存在的候选人:
    - 标量字段: 仅当新值非空才覆盖
    - experiences/projects/educations: 新简历的整体替换(以最新简历为准)
    """
    existing = db.get(Candidate, candidate_id)
    if not existing or existing.is_deleted:
        raise HTTPException(status_code=404, detail="target candidate not found")
    if user.role.name != "admin" and existing.owner_id != user.id:
        raise HTTPException(status_code=403, detail="not your candidate")

    def _set(attr: str, new_value):
        if new_value is not None and new_value != "":
            setattr(existing, attr, new_value)

    _set("name", (extracted.get("name") or "").strip()[:64] or None)
    _set("phone", extracted.get("phone") or None)
    _set("email", extracted.get("email") or None)
    _set("wechat", extracted.get("wechat") or None)
    _set("city", extracted.get("city") or None)
    _set("industry", extracted.get("industry") or None)
    _set("education_level", extracted.get("education_level") or None)
    try:
        if extracted.get("years_of_experience") not in (None, ""):
            existing.years_of_experience = int(extracted["years_of_experience"])
    except (TypeError, ValueError):
        pass
    for k in (
        "current_salary_min",
        "current_salary_max",
        "expected_salary_min",
        "expected_salary_max",
    ):
        v = extracted.get(k)
        if v not in (None, ""):
            try:
                setattr(existing, k, float(v))
            except (TypeError, ValueError):
                pass

    new_skills = list(extracted.get("skills") or [])
    if new_skills:
        existing.skills = sorted({*(existing.skills or []), *new_skills})

    if task.derived_capabilities:
        existing.derived_capabilities = task.derived_capabilities
    if task.resume_quality:
        existing.resume_quality = task.resume_quality
        existing.resume_quality_score = task.resume_quality.get("score")
    if task.resume_text:
        existing.resume_text = task.resume_text
    if task.file_id:
        existing.resume_file_id = task.file_id
    existing.raw_extracted = task.extracted

    # 子表整体替换为最新简历的内容
    existing.experiences.clear()
    existing.projects.clear()
    existing.educations.clear()
    db.flush()

    for exp in extracted.get("experiences") or []:
        existing.experiences.append(
            CandidateExperience(
                company_name=(exp.get("company_name") or "")[:128] or "未知公司",
                position_title=(exp.get("position_title") or "")[:128] or "未知岗位",
                start_date=_parse_date_str(exp.get("start_date")),
                end_date=_parse_date_str(exp.get("end_date")),
                description=exp.get("description"),
            )
        )
    for prj in extracted.get("projects") or []:
        existing.projects.append(
            CandidateProject(
                project_name=(prj.get("project_name") or "")[:128] or "未命名项目",
                role=prj.get("role"),
                start_date=_parse_date_str(prj.get("start_date")),
                end_date=_parse_date_str(prj.get("end_date")),
                description=prj.get("description"),
                tech_stack=list(prj.get("tech_stack") or []),
            )
        )
    for edu in extracted.get("educations") or []:
        existing.educations.append(
            CandidateEducation(
                school=(edu.get("school") or "")[:128] or "未知学校",
                degree=edu.get("degree"),
                major=edu.get("major"),
                start_date=_parse_date_str(edu.get("start_date")),
                end_date=_parse_date_str(edu.get("end_date")),
            )
        )

    return existing


def _parse_date_str(s):
    if not s:
        return None
    for fmt in ("%Y-%m-%d", "%Y-%m", "%Y/%m/%d", "%Y/%m", "%Y"):
        try:
            return datetime.strptime(str(s), fmt).date()
        except ValueError:
            continue
    return None


def _load_task(db: Session, task_id: int, user: User) -> ResumeTask:
    task = db.get(ResumeTask, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="task not found")
    if task.user_id != user.id and user.role.name != "admin":
        raise HTTPException(status_code=403, detail="forbidden")
    return task
