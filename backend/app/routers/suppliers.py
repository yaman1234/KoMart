from fastapi import APIRouter, HTTPException, status, Depends, Query
from math import ceil
import re

from pydantic import ValidationError
from pymongo import ASCENDING, DESCENDING

from app.auth.dependencies import get_current_user, require_manager_or_above
from app.models.user import User
from app.models.supplier import Supplier
from app.schemas.supplier import SupplierCreate, SupplierUpdate, SupplierResponse
from app.schemas.common import PaginatedResponse

router = APIRouter(prefix="/suppliers", tags=["Suppliers"])

_SORT_FIELDS = {
    "name": "name",
    "created_at": "created_at",
    "createdat": "created_at",
    "added": "created_at",
}


async def _load_supplier(supplier_id: str) -> Supplier:
    try:
        supplier = await Supplier.get(supplier_id)
    except (ValidationError, ValueError):
        supplier = None
    if not supplier:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Supplier not found")
    return supplier


def _to_response(s: Supplier) -> SupplierResponse:
    return SupplierResponse(
        id=str(s.id),
        name=s.name,
        country=s.country,
        contact_person=s.contact_person,
        phone=s.phone,
        email=s.email,
        address=s.address,
        payment_details=list(s.payment_details or []),
        created_at=s.created_at.isoformat(),
    )


@router.get("", response_model=PaginatedResponse[SupplierResponse])
async def list_suppliers(
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=500),
    search: str = Query(""),
    sort_by: str = Query("name"),
    sort_order: str = Query("asc"),
    _: User = Depends(get_current_user),
):
    query = Supplier.find()
    if search:
        escaped = re.escape(search.strip())
        pattern = {"$regex": escaped, "$options": "i"}
        query = query.find({
            "$or": [
                {"name": pattern},
                {"contact_person": pattern},
                {"phone": pattern},
                {"country": pattern},
            ]
        })

    sort_field = _SORT_FIELDS.get((sort_by or "").strip().lower().replace("-", "_"), "name")
    direction = ASCENDING if (sort_order or "").strip().lower() == "asc" else DESCENDING
    total = await query.count()
    suppliers = await query.sort([(sort_field, direction)]).skip((page - 1) * page_size).limit(page_size).to_list()
    return PaginatedResponse(
        data=[_to_response(s) for s in suppliers],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=ceil(total / page_size) if total else 1,
    )


@router.post("", response_model=SupplierResponse, status_code=status.HTTP_201_CREATED)
async def create_supplier(body: SupplierCreate, _: User = Depends(require_manager_or_above)):
    supplier = Supplier(**body.model_dump())
    await supplier.insert()
    return _to_response(supplier)


@router.get("/{supplier_id}", response_model=SupplierResponse)
async def get_supplier(supplier_id: str, _: User = Depends(get_current_user)):
    supplier = await _load_supplier(supplier_id)
    return _to_response(supplier)


@router.patch("/{supplier_id}", response_model=SupplierResponse)
async def update_supplier(
    supplier_id: str, body: SupplierUpdate, _: User = Depends(require_manager_or_above)
):
    supplier = await _load_supplier(supplier_id)
    update_data = {k: v for k, v in body.model_dump().items() if v is not None}
    if update_data:
        await supplier.set(update_data)
    return _to_response(supplier)
