"""Central stock operations — inventory_batches are the source of truth."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone

from fastapi import HTTPException, status

from app.models.inventory import AdjustmentType, InventoryBatch, StockAdjustment
from app.models.product import Product


@dataclass
class BatchDeduction:
    product_id: str
    batch_id: str
    quantity: int


def sort_batches_fefo(batches: list[InventoryBatch]) -> list[InventoryBatch]:
    """First-expiry-first-out; batches without expiry are consumed last."""

    def sort_key(batch: InventoryBatch) -> tuple[str, str]:
        expiry = batch.expiry_date or "9999-12-31"
        return expiry, batch.received_at.isoformat()

    return sorted(batches, key=sort_key)


async def get_batch_total(product_id: str) -> int:
    batches = await InventoryBatch.find(
        InventoryBatch.product_id == product_id,
        InventoryBatch.quantity > 0,
    ).to_list()
    return sum(batch.quantity for batch in batches)


async def refresh_product_stock(product: Product) -> int:
    total = await get_batch_total(str(product.id))
    await product.set({"stock": total, "updated_at": datetime.now(timezone.utc)})
    return total


async def refresh_all_product_stocks() -> None:
    products = await Product.find(Product.is_active == True).to_list()  # noqa: E712
    for product in products:
        await refresh_product_stock(product)


async def get_sorted_batches(product_id: str) -> list[InventoryBatch]:
    batches = await InventoryBatch.find(InventoryBatch.product_id == product_id).to_list()
    return sort_batches_fefo(batches)


async def check_stock_available(product_id: str, quantity: int) -> None:
    if quantity <= 0:
        return
    available = await get_batch_total(product_id)
    if available < quantity:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail=f"Insufficient stock. Available: {available}, requested: {quantity}",
        )


async def deduct_stock_fefo(product_id: str, quantity: int) -> list[BatchDeduction]:
    if quantity <= 0:
        return []

    batches = await InventoryBatch.find(
        InventoryBatch.product_id == product_id,
        InventoryBatch.quantity > 0,
    ).to_list()
    available = sum(batch.quantity for batch in batches)
    if available < quantity:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail=f"Insufficient stock. Available: {available}, requested: {quantity}",
        )

    deductions: list[BatchDeduction] = []
    remaining = quantity
    for batch in sort_batches_fefo(batches):
        if remaining <= 0:
            break
        deduct = min(batch.quantity, remaining)
        await batch.set({"quantity": batch.quantity - deduct})
        deductions.append(BatchDeduction(
            product_id=product_id,
            batch_id=str(batch.id),
            quantity=deduct,
        ))
        remaining -= deduct

    product = await Product.get(product_id)
    if not product:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Product not found")
    await refresh_product_stock(product)
    return deductions


async def restock_from_deductions(deductions: list[BatchDeduction]) -> None:
    """Restore quantities deducted during a failed sale."""
    touched_products: set[str] = set()
    for d in deductions:
        batch = await InventoryBatch.get(d.batch_id)
        if batch:
            await batch.set({"quantity": batch.quantity + d.quantity})
            touched_products.add(d.product_id)

    for product_id in touched_products:
        product = await Product.get(product_id)
        if product:
            await refresh_product_stock(product)


async def receive_stock(
    product_id: str,
    batch_number: str,
    quantity: int,
    *,
    expiry_date: str | None = None,
    purchase_order_id: str | None = None,
) -> InventoryBatch:
    if quantity < 1:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Quantity must be at least 1")

    product = await Product.get(product_id)
    if not product:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Product not found")

    batch = InventoryBatch(
        product_id=product_id,
        batch_number=batch_number,
        quantity=quantity,
        expiry_date=expiry_date,
        purchase_order_id=purchase_order_id,
        received_at=datetime.now(timezone.utc),
    )
    await batch.insert()
    await refresh_product_stock(product)
    return batch


async def adjust_stock(
    product_id: str,
    quantity: int,
    adjustment_type: AdjustmentType,
    reason: str,
    created_by: str,
    batch_id: str | None = None,
) -> int:
    if quantity == 0:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Quantity cannot be zero")

    product = await Product.get(product_id)
    if not product:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Product not found")

    affected_batch_id = batch_id

    if batch_id:
        batch = await InventoryBatch.get(batch_id)
        if not batch or batch.product_id != product_id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Batch not found")
        new_qty = max(0, batch.quantity + quantity)
        await batch.set({"quantity": new_qty})
        await refresh_product_stock(product)
    elif quantity < 0:
        await deduct_stock_fefo(product_id, abs(quantity))
    else:
        batch = InventoryBatch(
            product_id=product_id,
            batch_number=f"ADJ-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}",
            quantity=quantity,
            received_at=datetime.now(timezone.utc),
        )
        await batch.insert()
        affected_batch_id = str(batch.id)
        await refresh_product_stock(product)

    adjustment = StockAdjustment(
        product_id=product_id,
        batch_id=affected_batch_id,
        type=adjustment_type,
        quantity=quantity,
        reason=reason,
        created_by=created_by,
    )
    await adjustment.insert()

    refreshed = await Product.get(product_id)
    return refreshed.stock if refreshed else 0


async def expiring_product_ids(within_days: int = 30) -> set[str]:
    today = date.today().isoformat()
    cutoff = (date.today() + timedelta(days=within_days)).isoformat()
    batches = await InventoryBatch.find(
        InventoryBatch.quantity > 0,
        {"expiry_date": {"$gte": today, "$lte": cutoff}},
    ).to_list()
    return {batch.product_id for batch in batches}


def nearest_expiry(batches: list[InventoryBatch]) -> str | None:
    active = [batch for batch in batches if batch.quantity > 0 and batch.expiry_date]
    if not active:
        return None
    return min(batch.expiry_date for batch in active if batch.expiry_date)
