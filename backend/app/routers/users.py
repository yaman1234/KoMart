from fastapi import APIRouter, HTTPException, status, Depends, Request
from typing import List

from app.auth.dependencies import (
    get_current_user,
    invalidate_user_cache,
    require_admin_only,
    require_manager_or_above,
)
from app.auth.jwt import hash_password
from app.auth.refresh_tokens import revoke_all_user_tokens
from app.models.user import User, UserRole
from app.schemas.user import UserCreate, UserUpdate, UserMeUpdate, UserListItem, AssignableUserItem
from app.models.audit_log import AuditModule
from app.services.audit import log_audit, user_snapshot

router = APIRouter(prefix="/users", tags=["Users"])


async def _get_user_or_404(user_id: str) -> User:
    try:
        user = await User.get(user_id)
    except Exception:
        user = None
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="User not found")
    return user


def _to_list_item(u: User) -> UserListItem:
    return UserListItem(
        id=str(u.id),
        name=u.name,
        email=u.email,
        role=u.role,
        is_active=u.is_active,
        created_at=u.created_at.isoformat(),
    )


@router.get("/me", response_model=UserListItem)
async def get_me(current_user: User = Depends(get_current_user)):
    return _to_list_item(current_user)


@router.patch("/me", response_model=UserListItem)
async def update_me(
    body: UserMeUpdate,
    request: Request,
    current_user: User = Depends(get_current_user),
):
    before = user_snapshot(current_user)
    update_data: dict = {}
    if body.name is not None:
        update_data["name"] = body.name
    if body.password is not None:
        update_data["hashed_password"] = hash_password(body.password)
    if update_data:
        uid = str(current_user.id)
        await current_user.set(update_data)
        invalidate_user_cache(uid)
        if body.password is not None:
            await revoke_all_user_tokens(uid)
        refreshed = await User.get(current_user.id)
        await log_audit(
            module=AuditModule.users,
            action="update_me",
            user=current_user,
            request=request,
            entity_type="user",
            entity_id=uid,
            previous=before,
            new=user_snapshot(refreshed),  # type: ignore[arg-type]
        )
    refreshed = await User.get(current_user.id)
    return _to_list_item(refreshed)  # type: ignore[arg-type]


@router.get("/assignable", response_model=List[AssignableUserItem])
async def list_assignable_users(_: User = Depends(require_manager_or_above)):
    users = await User.find(User.is_active == True).to_list()  # noqa: E712
    allowed = {UserRole.admin, UserRole.manager, UserRole.cashier}
    return [
        AssignableUserItem(id=str(u.id), name=u.name, role=u.role)
        for u in users
        if u.role in allowed
    ]


@router.get("", response_model=List[UserListItem])
async def list_users(_: User = Depends(require_admin_only)):
    users = await User.find().to_list()
    return [_to_list_item(u) for u in users]


@router.post("", response_model=UserListItem, status_code=status.HTTP_201_CREATED)
async def create_user(
    body: UserCreate,
    request: Request,
    admin: User = Depends(require_admin_only),
):
    if await User.find_one(User.email == body.email):
        raise HTTPException(status.HTTP_409_CONFLICT, detail="Email already registered")
    user = User(
        name=body.name,
        email=body.email,
        hashed_password=hash_password(body.password),
        role=body.role,
    )
    await user.insert()
    await log_audit(
        module=AuditModule.users,
        action="create",
        user=admin,
        request=request,
        entity_type="user",
        entity_id=str(user.id),
        new=user_snapshot(user),
    )
    return _to_list_item(user)


@router.get("/{user_id}", response_model=UserListItem)
async def get_user(user_id: str, _: User = Depends(require_admin_only)):
    user = await _get_user_or_404(user_id)
    return _to_list_item(user)


@router.patch("/{user_id}", response_model=UserListItem)
async def update_user(
    user_id: str,
    body: UserUpdate,
    request: Request,
    admin: User = Depends(require_admin_only),
):
    user = await _get_user_or_404(user_id)

    if str(user.id) == str(admin.id):
        if body.role is not None and body.role != UserRole.admin:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Cannot change your own role")
        if body.is_active is False:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Cannot deactivate yourself")

    before = user_snapshot(user)
    update_data: dict = {}
    if body.name is not None:
        update_data["name"] = body.name
    if body.email is not None:
        if await User.find_one({"email": body.email, "_id": {"$ne": user.id}}):
            raise HTTPException(status.HTTP_409_CONFLICT, detail="Email already in use")
        update_data["email"] = body.email
    if body.password is not None:
        update_data["hashed_password"] = hash_password(body.password)
    if body.role is not None:
        update_data["role"] = body.role
    if body.is_active is not None:
        update_data["is_active"] = body.is_active

    if update_data:
        await user.set(update_data)
        invalidate_user_cache(user_id)
        if body.password is not None or body.is_active is False:
            await revoke_all_user_tokens(user_id)
        refreshed = await User.get(user_id)
        after = user_snapshot(refreshed)  # type: ignore[arg-type]
        await log_audit(
            module=AuditModule.users,
            action="update",
            user=admin,
            request=request,
            entity_type="user",
            entity_id=user_id,
            previous=before,
            new=after,
        )
    refreshed = await User.get(user_id)
    return _to_list_item(refreshed)  # type: ignore[arg-type]


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def deactivate_user(
    user_id: str,
    request: Request,
    admin: User = Depends(require_admin_only),
):
    user = await _get_user_or_404(user_id)
    if str(user.id) == str(admin.id):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Cannot deactivate yourself")
    before = user_snapshot(user)
    await user.set({"is_active": False})
    invalidate_user_cache(user_id)
    await revoke_all_user_tokens(user_id)
    await log_audit(
        module=AuditModule.users,
        action="deactivate",
        user=admin,
        request=request,
        entity_type="user",
        entity_id=user_id,
        previous=before,
        new={"is_active": False},
    )
