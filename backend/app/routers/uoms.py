from fastapi import APIRouter, HTTPException, status, Depends
from pydantic import BaseModel, field_validator
from typing import List, Optional
import re

from app.auth.dependencies import get_current_user, require_manager_or_above, require_admin_only
from app.models.user import User
from app.models.uom import Uom

router = APIRouter(prefix="/uoms", tags=["Units of Measure"])

_CODE_RE = re.compile(r"^[a-z0-9][a-z0-9_-]{0,19}$")


class UomCreate(BaseModel):
    code: str
    label: str
    description: Optional[str] = ""

    @field_validator("code")
    @classmethod
    def normalize_code(cls, value: str) -> str:
        code = value.strip().lower()
        if not _CODE_RE.match(code):
            raise ValueError("Code must be 1–20 lowercase letters, numbers, hyphens, or underscores")
        return code

    @field_validator("label")
    @classmethod
    def validate_label(cls, value: str) -> str:
        label = value.strip()
        if not label:
            raise ValueError("Label is required")
        return label


class UomUpdate(BaseModel):
    code: Optional[str] = None
    label: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None

    @field_validator("code")
    @classmethod
    def normalize_code(cls, value: str | None) -> str | None:
        if value is None:
            return None
        code = value.strip().lower()
        if not _CODE_RE.match(code):
            raise ValueError("Code must be 1–20 lowercase letters, numbers, hyphens, or underscores")
        return code

    @field_validator("label")
    @classmethod
    def validate_label(cls, value: str | None) -> str | None:
        if value is None:
            return None
        label = value.strip()
        if not label:
            raise ValueError("Label cannot be empty")
        return label


class UomResponse(BaseModel):
    id: str
    code: str
    label: str
    description: str
    is_active: bool
    created_at: str


def _to_response(u: Uom) -> UomResponse:
    return UomResponse(
        id=str(u.id),
        code=u.code,
        label=u.label,
        description=u.description,
        is_active=u.is_active,
        created_at=u.created_at.isoformat(),
    )


@router.get("", response_model=List[UomResponse])
async def list_uoms(
    include_inactive: bool = False,
    _: User = Depends(get_current_user),
):
    query = Uom.find() if include_inactive else Uom.find(Uom.is_active == True)  # noqa: E712
    uoms = await query.sort("label").to_list()
    return [_to_response(u) for u in uoms]


@router.post("", response_model=UomResponse, status_code=status.HTTP_201_CREATED)
async def create_uom(body: UomCreate, _: User = Depends(require_manager_or_above)):
    if await Uom.find_one(Uom.code == body.code):
        raise HTTPException(status.HTTP_409_CONFLICT, detail="UOM code already exists")
    uom = Uom(code=body.code, label=body.label, description=body.description or "")
    await uom.insert()
    return _to_response(uom)


@router.patch("/{uom_id}", response_model=UomResponse)
async def update_uom(
    uom_id: str,
    body: UomUpdate,
    _: User = Depends(require_manager_or_above),
):
    uom = await Uom.get(uom_id)
    if not uom:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="UOM not found")
    update_data: dict = {}
    if body.code is not None:
        existing = await Uom.find_one({"code": body.code, "_id": {"$ne": uom.id}})
        if existing:
            raise HTTPException(status.HTTP_409_CONFLICT, detail="UOM code already exists")
        update_data["code"] = body.code
    if body.label is not None:
        update_data["label"] = body.label
    if body.description is not None:
        update_data["description"] = body.description
    if body.is_active is not None:
        update_data["is_active"] = body.is_active
    if update_data:
        await uom.set(update_data)
    refreshed = await Uom.get(uom_id)
    return _to_response(refreshed)  # type: ignore[arg-type]


@router.delete("/{uom_id}", status_code=status.HTTP_204_NO_CONTENT)
async def deactivate_uom(uom_id: str, _: User = Depends(require_admin_only)):
    uom = await Uom.get(uom_id)
    if not uom:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="UOM not found")
    await uom.set({"is_active": False})
