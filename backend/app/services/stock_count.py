"""Stock Count service — snapshot, count, variance, approval → stock adjustments."""
from __future__ import annotations

from datetime import datetime, timezone, date
from math import ceil

from fastapi import HTTPException, status

from app.models.inventory import AdjustmentType, StockAdjustment
from app.models.product import Product
from app.models.stock_count import (
    CountMode,
    CountType,
    StockCount,
    StockCountAuditEntry,
    StockCountItem,
    StockCountStatus,
)
from app.models.user import User
from app.services.stock import adjust_stock, get_current_stock_batch


# ── helpers ──────────────────────────────────────────────────────────────────

async def _units_sold_in_window(product_id: str, since: datetime, until: datetime) -> int:
    """Sum of sale quantities for a product between snapshot time and counted_at."""
    col = StockAdjustment.get_motor_collection()
    pipeline = [
        {"$match": {
            "product_id": product_id,
            "type": "sale",
            "created_at": {"$gte": since, "$lte": until},
        }},
        {"$group": {"_id": None, "total": {"$sum": {"$abs": "$quantity"}}}},
    ]
    result = await col.aggregate(pipeline).to_list(1)
    return int(result[0]["total"]) if result else 0


def _apply_adjusted_variance(item: StockCountItem, physical_qty: int, units_sold: int) -> None:
    """Set adjusted_snapshot_qty, units_sold_in_window, variance_qty, variance_value."""
    item.units_sold_in_window = units_sold
    item.adjusted_snapshot_qty = item.snapshot_qty - units_sold
    item.physical_qty = physical_qty
    item.variance_qty = physical_qty - item.adjusted_snapshot_qty
    item.variance_value = round(item.variance_qty * item.unit_cost, 2)

async def _next_count_number() -> str:
    year = datetime.now(timezone.utc).year
    prefix = f"SC-{year}-"
    col = StockCount.get_motor_collection()
    last = await col.find_one(
        {"count_number": {"$regex": f"^{prefix}"}},
        sort=[("count_number", -1)],
    )
    if last:
        try:
            seq = int(last["count_number"].split("-")[-1]) + 1
        except (ValueError, IndexError):
            seq = 1
    else:
        seq = 1
    return f"{prefix}{seq:04d}"


def _audit(sc: StockCount, action: str, user: User, note: str = "") -> None:
    sc.audit_trail.append(StockCountAuditEntry(
        action=action,
        user_name=user.name,
        user_id=str(user.id),
        note=note,
    ))


def _recompute_summary(sc: StockCount) -> None:
    counted = [i for i in sc.items if i.physical_qty is not None]
    matched = short = excess = 0
    shortage_val = excess_val = 0.0
    for item in counted:
        v = item.variance_qty or 0
        if v == 0:
            matched += 1
        elif v < 0:
            short += 1
            shortage_val += abs(item.variance_value or 0.0)
        else:
            excess += 1
            excess_val += item.variance_value or 0.0

    sc.total_products = len(sc.items)
    sc.counted_products = len(counted)
    sc.matched_count = matched
    sc.short_count = short
    sc.excess_count = excess
    sc.shortage_value = round(shortage_val, 2)
    sc.excess_value = round(excess_val, 2)
    sc.net_variance_value = round(excess_val - shortage_val, 2)
    total = sc.total_products
    sc.stock_accuracy_pct = round(matched / total * 100, 2) if total else 100.0


# ── create ────────────────────────────────────────────────────────────────────

async def create_stock_count(
    *,
    count_type: CountType,
    count_mode: CountMode,
    category_filter: str,
    product_ids: list[str],
    notes: str,
    count_date: str,
    user: User,
) -> StockCount:
    # Resolve products
    match: dict = {"is_active": True}
    if count_type == CountType.category and category_filter:
        match["category"] = category_filter
    elif count_type == CountType.selected and product_ids:
        from beanie import PydanticObjectId
        match["_id"] = {"$in": [PydanticObjectId(pid) for pid in product_ids]}

    products = await Product.find(match).sort("name").to_list()
    if not products:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="No products found for this count.")

    # Snapshot current stock
    pids = [str(p.id) for p in products]
    stock_map = await get_current_stock_batch(pids)

    items = [
        StockCountItem(
            product_id=str(p.id),
            product_name=p.name,
            sku=p.sku,
            barcode=p.barcode or "",
            category=p.category or "",
            uom=p.uom or "pcs",
            image_url=p.images[0] if p.images else "",
            unit_cost=p.cost_price,
            snapshot_qty=stock_map.get(str(p.id), 0),
        )
        for p in products
    ]

    sc = StockCount(
        count_number=await _next_count_number(),
        status=StockCountStatus.counting,
        count_type=count_type,
        count_mode=count_mode,
        category_filter=category_filter,
        notes=notes,
        items=items,
        total_products=len(items),
        snapshot_taken_at=datetime.now(timezone.utc),
        created_by=user.name,
        created_by_id=str(user.id),
        count_date=count_date or date.today().isoformat(),
    )
    _audit(sc, "stock_count_created", user)
    _audit(sc, "snapshot_taken", user, f"{len(items)} products snapshotted")
    await sc.insert()
    return sc


# ── record physical count ─────────────────────────────────────────────────────

async def record_count(
    sc: StockCount,
    product_id: str,
    physical_qty: int,
    user: User,
) -> StockCount:
    if sc.status not in (StockCountStatus.counting, StockCountStatus.recount_required):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Count is not in counting state.")

    item = next((i for i in sc.items if i.product_id == product_id), None)
    if not item:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Product not in this count.")

    counted_at = datetime.now(timezone.utc)
    units_sold = await _units_sold_in_window(product_id, sc.snapshot_taken_at or sc.created_at, counted_at)
    _apply_adjusted_variance(item, physical_qty, units_sold)
    item.counted_by = user.name
    item.counted_at = counted_at

    _recompute_summary(sc)
    sc.updated_at = datetime.now(timezone.utc)
    await sc.save()
    return sc


# ── bulk count update (for mobile counting screen) ────────────────────────────

async def bulk_record_count(
    sc: StockCount,
    updates: list[dict],  # [{product_id, physical_qty}]
    user: User,
) -> StockCount:
    if sc.status not in (StockCountStatus.counting, StockCountStatus.recount_required):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Count is not in counting state.")

    item_map = {i.product_id: i for i in sc.items}
    counted_at = datetime.now(timezone.utc)
    snapshot_time = sc.snapshot_taken_at or sc.created_at
    for upd in updates:
        item = item_map.get(upd["product_id"])
        if not item:
            continue
        qty = int(upd["physical_qty"])
        units_sold = await _units_sold_in_window(upd["product_id"], snapshot_time, counted_at)
        _apply_adjusted_variance(item, qty, units_sold)
        item.counted_by = user.name
        item.counted_at = counted_at

    _recompute_summary(sc)
    sc.updated_at = datetime.now(timezone.utc)
    await sc.save()
    return sc


# ── submit ────────────────────────────────────────────────────────────────────

async def submit_count(sc: StockCount, user: User) -> StockCount:
    if sc.status != StockCountStatus.counting:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Only counting counts can be submitted.")
    _recompute_summary(sc)
    sc.status = StockCountStatus.submitted
    _audit(sc, "count_submitted", user, f"{sc.counted_products}/{sc.total_products} products counted")
    sc.updated_at = datetime.now(timezone.utc)
    await sc.save()
    return sc


# ── request recount ───────────────────────────────────────────────────────────

async def request_recount(sc: StockCount, user: User, note: str = "") -> StockCount:
    if sc.status not in (StockCountStatus.submitted, StockCountStatus.under_review):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Recount can only be requested after submission.")
    sc.status = StockCountStatus.recount_required
    _audit(sc, "recount_requested", user, note)
    sc.updated_at = datetime.now(timezone.utc)
    await sc.save()
    return sc


# ── record recount ────────────────────────────────────────────────────────────

async def record_recount(
    sc: StockCount,
    product_id: str,
    recount_qty: int,
    user: User,
) -> StockCount:
    if sc.status != StockCountStatus.recount_required:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Recount not requested.")

    item = next((i for i in sc.items if i.product_id == product_id), None)
    if not item:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Product not in this count.")

    recounted_at = datetime.now(timezone.utc)
    units_sold = await _units_sold_in_window(product_id, sc.snapshot_taken_at or sc.created_at, recounted_at)
    item.recount_qty = recount_qty
    item.recounted_by = user.name
    item.recounted_at = recounted_at
    # recount becomes the physical qty; recalculate with fresh window
    _apply_adjusted_variance(item, recount_qty, units_sold)
    item.counted_at = recounted_at  # update window end for display

    _recompute_summary(sc)
    _audit(sc, "recount_recorded", user, f"{item.product_name}: recount={recount_qty}")
    sc.updated_at = datetime.now(timezone.utc)
    await sc.save()
    return sc


# ── set variance reason ───────────────────────────────────────────────────────

async def set_variance_reason(
    sc: StockCount,
    product_id: str,
    reason: str,
    reason_note: str,
    final_qty: int | None,
    user: User,
) -> StockCount:
    if sc.status not in (StockCountStatus.submitted, StockCountStatus.under_review, StockCountStatus.recount_required):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Cannot set reason in current status.")

    item = next((i for i in sc.items if i.product_id == product_id), None)
    if not item:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Product not in this count.")

    if reason == "Other" and not reason_note:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="A note is required when reason is 'Other'.")

    item.reason = reason
    item.reason_note = reason_note
    if final_qty is not None:
        item.final_qty = final_qty
        # final_qty override: recalculate variance against adjusted snapshot
        adj = item.adjusted_snapshot_qty if item.adjusted_snapshot_qty is not None else item.snapshot_qty
        item.physical_qty = final_qty
        item.variance_qty = final_qty - adj
        item.variance_value = round(item.variance_qty * item.unit_cost, 2)
        _recompute_summary(sc)

    if sc.status == StockCountStatus.submitted:
        sc.status = StockCountStatus.under_review

    sc.updated_at = datetime.now(timezone.utc)
    await sc.save()
    return sc


# ── approve ───────────────────────────────────────────────────────────────────

async def approve_count(sc: StockCount, user: User, notes: str = "") -> StockCount:
    if sc.status not in (StockCountStatus.submitted, StockCountStatus.under_review):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Count must be submitted or under review to approve.")

    # Idempotency guard — prevent double approval
    if sc.adjustment_id:
        raise HTTPException(status.HTTP_409_CONFLICT, detail="Stock adjustments already created for this count.")

    _recompute_summary(sc)
    sc.status = StockCountStatus.approved
    sc.approved_by = user.name
    sc.approved_by_id = str(user.id)
    _audit(sc, "count_approved", user, notes)

    # Create stock adjustments for all variance items
    adj_ids: list[str] = []
    for item in sc.items:
        if item.variance_qty is None or item.variance_qty == 0:
            continue
        final_qty = item.final_qty if item.final_qty is not None else item.physical_qty
        if final_qty is None:
            continue
        adj = item.adjusted_snapshot_qty if item.adjusted_snapshot_qty is not None else item.snapshot_qty
        variance = final_qty - adj
        if variance == 0:
            continue
        try:
            await adjust_stock(
                item.product_id,
                variance,
                AdjustmentType.correction,
                f"Stock Count {sc.count_number}",
                user.name,
            )
            adj_ids.append(item.product_id)
        except HTTPException:
            # Log but don't abort — partial adjustments are better than none
            _audit(sc, "adjustment_failed", user, f"Failed for {item.product_name}")

    sc.adjustment_id = sc.count_number  # use count number as reference
    sc.status = StockCountStatus.completed
    _audit(sc, "stock_adjustments_created", user, f"{len(adj_ids)} products adjusted")
    _audit(sc, "count_completed", user)
    sc.updated_at = datetime.now(timezone.utc)
    await sc.save()
    return sc


# ── cancel ────────────────────────────────────────────────────────────────────

async def cancel_count(sc: StockCount, user: User, note: str = "") -> StockCount:
    if sc.status in (StockCountStatus.completed, StockCountStatus.cancelled):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Cannot cancel a completed or already cancelled count.")
    if sc.adjustment_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Cannot cancel after adjustments have been created.")
    sc.status = StockCountStatus.cancelled
    _audit(sc, "count_cancelled", user, note)
    sc.updated_at = datetime.now(timezone.utc)
    await sc.save()
    return sc


# ── list ──────────────────────────────────────────────────────────────────────

async def list_stock_counts(
    *,
    page: int = 1,
    page_size: int = 25,
    status_filter: str = "",
    count_type: str = "",
    search: str = "",
    start_date: str = "",
    end_date: str = "",
) -> tuple[list[StockCount], int]:
    query: dict = {}
    if status_filter:
        query["status"] = status_filter
    if count_type:
        query["count_type"] = count_type
    if search:
        query["count_number"] = {"$regex": search, "$options": "i"}
    if start_date or end_date:
        date_q: dict = {}
        if start_date:
            date_q["$gte"] = start_date
        if end_date:
            date_q["$lte"] = end_date
        query["count_date"] = date_q

    col = StockCount.get_motor_collection()
    total = await col.count_documents(query)
    rows = (
        await StockCount.find(query)
        .sort("-created_at")
        .skip((page - 1) * page_size)
        .limit(page_size)
        .to_list()
    )
    return rows, total
