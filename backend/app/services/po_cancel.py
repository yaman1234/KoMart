"""Cancel a purchase order with full unwind of payments and leftover stock."""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import HTTPException, Request, status

from app.models.audit_log import AuditModule
from app.models.expense import Expense
from app.models.purchase_order import (
    POStatus,
    PaymentStatus,
    PurchaseOrder,
)
from app.models.user import User
from app.services.audit import log_audit, po_snapshot
from app.services.po_amend import _po_batch_leftover, _reverse_po_receive, _units
from app.services.response_cache import bump_commerce_caches


async def cancel_purchase_order(
    po: PurchaseOrder,
    *,
    current_user: User,
    request: Request | None = None,
) -> PurchaseOrder:
    if po.status == POStatus.cancelled:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail="Purchase order is already cancelled",
        )

    po_id = str(po.id)
    before = po_snapshot(po)

    # Validate leftover stock covers every received line before mutating.
    stock_reverses: list[tuple[str, str, int]] = []
    for item in po.items or []:
        received = int(getattr(item, "received_quantity", 0) or 0)
        if received <= 0:
            continue
        base_needed = received * _units(item)
        leftover = await _po_batch_leftover(item.product_id, po_id)
        if leftover < base_needed:
            sold = base_needed - leftover
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Cannot cancel: {sold} unit(s) of {item.product_name} from this purchase "
                    f"order have already been sold. Reverse those sales or adjust inventory first."
                ),
            )
        if leftover > 0:
            stock_reverses.append((item.product_id, item.product_name, leftover))

    created_by = current_user.name
    for product_id, product_name, base_qty in stock_reverses:
        await _reverse_po_receive(
            product_id=product_id,
            product_name=product_name,
            po_id=po_id,
            base_qty=base_qty,
            created_by=created_by,
            reason="PO cancel — reverse receive",
        )

    expenses = await Expense.find(Expense.purchase_order_id == po_id).to_list()
    seen_expense_ids = {str(e.id) for e in expenses}
    for payment in getattr(po, "payments", None) or []:
        expense_id = getattr(payment, "expense_id", None) or ""
        if expense_id and expense_id not in seen_expense_ids:
            expense = await Expense.get(expense_id)
            if expense:
                expenses.append(expense)
                seen_expense_ids.add(expense_id)

    from app.services.wallet_ledger import reverse_reference

    for expense in expenses:
        expense_id = str(expense.id)
        await reverse_reference(
            reference_type="expense",
            reference_id=expense_id,
            reason=f"PO {po.order_number} cancelled",
            created_by=created_by,
        )
        await expense.delete()
        await log_audit(
            module=AuditModule.expenses,
            action="delete",
            user=current_user,
            request=request,
            entity_type="expense",
            entity_id=expense_id,
            previous={
                "id": expense_id,
                "title": expense.title,
                "amount": expense.amount,
                "purchase_order_id": po_id,
            },
        )

    now = datetime.now(timezone.utc)
    await po.set({
        "status": POStatus.cancelled,
        "payments": [],
        "amount_paid": 0.0,
        "payment_status": PaymentStatus.unpaid,
        "updated_at": now,
    })
    refreshed = await PurchaseOrder.get(po_id)
    if not refreshed:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Purchase order not found")

    if stock_reverses or expenses:
        await bump_commerce_caches()

    await log_audit(
        module=AuditModule.purchase_orders,
        action="cancel",
        user=current_user,
        request=request,
        entity_type="purchase_order",
        entity_id=po_id,
        previous=before,
        new=po_snapshot(refreshed),
    )
    return refreshed
