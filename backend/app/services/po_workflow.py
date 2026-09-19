"""PO approval workflow — submit / approve / reject / send / close."""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import HTTPException, Request, status

from app.models.audit_log import AuditModule
from app.models.purchase_order import POStatus, PurchaseOrder
from app.models.user import User
from app.services.audit import log_audit, po_snapshot

CANCELABLE = {
    POStatus.draft,
    POStatus.pending_approval,
    POStatus.approved,
    POStatus.ordered,
    POStatus.partial,
}


async def submit_purchase_order(
    po: PurchaseOrder,
    *,
    current_user: User,
    request: Request | None = None,
) -> PurchaseOrder:
    if po.status != POStatus.draft:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail="Only draft purchase orders can be submitted for approval",
        )
    if not po.items:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Add at least one line before submitting")

    before = po_snapshot(po)
    now = datetime.now(timezone.utc)
    await po.set({
        "status": POStatus.pending_approval,
        "rejected_reason": "",
        "updated_at": now,
    })
    refreshed = await PurchaseOrder.get(str(po.id))
    await log_audit(
        module=AuditModule.purchase_orders,
        action="submit",
        user=current_user,
        request=request,
        entity_type="purchase_order",
        entity_id=str(po.id),
        previous=before,
        new=po_snapshot(refreshed),
    )
    return refreshed  # type: ignore[return-value]


async def approve_purchase_order(
    po: PurchaseOrder,
    *,
    current_user: User,
    request: Request | None = None,
) -> PurchaseOrder:
    if po.status != POStatus.pending_approval:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail="Only purchase orders pending approval can be approved",
        )
    before = po_snapshot(po)
    now = datetime.now(timezone.utc)
    await po.set({
        "status": POStatus.approved,
        "approved_by": current_user.name,
        "approved_at": now,
        "rejected_reason": "",
        "updated_at": now,
    })
    refreshed = await PurchaseOrder.get(str(po.id))
    await log_audit(
        module=AuditModule.purchase_orders,
        action="approve",
        user=current_user,
        request=request,
        entity_type="purchase_order",
        entity_id=str(po.id),
        previous=before,
        new=po_snapshot(refreshed),
    )
    return refreshed  # type: ignore[return-value]


async def reject_purchase_order(
    po: PurchaseOrder,
    *,
    reason: str,
    current_user: User,
    request: Request | None = None,
) -> PurchaseOrder:
    if po.status != POStatus.pending_approval:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail="Only purchase orders pending approval can be rejected",
        )
    before = po_snapshot(po)
    now = datetime.now(timezone.utc)
    await po.set({
        "status": POStatus.rejected,
        "rejected_reason": (reason or "").strip(),
        "approved_by": None,
        "approved_at": None,
        "updated_at": now,
    })
    refreshed = await PurchaseOrder.get(str(po.id))
    await log_audit(
        module=AuditModule.purchase_orders,
        action="reject",
        user=current_user,
        request=request,
        entity_type="purchase_order",
        entity_id=str(po.id),
        previous=before,
        new=po_snapshot(refreshed),
    )
    return refreshed  # type: ignore[return-value]


async def send_purchase_order(
    po: PurchaseOrder,
    *,
    current_user: User,
    request: Request | None = None,
) -> PurchaseOrder:
    """Mark approved PO as sent to supplier (status = ordered)."""
    if po.status != POStatus.approved:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail="Only approved purchase orders can be sent to the supplier",
        )
    before = po_snapshot(po)
    now = datetime.now(timezone.utc)
    updates: dict = {
        "status": POStatus.ordered,
        "updated_at": now,
    }
    if not po.ordered_by:
        updates["ordered_by"] = current_user.name
    await po.set(updates)
    refreshed = await PurchaseOrder.get(str(po.id))
    await log_audit(
        module=AuditModule.purchase_orders,
        action="send",
        user=current_user,
        request=request,
        entity_type="purchase_order",
        entity_id=str(po.id),
        previous=before,
        new=po_snapshot(refreshed),
    )
    return refreshed  # type: ignore[return-value]


async def close_purchase_order(
    po: PurchaseOrder,
    *,
    current_user: User,
    request: Request | None = None,
) -> PurchaseOrder:
    if po.status != POStatus.received:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail="Only fully received purchase orders can be closed",
        )
    before = po_snapshot(po)
    now = datetime.now(timezone.utc)
    await po.set({"status": POStatus.closed, "updated_at": now})
    refreshed = await PurchaseOrder.get(str(po.id))
    await log_audit(
        module=AuditModule.purchase_orders,
        action="close",
        user=current_user,
        request=request,
        entity_type="purchase_order",
        entity_id=str(po.id),
        previous=before,
        new=po_snapshot(refreshed),
    )
    return refreshed  # type: ignore[return-value]
