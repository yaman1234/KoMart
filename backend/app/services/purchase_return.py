"""Purchase return — stock reverse + settlement (refund / credit / replacement / pending)."""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import HTTPException, Request, status

from app.models.audit_log import AuditModule
from app.models.purchase_invoice import SupplierCredit
from app.models.purchase_order import POStatus, PurchaseOrder
from app.models.purchase_return import (
    PurchaseReturn,
    PurchaseReturnItem,
    PurchaseReturnStatus,
    ReturnReason,
    ReturnSettlementType,
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

RETURNABLE_PO_STATUSES = {
    POStatus.ordered,
    POStatus.partial,
    POStatus.received,
    POStatus.closed,
}


def _to_response(doc: PurchaseReturn) -> PurchaseReturnResponse:
    status_val = doc.status
    # Normalize legacy posted → confirmed in API responses
    if status_val == PurchaseReturnStatus.posted:
        status_val = PurchaseReturnStatus.confirmed
    return PurchaseReturnResponse(
        id=str(doc.id),
        return_number=doc.return_number,
        purchase_order_id=doc.purchase_order_id,
        order_number=doc.order_number,
        goods_receipt_id=getattr(doc, "goods_receipt_id", "") or "",
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
        reason=getattr(doc, "reason", None) or ReturnReason.other,
        settlement_type=getattr(doc, "settlement_type", None) or ReturnSettlementType.refund,
        status=status_val,
        payment_method=doc.payment_method or "cash",
        bill_no=getattr(doc, "bill_no", "") or "",
        return_date=doc.return_date or "",
        approved_by=getattr(doc, "approved_by", "") or "",
        created_by=doc.created_by or "",
        created_at=doc.created_at.isoformat() if doc.created_at else "",
        updated_at=doc.updated_at.isoformat() if doc.updated_at else "",
        posted_at=doc.posted_at.isoformat() if doc.posted_at else None,
        confirmed_at=(
            doc.confirmed_at.isoformat()
            if getattr(doc, "confirmed_at", None)
            else (doc.posted_at.isoformat() if doc.posted_at else None)
        ),
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


async def _build_return_items(
    po: PurchaseOrder,
    qty_by_product: dict[str, int],
) -> tuple[list[PurchaseReturnItem], list[tuple[str, str, int]], float]:
    po_id = str(po.id)
    po_items_by_id = {i.product_id: i for i in (po.items or [])}
    built_items: list[PurchaseReturnItem] = []
    stock_reverses: list[tuple[str, str, int]] = []
    total_amount = 0.0

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

    return built_items, stock_reverses, round(total_amount, 2)


async def _paid_amount_for_po(po_id: str) -> float:
    from app.models.purchase_invoice import InvoiceStatus, PurchaseInvoice

    invoices = await PurchaseInvoice.find(
        PurchaseInvoice.purchase_order_id == po_id,
        PurchaseInvoice.status != InvoiceStatus.cancelled,
    ).to_list()
    return round(sum(float(i.amount_paid or 0) for i in invoices), 2)


async def _apply_refund_to_invoices(po_id: str, refund_amount: float) -> None:
    """Shrink paid invoice totals after a cash refund so AP stays consistent."""
    from app.models.purchase_invoice import InvoiceStatus, PurchaseInvoice

    invoices = await PurchaseInvoice.find(
        PurchaseInvoice.purchase_order_id == po_id,
        PurchaseInvoice.status != InvoiceStatus.cancelled,
    ).to_list()
    remaining_refund = round(refund_amount, 2)
    now = datetime.now(timezone.utc)
    for inv in sorted(invoices, key=lambda i: float(i.amount_paid or 0), reverse=True):
        if remaining_refund <= 0:
            break
        paid = float(inv.amount_paid or 0)
        if paid <= 0:
            continue
        take = min(paid, remaining_refund)
        new_total = round(max(0.0, float(inv.total_amount or 0) - take), 2)
        new_paid = round(min(paid - take, new_total), 2)
        if new_total <= 0:
            new_status = InvoiceStatus.cancelled
        elif new_paid <= 0:
            new_status = InvoiceStatus.unpaid
        elif new_paid + 0.001 >= new_total:
            new_status = InvoiceStatus.paid
        else:
            new_status = InvoiceStatus.partial
        await inv.set({
            "amount_paid": new_paid,
            "total_amount": new_total,
            "status": new_status,
            "updated_at": now,
        })
        remaining_refund = round(remaining_refund - take, 2)


async def _apply_settlement(
    doc: PurchaseReturn,
    *,
    current_user: User,
) -> None:
    settlement = getattr(doc, "settlement_type", None) or ReturnSettlementType.refund
    total_amount = float(doc.total_amount or 0)
    if total_amount <= 0:
        return

    if settlement == ReturnSettlementType.refund:
        amount_paid = await _paid_amount_for_po(doc.purchase_order_id)
        if amount_paid + 0.001 < total_amount:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                detail=(
                    "Refund settlement requires prior invoice payment covering the return amount. "
                    "Pay the invoice first, or use credit / replacement / pending settlement."
                ),
            )
        method = normalize_payment_method(doc.payment_method) or "cash"
        if method not in {w.value for w in WALLETS}:
            method = "cash"
        await post_entry(
            wallet=method,
            direction=WalletDirection.inflow,
            amount=total_amount,
            entry_type=WalletEntryType.purchase_return,
            date=doc.return_date or datetime.now(timezone.utc).date().isoformat(),
            remarks=f"Purchase return {doc.return_number} ({doc.order_number})",
            reference_type="purchase_return",
            reference_id=str(doc.id),
            created_by=current_user.name,
        )
        await _apply_refund_to_invoices(doc.purchase_order_id, total_amount)
    elif settlement == ReturnSettlementType.credit:
        credit = SupplierCredit(
            supplier_id=doc.supplier_id,
            supplier_name=doc.supplier_name,
            purchase_return_id=str(doc.id),
            purchase_order_id=doc.purchase_order_id,
            amount=total_amount,
            remaining_amount=total_amount,
            notes=f"Credit from {doc.return_number}",
            created_by=current_user.name,
        )
        await credit.insert()
    # replacement / pending: stock already reversed; no money movement yet


async def confirm_purchase_return(
    doc: PurchaseReturn,
    *,
    current_user: User,
    request: Request | None = None,
) -> PurchaseReturn:
    if doc.status not in (
        PurchaseReturnStatus.draft,
        PurchaseReturnStatus.pending_approval,
        PurchaseReturnStatus.approved,
    ):
        if doc.status in (PurchaseReturnStatus.confirmed, PurchaseReturnStatus.posted):
            return doc
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail="This purchase return cannot be confirmed",
        )

    settlement = getattr(doc, "settlement_type", None) or ReturnSettlementType.refund
    total_amount = float(doc.total_amount or 0)
    if settlement == ReturnSettlementType.refund and total_amount > 0:
        amount_paid = await _paid_amount_for_po(doc.purchase_order_id)
        if amount_paid + 0.001 < total_amount:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                detail=(
                    "Refund settlement requires prior invoice payment covering the return amount. "
                    "Pay the invoice first, or use credit / replacement / pending settlement."
                ),
            )

    po_id = doc.purchase_order_id
    created_by = current_user.name
    for item in doc.items or []:
        await _reverse_po_receive(
            product_id=item.product_id,
            product_name=item.product_name,
            po_id=po_id,
            base_qty=item.return_qty,
            created_by=created_by,
            reason="Purchase return — reverse receive",
        )

    now = datetime.now(timezone.utc)
    await doc.set({
        "status": PurchaseReturnStatus.confirmed,
        "confirmed_at": now,
        "posted_at": now,
        "approved_by": doc.approved_by or current_user.name,
        "approved_at": getattr(doc, "approved_at", None) or now,
        "updated_at": now,
    })
    refreshed = await PurchaseReturn.get(str(doc.id))
    if not refreshed:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Purchase return not found")

    await _apply_settlement(refreshed, current_user=current_user)
    await bump_commerce_caches()
    await log_audit(
        module=AuditModule.purchase_orders,
        action="purchase_return_confirm",
        user=current_user,
        request=request,
        entity_type="purchase_return",
        entity_id=str(refreshed.id),
        new={"id": str(refreshed.id), "settlement_type": refreshed.settlement_type},
    )
    return refreshed


async def post_purchase_return(
    body: PurchaseReturnCreate,
    *,
    current_user: User,
    request: Request | None = None,
) -> PurchaseReturn:
    """Create return. Managers confirm immediately by default (shortcut)."""
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
            detail="Purchase returns are only allowed for ordered, partial, received, or closed POs",
        )

    settlement = body.settlement_type or ReturnSettlementType.refund
    method = normalize_payment_method(body.payment_method) or "cash"
    if settlement == ReturnSettlementType.refund and method not in {w.value for w in WALLETS}:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail="payment_method must be cash, bank, or esewa for refund settlement",
        )

    return_date = (body.return_date or "").strip() or datetime.now(timezone.utc).date().isoformat()
    qty_by_product: dict[str, int] = {}
    for raw in body.items:
        pid = (raw.product_id or "").strip()
        if not pid:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Each return line needs a product")
        qty_by_product[pid] = qty_by_product.get(pid, 0) + int(raw.return_qty)

    built_items, _stock, total_amount = await _build_return_items(po, qty_by_product)
    now = datetime.now(timezone.utc)
    confirm_now = bool(getattr(body, "confirm_immediately", True))
    return_bill = (getattr(body, "bill_no", None) or "").strip() or (getattr(po, "bill_no", None) or "").strip()

    doc = PurchaseReturn(
        return_number=await _next_return_number(),
        purchase_order_id=str(po.id),
        order_number=po.order_number,
        goods_receipt_id=(body.goods_receipt_id or "").strip(),
        supplier_id=po.supplier_id,
        supplier_name=po.supplier_name,
        items=built_items,
        total_amount=total_amount,
        remarks=(body.remarks or "").strip(),
        reason=body.reason or ReturnReason.other,
        settlement_type=settlement,
        status=PurchaseReturnStatus.approved if confirm_now else PurchaseReturnStatus.pending_approval,
        payment_method=method,
        bill_no=return_bill,
        return_date=return_date,
        created_by=current_user.name,
        created_at=now,
        updated_at=now,
    )
    await doc.insert()

    if confirm_now:
        return await confirm_purchase_return(doc, current_user=current_user, request=request)

    await log_audit(
        module=AuditModule.purchase_orders,
        action="purchase_return_create",
        user=current_user,
        request=request,
        entity_type="purchase_return",
        entity_id=str(doc.id),
        new={"id": str(doc.id), "status": doc.status.value},
    )
    return doc


async def approve_purchase_return(
    return_id: str,
    *,
    current_user: User,
    request: Request | None = None,
    confirm: bool = True,
) -> PurchaseReturn:
    doc = await PurchaseReturn.get(return_id)
    if not doc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Purchase return not found")
    if doc.status != PurchaseReturnStatus.pending_approval:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail="Only pending purchase returns can be approved",
        )
    now = datetime.now(timezone.utc)
    await doc.set({
        "status": PurchaseReturnStatus.approved,
        "approved_by": current_user.name,
        "approved_at": now,
        "updated_at": now,
    })
    doc = await PurchaseReturn.get(return_id)
    if confirm and doc:
        return await confirm_purchase_return(doc, current_user=current_user, request=request)
    return doc  # type: ignore[return-value]
