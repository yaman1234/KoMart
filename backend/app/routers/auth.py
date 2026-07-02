from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm

from app.auth.jwt import create_access_token, verify_password
from app.auth.refresh_tokens import (
    issue_refresh_token,
    revoke_all_user_tokens,
    revoke_token_by_plain,
    rotate_refresh_token,
)
from app.auth.dependencies import get_optional_user
from app.config import settings
from app.models.user import User
from app.schemas.auth import (
    LoginRequest,
    LogoutRequest,
    RefreshRequest,
    TokenResponse,
    UserResponse,
)
from app.schemas.common import MessageResponse
from app.models.audit_log import AuditModule
from app.services.audit import log_audit, user_snapshot

router = APIRouter(prefix="/auth", tags=["Auth"])


def _user_response(user: User) -> UserResponse:
    return UserResponse(
        id=str(user.id),
        email=user.email,
        name=user.name,
        role=user.role,
        avatar=user.avatar,
        created_at=user.created_at.isoformat(),
    )


def _client_meta(request: Request) -> dict[str, str]:
    forwarded = request.headers.get("x-forwarded-for", "")
    ip = forwarded.split(",")[0].strip() if forwarded else (request.client.host if request.client else "")
    return {
        "ip_address": ip,
        "user_agent": request.headers.get("user-agent", "")[:512],
    }


async def _build_token_response(user: User, request: Request) -> TokenResponse:
    if not user.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Account is inactive")

    meta = _client_meta(request)
    access = create_access_token({"sub": str(user.id)})
    refresh_plain, _ = await issue_refresh_token(
        str(user.id),
        device_label=meta["user_agent"][:80],
        user_agent=meta["user_agent"],
        ip_address=meta["ip_address"],
    )
    return TokenResponse(
        access_token=access,
        refresh_token=refresh_plain,
        token_type="bearer",
        expires_in=settings.access_token_expire_minutes * 60,
        user=_user_response(user),
    )


async def _authenticate(email: str, password: str, request: Request) -> TokenResponse:
    user = await User.find_one(User.email == email)
    if not user or not verify_password(password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )
    response = await _build_token_response(user, request)
    await log_audit(
        module=AuditModule.auth,
        action="login",
        user=user,
        request=request,
        entity_type="user",
        entity_id=str(user.id),
        new={"email": user.email, "role": user.role.value},
    )
    return response


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, request: Request):
    """Login with JSON body — used by the React frontend."""
    return await _authenticate(body.email, body.password, request)


@router.post("/token", response_model=TokenResponse)
async def login_swagger(request: Request, form: OAuth2PasswordRequestForm = Depends()):
    """OAuth2 form-based login — used by Swagger UI Authorize button.
    Enter your email in the 'username' field."""
    return await _authenticate(form.username, form.password, request)


@router.post("/refresh", response_model=TokenResponse)
async def refresh_tokens(body: RefreshRequest, request: Request):
    """Exchange a valid refresh token for a new access + refresh token pair (rotation)."""
    meta = _client_meta(request)
    new_plain, _, user_id = await rotate_refresh_token(
        body.refresh_token,
        user_agent=meta["user_agent"],
        ip_address=meta["ip_address"],
    )
    user = await User.get(user_id)
    if not user or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="User not found or inactive")

    access = create_access_token({"sub": str(user.id)})
    return TokenResponse(
        access_token=access,
        refresh_token=new_plain,
        token_type="bearer",
        expires_in=settings.access_token_expire_minutes * 60,
        user=_user_response(user),
    )


@router.post("/logout", response_model=MessageResponse)
async def logout(
    body: LogoutRequest,
    request: Request,
    current_user: User | None = Depends(get_optional_user),
):
    """Revoke refresh token. Use all_devices=true (requires valid access token) to revoke every session."""
    if body.all_devices:
        if not current_user:
            raise HTTPException(
                status.HTTP_401_UNAUTHORIZED,
                detail="Valid access token required to log out all devices",
            )
        count = await revoke_all_user_tokens(str(current_user.id))
        await log_audit(
            module=AuditModule.auth,
            action="logout",
            user=current_user,
            request=request,
            entity_type="user",
            entity_id=str(current_user.id),
            new={"all_devices": True, "sessions_revoked": count},
        )
        return MessageResponse(message=f"Logged out from {count} device(s)")

    if body.refresh_token:
        await revoke_token_by_plain(body.refresh_token)

    await log_audit(
        module=AuditModule.auth,
        action="logout",
        user=current_user,
        request=request,
        entity_type="user",
        entity_id=str(current_user.id) if current_user else "",
        new={"all_devices": False},
    )
    return MessageResponse(message="Logged out")
