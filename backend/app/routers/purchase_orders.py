from fastapi import APIRouter, HTTPException, status, Depends, Query, Request
from math import ceil
from datetime import datetime, timezone
import logging

from app.auth.dependencies import get_current_user, require_manager_or_above
from app.models.user import User
from app.services.po_receive import receive_purchase_order_items
from app.services.po_payment import record_payment
from app.models.purchase_order import (
    PurchaseOrder,
    POStatus,
    PaymentStatus,
    compute_payment_status,
)
from app.schemas.purchase_order import (
    PurchaseOrderCreate,
    PurchaseOrderUpdate,
    PurchaseOrderStatusUpdate,
    PurchaseOrderBillUpdate,
    PurchaseOrderReceiveRequest,
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
from app.services.po_totals import compute_po_totals
from app.services.po_product_sync import sync_product_uoms_from_po_lines

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/purchase-orders", tags=["Purchase Orders"])


def _resolve_ordered_by(body_ordered_by: str | None, current_user: User, placing_order: bool) -> str | None:
    if body_ordered_by and body_ordered_by.strip():
        return body_ordered_by.strip()
    if placing_order:
        return current_user.name
    return None


def _po_is_editable(po: PurchaseOrder) -> bool:
    if po.status in (POStatus.received, POStatus.cancelled):
        return False
    if po.status == POStatus.partial:
        return True
    if po.status == POStatus.ordered:
        return all(item.received_quantity == 0 for item in po.items)
    return po.status == POStatus.draft


def _allowed_update_status(po: PurchaseOrder, target: POStatus) -> bool:
    if target in (POStatus.received, POStatus.cancelled, POStatus.partial) and target != po.status:
        if target == POStatus.partial:
            return po.status == POStatus.partial
        return False
    if po.status in (POStatus.ordered, POStatus.partial) and target == POStatus.draft:
        return False
    return target in (POStatus.draft, POStatus.ordered, POStatus.partial)


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


def _normalized_totals(po: PurchaseOrder) -> dict[str, float]:
    items = getattr(po, "items", None) or []
    discount = float(getattr(po, "discount", 0) or 0)
    charges = float(getattr(po, "additional_charges", 0) or 0)
    computed = compute_po_totals(items, discount, charges)
    # Legacy docs with no items parse: fall back to stored total as subtotal/total
    if not items and computed["total_amount"] == 0:
        stored = round(float(getattr(po, "total_amount", 0) or 0), 2)
        return {
            "subtotal": stored,
            "discount": round(max(0.0, discount), 2),
            "additional_charges": round(max(0.0, charges), 2),
            "total_amount": stored,
        }
    return computed


def _to_response(po: PurchaseOrder) -> PurchaseOrderResponse:
    amount_paid = float(getattr(po, "amount_paid", 0) or 0)
    totals = _normalized_totals(po)
    total_amount = totals["total_amount"]
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
    bill_number = (getattr(po, "bill_number", None) or "").strip() or None
    bill_images = [str(u).strip() for u in (getattr(po, "bill_images", None) or []) if str(u).strip()]
    items = [item_to_response(i) for i in (po.items or [])]
    return PurchaseOrderResponse(
        id=str(po.id),
        order_number=po.order_number,
        supplier_id=po.supplier_id,
        supplier_name=po.supplier_name,
        status=po.status,
        items=items,
        items_count=len(items),
        subtotal=totals["subtotal"],
        discount=totals["discount"],
        additional_charges=totals["additional_charges"],
        total_amount=total_amount,
        amount_paid=amount_paid,
        payment_status=payment_status,
        payments=[payment_to_response(p) for p in payments],
        expected_delivery=po.expected_delivery,
        ordered_by=po.ordered_by,
        received_by=po.received_by,
        received_date=po.received_date,
        bill_number=bill_number,
        bill_images=bill_images,
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

    items_count = int(doc.get("_items_count") or 0)
    if not items_count and doc.get("items") is not None:
        items_count = len(doc.get("items") or [])

    return PurchaseOrderResponse(
        id=str(doc.get("_id") or ""),
        order_number=str(doc.get("order_number") or ""),
        supplier_id=str(doc.get("supplier_id") or ""),
        supplier_name=str(doc.get("supplier_name") or ""),
        status=po_status,
        items=[],
        items_count=items_count,
        subtotal=round(float(doc.get("subtotal") or total_amount or 0), 2),
        discount=round(float(doc.get("discount") or 0), 2),
        additional_charges=round(float(doc.get("additional_charges") or 0), 2),
        total_amount=total_amount if total_amount >= 0 else 0.0,
        amount_paid=amount_paid if amount_paid >= 0 else 0.0,
        payment_status=payment_status,
        payments=[],
        expected_delivery=doc.get("expected_delivery"),
        ordered_by=doc.get("ordered_by"),
        received_by=doc.get("received_by"),
        received_date=doc.get("received_date"),
        bill_number=(str(doc.get("bill_number") or "").strip() or None),
        bill_images=[str(u).strip() for u in (doc.get("bill_images") or []) if str(u).strip()],
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


# Frontend sortBy (camelCase or snake) → Mongo field. `_items_count` is computed in aggregation.
_PO_LIST_SORT_FIELDS: dict[str, str] = {
    "order_number": "order_number",
    "ordernumber": "order_number",
    "supplier_name": "supplier_name",
    "suppliername": "supplier_name",
    "supplier": "supplier_name",
    "bill_number": "bill_number",
    "billnumber": "bill_number",
    "status": "status",
    "payment_status": "payment_status",
    "paymentstatus": "payment_status",
    "payment": "payment_status",
    "items": "_items_count",
    "items_count": "_items_count",
    "itemscount": "_items_count",
    "total_amount": "total_amount",
    "totalamount": "total_amount",
    "total": "total_amount",
    "amount_paid": "amount_paid",
    "amountpaid": "amount_paid",
    "paid": "amount_paid",
    "ordered_by": "ordered_by",
    "orderedby": "ordered_by",
    "created_at": "created_at",
    "createdat": "created_at",
    "created": "created_at",
    "received_date": "received_date",
    "receiveddate": "received_date",
    "expected_delivery": "expected_delivery",
    "expecteddelivery": "expected_delivery",
    "delivery": "expected_delivery",
}


def _resolve_po_list_sort(sort_by: str, sort_order: str) -> tuple[str, int]:
    key = (sort_by or "").strip().lower().replace("-", "_")
    field = _PO_LIST_SORT_FIELDS.get(key, "created_at")
    direction = 1 if (sort_order or "").strip().lower() == "asc" else -1
    return field, direction


@router.get("", response_model=PurchaseOrderListResponse)
async def list_purchase_orders(
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    search: str = Query(""),
    supplier_id: str = Query(""),
    status: str = Query(""),
    payment_status: str = Query(""),
    sort_by: str = Query("created_at"),
    sort_order: str = Query("desc", pattern="^(|asc|desc)$"),
    lean: bool = Query(False, description="Omit line items/payments/images for fast pickers"),
    include_summary: bool = Query(True, description="Include store-wide KPI totals"),
    _: User = Depends(get_current_user),
):
    and_clauses: list[dict] = []

    if supplier_id:
        and_clauses.append({"supplier_id": supplier_id})

    status_filter = (status or "").strip().lower()
    if status_filter:
        status_parts = [p.strip() for p in status_filter.split(",") if p.strip()]
        parsed_statuses: list[str] = []
        for part in status_parts:
            try:
                parsed_statuses.append(POStatus(part).value)
            except ValueError as exc:
                raise HTTPException(
                    status.HTTP_400_BAD_REQUEST,
                    detail=f"Invalid status. Use one of: {', '.join(s.value for s in POStatus)}",
                ) from exc
        if len(parsed_statuses) == 1:
            and_clauses.append({"status": parsed_statuses[0]})
        elif parsed_statuses:
            and_clauses.append({"status": {"$in": parsed_statuses}})

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

    received_total_amount = 0.0
    outstanding_amount = 0.0
    if include_summary:
        # KPI match ignores status/payment filters so list cards stay store-wide.
        kpi_clauses: list[dict] = []
        if supplier_id:
            kpi_clauses.append({"supplier_id": supplier_id})
        if search:
            kpi_clauses.append({
                "$or": [
                    {"order_number": {"$regex": search, "$options": "i"}},
                    {"supplier_name": {"$regex": search, "$options": "i"}},
                ]
            })
        if not kpi_clauses:
            kpi_match: dict = {}
        elif len(kpi_clauses) == 1:
            kpi_match = kpi_clauses[0]
        else:
            kpi_match = {"$and": kpi_clauses}

        summary_rows = await col.aggregate([
            {"$match": kpi_match} if kpi_match else {"$match": {}},
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

    sort_field, sort_dir = _resolve_po_list_sort(sort_by, sort_order)
    # Always compute item count so Items column sorting works on both lean/full list.
    pipeline: list[dict] = [
        {"$match": match} if match else {"$match": {}},
        {
            "$addFields": {
                "_items_count": {"$size": {"$ifNull": ["$items", []]}},
            }
        },
        {"$sort": {sort_field: sort_dir, "_id": sort_dir}},
        {"$skip": (page - 1) * page_size},
        {"$limit": page_size},
    ]
    if lean:
        pipeline.append({"$project": {"items": 0, "payments": 0, "bill_images": 0}})

    raw_docs = await col.aggregate(pipeline).to_list(page_size)
    data = (
        [_soft_response_from_doc(doc) for doc in raw_docs]
        if lean
        else [_doc_to_response(doc) for doc in raw_docs]
    )
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
    totals = compute_po_totals(body.items, body.discount, body.additional_charges)
    po_data.update(totals)
    placing_order = body.status == POStatus.ordered
    ordered_by = _resolve_ordered_by(body.ordered_by, current_user, placing_order)
    if ordered_by:
        po_data["ordered_by"] = ordered_by
    elif not placing_order:
        po_data.pop("ordered_by", None)
    bill_number = (po_data.get("bill_number") or "").strip() or None
    po_data["bill_number"] = bill_number
    po_data["bill_images"] = [str(u).strip() for u in (po_data.get("bill_images") or []) if str(u).strip()]
    po = PurchaseOrder(
        order_number=await _next_po_number(),
        **po_data,
    )
    await po.insert()
    if placing_order:
        await sync_product_uoms_from_po_lines(po.items)
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
    if not _po_is_editable(po):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail="Only draft, ordered, or partial purchase orders can be edited",
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
    totals = compute_po_totals(merged_items, body.discount, body.additional_charges)
    if totals["total_amount"] + 0.001 < amount_paid:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail=f"Total amount cannot be less than amount already paid ({amount_paid:.2f})",
        )

    bill_number = (body.bill_number or "").strip() or None
    bill_images = [str(u).strip() for u in (body.bill_images or []) if str(u).strip()]

    updates: dict = {
        **body.model_dump(),
        **totals,
        "items": merged_items,
        "bill_number": bill_number,
        "bill_images": bill_images,
        "payment_status": compute_payment_status(amount_paid, totals["total_amount"]),
        "updated_at": datetime.now(timezone.utc),
    }
    placing_order = body.status == POStatus.ordered
    if body.ordered_by and body.ordered_by.strip():
        updates["ordered_by"] = body.ordered_by.strip()
    elif placing_order:
        resolved = _resolve_ordered_by(None, current_user, True)
        if resolved:
            updates["ordered_by"] = resolved

    await po.set(updates)
    refreshed = await PurchaseOrder.get(po_id)
    # Sync catalog UOMs when placing/updating an ordered (or partial) PO — never on draft-only saves.
    effective_status = updates.get("status", po.status)
    if effective_status in (POStatus.ordered, POStatus.partial):
        await sync_product_uoms_from_po_lines(merged_items)
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


@router.patch("/{po_id}/bill", response_model=PurchaseOrderResponse)
async def update_purchase_order_bill(
    po_id: str,
    body: PurchaseOrderBillUpdate,
    request: Request,
    current_user: User = Depends(require_manager_or_above),
):
    """Update bill_number / bill_images in any PO status (not gated by _po_is_editable)."""
    po = await PurchaseOrder.get(po_id)
    if not po:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Purchase order not found")

    before = po_snapshot(po)
    bill_number = (body.bill_number or "").strip() or None
    bill_images = [str(u).strip() for u in (body.bill_images or []) if str(u).strip()]
    await po.set(
        {
            "bill_number": bill_number,
            "bill_images": bill_images,
            "updated_at": datetime.now(timezone.utc),
        }
    )
    refreshed = await PurchaseOrder.get(po_id)
    await log_audit(
        module=AuditModule.purchase_orders,
        action="update_bill",
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

    if body.status == POStatus.cancelled and po.status in (POStatus.received, POStatus.partial):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail=(
                "Received POs cannot be cancelled — use purchase return for unsold stock."
            ),
        )

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


@router.post("/{po_id}/payments", response_model=PurchaseOrderResponse)
async def create_payment(
    po_id: str,
    body: PurchaseOrderPaymentCreate,
    request: Request,
    current_user: User = Depends(require_manager_or_above),
):
    refreshed = await record_payment(
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
    refreshed = await receive_purchase_order_items(
        po_id,
        body.items,
        created_by=current_user.name,
        current_user=current_user,
        request=request,
    )
    return _to_response(refreshed)
