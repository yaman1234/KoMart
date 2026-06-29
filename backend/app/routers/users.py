from fastapi import APIRouter, HTTPException, status, Depends
from typing import List

from app.auth.dependencies import get_current_user, require_admin_only
from app.auth.jwt import hash_password
from app.models.user import User, UserRole
from app.schemas.user import UserCreate, UserUpdate, UserMeUpdate, UserListItem

router = APIRouter(prefix="/users", tags=["Users"])


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
async def update_me(body: UserMeUpdate, current_user: User = Depends(get_current_user)):
    update_data: dict = {}
    if body.name is not None:
        update_data["name"] = body.name
    if body.password is not None:
        update_data["hashed_password"] = hash_password(body.password)
    if update_data:
        await current_user.set(update_data)
    refreshed = await User.get(current_user.id)
    return _to_list_item(refreshed)  # type: ignore[arg-type]


@router.get("", response_model=List[UserListItem])
async def list_users(_: User = Depends(require_admin_only)):
    users = await User.find().to_list()
    return [_to_list_item(u) for u in users]


@router.post("", response_model=UserListItem, status_code=status.HTTP_201_CREATED)
async def create_user(body: UserCreate, _: User = Depends(require_admin_only)):
    if await User.find_one(User.email == body.email):
        raise HTTPException(status.HTTP_409_CONFLICT, detail="Email already registered")
    user = User(
        name=body.name,
        email=body.email,
        hashed_password=hash_password(body.password),
        role=body.role,
    )
    await user.insert()
    return _to_list_item(user)


@router.get("/{user_id}", response_model=UserListItem)
async def get_user(user_id: str, _: User = Depends(require_admin_only)):
    user = await User.get(user_id)
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="User not found")
    return _to_list_item(user)


@router.patch("/{user_id}", response_model=UserListItem)
async def update_user(user_id: str, body: UserUpdate, admin: User = Depends(require_admin_only)):
    user = await User.get(user_id)
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="User not found")

    # Prevent admin from demoting or deactivating themselves
    if str(user.id) == str(admin.id):
        if body.role is not None and body.role != UserRole.admin:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Cannot change your own role")
        if body.is_active is False:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Cannot deactivate yourself")

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
    refreshed = await User.get(user_id)
    return _to_list_item(refreshed)  # type: ignore[arg-type]


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def deactivate_user(user_id: str, admin: User = Depends(require_admin_only)):
    user = await User.get(user_id)
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="User not found")
    if str(user.id) == str(admin.id):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Cannot deactivate yourself")
    await user.set({"is_active": False})
