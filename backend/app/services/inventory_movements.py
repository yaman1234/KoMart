"""Inventory movement ledger — query and presentation helpers."""

from __future__ import annotations

from datetime import datetime, timezone

from beanie import PydanticObjectId
from fastapi import HTTPException, status

from app.models.inventory import AdjustmentType, InventoryBatch, StockAdjustment
from app.models.product import Product
from app.models.transaction import Transaction
from app.services.stock import get_current_stock

MOVEMENT_LABELS: dict[str, str] = {
    "sale": "Sale",
    "void": "Sale void",
    "receive": "Stock In",
    "purchase_order": "PO Receive",
    "adjustment": "Adjustment",
    "damaged": "Damaged / Expired",
    "correction": "Correction",
}


def movement_direction(quantity: int) -> str:
    return "in" if quantity > 0 else "out"


def movement_label(reference_type: str, adjustment_type: AdjustmentType) -> str:
    if adjustment_type == AdjustmentType.void:
        return MOVEMENT_LABELS["void"]
    if reference_type in MOVEMENT_LABELS:
        return MOVEMENT_LABELS[reference_type]
    return MOVEMENT_LABELS.get(adjustment_type.value, adjustment_type.value.title())


async def resolve_reference(
    adj: StockAdjustment,
    batch_po_map: dict[str, str] | None = None,
) -> tuple[str, str]:
    if adj.reference_type and adj.reference_id:
        return adj.reference_type, adj.reference_id
    if adj.transaction_id:
        return "sale", adj.transaction_id
    if adj.type == AdjustmentType.sale:
        return "sale", adj.transaction_id or ""
    if adj.type == AdjustmentType.receive and adj.batch_id:
        po_id = (batch_po_map or {}).get(adj.batch_id, "")
        if po_id:
            return "purchase_order", po_id
        return "receive", adj.batch_id
    return adj.type.value, adj.batch_id or ""


def _reference_label(*, ref_type: str, txn_number: str, batch_number: str) -> str:
    if ref_type == "sale":
        return txn_number
    return batch_number


async def build_movement_row(
    adj: StockAdjustment,
    *,
    txn_numbers: dict[str, str] | None = None,
    batch_po_map: dict[str, str] | None = None,
    batch_numbers: dict[str, str] | None = None,
    sku_cache: dict[str, str] | None = None,
) -> dict:
    ref_type, ref_id = await resolve_reference(adj, batch_po_map)
    sku = adj.product_sku or (sku_cache or {}).get(adj.product_id, "")
    txn_number = ""
    if ref_type == "sale" and ref_id and txn_numbers:
        txn_number = txn_numbers.get(ref_id, "")
    batch_key = adj.batch_id or (ref_id if ref_type != "sale" else "")
    batch_number = (batch_numbers or {}).get(batch_key, "") if batch_key else ""

    return {
        "id": str(adj.id),
        "product_id": adj.product_id,
        "product_name": adj.product_name,
        "product_sku": sku,
        "batch_id": adj.batch_id,
        "transaction_id": adj.transaction_id,
        "reference_type": ref_type,
        "reference_id": ref_id,
        "reference_label": _reference_label(
            ref_type=ref_type,
            txn_number=txn_number,
            batch_number=batch_number,
        ),
        "transaction_number": txn_number,
        "type": adj.type.value,
        "direction": movement_direction(adj.quantity),
        "movement_label": movement_label(ref_type, adj.type),
        "quantity": adj.quantity,
        "stock_before": adj.stock_before,
        "stock_after": adj.stock_after,
        "unit_cost": adj.unit_cost,
        "extended_cost": adj.extended_cost,
        "unit_selling_price": adj.unit_selling_price,
        "extended_revenue": adj.extended_revenue,
        "reason": adj.reason,
        "created_by": adj.created_by,
        "created_at": adj.created_at.isoformat(),
    }


async def load_batch_lookups(batch_ids: set[str]) -> tuple[dict[str, str], dict[str, str]]:
    """Return (purchase_order_id_by_batch, batch_number_by_batch)."""
    if not batch_ids:
        return {}, {}
    oids = []
    for bid in batch_ids:
        try:
            oids.append(PydanticObjectId(bid))
        except Exception:
            continue
    if not oids:
        return {}, {}
    batches = await InventoryBatch.find({"_id": {"$in": oids}}).to_list()
    po_map = {
        str(b.id): b.purchase_order_id
        for b in batches
        if b.purchase_order_id
    }
    number_map = {
        str(b.id): b.batch_number
        for b in batches
        if b.batch_number
    }
    return po_map, number_map


async def load_batch_po_map(batch_ids: set[str]) -> dict[str, str]:
    po_map, _ = await load_batch_lookups(batch_ids)
    return po_map


async def load_txn_numbers(txn_ids: set[str]) -> dict[str, str]:
    if not txn_ids:
        return {}
    oids = []
    for tid in txn_ids:
        try:
            oids.append(PydanticObjectId(tid))
        except Exception:
            continue
    if not oids:
        return {}
    txns = await Transaction.find({"_id": {"$in": oids}}).to_list()
    return {str(t.id): t.transaction_number for t in txns}


async def load_sku_cache(product_ids: set[str]) -> dict[str, str]:
    if not product_ids:
        return {}
    oids = []
    for pid in product_ids:
        try:
            oids.append(PydanticObjectId(pid))
        except Exception:
            continue
    if not oids:
        return {}
    products = await Product.find({"_id": {"$in": oids}}).to_list()
    return {str(p.id): p.sku for p in products}


async def product_ids_for_search(search: str) -> list[str] | None:
    if not search.strip():
        return None
    products = await Product.find({
        "$or": [
            {"name": {"$regex": search, "$options": "i"}},
            {"sku": {"$regex": search, "$options": "i"}},
        ],
    }).to_list()
    return [str(p.id) for p in products]


def parse_movement_date_filters(
    start_date: str,
    end_date: str,
) -> dict[str, datetime]:
    filters: dict[str, datetime] = {}
    if start_date:
        start = datetime.fromisoformat(start_date)
        if start.tzinfo is None:
            start = start.replace(tzinfo=timezone.utc)
        filters["$gte"] = start
    if end_date:
        end = datetime.fromisoformat(end_date)
        if end.tzinfo is None:
            end = end.replace(tzinfo=timezone.utc)
        end = end.replace(hour=23, minute=59, second=59)
        filters["$lte"] = end
    return filters


async def product_stock_rollforward(
    product_id: str,
    start_date: str,
    end_date: str,
) -> dict[str, int]:
    """Opening from the ledger (stock before the first row in range), then In/Out/close."""
    dates = parse_movement_date_filters(start_date, end_date)
    period_filter: dict = {"product_id": product_id}
    if dates:
        period_filter["created_at"] = dates

    period_in_out = await aggregate_movement_summary(period_filter)
    period_in = int(period_in_out["total_in"])
    period_out = int(period_in_out["total_out"])

    opening = 0
    if "$gte" in dates:
        last_before = (
            await StockAdjustment.find({
                "product_id": product_id,
                "created_at": {"$lt": dates["$gte"]},
            })
            .sort("-created_at")
            .first_or_none()
        )
        if last_before is not None:
            opening = int(last_before.stock_after)
        else:
            first_in = (
                await StockAdjustment.find(period_filter)
                .sort("+created_at")
                .first_or_none()
            )
            if first_in is not None:
                opening = int(first_in.stock_before)
    else:
        first_in = (
            await StockAdjustment.find({"product_id": product_id})
            .sort("+created_at")
            .first_or_none()
        )
        if first_in is not None:
            opening = int(first_in.stock_before)

    ledger_close = opening + period_in - period_out
    on_hand = await get_current_stock(product_id)
    book = await product_book_stock(product_id)
    return {
        "opening_stock": opening,
        "closing_stock": ledger_close,
        "period_in": period_in,
        "period_out": period_out,
        "on_hand": on_hand,
        "variance": on_hand - book,
    }


async def product_book_stock(product_id: str) -> int:
    """All-time rollforward: first Before + In − Out.

    Last After can still match Current Stock after an old clipped correction
    (logged −20, moved 18). The quantity sum is the book the cards show.
    """
    first = (
        await StockAdjustment.find({"product_id": product_id})
        .sort("+created_at")
        .first_or_none()
    )
    if first is None:
        return 0
    totals = await aggregate_movement_summary({"product_id": product_id})
    return int(first.stock_before) + int(totals["total_in"]) - int(totals["total_out"])


async def product_integrity(product_id: str) -> dict[str, int]:
    on_hand = await get_current_stock(product_id)
    book = await product_book_stock(product_id)
    return {
        "on_hand": on_hand,
        "ledger_close": book,
        "variance": on_hand - book,
    }


def _as_pid(value: object) -> str:
    return str(value)


async def list_integrity_rows(
    *,
    only_out_of_sync: bool = True,
    product_id: str = "",
) -> list[dict]:
    if product_id:
        product = await Product.get(product_id)
        products = [product] if product else []
    else:
        products = await Product.find(Product.is_active == True).to_list()  # noqa: E712
    catalog = {str(p.id): p for p in products if p is not None}
    if not catalog:
        return []

    last_rows = await StockAdjustment.aggregate([
        {"$sort": {"created_at": 1}},
        {"$group": {
            "_id": "$product_id",
            "opening": {"$first": "$stock_before"},
            "total_in": {
                "$sum": {"$cond": [{"$gt": ["$quantity", 0]}, "$quantity", 0]},
            },
            "total_out": {
                "$sum": {"$cond": [{"$lt": ["$quantity", 0]}, {"$abs": "$quantity"}, 0]},
            },
        }},
    ]).to_list()
    book_by_pid = {
        _as_pid(row["_id"]): (
            int(row.get("opening") or 0)
            + int(row.get("total_in") or 0)
            - int(row.get("total_out") or 0)
        )
        for row in last_rows
        if row.get("_id")
    }

    on_hand_rows = await InventoryBatch.aggregate([
        {"$match": {"quantity": {"$gt": 0}}},
        {"$group": {"_id": "$product_id", "on_hand": {"$sum": "$quantity"}}},
    ]).to_list()
    on_hand_by_pid = {
        _as_pid(row["_id"]): int(row.get("on_hand") or 0)
        for row in on_hand_rows
        if row.get("_id")
    }

    rows: list[dict] = []
    for pid, product in catalog.items():
        on_hand = on_hand_by_pid.get(pid, 0)
        book = int(book_by_pid.get(pid) or 0)
        variance = on_hand - book
        if only_out_of_sync and variance == 0:
            continue
        rows.append({
            "product_id": pid,
            "product_name": product.name,
            "product_sku": product.sku,
            "on_hand": on_hand,
            "ledger_close": book,
            "variance": variance,
        })
    rows.sort(key=lambda r: abs(int(r["variance"])), reverse=True)
    return rows


async def count_out_of_sync_skus() -> int:
    return len(await list_integrity_rows(only_out_of_sync=True))


async def align_ledger_to_on_hand(
    product_id: str,
    reason: str,
    created_by: str,
) -> dict[str, int]:
    """Write one correction so the diary matches Current Stock. Batches stay put."""
    if not reason.strip():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Reason is required")

    product = await Product.get(product_id)
    if not product:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Product not found")

    from app.services.stock import assert_stock_matches_ledger, record_inventory_change

    on_hand = await get_current_stock(product_id)
    book = await product_book_stock(product_id)
    qty = on_hand - book
    if qty == 0:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail="Ledger already matches Current Stock",
        )

    await record_inventory_change(
        product=product,
        quantity=qty,
        adjustment_type=AdjustmentType.correction,
        reason=reason.strip(),
        created_by=created_by,
        stock_before=book,
        stock_after=on_hand,
        reference_type="correction",
        reference_id="",
    )
    await assert_stock_matches_ledger(product_id, book, qty, on_hand)
    return {
        "on_hand": on_hand,
        "ledger_close": on_hand,
        "variance": 0,
    }


async def aggregate_movement_summary(match_filter: dict) -> dict[str, int | float]:
    pipeline: list[dict] = []
    if match_filter:
        pipeline.append({"$match": match_filter})
    pipeline.append({
        "$group": {
            "_id": None,
            "movement_count": {"$sum": 1},
            "total_in": {
                "$sum": {"$cond": [{"$gt": ["$quantity", 0]}, "$quantity", 0]},
            },
            "total_out": {
                "$sum": {"$cond": [{"$lt": ["$quantity", 0]}, {"$abs": "$quantity"}, 0]},
            },
        },
    })
    rows = await StockAdjustment.aggregate(pipeline).to_list()
    if not rows:
        return {"movement_count": 0, "total_in": 0, "total_out": 0}
    row = rows[0]
    return {
        "movement_count": int(row["movement_count"]),
        "total_in": int(row["total_in"]),
        "total_out": int(row["total_out"]),
    }
