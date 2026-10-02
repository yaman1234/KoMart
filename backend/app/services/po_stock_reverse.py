"""Reverse leftover PO-tagged inventory for purchase returns."""

from __future__ import annotations

from fastapi import HTTPException, status

from app.models.inventory import AdjustmentType, InventoryBatch
from app.models.product import Product
from app.models.purchase_order import PurchaseOrder
from app.services.stock import (
    BatchDeduction,
    SignedBatchMove,
    batch_unit_cost,
    get_current_stock,
    log_signed_batch_moves,
    restock_from_deductions,
    sort_batches_fefo,
)


async def leftover_for_po(product_id: str, po_id: str) -> int:
    batches = await InventoryBatch.find(
        InventoryBatch.product_id == product_id,
        InventoryBatch.purchase_order_id == po_id,
        InventoryBatch.quantity > 0,
    ).to_list()
    return sum(batch.quantity for batch in batches)


async def leftover_by_product_for_po(po_id: str, product_ids: list[str] | None = None) -> dict[str, int]:
    """One aggregation: leftover qty per product for a PO."""
    match: dict = {
        "purchase_order_id": po_id,
        "quantity": {"$gt": 0},
    }
    if product_ids:
        match["product_id"] = {"$in": list(product_ids)}
    col = InventoryBatch.get_motor_collection()
    rows = await col.aggregate(
        [
            {"$match": match},
            {"$group": {"_id": "$product_id", "qty": {"$sum": "$quantity"}}},
        ]
    ).to_list(None)
    return {str(r["_id"]): int(r.get("qty") or 0) for r in rows if r.get("_id")}


async def _po_ids_for_supplier(supplier_id: str) -> list[str]:
    """IDs only — no full PO document hydration."""
    col = PurchaseOrder.get_motor_collection()
    cursor = col.find(
        {"supplier_id": supplier_id},
        {"_id": 1},
    )
    return [str(doc["_id"]) for doc in await cursor.to_list(None)]


async def leftover_for_supplier(product_id: str, supplier_id: str) -> int:
    po_ids = await _po_ids_for_supplier(supplier_id)
    if not po_ids:
        return 0
    batches = await InventoryBatch.find(
        InventoryBatch.product_id == product_id,
        {"purchase_order_id": {"$in": po_ids}},
        InventoryBatch.quantity > 0,
    ).to_list()
    return sum(batch.quantity for batch in batches)


async def list_supplier_returnable_batches(supplier_id: str) -> list[InventoryBatch]:
    po_ids = await _po_ids_for_supplier(supplier_id)
    if not po_ids:
        return []
    return await InventoryBatch.find(
        {"purchase_order_id": {"$in": po_ids}, "quantity": {"$gt": 0}},
    ).to_list()


async def aggregate_supplier_returnable_by_product(supplier_id: str) -> dict[str, dict]:
    """qty / cost aggregates per product without loading full batch docs into Beanie."""
    po_ids = await _po_ids_for_supplier(supplier_id)
    if not po_ids:
        return {}
    col = InventoryBatch.get_motor_collection()
    rows = await col.aggregate(
        [
            {
                "$match": {
                    "purchase_order_id": {"$in": po_ids},
                    "quantity": {"$gt": 0},
                }
            },
            {
                "$group": {
                    "_id": "$product_id",
                    "qty": {"$sum": "$quantity"},
                    "cost_sum": {
                        "$sum": {
                            "$cond": [
                                {"$gt": ["$unit_cost", 0]},
                                {"$multiply": ["$unit_cost", "$quantity"]},
                                0,
                            ]
                        }
                    },
                    "cost_qty": {
                        "$sum": {
                            "$cond": [
                                {"$gt": ["$unit_cost", 0]},
                                "$quantity",
                                0,
                            ]
                        }
                    },
                }
            },
        ]
    ).to_list(None)
    out: dict[str, dict] = {}
    for r in rows:
        pid = str(r.get("_id") or "")
        if not pid:
            continue
        out[pid] = {
            "qty": int(r.get("qty") or 0),
            "cost_sum": float(r.get("cost_sum") or 0),
            "cost_qty": int(r.get("cost_qty") or 0),
        }
    return out


async def _deduct_from_batches(
    batches: list[InventoryBatch],
    quantity: int,
    *,
    product_id: str,
    product_name: str,
) -> list[BatchDeduction]:
    if quantity <= 0:
        return []

    leftover = sum(batch.quantity for batch in batches)
    if leftover < quantity:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Cannot return {quantity} unit(s) of {product_name}: "
                f"only {leftover} leftover from eligible purchase batches."
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
                f"Cannot return {product_name}: leftover stock changed while saving. Try again."
            ),
        )
    return deductions


async def reverse_po_batches(
    *,
    product_id: str,
    product_name: str,
    po_id: str,
    base_qty: int,
    created_by: str,
    reference_id: str,
    reason: str = "Purchase return — reverse receive",
) -> list[BatchDeduction]:
    product = await Product.get(product_id)
    if not product:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=f"Product {product_name} not found")

    batches = await InventoryBatch.find(
        InventoryBatch.product_id == product_id,
        InventoryBatch.purchase_order_id == po_id,
        InventoryBatch.quantity > 0,
    ).to_list()
    stock_before = await get_current_stock(product_id)
    deductions = await _deduct_from_batches(
        batches, base_qty, product_id=product_id, product_name=product_name,
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
        adjustment_type=AdjustmentType.purchase_return,
        reason=reason,
        created_by=created_by,
        reference_type="purchase_return",
        reference_id=reference_id,
    )
    return deductions


async def reverse_supplier_batches(
    *,
    product_id: str,
    product_name: str,
    supplier_id: str,
    base_qty: int,
    created_by: str,
    reference_id: str,
    reason: str = "Supplier return — reverse stock",
) -> list[BatchDeduction]:
    product = await Product.get(product_id)
    if not product:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=f"Product {product_name} not found")

    po_ids = await _po_ids_for_supplier(supplier_id)
    if not po_ids:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail=f"No purchase-order stock found for this supplier to return {product_name}",
        )
    batches = await InventoryBatch.find(
        InventoryBatch.product_id == product_id,
        {"purchase_order_id": {"$in": po_ids}},
        InventoryBatch.quantity > 0,
    ).to_list()
    stock_before = await get_current_stock(product_id)
    deductions = await _deduct_from_batches(
        batches, base_qty, product_id=product_id, product_name=product_name,
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
        adjustment_type=AdjustmentType.purchase_return,
        reason=reason,
        created_by=created_by,
        reference_type="purchase_return",
        reference_id=reference_id,
    )
    return deductions
