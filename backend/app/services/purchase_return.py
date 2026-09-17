"""Purchase return — reverse leftover PO stock and post supplier wallet credit."""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import HTTPException, Request, status

from app.models.audit_log import AuditModule
from app.models.purchase_order import POStatus, PurchaseOrder
from app.models.purchase_return import (
    PurchaseReturn,
    PurchaseReturnItem,
    PurchaseReturnStatus,
)
from app.models.user import User
from app.models.wallet_ledger import WalletDirection, WalletEntryType
from app.schemas.purchase_return import (
    PurchaseReturnCreate,
    PurchaseReturnItemResponse,
    PurchaseReturnResponse,
    ReturnableLineResponse,
)
from app.services.audit import log_audit
from app.services.payment_methods import normalize_payment_method
from app.services.po_amend import _landed_cost, _po_batch_leftover, _reverse_po_receive, _units
from app.services.response_cache import bump_commerce_caches
from app.services.wallet_ledger import WALLETS, post_entry

RETURNABLE_PO_STATUSES = {POStatus.ordered, POStatus.partial, POStatus.received}


def _to_response(doc: PurchaseReturn) -> PurchaseReturnResponse:
    return PurchaseReturnResponse(
        id=str(doc.id),
        return_number=doc.return_number,
        purchase_order_id=doc.purchase_order_id,
        order_number=doc.order_number,
        supplier_id=doc.supplier_id,
        supplier_name=doc.supplier_name,
        items=[
            PurchaseReturnItemResponse(
                product_id=i.product_id,
                product_name=i.product_name,
                return_qty=i.return_qty,
                unit_cost=i.unit_cost,
                line_total=i.line_total,
                base_uom=i.base_uom,
            )
            for i in (doc.items or [])
        ],
        total_amount=float(doc.total_amount or 0),
        remarks=doc.remarks or "",
        status=doc.status,
        payment_method=doc.payment_method or "cash",
        return_date=doc.return_date or "",
        created_by=doc.created_by or "",
        created_at=doc.created_at.isoformat() if doc.created_at else "",
        updated_at=doc.updated_at.isoformat() if doc.updated_at else "",
        posted_at=doc.posted_at.isoformat() if doc.posted_at else None,
    )


async def _next_return_number() -> str:
    prefix = "PR-"
    count = await PurchaseReturn.find({"return_number": {"$regex": f"^{prefix}"}}).count()
    return f"{prefix}{str(count + 1).zfill(4)}"


async def list_returnable_lines(po: PurchaseOrder) -> list[ReturnableLineResponse]:
    if po.status not in RETURNABLE_PO_STATUSES:
        return []
    po_id = str(po.id)
    lines: list[ReturnableLineResponse] = []
    for item in po.items or []:
        received = int(getattr(item, "received_quantity", 0) or 0)
        if received <= 0:
            continue
        leftover = await _po_batch_leftover(item.product_id, po_id)
        if leftover <= 0:
            continue
        units = _units(item)
        landed = _landed_cost(float(item.unit_cost or 0), units, 0.0)
        lines.append(
            ReturnableLineResponse(
                product_id=item.product_id,
                product_name=item.product_name,
                available_qty=leftover,
                unit_cost=landed,
                base_uom=getattr(item, "base_uom", None) or "pcs",
                received_quantity=received,
                units_per_buy_uom=units,
            )
        )
    return lines


async def post_purchase_return(
    body: PurchaseReturnCreate,
    *,
    current_user: User,
    request: Request | None = None,
) -> PurchaseReturn:
    po = await PurchaseOrder.get(body.purchase_order_id)
    if not po:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Purchase order not found")
    if po.status == POStatus.cancelled:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail="Cannot return goods from a cancelled purchase order",
        )
    if po.status not in RETURNABLE_PO_STATUSES:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail="Purchase returns are only allowed for ordered, partial, or received purchase orders",
        )
    if po.status == POStatus.ordered and not any(
        int(getattr(i, "received_quantity", 0) or 0) > 0 for i in (po.items or [])
    ):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail="No received stock on this purchase order to return",
        )

    method = normalize_payment_method(body.payment_method) or "cash"
    if method not in {w.value for w in WALLETS}:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail="payment_method must be cash, bank, or esewa",
        )

    return_date = (body.return_date or "").strip() or datetime.now(timezone.utc).date().isoformat()
    po_id = str(po.id)
    po_items_by_id = {i.product_id: i for i in (po.items or [])}

    # Deduplicate request lines
    qty_by_product: dict[str, int] = {}
    for raw in body.items:
        pid = (raw.product_id or "").strip()
        if not pid:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Each return line needs a product")
        qty_by_product[pid] = qty_by_product.get(pid, 0) + int(raw.return_qty)

    if not qty_by_product:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Add at least one return line")

    built_items: list[PurchaseReturnItem] = []
    total_amount = 0.0
    stock_reverses: list[tuple[str, str, int]] = []

    for product_id, return_qty in qty_by_product.items():
        po_item = po_items_by_id.get(product_id)
        if not po_item:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                detail=f"Product {product_id} is not on this purchase order",
            )
        received = int(getattr(po_item, "received_quantity", 0) or 0)
        if received <= 0:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                detail=f"{po_item.product_name} was not received on this purchase order",
            )
        leftover = await _po_batch_leftover(product_id, po_id)
        if return_qty > leftover:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Cannot return {return_qty} unit(s) of {po_item.product_name}: "
                    f"only {leftover} leftover from this purchase order"
                ),
            )
        units = _units(po_item)
        landed = _landed_cost(float(po_item.unit_cost or 0), units, 0.0)
        line_total = round(landed * return_qty, 2)
        total_amount += line_total
        built_items.append(
            PurchaseReturnItem(
                product_id=product_id,
                product_name=po_item.product_name,
                return_qty=return_qty,
                unit_cost=landed,
                line_total=line_total,
                base_uom=getattr(po_item, "base_uom", None) or "pcs",
            )
        )
        stock_reverses.append((product_id, po_item.product_name, return_qty))

    total_amount = round(total_amount, 2)
    now = datetime.now(timezone.utc)
    created_by = current_user.name

    for product_id, product_name, base_qty in stock_reverses:
        await _reverse_po_receive(
            product_id=product_id,
            product_name=product_name,
            po_id=po_id,
            base_qty=base_qty,
            created_by=created_by,
            reason="Purchase return — reverse receive",
        )

    doc = PurchaseReturn(
        return_number=await _next_return_number(),
        purchase_order_id=po_id,
        order_number=po.order_number,
        supplier_id=po.supplier_id,
        supplier_name=po.supplier_name,
        items=built_items,
        total_amount=total_amount,
        remarks=(body.remarks or "").strip(),
        status=PurchaseReturnStatus.posted,
        payment_method=method,
        return_date=return_date,
        created_by=created_by,
        created_at=now,
        updated_at=now,
        posted_at=now,
    )
    await doc.insert()
    return_id = str(doc.id)

    if total_amount > 0:
        await post_entry(
            wallet=method,
            direction=WalletDirection.inflow,
            amount=total_amount,
            entry_type=WalletEntryType.purchase_return,
            date=return_date,
            remarks=f"Purchase return {doc.return_number} ({po.order_number})",
            reference_type="purchase_return",
            reference_id=return_id,
            created_by=created_by,
        )

    await bump_commerce_caches()
    await log_audit(
        module=AuditModule.purchase_orders,
        action="purchase_return",
        user=current_user,
        request=request,
        entity_type="purchase_return",
        entity_id=return_id,
        new={
            "id": return_id,
            "return_number": doc.return_number,
            "purchase_order_id": po_id,
            "order_number": po.order_number,
            "total_amount": total_amount,
            "items": [i.model_dump() for i in built_items],
        },
    )
    return doc
