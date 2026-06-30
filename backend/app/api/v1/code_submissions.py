from datetime import UTC, datetime
import hashlib
import os

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, require_interviewer, require_interviewee
from app.db.session import get_db
from app.models.attachment import Attachment
from app.models.candidate import Candidate
from app.models.code_submission import CodeSubmission
from app.models.user import Role, User
from app.schemas.code_submission import (
    CodeSubmissionBrief,
    CodeSubmissionCreate,
    CodeSubmissionListItem,
    CodeSubmissionOut,
    CodeSubmissionScoreIn,
)
import app.services.storage as storage_service

router = APIRouter(prefix="/code-submissions", tags=["code-submissions"])


@router.post("", response_model=CodeSubmissionOut, status_code=status.HTTP_201_CREATED)
async def create_submission(
    challenge_id: str = Form(...),
    github_url: str = Form(...),
    notes: str | None = Form(None),
    name: str | None = Form(None),
    email: str | None = Form(None),
    resume: UploadFile | None = File(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_interviewee),
):
    """面试者提交代码作品（支持上传简历，自动入 candidate 库）"""
    resume_attachment_id: int | None = None
    candidate_id: int | None = None

    if resume and resume.filename:
        # 1. 读取并保存文件
        raw = await resume.read()
        if not raw:
            raise HTTPException(status_code=400, detail="empty resume file")

        sha = hashlib.sha256(raw).hexdigest()
        try:
            storage_path = storage_service.save(resume.filename, raw)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"storage error: {e}") from e

        # 2. 创建 Attachment
        att = Attachment(
            uploader_id=current_user.id,
            filename=resume.filename,
            storage_path=storage_path,
            mime=resume.content_type,
            size_bytes=len(raw),
            sha256=sha,
            owner_type="interview_submission",
        )
        db.add(att)
        db.flush()
        resume_attachment_id = att.id

        # 3. 自动创建 Candidate（简历入库）
        # 找到一个活跃的 admin 作为 owner（interview 流入的候选人归 admin 池）
        admin = (
            db.query(User)
            .join(Role)
            .filter(Role.name == "admin", User.is_active.is_(True))
            .first()
        )
        owner_id = admin.id if admin else current_user.id

        display_name = (name or current_user.display_name or current_user.username or "面试候选人").strip()
        cand_email = (email or current_user.email or None)

        candidate = Candidate(
            owner_id=owner_id,
            name=display_name[:64],
            email=cand_email,
            resume_file_id=att.id,
            source="self_upload",
            job_status="active",
            notes=f"来自面试平台 - 题目 {challenge_id}",
        )
        db.add(candidate)
        db.flush()
        candidate_id = candidate.id

    # 4. 创建 CodeSubmission 记录
    submission = CodeSubmission(
        user_id=current_user.id,
        challenge_id=challenge_id,
        github_url=github_url,
        resume_attachment_id=resume_attachment_id,
        candidate_id=candidate_id,
        status="pending_evaluation",
        submitted_at=datetime.now(UTC),
    )
    db.add(submission)
    db.commit()
    db.refresh(submission)
    return submission


@router.get("/mine", response_model=list[CodeSubmissionBrief])
def list_my_submissions(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_interviewee),
):
    """面试者查看自己提交的记录"""
    subs = (
        db.query(CodeSubmission)
        .filter(CodeSubmission.user_id == current_user.id)
        .order_by(CodeSubmission.submitted_at.desc())
        .all()
    )
    return subs


@router.get("", response_model=list[CodeSubmissionListItem])
def list_all_submissions(
    filter_status: str | None = None,
    since: datetime | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(require_interviewer),
):
    """HR / 面试官查看所有提交（可按 status 筛选；since 用于增量轮询）"""
    q = db.query(CodeSubmission, User).join(User, CodeSubmission.user_id == User.id)
    if filter_status:
        q = q.filter(CodeSubmission.status == filter_status)
    if since:
        q = q.filter(CodeSubmission.submitted_at > since)
    rows = q.order_by(CodeSubmission.submitted_at.desc()).all()

    result = []
    for sub, user in rows:
        result.append(CodeSubmissionListItem(
            id=sub.id,
            challenge_id=sub.challenge_id,
            github_url=sub.github_url,
            candidate_id=sub.candidate_id,
            status=sub.status,
            submitted_at=sub.submitted_at,
            time_spent_seconds=sub.time_spent_seconds,
            score=float(sub.score) if sub.score is not None else None,
            grade=sub.grade,
            notes=sub.notes,
            evaluated_at=sub.evaluated_at,
            user_id=sub.user_id,
            submitter_username=user.username,
            submitter_name=user.display_name,
            submitter_email=user.email,
        ))
    return result


@router.get("/stats")
def get_stats(
    db: Session = Depends(get_db),
    _: User = Depends(require_interviewer),
):
    """面试挑战汇总数据（HR 看板用）"""
    total_subs = db.query(func.count(CodeSubmission.id)).scalar() or 0
    pending = db.query(func.count(CodeSubmission.id)).filter(
        CodeSubmission.status == "pending_evaluation"
    ).scalar() or 0
    evaluated = db.query(func.count(CodeSubmission.id)).filter(
        CodeSubmission.status == "evaluated"
    ).scalar() or 0
    avg_score = db.query(func.avg(CodeSubmission.score)).filter(
        CodeSubmission.score.isnot(None)
    ).scalar()

    grade_rows = (
        db.query(CodeSubmission.grade, func.count(CodeSubmission.id))
        .filter(CodeSubmission.grade.isnot(None))
        .group_by(CodeSubmission.grade)
        .all()
    )
    grade_dist = {g: c for g, c in grade_rows}

    # 面试者注册总数
    interviewee_role = db.query(Role).filter(Role.name == "interviewee").first()
    total_interviewees = 0
    if interviewee_role:
        total_interviewees = db.query(func.count(User.id)).filter(
            User.role_id == interviewee_role.id, User.is_active.is_(True)
        ).scalar() or 0

    return {
        "total_interviewees": total_interviewees,
        "total_submissions": total_subs,
        "pending": pending,
        "evaluated": evaluated,
        "avg_score": round(float(avg_score), 1) if avg_score is not None else None,
        "grade_distribution": grade_dist,
    }


@router.get("/pending", response_model=list[CodeSubmissionBrief])
def list_pending(
    db: Session = Depends(get_db),
    _interviewer: User = Depends(require_interviewer),
):
    """面试官查看待评估列表"""
    subs = (
        db.query(CodeSubmission)
        .filter(CodeSubmission.status == "pending_evaluation")
        .order_by(CodeSubmission.submitted_at.desc())
        .all()
    )
    return subs


@router.get("/{submission_id}", response_model=CodeSubmissionOut)
def get_submission(
    submission_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    sub = db.get(CodeSubmission, submission_id)
    if not sub:
        raise HTTPException(status_code=404, detail="submission not found")

    # 面试者只能看自己的
    if current_user.role.name == "interviewee" and sub.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="forbidden")

    # interviewer 和 admin 可以看任意
    if current_user.role.name not in ("interviewer", "admin", "interviewee"):
        raise HTTPException(status_code=403, detail="forbidden")

    return sub


@router.post("/{submission_id}/score", response_model=CodeSubmissionOut)
def score_submission(
    submission_id: int,
    payload: CodeSubmissionScoreIn,
    db: Session = Depends(get_db),
    interviewer: User = Depends(require_interviewer),
):
    """面试官打分"""
    sub = db.get(CodeSubmission, submission_id)
    if not sub:
        raise HTTPException(status_code=404, detail="submission not found")

    sub.score = payload.score
    sub.grade = payload.grade
    sub.notes = payload.notes
    sub.evaluated_by = interviewer.id
    sub.evaluated_at = datetime.now(UTC)
    sub.status = "evaluated"

    db.commit()
    db.refresh(sub)
    return sub
