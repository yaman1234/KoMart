from fastapi import APIRouter, Depends, HTTPException, Query, Request, status

from app.auth.dependencies import get_current_user, require_manager_or_above
from app.models.purchase_order import PurchaseOrder
from app.models.purchase_return import PurchaseReturn
from app.models.user import User
from app.schemas.purchase_return import (
    PurchaseReturnCreate,
    PurchaseReturnListResponse,
    PurchaseReturnResponse,
    ReturnableLineResponse,
)
from app.services.purchase_return import (
    list_returnable_lines,
    post_purchase_return,
    _to_response,
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
    return await list_returnable_lines(po)


@router.get("", response_model=PurchaseReturnListResponse)
async def list_purchase_returns(
    purchase_order_id: str = Query(""),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    _: User = Depends(get_current_user),
):
    query: dict = {}
    if purchase_order_id.strip():
        query["purchase_order_id"] = purchase_order_id.strip()
    total = await PurchaseReturn.find(query).count()
    skip = (page - 1) * page_size
    docs = (
        await PurchaseReturn.find(query)
        .sort([("created_at", -1)])
        .skip(skip)
        .limit(page_size)
        .to_list()
    )
    return PurchaseReturnListResponse(
        data=[_to_response(d) for d in docs],
        total=total,
    )


@router.post("", response_model=PurchaseReturnResponse, status_code=status.HTTP_201_CREATED)
async def create_purchase_return(
    body: PurchaseReturnCreate,
    request: Request,
    current_user: User = Depends(require_manager_or_above),
):
    doc = await post_purchase_return(body, current_user=current_user, request=request)
    return _to_response(doc)


@router.get("/{return_id}", response_model=PurchaseReturnResponse)
async def get_purchase_return(
    return_id: str,
    _: User = Depends(get_current_user),
):
    doc = await PurchaseReturn.get(return_id)
    if not doc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Purchase return not found")
    return _to_response(doc)
