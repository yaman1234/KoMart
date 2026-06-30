from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm

from app.auth.jwt import verify_password, create_access_token
from app.models.user import User
from app.schemas.auth import LoginRequest, ForgotPasswordRequest, TokenResponse, UserResponse
from app.schemas.common import MessageResponse

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


async def _authenticate(email: str, password: str) -> TokenResponse:
    user = await User.find_one(User.email == email)
    if not user or not verify_password(password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account has been deactivated. Contact an administrator.",
        )
    token = create_access_token({"sub": str(user.id)})
    return TokenResponse(access_token=token, user=_user_response(user))


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest):
    """Login with JSON body — used by the React frontend."""
    return await _authenticate(body.email, body.password)


@router.post("/token", response_model=TokenResponse)
async def login_swagger(form: OAuth2PasswordRequestForm = Depends()):
    """OAuth2 form-based login — used by Swagger UI Authorize button.
    Enter your email in the 'username' field."""
    return await _authenticate(form.username, form.password)


@router.post("/forgot-password", response_model=MessageResponse)
async def forgot_password(body: ForgotPasswordRequest):
    # In production: send reset email
    return MessageResponse(message="If an account exists, a reset link has been sent.")
