"""Amend a PO that already has received stock — keep batches and ledger in sync."""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import HTTPException, Request, status

from app.models.audit_log import AuditModule
from app.models.inventory import AdjustmentType, InventoryBatch
from app.models.product import Product
from app.models.purchase_order import (
    PurchaseOrder,
    PurchaseOrderItem,
    compute_payment_status,
    compute_po_status,
)
from app.models.user import User
from app.schemas.purchase_order import PurchaseOrderUpdate
from app.services.audit import log_audit, po_snapshot
from app.services.stock import (
    BatchDeduction,
    SignedBatchMove,
    batch_unit_cost,
    get_current_stock,
    log_signed_batch_moves,
    restock_from_deductions,
    sort_batches_fefo,
)


def _item_data(item: PurchaseOrderItem | dict) -> dict:
    if hasattr(item, "model_dump"):
        return item.model_dump()
    return dict(item)


def _units(item: PurchaseOrderItem) -> int:
    return int(getattr(item, "units_per_buy_uom", None) or 1)


def _landed_cost(unit_cost: float, units: int, fallback: float) -> float:
    cost_per_buy = unit_cost if unit_cost > 0 else fallback * units
    return round(cost_per_buy / units, 4) if units else round(cost_per_buy, 4)


async def _po_batch_leftover(product_id: str, po_id: str) -> int:
    batches = await InventoryBatch.find(
        InventoryBatch.product_id == product_id,
        InventoryBatch.purchase_order_id == po_id,
        InventoryBatch.quantity > 0,
    ).to_list()
    return sum(batch.quantity for batch in batches)


async def _deduct_from_po_batches(
    product_id: str,
    po_id: str,
    quantity: int,
    *,
    product_name: str,
) -> list[BatchDeduction]:
    if quantity <= 0:
        return []

    batches = await InventoryBatch.find(
        InventoryBatch.product_id == product_id,
        InventoryBatch.purchase_order_id == po_id,
        InventoryBatch.quantity > 0,
    ).to_list()
    leftover = sum(batch.quantity for batch in batches)
    if leftover < quantity:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Cannot reduce {product_name}: only {leftover} unit(s) remain "
                f"from this purchase order ({quantity} needed). "
                f"The rest have already been sold."
            ),
        )

    product = await Product.get(product_id)
    if not product:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=f"Product {product_name} not found")

    deductions: list[BatchDeduction] = []
    remaining = quantity
    for batch in sort_batches_fefo(batches):
        if remaining <= 0:
            break
        deduct = min(batch.quantity, remaining)
        if deduct <= 0:
            continue
        col = InventoryBatch.get_motor_collection()
        result = await col.update_one(
            {"_id": batch.id, "quantity": {"$gte": deduct}},
            {"$inc": {"quantity": -deduct}},
        )
        if result.matched_count != 1:
            continue
        deductions.append(BatchDeduction(
            product_id=product_id,
            batch_id=str(batch.id),
            quantity=deduct,
            unit_cost=batch_unit_cost(batch, product),
        ))
        remaining -= deduct

    if remaining > 0:
        if deductions:
            await restock_from_deductions(deductions)
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Cannot reduce {product_name}: leftover stock from this purchase order "
                f"changed while saving. Try again."
            ),
        )
    return deductions


async def _reverse_po_receive(
    *,
    product_id: str,
    product_name: str,
    po_id: str,
    base_qty: int,
    created_by: str,
) -> None:
    product = await Product.get(product_id)
    if not product:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=f"Product {product_name} not found")

    stock_before = await get_current_stock(product_id)
    deductions = await _deduct_from_po_batches(
        product_id, po_id, base_qty, product_name=product_name,
    )
    await log_signed_batch_moves(
        product=product,
        moves=[
            SignedBatchMove(
                batch_id=d.batch_id,
                quantity=-d.quantity,
                unit_cost=d.unit_cost,
            )
            for d in deductions
        ],
        stock_before=stock_before,
        adjustment_type=AdjustmentType.adjustment,
        reason="PO amend — reverse receive",
        created_by=created_by,
        reference_type="purchase_order",
        reference_id=po_id,
    )


async def _update_leftover_batch_cost(
    product_id: str,
    po_id: str,
    landed_cost: float,
) -> None:
    batches = await InventoryBatch.find(
        InventoryBatch.product_id == product_id,
        InventoryBatch.purchase_order_id == po_id,
        InventoryBatch.quantity > 0,
    ).to_list()
    for batch in batches:
        if abs((batch.unit_cost or 0) - landed_cost) > 0.0001:
            await batch.set({"unit_cost": landed_cost})


def _normalize_incoming(incoming: list) -> list[PurchaseOrderItem]:
    seen: set[str] = set()
    items: list[PurchaseOrderItem] = []
    for raw in incoming:
        data = _item_data(raw)
        pid = str(data.get("product_id") or "")
        if not pid:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Each line needs a product")
        if pid in seen:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                detail=f"Duplicate product on purchase order: {data.get('product_name') or pid}",
            )
        seen.add(pid)
        items.append(PurchaseOrderItem(**data))
    if not items:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Add at least one line")
    return items


async def amend_purchase_order(
    po: PurchaseOrder,
    body: PurchaseOrderUpdate,
    *,
    current_user: User,
    request: Request | None = None,
) -> PurchaseOrder:
    amount_paid = float(getattr(po, "amount_paid", 0) or 0)
    if body.total_amount + 0.001 < amount_paid:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Total amount cannot be less than amount already paid ({amount_paid:.2f}). "
                "Delete the extra PO expense to reverse payment first."
            ),
        )

    incoming = _normalize_incoming(body.items)
    existing_by_pid = {item.product_id: item for item in po.items}
    incoming_by_pid = {item.product_id: item for item in incoming}
    po_id = str(po.id)

    reverses: list[tuple[PurchaseOrderItem, int]] = []
    cost_updates: list[tuple[PurchaseOrderItem, float]] = []
    merged: list[PurchaseOrderItem] = []

    for new_item in incoming:
        old = existing_by_pid.get(new_item.product_id)
        if old is None:
            merged.append(new_item.model_copy(update={"received_quantity": 0}))
            continue

        if old.received_quantity > 0:
            if _units(new_item) != _units(old):
                raise HTTPException(
                    status.HTTP_400_BAD_REQUEST,
                    detail=(
                        f"Cannot change conversion rate for {old.product_name} "
                        "after stock was received"
                    ),
                )
            if (new_item.order_uom or "pcs") != (old.order_uom or "pcs") or (
                new_item.base_uom or "pcs"
            ) != (old.base_uom or "pcs"):
                raise HTTPException(
                    status.HTTP_400_BAD_REQUEST,
                    detail=f"Cannot change unit of measure for {old.product_name} after stock was received",
                )

        received = old.received_quantity
        if new_item.quantity < received:
            buy_delta = received - new_item.quantity
            base_delta = buy_delta * _units(old)
            leftover = await _po_batch_leftover(old.product_id, po_id)
            if leftover < base_delta:
                raise HTTPException(
                    status.HTTP_400_BAD_REQUEST,
                    detail=(
                        f"Cannot reduce {old.product_name}: only {leftover} unit(s) remain "
                        f"from this purchase order ({base_delta} needed). "
                        f"The rest have already been sold."
                    ),
                )
            reverses.append((old, base_delta))
            received = new_item.quantity

        merged.append(
            new_item.model_copy(
                update={
                    "received_quantity": received,
                    "order_uom": old.order_uom if old.received_quantity > 0 else new_item.order_uom,
                    "base_uom": old.base_uom if old.received_quantity > 0 else new_item.base_uom,
                    "units_per_buy_uom": _units(old) if old.received_quantity > 0 else _units(new_item),
                }
            )
        )
        if abs(float(new_item.unit_cost) - float(old.unit_cost)) > 0.0001:
            cost_updates.append((merged[-1], float(new_item.unit_cost)))

    for old in po.items:
        if old.product_id in incoming_by_pid:
            continue
        if old.received_quantity > 0:
            base_delta = old.received_quantity * _units(old)
            leftover = await _po_batch_leftover(old.product_id, po_id)
            if leftover < base_delta:
                raise HTTPException(
                    status.HTTP_400_BAD_REQUEST,
                    detail=(
                        f"Cannot remove {old.product_name}: only {leftover} unit(s) remain "
                        f"from this purchase order ({base_delta} needed). "
                        f"The rest have already been sold."
                    ),
                )
            reverses.append((old, base_delta))

    created_by = current_user.name
    for old, base_delta in reverses:
        await _reverse_po_receive(
            product_id=old.product_id,
            product_name=old.product_name,
            po_id=po_id,
            base_qty=base_delta,
            created_by=created_by,
        )

    for item, unit_cost in cost_updates:
        product = await Product.get(item.product_id)
        fallback = product.cost_price if product else 0.0
        landed = _landed_cost(unit_cost, _units(item), fallback)
        await _update_leftover_batch_cost(item.product_id, po_id, landed)
        if product and landed > 0 and abs(product.cost_price - landed) > 0.0001:
            await product.set({
                "cost_price": landed,
                "updated_at": datetime.now(timezone.utc),
            })

    before = po_snapshot(po)
    now = datetime.now(timezone.utc)
    ordered_by = (body.ordered_by or "").strip() or po.ordered_by
    updates = {
        "supplier_id": body.supplier_id,
        "supplier_name": body.supplier_name,
        "items": [item.model_dump() for item in merged],
        "total_amount": body.total_amount,
        "expected_delivery": body.expected_delivery,
        "ordered_by": ordered_by,
        "status": compute_po_status(merged),
        "payment_status": compute_payment_status(amount_paid, body.total_amount),
        "updated_at": now,
    }
    await po.set(updates)
    refreshed = await PurchaseOrder.get(po_id)
    if not refreshed:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Purchase order not found")

    if reverses or cost_updates:
        from app.services.response_cache import bump_commerce_caches
        await bump_commerce_caches()

    await log_audit(
        module=AuditModule.purchase_orders,
        action="amend",
        user=current_user,
        request=request,
        entity_type="purchase_order",
        entity_id=po_id,
        previous=before,
        new=po_snapshot(refreshed),
    )
    return refreshed
