from fastapi import APIRouter, Depends, HTTPException, Query, Request, status

from app.auth.dependencies import get_current_user, require_manager_or_above
from app.models.purchase_order import PurchaseOrder
from app.models.purchase_return import PurchaseReturn
from app.models.user import User
from app.schemas.purchase_return import (
    PurchaseReturnClose,
    PurchaseReturnCreate,
    PurchaseReturnListResponse,
    PurchaseReturnResponse,
    PurchaseReturnSummaryResponse,
    PurchaseReturnWriteOff,
    ReturnableLineResponse,
)
from app.services.dashboard_kpi import build_purchase_return_summary
from app.services.purchase_return import (
    close_purchase_return,
    create_purchase_return,
    list_returnable_lines_for_po,
    list_returnable_lines_for_supplier,
    to_response,
    write_off_purchase_return,
)

router = APIRouter(prefix="/purchase-returns", tags=["Purchase Returns"])


@router.get("/available", response_model=list[ReturnableLineResponse])
async def get_returnable_lines(
    purchase_order_id: str = Query(..., min_length=1),
    _: User = Depends(get_current_user),
):
    po = await PurchaseOrder.get(purchase_order_id)
    if not po:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Purchase order not found")
    return await list_returnable_lines_for_po(po)


@router.get("/available-by-supplier", response_model=list[ReturnableLineResponse])
async def get_returnable_lines_by_supplier(
    supplier_id: str = Query(..., min_length=1),
    _: User = Depends(get_current_user),
):
    return await list_returnable_lines_for_supplier(supplier_id.strip())


@router.get("/summary", response_model=PurchaseReturnSummaryResponse)
async def get_purchase_return_summary(_: User = Depends(get_current_user)):
    return PurchaseReturnSummaryResponse(**await build_purchase_return_summary())


@router.get("", response_model=PurchaseReturnListResponse)
async def list_purchase_returns(
    purchase_order_id: str = Query(""),
    supplier_id: str = Query(""),
    return_mode: str = Query(""),
    settlement_type: str = Query(""),
    status_filter: str = Query("", alias="status"),
    search: str = Query(""),
    date_from: str = Query(""),
    date_to: str = Query(""),
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=50),
    _: User = Depends(get_current_user),
):
    query: dict = {}
    if purchase_order_id.strip():
        query["purchase_order_id"] = purchase_order_id.strip()
    if supplier_id.strip():
        query["supplier_id"] = supplier_id.strip()
    if return_mode.strip():
        query["return_mode"] = return_mode.strip()
    if settlement_type.strip():
        query["settlement_type"] = settlement_type.strip()
    if status_filter.strip():
        query["status"] = status_filter.strip()
    if date_from.strip() or date_to.strip():
        date_q: dict = {}
        if date_from.strip():
            date_q["$gte"] = date_from.strip()
        if date_to.strip():
            date_q["$lte"] = date_to.strip()
        query["return_date"] = date_q

    q = search.strip()
    if q:
        query["$or"] = [
            {"return_number": {"$regex": q, "$options": "i"}},
            {"supplier_name": {"$regex": q, "$options": "i"}},
            {"order_number": {"$regex": q, "$options": "i"}},
        ]

    total = await PurchaseReturn.find(query).count()
    skip = (page - 1) * page_size
    docs = (
        await PurchaseReturn.find(query)
        .sort([("created_at", -1)])
        .skip(skip)
        .limit(page_size)
        .to_list()
    )
    data = [await to_response(d, include_payments=False) for d in docs]
    return PurchaseReturnListResponse(data=data, total=total)


@router.post("", response_model=PurchaseReturnResponse, status_code=status.HTTP_201_CREATED)
async def create_return(
    body: PurchaseReturnCreate,
    request: Request,
    current_user: User = Depends(require_manager_or_above),
):
    doc = await create_purchase_return(body, current_user=current_user, request=request)
    return await to_response(doc, include_payments=True)


@router.post("/{return_id}/close", response_model=PurchaseReturnResponse)
async def close_return(
    return_id: str,
    request: Request,
    body: PurchaseReturnClose | None = None,
    current_user: User = Depends(require_manager_or_above),
):
    payload = body or PurchaseReturnClose()
    doc = await close_purchase_return(
        return_id,
        current_user=current_user,
        request=request,
        payment_method=payload.payment_method,
        amount_received=payload.amount_received,
        remarks=payload.remarks or "",
        received_date=payload.received_date,
    )
    return await to_response(doc, include_payments=True)


@router.post("/{return_id}/write-off", response_model=PurchaseReturnResponse)
async def write_off_return(
    return_id: str,
    body: PurchaseReturnWriteOff,
    request: Request,
    current_user: User = Depends(require_manager_or_above),
):
    doc = await write_off_purchase_return(
        return_id,
        reason=body.reason,
        current_user=current_user,
        request=request,
    )
    return await to_response(doc, include_payments=True)


@router.get("/{return_id}", response_model=PurchaseReturnResponse)
async def get_purchase_return(
    return_id: str,
    _: User = Depends(get_current_user),
):
    doc = await PurchaseReturn.get(return_id)
    if not doc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Purchase return not found")
    return await to_response(doc, include_payments=True)
