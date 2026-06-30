"""批量导入简历（后台脚本）。

将指定目录或 ZIP 文件中的简历批量解析并自动入库，跳过「待确认」步骤。

用法：
    cd backend
    python -m app.scripts.batch_import /path/to/resumes/
    python -m app.scripts.batch_import /path/to/resumes.zip
    python -m app.scripts.batch_import /path/to/resumes/ --user admin
    python -m app.scripts.batch_import /path/to/resumes/ --dry-run
"""

from __future__ import annotations

import argparse
import hashlib
import os
import sys
import tempfile
import zipfile
from datetime import datetime
from pathlib import Path

from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models.attachment import Attachment
from app.models.candidate import (
    Candidate,
    CandidateEducation,
    CandidateExperience,
    CandidateProject,
)
from app.models.resume_task import ResumeTask
from app.models.user import User
from app.services import storage
from app.services.resume.pipeline import run_pipeline
from app.services.resume.text_extract import extract as extract_text
from app.services.vectorize import vectorize_candidate

_ALLOWED_EXT = {".pdf", ".docx", ".txt", ".md", ".html", ".htm"}
_MAX_BYTES = 20 * 1024 * 1024  # 20MB


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------


def _find_user(db: Session, username: str) -> User:
    user = db.query(User).filter_by(username=username).first()
    if not user:
        user = db.query(User).filter_by(email=username).first()
    if not user:
        raise RuntimeError(f"User not found: {username}")
    return user


def _collect_files(source: str) -> list[Path]:
    source_path = Path(source)

    if source_path.is_file() and source_path.suffix.lower() == ".zip":
        tmpdir = tempfile.mkdtemp(prefix="batch_import_")
        with zipfile.ZipFile(source_path, "r") as zf:
            zf.extractall(tmpdir)
        print(f"[zip] 解压到 {tmpdir}")
        source_path = Path(tmpdir)

    if not source_path.is_dir():
        raise RuntimeError(f"不是目录或 ZIP: {source}")

    return sorted(
        f for f in source_path.rglob("*") if f.is_file() and f.suffix.lower() in _ALLOWED_EXT
    )


# ---------------------------------------------------------------------------
# candidate builder（镜像 resumes.py:_build_candidate，避免引入 FastAPI 层）
# ---------------------------------------------------------------------------


def _int(v):
    try:
        return int(v) if v is not None and v != "" else None
    except (TypeError, ValueError):
        return None


def _num(v):
    try:
        return float(v) if v is not None and v != "" else None
    except (TypeError, ValueError):
        return None


def _parse_date(s):
    if not s:
        return None
    for fmt in ("%Y-%m-%d", "%Y-%m", "%Y/%m/%d", "%Y/%m", "%Y"):
        try:
            return datetime.strptime(str(s), fmt).date()
        except ValueError:
            continue
    return None


def _build_candidate(owner_id: int, task: ResumeTask, extracted: dict) -> Candidate:
    source_type = "url_upload" if task.source_type.startswith("url") else "import"

    candidate = Candidate(
        owner_id=owner_id,
        name=(extracted.get("name") or "未命名").strip()[:64],
        phone=(extracted.get("phone") or None),
        email=(extracted.get("email") or None),
        wechat=(extracted.get("wechat") or None),
        city=(extracted.get("city") or None),
        industry=(extracted.get("industry") or None),
        years_of_experience=_int(extracted.get("years_of_experience")),
        education_level=(extracted.get("education_level") or None),
        current_salary_min=_num(extracted.get("current_salary_min")),
        current_salary_max=_num(extracted.get("current_salary_max")),
        expected_salary_min=_num(extracted.get("expected_salary_min")),
        expected_salary_max=_num(extracted.get("expected_salary_max")),
        skills=list(extracted.get("skills") or []),
        derived_capabilities=task.derived_capabilities,
        resume_quality=task.resume_quality,
        resume_quality_score=(task.resume_quality or {}).get("score"),
        resume_text=task.resume_text,
        resume_file_id=task.file_id,
        raw_extracted=task.extracted,
        source=source_type,
    )

    for exp in extracted.get("experiences") or []:
        candidate.experiences.append(
            CandidateExperience(
                company_name=(exp.get("company_name") or "")[:128] or "未知公司",
                position_title=(exp.get("position_title") or "")[:128] or "未知岗位",
                start_date=_parse_date(exp.get("start_date")),
                end_date=_parse_date(exp.get("end_date")),
                description=exp.get("description"),
            )
        )
    for prj in extracted.get("projects") or []:
        candidate.projects.append(
            CandidateProject(
                project_name=(prj.get("project_name") or "")[:128] or "未命名项目",
                role=prj.get("role"),
                start_date=_parse_date(prj.get("start_date")),
                end_date=_parse_date(prj.get("end_date")),
                description=prj.get("description"),
                tech_stack=list(prj.get("tech_stack") or []),
            )
        )
    for edu in extracted.get("educations") or []:
        candidate.educations.append(
            CandidateEducation(
                school=(edu.get("school") or "")[:128] or "未知学校",
                degree=edu.get("degree"),
                major=edu.get("major"),
                start_date=_parse_date(edu.get("start_date")),
                end_date=_parse_date(edu.get("end_date")),
            )
        )
    return candidate


# ---------------------------------------------------------------------------
# single file processor
# ---------------------------------------------------------------------------


def _process_one(db: Session, file_path: Path, user: User, dry_run: bool = False) -> dict:
    filename = file_path.name
    result = {"file": filename, "status": "pending", "name": None, "candidate_id": None, "error": None}

    try:
        raw = file_path.read_bytes()
        if len(raw) > _MAX_BYTES:
            result["status"] = "skipped"
            result["error"] = f"文件过大 ({len(raw)} bytes)"
            return result
        if not raw:
            result["status"] = "skipped"
            result["error"] = "空文件"
            return result

        if dry_run:
            text = extract_text(filename, raw)
            result["status"] = "dry_run"
            result["error"] = f"可提取文本 {len(text)} 字符"
            return result

        # 1. 存储 → Attachment → ResumeTask
        sha = hashlib.sha256(raw).hexdigest()
        storage_path = storage.save(filename, raw)

        att = Attachment(
            uploader_id=user.id,
            filename=filename,
            storage_path=storage_path,
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

        # 2. 跑 pipeline（内部独立 session，完成后已 commit）
        run_pipeline(task.id)

        # 3. 重新读取 pipeline 结果
        db.refresh(task)

        if task.status == "failed":
            result["status"] = "failed"
            result["error"] = task.error_msg or "pipeline failed"
            return result

        if not task.extracted:
            result["status"] = "failed"
            result["error"] = "解析结果为空"
            return result

        # 4. 自动确认：直接建候选人
        extracted = dict(task.extracted)
        candidate = _build_candidate(user.id, task, extracted)
        db.add(candidate)
        db.flush()

        task.candidate_id = candidate.id
        task.status = "confirmed"
        db.commit()
        db.refresh(candidate)

        # 5. 向量化
        vectorize_candidate(candidate.id)

        result["status"] = "ok"
        result["name"] = candidate.name
        result["candidate_id"] = candidate.id

    except Exception as e:
        db.rollback()
        result["status"] = "error"
        result["error"] = f"{type(e).__name__}: {e}"

    return result


# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------


def run(source: str, username: str = "admin", dry_run: bool = False) -> None:
    db: Session = SessionLocal()
    try:
        user = _find_user(db, username)

        files = _collect_files(source)
        if not files:
            print(f"[abort] 在 {source} 中未找到简历文件")
            return

        print(f"\n{'=' * 60}")
        print(f"批量导入简历")
        print(f"  来源:   {source}")
        print(f"  文件数: {len(files)}")
        print(f"  用户:   {user.username} (#{user.id})")
        if dry_run:
            print(f"  模式:   DRY RUN（仅检测，不入库）")
        print(f"{'=' * 60}\n")

        ok = 0
        failed = 0
        skipped = 0

        for i, fp in enumerate(files, 1):
            prefix = f"[{i}/{len(files)}]"
            print(f"{prefix} {fp.name} ... ", end="", flush=True)

            r = _process_one(db, fp, user, dry_run)

            if r["status"] == "ok":
                ok += 1
                print(f"-> {r['name']} (candidate #{r['candidate_id']})")
            elif r["status"] == "dry_run":
                print(f"[dry-run] {r['error']}")
                ok += 1
            elif r["status"] == "skipped":
                skipped += 1
                print(f"跳过: {r['error']}")
            else:
                failed += 1
                print(f"失败: {r['error']}")

        print(f"\n{'=' * 60}")
        print(f"完成: 成功 {ok} / 失败 {failed} / 跳过 {skipped} / 共 {len(files)}")
        print(f"{'=' * 60}")

    finally:
        db.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="批量导入简历（后台脚本，自动入库）")
    parser.add_argument("source", help="简历目录路径或 ZIP 文件路径")
    parser.add_argument("--user", default="admin", help="归属用户名（默认 admin）")
    parser.add_argument("--dry-run", action="store_true", help="仅检测文件，不入库")
    args = parser.parse_args()

    if not os.path.exists(args.source):
        print(f"Error: 路径不存在: {args.source}", file=sys.stderr)
        sys.exit(1)

    run(args.source, args.user, args.dry_run)


if __name__ == "__main__":
    main()
