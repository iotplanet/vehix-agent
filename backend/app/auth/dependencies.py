"""FastAPI dependencies for JWT authentication and RBAC authorization."""

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.auth.jwt import decode_token
from app.models.user import User, ROLES

security = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Extract and validate the current user from JWT Bearer token.

    Raises 401 if token is missing, expired, or invalid.
    Raises 403 if user is inactive.
    """
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="未提供认证令牌",
        )

    payload = decode_token(credentials.credentials)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="令牌无效或已过期",
        )

    if payload.get("type") != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="请使用 access token",
        )

    user_id = int(payload.get("sub", 0))
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户不存在",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="账户已被禁用",
        )

    return user


def require_role(*roles: str):
    """Factory: create a dependency that requires one of the given roles.

    Usage:
        @router.post("/commands")
        async def dispatch(
            current_user: User = Depends(require_role("operator", "admin", "superuser")),
        ):
            ...
    """

    async def role_checker(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in roles:
            role_labels = {"viewer": "查看者", "operator": "操作员", "admin": "管理员", "superuser": "超级管理员"}
            required = " / ".join(role_labels.get(r, r) for r in roles)
            current = role_labels.get(current_user.role, current_user.role)
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"权限不足。需要: {required}，当前: {current}",
            )
        return current_user

    return role_checker


async def get_optional_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> User | None:
    """Like get_current_user but returns None instead of raising 401."""
    if credentials is None:
        return None
    try:
        return await get_current_user(credentials, db)
    except HTTPException:
        return None


# Pre-built role dependencies
RequireViewer = require_role("viewer", "operator", "admin", "superuser")
RequireOperator = require_role("operator", "admin", "superuser")
RequireAdmin = require_role("admin", "superuser")
RequireSuperuser = require_role("superuser")
OptionalUser = get_optional_user
