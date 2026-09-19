"""Purchase invoices and supplier payments."""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import HTTPException, Request, status

from app.models.audit_log import AuditModule
from app.models.expense import Expense, ExpenseCategory
from app.models.goods_receipt import GoodsReceipt
from app.models.purchase_invoice import InvoiceStatus, PurchaseInvoice, SupplierPayment
from app.models.purchase_order import (
    POStatus,
    PurchaseOrder,
    PurchaseOrderPayment,
    compute_payment_status,
)
from app.models.user import User
from app.schemas.purchase_order import PurchaseOrderPaymentCreate
from app.services.audit import log_audit, po_snapshot
from app.services.payment_methods import normalize_payment_method
from app.services.wallet_ledger import WALLETS, post_expense
from beanie.operators import In, NotIn


def _invoice_status(amount_paid: float, total: float, due_date: str = "") -> InvoiceStatus:
    paid = round(amount_paid, 2)
    tot = round(total, 2)
    if paid <= 0:
        if due_date and due_date < datetime.now(timezone.utc).date().isoformat():
            return InvoiceStatus.overdue
        return InvoiceStatus.unpaid
    if tot > 0 and paid >= tot:
        return InvoiceStatus.paid
    return InvoiceStatus.partial


async def _next_invoice_number() -> str:
    prefix = "PI-"
    count = await PurchaseInvoice.find({"invoice_number": {"$regex": f"^{prefix}"}}).count()
    return f"{prefix}{str(count + 1).zfill(4)}"


async def _next_payment_number() -> str:
    prefix = "SP-"
    count = await SupplierPayment.find({"payment_number": {"$regex": f"^{prefix}"}}).count()
    return f"{prefix}{str(count + 1).zfill(4)}"


def invoice_to_dict(inv: PurchaseInvoice) -> dict:
    return {
        "id": str(inv.id),
        "invoice_number": inv.invoice_number,
        "supplier_invoice_no": inv.supplier_invoice_no or "",
        "purchase_order_id": inv.purchase_order_id,
        "order_number": inv.order_number,
        "goods_receipt_ids": list(inv.goods_receipt_ids or []),
        "supplier_id": inv.supplier_id,
        "supplier_name": inv.supplier_name,
        "invoice_date": inv.invoice_date,
        "due_date": inv.due_date or "",
        "subtotal": float(inv.subtotal or 0),
        "discount": float(inv.discount or 0),
        "tax": float(inv.tax or 0),
        "shipping": float(inv.shipping or 0),
        "other_charges": float(inv.other_charges or 0),
        "total_amount": float(inv.total_amount or 0),
        "amount_paid": float(inv.amount_paid or 0),
        "outstanding": inv.outstanding,
        "status": inv.status.value if hasattr(inv.status, "value") else str(inv.status),
        "notes": inv.notes or "",
        "created_by": inv.created_by or "",
        "created_at": inv.created_at.isoformat() if inv.created_at else "",
        "updated_at": inv.updated_at.isoformat() if inv.updated_at else "",
    }


async def create_invoice_from_goods_receipt(
    gr: GoodsReceipt,
    *,
    current_user: User,
    request: Request | None = None,
) -> PurchaseInvoice:
    """Auto-create a posted invoice from a confirmed goods receipt."""
    existing = await PurchaseInvoice.find_one({
        "goods_receipt_ids": str(gr.id),
    })
    if existing:
        return existing

    po = await PurchaseOrder.get(gr.purchase_order_id)
    subtotal = float(gr.total_amount or 0)
    discount = float(getattr(po, "discount", 0) or 0) if po else 0.0
    tax = float(getattr(po, "tax", 0) or 0) if po else 0.0
    shipping = float(getattr(po, "shipping", 0) or 0) if po else 0.0
    other = float(getattr(po, "other_charges", 0) or 0) if po else 0.0
    # Only apply PO-level charges once for the PO lifetime (including cancelled invoices
    # so a full refund cannot re-arm discount/tax/shipping on a later GR).
    prior = 0
    if po:
        prior = await PurchaseInvoice.find(
            PurchaseInvoice.purchase_order_id == str(po.id),
        ).count()
    if prior > 0:
        discount = tax = shipping = other = 0.0

    total = round(max(0.0, subtotal - discount + tax + shipping + other), 2)
    now = datetime.now(timezone.utc)
    inv = PurchaseInvoice(
        invoice_number=await _next_invoice_number(),
        supplier_invoice_no=(gr.bill_no or "").strip(),
        purchase_order_id=gr.purchase_order_id,
        order_number=gr.order_number,
        goods_receipt_ids=[str(gr.id)],
        supplier_id=gr.supplier_id,
        supplier_name=gr.supplier_name,
        invoice_date=gr.receipt_date or now.date().isoformat(),
        due_date="",
        subtotal=subtotal,
        discount=discount,
        tax=tax,
        shipping=shipping,
        other_charges=other,
        total_amount=total,
        amount_paid=0.0,
        status=InvoiceStatus.unpaid,
        notes=f"Auto-created from {gr.receipt_number}",
        created_by=current_user.name,
        created_at=now,
        updated_at=now,
    )
    await inv.insert()
    await log_audit(
        module=AuditModule.purchase_orders,
        action="invoice_create",
        user=current_user,
        request=request,
        entity_type="purchase_invoice",
        entity_id=str(inv.id),
        new=invoice_to_dict(inv),
    )
    return inv


async def list_invoices_for_po(po_id: str) -> list[dict]:
    docs = (
        await PurchaseInvoice.find(PurchaseInvoice.purchase_order_id == po_id)
        .sort([("created_at", -1)])
        .to_list()
    )
    return [invoice_to_dict(d) for d in docs]


async def get_open_invoice_for_po(po_id: str) -> PurchaseInvoice | None:
    docs = (
        await PurchaseInvoice.find(
            PurchaseInvoice.purchase_order_id == po_id,
            In(
                PurchaseInvoice.status,
                [InvoiceStatus.unpaid, InvoiceStatus.partial, InvoiceStatus.overdue],
            ),
        )
        .sort([("created_at", 1)])
        .to_list()
    )
    return docs[0] if docs else None


async def pay_invoice(
    invoice_id: str,
    body: PurchaseOrderPaymentCreate,
    *,
    current_user: User,
    request: Request | None = None,
) -> tuple[PurchaseInvoice, PurchaseOrder | None]:
    inv = await PurchaseInvoice.get(invoice_id)
    if not inv:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Purchase invoice not found")
    if inv.status == InvoiceStatus.cancelled:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Cannot pay a cancelled invoice")
    if not (inv.goods_receipt_ids or []):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail="Receive goods first — invoice is not linked to a goods receipt",
        )

    amount = round(float(body.amount), 2)
    if amount <= 0:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Payment amount must be greater than zero")
    outstanding = inv.outstanding
    if amount > outstanding + 0.001:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail=f"Payment exceeds invoice outstanding ({outstanding:.2f})",
        )

    method = normalize_payment_method(body.payment_method) or "cash"
    if method not in {w.value for w in WALLETS}:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail="payment_method must be cash, bank, or esewa",
        )

    bill_no = (body.bill_no or "").strip() or None
    if not bill_no:
        po_for_bill = await PurchaseOrder.get(inv.purchase_order_id)
        bill_no = ((getattr(po_for_bill, "bill_no", None) or "").strip() or None) if po_for_bill else None
    expense = Expense(
        title=f"Invoice payment {inv.invoice_number}",
        description=body.notes.strip() or f"Payment for invoice {inv.invoice_number}",
        amount=amount,
        category=ExpenseCategory.purchase_order.value,
        date=body.date,
        paid_to=inv.supplier_name,
        bill_no=bill_no,
        payment_method=method,
        is_setup_cost=False,
        purchase_order_id=inv.purchase_order_id,
    )
    await expense.insert()
    await post_expense(expense, created_by=current_user.name)

    now = datetime.now(timezone.utc)
    payment = SupplierPayment(
        payment_number=await _next_payment_number(),
        purchase_invoice_id=str(inv.id),
        purchase_order_id=inv.purchase_order_id,
        supplier_id=inv.supplier_id,
        supplier_name=inv.supplier_name,
        amount=amount,
        payment_date=body.date,
        payment_method=method,
        bill_no=bill_no or "",
        notes=body.notes.strip(),
        expense_id=str(expense.id),
        created_by=current_user.name,
        created_at=now,
    )
    await payment.insert()

    new_paid = round(float(inv.amount_paid or 0) + amount, 2)
    new_status = _invoice_status(new_paid, float(inv.total_amount or 0), inv.due_date or "")
    await inv.set({
        "amount_paid": new_paid,
        "status": new_status,
        "updated_at": now,
    })
    refreshed_inv = await PurchaseInvoice.get(str(inv.id))

    # Roll up onto PO for backward-compatible UI
    po = await PurchaseOrder.get(inv.purchase_order_id)
    if po:
        before = po_snapshot(po)
        po_paid = round(float(getattr(po, "amount_paid", 0) or 0) + amount, 2)
        po_payment = PurchaseOrderPayment(
            amount=amount,
            date=body.date,
            payment_method=method,
            bill_no=bill_no,
            notes=body.notes.strip(),
            expense_id=str(expense.id),
            created_by=current_user.name,
            created_at=now,
        )
        payments = list(getattr(po, "payments", None) or [])
        payments.append(po_payment)
        await po.set({
            "amount_paid": po_paid,
            "payment_status": compute_payment_status(po_paid, float(po.total_amount or 0)),
            "payments": [p.model_dump() for p in payments],
            "updated_at": now,
        })
        po = await PurchaseOrder.get(str(po.id))
        await log_audit(
            module=AuditModule.purchase_orders,
            action="payment",
            user=current_user,
            request=request,
            entity_type="purchase_order",
            entity_id=str(po.id) if po else inv.purchase_order_id,
            previous=before,
            new=po_snapshot(po) if po else {},
        )

    return refreshed_inv, po  # type: ignore[return-value]


PAYABLE_PO_STATUSES = {
    POStatus.ordered,
    POStatus.partial,
    POStatus.received,
    POStatus.closed,
}


async def pay_po_via_open_invoice(
    po_id: str,
    body: PurchaseOrderPaymentCreate,
    *,
    current_user: User,
    request: Request | None = None,
) -> PurchaseOrder:
    """Proxy legacy PO payment endpoint onto the oldest open GR-linked invoice."""
    po = await PurchaseOrder.get(po_id)
    if not po:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Purchase order not found")
    if po.status not in PAYABLE_PO_STATUSES:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail="Payments are only allowed for ordered, partial, received, or closed purchase orders",
        )

    inv = await get_open_invoice_for_po(po_id)
    if not inv:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail="Receive goods first — payments require an open purchase invoice from a goods receipt",
        )
    if not (inv.goods_receipt_ids or []):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail="Receive goods first — open invoice is not linked to a goods receipt",
        )

    _, refreshed = await pay_invoice(
        str(inv.id), body, current_user=current_user, request=request,
    )
    if not refreshed:
        refreshed = await PurchaseOrder.get(po_id)
    if not refreshed:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Purchase order not found")
    return refreshed


async def supplier_outstanding(supplier_id: str) -> dict:
    invoices = await PurchaseInvoice.find(
        PurchaseInvoice.supplier_id == supplier_id,
        NotIn(PurchaseInvoice.status, [InvoiceStatus.cancelled, InvoiceStatus.paid]),
    ).to_list()
    from app.models.purchase_invoice import SupplierCredit
    credits = await SupplierCredit.find(SupplierCredit.supplier_id == supplier_id).to_list()
    inv_outstanding = round(sum(i.outstanding for i in invoices), 2)
    credit_remaining = round(sum(float(c.remaining_amount or 0) for c in credits), 2)
    return {
        "supplier_id": supplier_id,
        "invoice_outstanding": inv_outstanding,
        "credit_balance": credit_remaining,
        "net_outstanding": round(max(0.0, inv_outstanding - credit_remaining), 2),
    }
