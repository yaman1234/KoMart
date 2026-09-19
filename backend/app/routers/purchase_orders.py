from fastapi import APIRouter, HTTPException, status, Depends, Query, Request
from math import ceil
from datetime import datetime, timezone
import logging

from app.auth.dependencies import get_current_user, require_manager_or_above
from app.models.user import User
from app.models.purchase_order import (
    PurchaseOrder,
    POStatus,
    PaymentStatus,
    compute_payment_status,
    compute_line_subtotal,
    compute_order_total,
)
from app.schemas.purchase_order import (
    PurchaseOrderCreate,
    PurchaseOrderUpdate,
    PurchaseOrderStatusUpdate,
    PurchaseOrderRejectRequest,
    PurchaseOrderReceiveRequest,
    PurchaseOrderBillImagesUpdate,
    PurchaseOrderPaymentCreate,
    PurchaseOrderResponse,
    PurchaseOrderListResponse,
    item_to_response,
    payment_to_response,
)
from app.schemas.common import PaginatedResponse
from app.models.audit_log import AuditModule
from app.services.audit import log_audit, po_snapshot
from app.services.store_settings import get_store_settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/purchase-orders", tags=["Purchase Orders"])


def _resolve_ordered_by(body_ordered_by: str | None, current_user: User, placing_order: bool) -> str | None:
    if body_ordered_by and body_ordered_by.strip():
        return body_ordered_by.strip()
    if placing_order:
        return current_user.name
    return None


def _allowed_update_status(po: PurchaseOrder, target: POStatus) -> bool:
    if po.status == POStatus.received:
        return target in (POStatus.received, POStatus.partial)
    if target in (POStatus.received, POStatus.cancelled, POStatus.partial) and target != po.status:
        if target == POStatus.partial:
            return po.status in (POStatus.partial, POStatus.received)
        return False
    if po.status in (POStatus.ordered, POStatus.partial, POStatus.received) and target == POStatus.draft:
        return False
    return target in (POStatus.draft, POStatus.ordered, POStatus.partial, POStatus.received)


def _merge_items(existing: PurchaseOrder, incoming: list) -> list:
    received_by_product = {item.product_id: item.received_quantity for item in existing.items}
    merged = []
    for item in incoming:
        data = item.model_dump() if hasattr(item, "model_dump") else dict(item)
        received = received_by_product.get(data["product_id"], 0)
        if data["quantity"] < received:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                detail=f"Quantity for {data['product_name']} cannot be less than received quantity ({received})",
            )
        data["received_quantity"] = received
        merged.append(data)
    return merged


def _dt_iso(value) -> str:
    if value is None:
        return ""
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return str(value)


def _to_response(po: PurchaseOrder) -> PurchaseOrderResponse:
    amount_paid = float(getattr(po, "amount_paid", 0) or 0)
    discount = float(getattr(po, "discount", 0) or 0)
    tax = float(getattr(po, "tax", 0) or 0)
    shipping = float(getattr(po, "shipping", 0) or 0)
    other_charges = float(getattr(po, "other_charges", 0) or 0)
    remarks = getattr(po, "remarks", "") or ""
    supplier_reference = getattr(po, "supplier_reference", "") or ""
    subtotal = compute_line_subtotal(po.items or [])
    total_amount = float(getattr(po, "total_amount", 0) or 0)
    raw_status = getattr(po, "payment_status", None)
    if isinstance(raw_status, PaymentStatus):
        payment_status = raw_status
    elif raw_status:
        try:
            payment_status = PaymentStatus(str(raw_status).strip().lower())
        except ValueError:
            payment_status = compute_payment_status(amount_paid, total_amount)
    else:
        payment_status = compute_payment_status(amount_paid, total_amount)

    payments = getattr(po, "payments", None) or []
    approved_at = getattr(po, "approved_at", None)
    return PurchaseOrderResponse(
        id=str(po.id),
        order_number=po.order_number,
        supplier_id=po.supplier_id,
        supplier_name=po.supplier_name,
        status=po.status,
        items=[item_to_response(i) for i in (po.items or [])],
        total_amount=total_amount,
        subtotal=subtotal,
        discount=discount,
        tax=tax,
        shipping=shipping,
        other_charges=other_charges,
        remarks=remarks,
        supplier_reference=supplier_reference,
        bill_no=getattr(po, "bill_no", "") or "",
        bill_images=list(getattr(po, "bill_images", None) or []),
        amount_paid=amount_paid,
        payment_status=payment_status,
        payments=[payment_to_response(p) for p in payments],
        expected_delivery=po.expected_delivery,
        ordered_by=po.ordered_by,
        received_by=po.received_by,
        received_date=po.received_date,
        approved_by=getattr(po, "approved_by", None),
        approved_at=_dt_iso(approved_at) if approved_at else None,
        rejected_reason=getattr(po, "rejected_reason", "") or "",
        created_at=_dt_iso(getattr(po, "created_at", None)),
        updated_at=_dt_iso(getattr(po, "updated_at", None)),
    )


def _parse_po_doc(doc: dict) -> PurchaseOrder | None:
    """Parse a raw Mongo PO doc without failing the whole list on one bad row."""
    try:
        data = dict(doc)
        oid = data.pop("_id", None)
        po = PurchaseOrder.model_validate(data)
        if oid is not None:
            po.id = oid
        return po
    except Exception:
        logger.exception("Failed to parse purchase_order %s", doc.get("_id"))
        return None


def _soft_response_from_doc(doc: dict) -> PurchaseOrderResponse:
    """Minimal response when full Beanie/Pydantic parse fails."""
    amount_paid = float(doc.get("amount_paid") or 0)
    total_amount = float(doc.get("total_amount") or 0)
    raw_status = doc.get("payment_status")
    try:
        payment_status = (
            PaymentStatus(str(raw_status).strip().lower())
            if raw_status
            else compute_payment_status(amount_paid, total_amount)
        )
    except ValueError:
        payment_status = compute_payment_status(amount_paid, total_amount)

    raw_po_status = doc.get("status") or "draft"
    try:
        po_status = POStatus(str(raw_po_status).strip().lower())
    except ValueError:
        po_status = POStatus.draft

    return PurchaseOrderResponse(
        id=str(doc.get("_id") or ""),
        order_number=str(doc.get("order_number") or ""),
        supplier_id=str(doc.get("supplier_id") or ""),
        supplier_name=str(doc.get("supplier_name") or ""),
        status=po_status,
        items=[],
        total_amount=total_amount if total_amount >= 0 else 0.0,
        subtotal=float(doc.get("subtotal") or total_amount or 0),
        discount=float(doc.get("discount") or 0),
        tax=float(doc.get("tax") or 0),
        shipping=float(doc.get("shipping") or 0),
        other_charges=float(doc.get("other_charges") or 0),
        remarks=str(doc.get("remarks") or ""),
        supplier_reference=str(doc.get("supplier_reference") or ""),
        bill_no=str(doc.get("bill_no") or ""),
        bill_images=[str(u) for u in (doc.get("bill_images") or []) if u],
        amount_paid=amount_paid if amount_paid >= 0 else 0.0,
        payment_status=payment_status,
        payments=[],
        expected_delivery=doc.get("expected_delivery"),
        ordered_by=doc.get("ordered_by"),
        received_by=doc.get("received_by"),
        received_date=doc.get("received_date"),
        approved_by=doc.get("approved_by"),
        approved_at=_dt_iso(doc.get("approved_at")) if doc.get("approved_at") else None,
        rejected_reason=str(doc.get("rejected_reason") or ""),
        created_at=_dt_iso(doc.get("created_at")),
        updated_at=_dt_iso(doc.get("updated_at")),
    )


def _doc_to_response(doc: dict) -> PurchaseOrderResponse:
    po = _parse_po_doc(doc)
    if po is not None:
        try:
            return _to_response(po)
        except Exception:
            logger.exception("Failed to map purchase_order %s", doc.get("_id"))
    return _soft_response_from_doc(doc)


async def _next_po_number() -> str:
    settings = await get_store_settings()
    prefix_base = (settings.purchase_order_prefix or "PO").strip().upper()
    prefix = f"{prefix_base}-"
    count = await PurchaseOrder.find({"order_number": {"$regex": f"^{prefix}"}}).count()
    return f"{prefix}{str(count + 1).zfill(4)}"


@router.get("", response_model=PurchaseOrderListResponse)
async def list_purchase_orders(
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=500),
    search: str = Query(""),
    supplier_id: str = Query(""),
    status: str = Query(""),
    payment_status: str = Query(""),
    _: User = Depends(get_current_user),
):
    and_clauses: list[dict] = []

    if supplier_id:
        and_clauses.append({"supplier_id": supplier_id})

    status_filter = (status or "").strip().lower()
    if status_filter:
        raw_statuses = [part.strip() for part in status_filter.split(",") if part.strip()]
        parsed: list[str] = []
        for part in raw_statuses:
            try:
                parsed.append(POStatus(part).value)
            except ValueError as exc:
                raise HTTPException(
                    status.HTTP_400_BAD_REQUEST,
                    detail=f"Invalid status. Use one of: {', '.join(s.value for s in POStatus)}",
                ) from exc
        if len(parsed) == 1:
            and_clauses.append({"status": parsed[0]})
        elif parsed:
            and_clauses.append({"status": {"$in": parsed}})

    payment_filter = (payment_status or "").strip().lower()
    if payment_filter:
        try:
            pay_status = PaymentStatus(payment_filter)
        except ValueError as exc:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid payment_status. Use one of: {', '.join(s.value for s in PaymentStatus)}",
            ) from exc
        if pay_status == PaymentStatus.unpaid:
            # Include legacy docs with missing/null/empty payment_status
            and_clauses.append({
                "$or": [
                    {"payment_status": PaymentStatus.unpaid.value},
                    {"payment_status": None},
                    {"payment_status": ""},
                    {"payment_status": {"$exists": False}},
                ]
            })
        else:
            and_clauses.append({"payment_status": pay_status.value})

    if search:
        and_clauses.append({
            "$or": [
                {"order_number": {"$regex": search, "$options": "i"}},
                {"supplier_name": {"$regex": search, "$options": "i"}},
            ]
        })

    if not and_clauses:
        match: dict = {}
    elif len(and_clauses) == 1:
        match = and_clauses[0]
    else:
        match = {"$and": and_clauses}

    col = PurchaseOrder.get_motor_collection()
    total = await col.count_documents(match)

    # Aggregate summary totals without loading every document into Python first.
    summary_rows = await col.aggregate([
        {"$match": match} if match else {"$match": {}},
        {
            "$group": {
                "_id": None,
                "received_total_amount": {
                    "$sum": {
                        "$cond": [
                            {"$eq": ["$status", POStatus.received.value]},
                            {"$ifNull": ["$total_amount", 0]},
                            0,
                        ]
                    }
                },
                "outstanding_amount": {
                    "$sum": {
                        "$cond": [
                            {"$ne": ["$status", POStatus.cancelled.value]},
                            {
                                "$max": [
                                    0,
                                    {
                                        "$subtract": [
                                            {"$ifNull": ["$total_amount", 0]},
                                            {"$ifNull": ["$amount_paid", 0]},
                                        ]
                                    },
                                ]
                            },
                            0,
                        ]
                    }
                },
            }
        },
    ]).to_list(1)
    received_total_amount = (
        round(float(summary_rows[0]["received_total_amount"] or 0), 2) if summary_rows else 0.0
    )
    outstanding_amount = (
        round(float(summary_rows[0]["outstanding_amount"] or 0), 2) if summary_rows else 0.0
    )

    # Motor fetch + per-doc soft parse so one legacy/corrupt PO cannot 500 the list.
    raw_docs = (
        await col.find(match)
        .sort([("created_at", -1)])
        .skip((page - 1) * page_size)
        .limit(page_size)
        .to_list(page_size)
    )
    data = [_doc_to_response(doc) for doc in raw_docs]
    return PurchaseOrderListResponse(
        data=data,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=ceil(total / page_size) if total else 1,
        received_total_amount=received_total_amount,
        outstanding_amount=outstanding_amount,
    )


@router.post("", response_model=PurchaseOrderResponse, status_code=status.HTTP_201_CREATED)
async def create_purchase_order(
    body: PurchaseOrderCreate,
    request: Request,
    current_user: User = Depends(require_manager_or_above),
):
    po_data = body.model_dump()
    if body.status not in (POStatus.draft, POStatus.ordered):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail="New purchase orders must be created as draft or ordered (Place Order)",
        )
    discount = float(po_data.get("discount") or 0)
    tax = float(po_data.get("tax") or 0)
    shipping = float(po_data.get("shipping") or 0)
    other_charges = float(po_data.get("other_charges") or 0)
    remarks = (po_data.get("remarks") or "").strip()
    supplier_reference = (po_data.get("supplier_reference") or "").strip()
    subtotal = compute_line_subtotal(body.items)
    total_amount = compute_order_total(subtotal, discount, tax, shipping, other_charges)
    po_data["discount"] = discount
    po_data["tax"] = tax
    po_data["shipping"] = shipping
    po_data["other_charges"] = other_charges
    po_data["remarks"] = remarks
    po_data["supplier_reference"] = supplier_reference
    po_data["total_amount"] = total_amount
    # Manager shortcut: Place Order (ordered) skips approval. submit endpoint for formal flow.
    placing_order = body.status == POStatus.ordered
    ordered_by = _resolve_ordered_by(body.ordered_by, current_user, placing_order)
    if ordered_by:
        po_data["ordered_by"] = ordered_by
    elif not placing_order:
        po_data.pop("ordered_by", None)
    if placing_order:
        po_data["approved_by"] = current_user.name
        po_data["approved_at"] = datetime.now(timezone.utc)
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
    if po.status == POStatus.cancelled:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail="Cancelled purchase orders cannot be edited",
        )
    if po.status != POStatus.draft:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            detail=(
                "Only draft purchase orders can be edited. "
                "Cancel the order and create a new one, or use Purchase Return "
                "to send leftover goods back to the supplier."
            ),
        )
    if not _allowed_update_status(po, body.status):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail="Invalid status for this purchase order update",
        )

    before = po_snapshot(po)
    try:
        merged_items = _merge_items(po, body.items)
    except HTTPException:
        raise

    amount_paid = float(getattr(po, "amount_paid", 0) or 0)
    discount = float(getattr(body, "discount", 0) or 0)
    tax = float(getattr(body, "tax", 0) or 0)
    shipping = float(getattr(body, "shipping", 0) or 0)
    other_charges = float(getattr(body, "other_charges", 0) or 0)
    remarks = (getattr(body, "remarks", None) or "").strip()
    supplier_reference = (getattr(body, "supplier_reference", None) or "").strip()
    subtotal = compute_line_subtotal(merged_items)
    total_amount = compute_order_total(subtotal, discount, tax, shipping, other_charges)
    if total_amount + 0.001 < amount_paid:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Total amount cannot be less than amount already paid ({amount_paid:.2f}). "
                "Delete the extra PO expense to reverse payment first."
            ),
        )

    updates: dict = {
        **body.model_dump(),
        "items": merged_items,
        "discount": discount,
        "tax": tax,
        "shipping": shipping,
        "other_charges": other_charges,
        "remarks": remarks,
        "supplier_reference": supplier_reference,
        "total_amount": total_amount,
        "payment_status": compute_payment_status(amount_paid, total_amount),
        "updated_at": datetime.now(timezone.utc),
    }
    placing_order = body.status == POStatus.ordered
    if body.ordered_by and body.ordered_by.strip():
        updates["ordered_by"] = body.ordered_by.strip()
    elif placing_order:
        resolved = _resolve_ordered_by(None, current_user, True)
        if resolved:
            updates["ordered_by"] = resolved
    if placing_order:
        updates["approved_by"] = current_user.name
        updates["approved_at"] = datetime.now(timezone.utc)

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


@router.post("/{po_id}/submit", response_model=PurchaseOrderResponse)
async def submit_purchase_order_endpoint(
    po_id: str,
    request: Request,
    current_user: User = Depends(require_manager_or_above),
):
    from app.services.po_workflow import submit_purchase_order
    po = await PurchaseOrder.get(po_id)
    if not po:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Purchase order not found")
    refreshed = await submit_purchase_order(po, current_user=current_user, request=request)
    return _to_response(refreshed)


@router.post("/{po_id}/approve", response_model=PurchaseOrderResponse)
async def approve_purchase_order_endpoint(
    po_id: str,
    request: Request,
    current_user: User = Depends(require_manager_or_above),
):
    from app.services.po_workflow import approve_purchase_order
    po = await PurchaseOrder.get(po_id)
    if not po:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Purchase order not found")
    refreshed = await approve_purchase_order(po, current_user=current_user, request=request)
    return _to_response(refreshed)


@router.post("/{po_id}/reject", response_model=PurchaseOrderResponse)
async def reject_purchase_order_endpoint(
    po_id: str,
    body: PurchaseOrderRejectRequest,
    request: Request,
    current_user: User = Depends(require_manager_or_above),
):
    from app.services.po_workflow import reject_purchase_order
    po = await PurchaseOrder.get(po_id)
    if not po:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Purchase order not found")
    refreshed = await reject_purchase_order(
        po, reason=body.reason, current_user=current_user, request=request,
    )
    return _to_response(refreshed)


@router.post("/{po_id}/send", response_model=PurchaseOrderResponse)
async def send_purchase_order_endpoint(
    po_id: str,
    request: Request,
    current_user: User = Depends(require_manager_or_above),
):
    from app.services.po_workflow import send_purchase_order
    po = await PurchaseOrder.get(po_id)
    if not po:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Purchase order not found")
    refreshed = await send_purchase_order(po, current_user=current_user, request=request)
    return _to_response(refreshed)


@router.post("/{po_id}/close", response_model=PurchaseOrderResponse)
async def close_purchase_order_endpoint(
    po_id: str,
    request: Request,
    current_user: User = Depends(require_manager_or_above),
):
    from app.services.po_workflow import close_purchase_order
    po = await PurchaseOrder.get(po_id)
    if not po:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Purchase order not found")
    refreshed = await close_purchase_order(po, current_user=current_user, request=request)
    return _to_response(refreshed)


@router.patch("/{po_id}/status", response_model=PurchaseOrderResponse)
async def update_status(
    po_id: str,
    body: PurchaseOrderStatusUpdate,
    request: Request,
    current_user: User = Depends(require_manager_or_above),
):
    """Legacy status endpoint: cancel (admin) or Place Order (draft→ordered) only.

    All other transitions must use submit/approve/reject/send/close or receive.
    """
    po = await PurchaseOrder.get(po_id)
    if not po:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Purchase order not found")

    if body.status == POStatus.cancelled:
        from app.models.user import UserRole
        if current_user.role != UserRole.admin:
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                detail="Only admins can cancel purchase orders",
            )
        from app.services.po_cancel import cancel_purchase_order
        refreshed = await cancel_purchase_order(
            po,
            current_user=current_user,
            request=request,
        )
        return _to_response(refreshed)

    # Place Order shortcut: draft → ordered only
    if body.status == POStatus.ordered:
        if po.status != POStatus.draft:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                detail="Only draft purchase orders can be placed via status update",
            )
        before = po_snapshot(po)
        now = datetime.now(timezone.utc)
        updates: dict = {
            "status": POStatus.ordered,
            "updated_at": now,
            "approved_by": current_user.name,
            "approved_at": now,
        }
        if not po.ordered_by:
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

    raise HTTPException(
        status.HTTP_400_BAD_REQUEST,
        detail=(
            "Use submit/approve/reject/send/close for workflow, "
            "receive for goods receipt, or cancel to void the order"
        ),
    )


@router.post("/{po_id}/payments", response_model=PurchaseOrderResponse)
async def create_payment(
    po_id: str,
    body: PurchaseOrderPaymentCreate,
    request: Request,
    current_user: User = Depends(require_manager_or_above),
):
    from app.services.purchase_invoice_service import pay_po_via_open_invoice
    refreshed = await pay_po_via_open_invoice(
        po_id,
        body,
        current_user=current_user,
        request=request,
    )
    return _to_response(refreshed)


@router.post("/{po_id}/receive", response_model=PurchaseOrderResponse)
async def receive_items(
    po_id: str,
    body: PurchaseOrderReceiveRequest,
    request: Request,
    current_user: User = Depends(require_manager_or_above),
):
    from app.services.goods_receipt_service import create_and_confirm_goods_receipt
    _gr, refreshed = await create_and_confirm_goods_receipt(
        po_id,
        body.items,
        created_by=current_user.name,
        current_user=current_user,
        request=request,
        bill_no=(body.bill_no or "").strip(),
        bill_images=list(body.bill_images or []),
    )
    return _to_response(refreshed)


@router.patch("/{po_id}/bill-images", response_model=PurchaseOrderResponse)
async def update_bill_images(
    po_id: str,
    body: PurchaseOrderBillImagesUpdate,
    request: Request,
    current_user: User = Depends(require_manager_or_above),
):
    po = await PurchaseOrder.get(po_id)
    if not po:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Purchase order not found")
    if po.status == POStatus.cancelled:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Cannot update a cancelled purchase order")
    before = po_snapshot(po)
    images = [str(u).strip() for u in (body.bill_images or []) if str(u).strip()]
    now = datetime.now(timezone.utc)
    await po.set({"bill_images": images, "updated_at": now})
    refreshed = await PurchaseOrder.get(po_id)
    if not refreshed:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Purchase order not found")
    await log_audit(
        module=AuditModule.purchase_orders,
        action="update_bill_images",
        user=current_user,
        request=request,
        entity_type="purchase_order",
        entity_id=po_id,
        previous=before,
        new=po_snapshot(refreshed),
    )
    return _to_response(refreshed)


@router.get("/{po_id}/goods-receipts")
async def list_po_goods_receipts(
    po_id: str,
    _: User = Depends(get_current_user),
):
    po = await PurchaseOrder.get(po_id)
    if not po:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Purchase order not found")
    from app.services.goods_receipt_service import list_goods_receipts_for_po
    return {"data": await list_goods_receipts_for_po(po_id), "total": 0}


@router.get("/{po_id}/invoices")
async def list_po_invoices(
    po_id: str,
    _: User = Depends(get_current_user),
):
    po = await PurchaseOrder.get(po_id)
    if not po:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Purchase order not found")
    from app.services.purchase_invoice_service import list_invoices_for_po
    data = await list_invoices_for_po(po_id)
    return {"data": data, "total": len(data)}
