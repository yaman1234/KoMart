from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError

from app.auth.jwt import decode_token
from app.models.user import User, UserRole

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/token")
oauth2_scheme_optional = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/token", auto_error=False)


async def _user_from_token(token: str) -> User | None:
    try:
        payload = decode_token(token)
        user_id: str | None = payload.get("sub")
        if user_id is None:
            return None
    except JWTError:
        return None

    user = await User.get(user_id)
    if user is None or not user.is_active:
        return None
    return user


async def get_current_user(token: str = Depends(oauth2_scheme)) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    user = await _user_from_token(token)
    if user is None:
        raise credentials_exception
    return user


async def get_optional_user(token: str | None = Depends(oauth2_scheme_optional)) -> User | None:
    if not token:
        return None
    return await _user_from_token(token)


async def require_manager_or_above(current_user: User = Depends(get_current_user)) -> User:
    """Allow admin and manager. Deny cashier."""
    if current_user.role not in (UserRole.admin, UserRole.manager):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Manager or admin access required",
        )
    return current_user


async def require_admin_only(current_user: User = Depends(get_current_user)) -> User:
    """Allow admin only. Deny manager and cashier."""
    if current_user.role != UserRole.admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return current_user


# Kept for any legacy import compatibility — points to require_manager_or_above
require_admin = require_manager_or_above
