from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.core.deps import forbid_interviewee, require_interviewer


def _user(role_name: str):
    return SimpleNamespace(role=SimpleNamespace(name=role_name))


def test_interviewee_is_rejected_by_hr_guard():
    with pytest.raises(HTTPException) as exc_info:
        forbid_interviewee(_user("interviewee"))

    assert exc_info.value.status_code == 403


@pytest.mark.parametrize("role_name", ["admin", "interviewer"])
def test_review_management_allows_only_admin_or_interviewer(role_name: str):
    assert require_interviewer(_user(role_name)).role.name == role_name


def test_review_management_rejects_interviewee():
    with pytest.raises(HTTPException) as exc_info:
        require_interviewer(_user("interviewee"))

    assert exc_info.value.status_code == 403


def test_enabled_hr_routes_do_not_use_bare_current_user_dependency():
    api_dir = Path(__file__).resolve().parents[1] / "app" / "api" / "v1"
    enabled_hr_modules = [
        "agent.py",
        "candidates.py",
        "companies.py",
        "dashboard.py",
        "follow_ups.py",
        "matches.py",
        "positions.py",
    ]

    offenders = []
    for module in enabled_hr_modules:
        source = (api_dir / module).read_text()
        if "Depends(get_current_user)" in source:
            offenders.append(module)

    assert offenders == []
