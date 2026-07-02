"""Inventory movement ledger — query and presentation helpers."""

from __future__ import annotations

from datetime import datetime, timezone

from beanie import PydanticObjectId

from app.models.inventory import AdjustmentType, InventoryBatch, StockAdjustment
from app.models.product import Product
from app.models.transaction import Transaction

MOVEMENT_LABELS: dict[str, str] = {
    "sale": "Sale",
    "receive": "Stock In",
    "purchase_order": "PO Receive",
    "adjustment": "Adjustment",
    "damaged": "Damaged / Expired",
    "correction": "Correction",
}


def movement_direction(quantity: int) -> str:
    return "in" if quantity > 0 else "out"


def movement_label(reference_type: str, adjustment_type: AdjustmentType) -> str:
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


async def build_movement_row(
    adj: StockAdjustment,
    *,
    txn_numbers: dict[str, str] | None = None,
    batch_po_map: dict[str, str] | None = None,
    sku_cache: dict[str, str] | None = None,
) -> dict:
    ref_type, ref_id = await resolve_reference(adj, batch_po_map)
    sku = adj.product_sku or (sku_cache or {}).get(adj.product_id, "")
    txn_number = ""
    if ref_type == "sale" and ref_id and txn_numbers:
        txn_number = txn_numbers.get(ref_id, "")

    return {
        "id": str(adj.id),
        "product_id": adj.product_id,
        "product_name": adj.product_name,
        "product_sku": sku,
        "batch_id": adj.batch_id,
        "transaction_id": adj.transaction_id,
        "reference_type": ref_type,
        "reference_id": ref_id,
        "reference_label": txn_number or ref_id[:8] if ref_id else "",
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


async def load_batch_po_map(batch_ids: set[str]) -> dict[str, str]:
    if not batch_ids:
        return {}
    oids = []
    for bid in batch_ids:
        try:
            oids.append(PydanticObjectId(bid))
        except Exception:
            continue
    if not oids:
        return {}
    batches = await InventoryBatch.find({"_id": {"$in": oids}}).to_list()
    return {
        str(b.id): b.purchase_order_id
        for b in batches
        if b.purchase_order_id
    }


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
