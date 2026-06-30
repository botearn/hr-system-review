from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.core.security import decode_token
from app.db.session import get_db
from app.models.user import User

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    try:
        payload = decode_token(token)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(e),
            headers={"WWW-Authenticate": "Bearer"},
        ) from e

    if payload.get("type") != "access":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="wrong token type")

    user_id = int(payload["sub"])
    user = db.get(User, user_id)
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="user not found")
    return user


def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.role.name != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="admin required")
    return user


def require_interviewer(user: User = Depends(get_current_user)) -> User:
    """面试官或 admin 都可以访问评估相关功能"""
    if user.role.name not in ("interviewer", "admin"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="interviewer or admin required")
    return user


def require_interviewee(user: User = Depends(get_current_user)) -> User:
    """面试者只能访问面试平台相关极窄接口"""
    if user.role.name != "interviewee":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="interviewee only")
    return user


def forbid_interviewee(user: User = Depends(get_current_user)) -> User:
    """HR 系统所有敏感数据接口必须使用此依赖，interviewee 直接拒绝。
    这是实现「interviewee 绝对隔离」的核心防护。
    """
    if user.role.name == "interviewee":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden for interviewee")
    return user
