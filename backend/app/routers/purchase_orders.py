from fastapi import APIRouter, HTTPException, status, Depends, Query, Request
from math import ceil
from datetime import datetime, timezone, date

from app.auth.dependencies import get_current_user, require_manager_or_above
from app.models.user import User
from app.models.product import Product
from app.models.inventory import InventoryBatch
from app.services.stock import receive_stock
from app.models.purchase_order import (
    PurchaseOrder,
    POStatus,
    PurchaseOrderItem,
    compute_po_status,
)
from app.schemas.purchase_order import (
    PurchaseOrderCreate,
    PurchaseOrderUpdate,
    PurchaseOrderStatusUpdate,
    PurchaseOrderReceiveRequest,
    PurchaseOrderResponse,
    item_to_response,
)
from app.schemas.common import PaginatedResponse
from app.models.audit_log import AuditModule
from app.services.audit import log_audit, po_snapshot
from app.services.store_settings import get_store_settings

router = APIRouter(prefix="/purchase-orders", tags=["Purchase Orders"])


def _to_response(po: PurchaseOrder) -> PurchaseOrderResponse:
    return PurchaseOrderResponse(
        id=str(po.id),
        order_number=po.order_number,
        supplier_id=po.supplier_id,
        supplier_name=po.supplier_name,
        status=po.status,
        items=[item_to_response(i) for i in po.items],
        total_amount=po.total_amount,
        expected_delivery=po.expected_delivery,
        ordered_by=po.ordered_by,
        received_by=po.received_by,
        received_date=po.received_date,
        created_at=po.created_at.isoformat(),
        updated_at=po.updated_at.isoformat(),
    )


async def _next_po_number() -> str:
    settings = await get_store_settings()
    prefix_base = (settings.purchase_order_prefix or "PO").strip().upper()
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    prefix = f"{prefix_base}-{today}-"
    count = await PurchaseOrder.find({"order_number": {"$regex": f"^{prefix}"}}).count()
    return f"{prefix}{str(count + 1).zfill(3)}"


@router.get("", response_model=PaginatedResponse[PurchaseOrderResponse])
async def list_purchase_orders(
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=500),
    search: str = Query(""),
    supplier_id: str = Query(""),
    _: User = Depends(get_current_user),
):
    query = PurchaseOrder.find()
    if supplier_id:
        query = query.find(PurchaseOrder.supplier_id == supplier_id)
    if search:
        query = query.find({"$or": [
            {"order_number": {"$regex": search, "$options": "i"}},
            {"supplier_name": {"$regex": search, "$options": "i"}},
        ]})

    total = await query.count()
    orders = await query.sort("-created_at").skip((page - 1) * page_size).limit(page_size).to_list()
    return PaginatedResponse(
        data=[_to_response(po) for po in orders],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=ceil(total / page_size) if total else 1,
    )


@router.post("", response_model=PurchaseOrderResponse, status_code=status.HTTP_201_CREATED)
async def create_purchase_order(
    body: PurchaseOrderCreate,
    request: Request,
    current_user: User = Depends(require_manager_or_above),
):
    po_data = body.model_dump()
    if body.status == POStatus.ordered:
        po_data["ordered_by"] = current_user.name
    po = PurchaseOrder(
        order_number=await _next_po_number(),
        **po_data,
    )
    await po.insert()
    await log_audit(
        module=AuditModule.purchase_orders,
        action="create",
        user=current_user,
        request=request,
        entity_type="purchase_order",
        entity_id=str(po.id),
        new=po_snapshot(po),
    )
    return _to_response(po)


@router.get("/{po_id}", response_model=PurchaseOrderResponse)
async def get_purchase_order(po_id: str, _: User = Depends(get_current_user)):
    po = await PurchaseOrder.get(po_id)
    if not po:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Purchase order not found")
    return _to_response(po)


@router.patch("/{po_id}", response_model=PurchaseOrderResponse)
async def update_purchase_order(
    po_id: str,
    body: PurchaseOrderUpdate,
    request: Request,
    current_user: User = Depends(require_manager_or_above),
):
    po = await PurchaseOrder.get(po_id)
    if not po:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Purchase order not found")
    if po.status != POStatus.draft:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail="Only draft purchase orders can be edited",
        )
    if body.status not in (POStatus.draft, POStatus.ordered):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail="Draft orders can only be saved as draft or placed as ordered",
        )

    before = po_snapshot(po)
    updates: dict = {
        **body.model_dump(),
        "updated_at": datetime.now(timezone.utc),
    }
    if body.status == POStatus.ordered and not po.ordered_by:
        updates["ordered_by"] = current_user.name

    await po.set(updates)
    refreshed = await PurchaseOrder.get(po_id)
    await log_audit(
        module=AuditModule.purchase_orders,
        action="update",
        user=current_user,
        request=request,
        entity_type="purchase_order",
        entity_id=po_id,
        previous=before,
        new=po_snapshot(refreshed),  # type: ignore[arg-type]
    )
    return _to_response(refreshed)  # type: ignore[arg-type]


@router.patch("/{po_id}/status", response_model=PurchaseOrderResponse)
async def update_status(
    po_id: str,
    body: PurchaseOrderStatusUpdate,
    request: Request,
    current_user: User = Depends(require_manager_or_above),
):
    if body.status in (POStatus.partial, POStatus.received):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail="Use the receive endpoint to process received items",
        )

    po = await PurchaseOrder.get(po_id)
    if not po:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Purchase order not found")

    before = po_snapshot(po)
    updates: dict = {"status": body.status, "updated_at": datetime.now(timezone.utc)}
    if body.status == POStatus.ordered and not po.ordered_by:
        updates["ordered_by"] = current_user.name

    await po.set(updates)
    refreshed = await PurchaseOrder.get(po_id)
    await log_audit(
        module=AuditModule.purchase_orders,
        action="status_change",
        user=current_user,
        request=request,
        entity_type="purchase_order",
        entity_id=po_id,
        previous=before,
        new=po_snapshot(refreshed),  # type: ignore[arg-type]
    )
    return _to_response(refreshed)  # type: ignore[arg-type]


@router.post("/{po_id}/receive", response_model=PurchaseOrderResponse)
async def receive_items(
    po_id: str,
    body: PurchaseOrderReceiveRequest,
    request: Request,
    current_user: User = Depends(require_manager_or_above),
):
    po = await PurchaseOrder.get(po_id)
    if not po:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Purchase order not found")

    if po.status not in (POStatus.ordered, POStatus.partial):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail="Only ordered or partially received purchase orders can be processed",
        )

    if not body.items:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="No items to receive")

    before = po_snapshot(po)
    item_map = {i.product_id: i for i in po.items}
    updated_items: list[PurchaseOrderItem] = list(po.items)
    now = datetime.now(timezone.utc)
    batch_seq = await InventoryBatch.count()

    for receive in body.items:
        if receive.product_id not in item_map:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                detail=f"Product {receive.product_id} is not on this purchase order",
            )

        idx = next(i for i, it in enumerate(updated_items) if it.product_id == receive.product_id)
        item = updated_items[idx]
        remaining = item.quantity - item.received_quantity
        if remaining <= 0:
            continue

        delta = min(receive.receive_quantity, remaining)
        if delta <= 0:
            continue

        product = await Product.get(item.product_id)
        if not product:
            raise HTTPException(
                status.HTTP_404_NOT_FOUND,
                detail=f"Product {item.product_name} not found",
            )

        batch_seq += 1
        await receive_stock(
            item.product_id,
            f"PO-{po.order_number}-{batch_seq:03d}",
            delta,
            expiry_date=receive.expiry_date,
            purchase_order_id=str(po.id),
            unit_cost=item.unit_cost,
            created_by=current_user.name,
        )

        updated_items[idx] = item.model_copy(
            update={"received_quantity": item.received_quantity + delta},
        )

    if updated_items == list(po.items):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="No stock was received")

    new_status = compute_po_status(updated_items)
    await po.set({
        "items": updated_items,
        "status": new_status,
        "received_by": current_user.name,
        "received_date": date.today().isoformat(),
        "updated_at": now,
    })

    refreshed = await PurchaseOrder.get(po_id)
    await log_audit(
        module=AuditModule.purchase_orders,
        action="receive",
        user=current_user,
        request=request,
        entity_type="purchase_order",
        entity_id=po_id,
        previous=before,
        new=po_snapshot(refreshed),  # type: ignore[arg-type]
    )
    return _to_response(refreshed)  # type: ignore[arg-type]
