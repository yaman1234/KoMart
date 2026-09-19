"""Goods receipt — first-class receive document wrapping PO receive."""

from __future__ import annotations

from datetime import date, datetime, timezone

from fastapi import HTTPException, Request, status

from app.models.audit_log import AuditModule
from app.models.goods_receipt import GoodsReceipt, GoodsReceiptItem, GoodsReceiptStatus
from app.models.purchase_order import POStatus, PurchaseOrder
from app.models.user import User
from app.schemas.purchase_order import PurchaseOrderReceiveItem
from app.services.audit import log_audit
from app.services.po_receive import receive_purchase_order_items


RECEIVABLE = {POStatus.ordered, POStatus.partial}


async def _next_receipt_number() -> str:
    prefix = "GR-"
    count = await GoodsReceipt.find({"receipt_number": {"$regex": f"^{prefix}"}}).count()
    return f"{prefix}{str(count + 1).zfill(4)}"


def _gr_to_dict(gr: GoodsReceipt) -> dict:
    return {
        "id": str(gr.id),
        "receipt_number": gr.receipt_number,
        "purchase_order_id": gr.purchase_order_id,
        "order_number": gr.order_number,
        "supplier_id": gr.supplier_id,
        "supplier_name": gr.supplier_name,
        "status": gr.status.value if hasattr(gr.status, "value") else str(gr.status),
        "items": [i.model_dump() for i in (gr.items or [])],
        "bill_no": gr.bill_no or "",
        "bill_images": list(getattr(gr, "bill_images", None) or []),
        "delivery_note": gr.delivery_note or "",
        "receipt_date": gr.receipt_date or "",
        "received_by": gr.received_by or "",
        "notes": gr.notes or "",
        "replacement_for_return_id": gr.replacement_for_return_id or "",
        "total_amount": float(gr.total_amount or 0),
        "created_by": gr.created_by or "",
        "created_at": gr.created_at.isoformat() if gr.created_at else "",
        "updated_at": gr.updated_at.isoformat() if gr.updated_at else "",
        "confirmed_at": gr.confirmed_at.isoformat() if gr.confirmed_at else None,
    }


async def create_and_confirm_goods_receipt(
    po_id: str,
    receive_items: list[PurchaseOrderReceiveItem],
    *,
    created_by: str,
    current_user: User,
    request: Request | None = None,
    bill_no: str = "",
    bill_images: list[str] | None = None,
    notes: str = "",
    damaged_by_product: dict[str, int] | None = None,
    replacement_for_return_id: str = "",
) -> tuple[GoodsReceipt, PurchaseOrder]:
    """Create a confirmed GR and apply stock via existing receive service."""
    po = await PurchaseOrder.get(po_id)
    if not po:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Purchase order not found")
    if po.status not in RECEIVABLE and not replacement_for_return_id:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail="Goods can only be received for ordered or partially received purchase orders",
        )

    damaged_by_product = damaged_by_product or {}
    po_items = {i.product_id: i for i in (po.items or [])}
    gr_items: list[GoodsReceiptItem] = []
    stock_receive: list[PurchaseOrderReceiveItem] = []
    total_amount = 0.0

    for raw in receive_items:
        po_item = po_items.get(raw.product_id)
        if not po_item:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                detail=f"Product {raw.product_id} is not on this purchase order",
            )
        damaged = int(damaged_by_product.get(raw.product_id, 0) or 0)
        sellable = int(raw.receive_quantity) - damaged
        if sellable < 0:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                detail=f"Damaged qty cannot exceed receive qty for {po_item.product_name}",
            )
        units = int(getattr(raw, "units_per_buy_uom", None) or po_item.units_per_buy_uom or 1)
        prev = int(po_item.received_quantity or 0)
        gr_items.append(
            GoodsReceiptItem(
                product_id=po_item.product_id,
                product_name=po_item.product_name,
                ordered_quantity=po_item.quantity,
                previously_received=prev,
                receive_quantity=int(raw.receive_quantity),
                damaged_quantity=damaged,
                unit_cost=float(po_item.unit_cost or 0),
                units_per_buy_uom=units,
                order_uom=po_item.order_uom,
                base_uom=po_item.base_uom,
                expiry_date=raw.expiry_date,
            )
        )
        total_amount += sellable * float(po_item.unit_cost or 0)
        if sellable > 0:
            stock_receive.append(
                PurchaseOrderReceiveItem(
                    product_id=raw.product_id,
                    receive_quantity=sellable,
                    expiry_date=raw.expiry_date,
                    units_per_buy_uom=raw.units_per_buy_uom,
                )
            )

    if not stock_receive and not any(i.damaged_quantity > 0 for i in gr_items):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Nothing to receive")

    now = datetime.now(timezone.utc)
    images = [str(u).strip() for u in (bill_images or []) if str(u).strip()]
    gr = GoodsReceipt(
        receipt_number=await _next_receipt_number(),
        purchase_order_id=po_id,
        order_number=po.order_number,
        supplier_id=po.supplier_id,
        supplier_name=po.supplier_name,
        status=GoodsReceiptStatus.draft,
        items=gr_items,
        bill_no=(bill_no or "").strip(),
        bill_images=images,
        receipt_date=date.today().isoformat(),
        received_by=created_by,
        notes=(notes or "").strip(),
        replacement_for_return_id=(replacement_for_return_id or "").strip(),
        total_amount=round(total_amount, 2),
        created_by=created_by,
        created_at=now,
        updated_at=now,
    )
    await gr.insert()

    refreshed_po = po
    if stock_receive:
        if request is None:
            raise HTTPException(
                status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Request context required to confirm goods receipt",
            )
        refreshed_po = await receive_purchase_order_items(
            po_id,
            stock_receive,
            created_by=created_by,
            current_user=current_user,
            request=request,
            bill_no=bill_no,
            allow_replacement=bool((replacement_for_return_id or "").strip()),
        )

    await gr.set({
        "status": GoodsReceiptStatus.confirmed,
        "confirmed_at": now,
        "updated_at": now,
    })
    refreshed_gr = await GoodsReceipt.get(str(gr.id))
    if not refreshed_gr:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Goods receipt not found after confirm")

    bill = (bill_no or "").strip()
    po_updates: dict = {"updated_at": now}
    if bill:
        po_updates["bill_no"] = bill
    if images:
        existing = [str(u).strip() for u in (getattr(refreshed_po, "bill_images", None) or []) if str(u).strip()]
        merged = list(dict.fromkeys([*existing, *images]))
        po_updates["bill_images"] = merged
    if len(po_updates) > 1:
        await refreshed_po.set(po_updates)
        refreshed_po = await PurchaseOrder.get(po_id) or refreshed_po

    # Auto-create posted invoice from this GR (skip for replacement receipts — no AP)
    if not (refreshed_gr.replacement_for_return_id or "").strip():
        from app.services.purchase_invoice_service import create_invoice_from_goods_receipt
        try:
            await create_invoice_from_goods_receipt(
                refreshed_gr, current_user=current_user, request=request,
            )
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(
                status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Goods receipt confirmed but invoice creation failed: {exc}",
            ) from exc

    await log_audit(
        module=AuditModule.purchase_orders,
        action="goods_receipt_confirm",
        user=current_user,
        request=request,
        entity_type="goods_receipt",
        entity_id=str(refreshed_gr.id),
        new=_gr_to_dict(refreshed_gr),
    )
    return refreshed_gr, refreshed_po


async def list_goods_receipts_for_po(po_id: str) -> list[dict]:
    docs = (
        await GoodsReceipt.find(GoodsReceipt.purchase_order_id == po_id)
        .sort([("created_at", -1)])
        .to_list()
    )
    return [_gr_to_dict(d) for d in docs]
