"""Purchase order payment recording — creates linked expenses."""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import HTTPException, Request, status

from app.models.audit_log import AuditModule
from app.models.expense import Expense, ExpenseCategory
from app.models.purchase_order import (
    POStatus,
    PurchaseOrder,
    PurchaseOrderPayment,
    compute_payment_status,
)
from app.models.user import User
from app.schemas.purchase_order import PurchaseOrderPaymentCreate
from app.services.audit import log_audit, po_snapshot


PAYABLE_STATUSES = {POStatus.ordered, POStatus.partial, POStatus.received}


def remaining_balance(po: PurchaseOrder) -> float:
    return round(max(0.0, po.total_amount - float(getattr(po, "amount_paid", 0) or 0)), 2)


async def record_payment(
    po_id: str,
    body: PurchaseOrderPaymentCreate,
    *,
    current_user: User,
    request: Request | None = None,
) -> PurchaseOrder:
    po = await PurchaseOrder.get(po_id)
    if not po:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Purchase order not found")
    if po.status not in PAYABLE_STATUSES:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail="Payments can only be recorded for ordered, partial, or received purchase orders",
        )

    amount = round(float(body.amount), 2)
    if amount <= 0:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Payment amount must be greater than zero")

    remaining = remaining_balance(po)
    if amount > remaining + 0.001:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail=f"Payment exceeds remaining balance ({remaining:.2f})",
        )

    before = po_snapshot(po)
    expense = Expense(
        title=f"PO payment {po.order_number}",
        description=body.notes.strip() or f"Payment for purchase order {po.order_number}",
        amount=amount,
        category=ExpenseCategory.purchase_order,
        date=body.date,
        paid_to=po.supplier_name,
        payment_method=body.payment_method.strip() or "cash",
        is_setup_cost=False,
        purchase_order_id=str(po.id),
    )
    await expense.insert()

    payment = PurchaseOrderPayment(
        amount=amount,
        date=body.date,
        payment_method=body.payment_method.strip() or "cash",
        notes=body.notes.strip(),
        expense_id=str(expense.id),
        created_by=current_user.name,
        created_at=datetime.now(timezone.utc),
    )
    payments = list(getattr(po, "payments", None) or [])
    payments.append(payment)
    amount_paid = round(float(getattr(po, "amount_paid", 0) or 0) + amount, 2)
    payment_status = compute_payment_status(amount_paid, po.total_amount)

    await po.set({
        "payments": payments,
        "amount_paid": amount_paid,
        "payment_status": payment_status,
        "updated_at": datetime.now(timezone.utc),
    })
    refreshed = await PurchaseOrder.get(po_id)
    assert refreshed is not None

    await log_audit(
        module=AuditModule.expenses,
        action="create",
        user=current_user,
        request=request,
        entity_type="expense",
        entity_id=str(expense.id),
        new={
            "id": str(expense.id),
            "title": expense.title,
            "amount": expense.amount,
            "category": expense.category.value,
            "purchase_order_id": str(po.id),
        },
    )
    await log_audit(
        module=AuditModule.purchase_orders,
        action="payment",
        user=current_user,
        request=request,
        entity_type="purchase_order",
        entity_id=po_id,
        previous=before,
        new=po_snapshot(refreshed),
    )
    return refreshed


async def reverse_payment_for_expense(
    expense: Expense,
    *,
    current_user: User,
    request: Request | None = None,
) -> None:
    """Remove the matching PO payment when a linked expense is deleted."""
    po_id = getattr(expense, "purchase_order_id", None)
    if not po_id:
        return

    po = await PurchaseOrder.get(po_id)
    if not po:
        return

    before = po_snapshot(po)
    expense_id = str(expense.id)
    payments = list(getattr(po, "payments", None) or [])
    matched = [p for p in payments if (p.expense_id or "") == expense_id]
    if not matched:
        return

    removed_amount = round(sum(p.amount for p in matched), 2)
    remaining_payments = [p for p in payments if (p.expense_id or "") != expense_id]
    amount_paid = round(max(0.0, float(getattr(po, "amount_paid", 0) or 0) - removed_amount), 2)
    payment_status = compute_payment_status(amount_paid, po.total_amount)

    await po.set({
        "payments": remaining_payments,
        "amount_paid": amount_paid,
        "payment_status": payment_status,
        "updated_at": datetime.now(timezone.utc),
    })
    refreshed = await PurchaseOrder.get(po_id)
    if refreshed:
        await log_audit(
            module=AuditModule.purchase_orders,
            action="payment_reverse",
            user=current_user,
            request=request,
            entity_type="purchase_order",
            entity_id=po_id,
            previous=before,
            new=po_snapshot(refreshed),
        )
