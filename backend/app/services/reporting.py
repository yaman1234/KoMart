"""Shared helpers for report aggregation."""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Any

from beanie import PydanticObjectId

from app.models.expense import Expense
from app.models.product import Product
from app.models.transaction import Transaction, TransactionItem


def parse_date_range(start_date: str, end_date: str) -> tuple[datetime, datetime]:
    now = datetime.now(timezone.utc)
    start = datetime.fromisoformat(start_date) if start_date else now - timedelta(days=30)
    if start.tzinfo is None:
        start = start.replace(tzinfo=timezone.utc)
    end = datetime.fromisoformat(end_date) if end_date else now
    if end.tzinfo is None:
        end = end.replace(tzinfo=timezone.utc)
    end = end.replace(hour=23, minute=59, second=59, microsecond=999999)
    return start, end


async def fetch_transactions(start: datetime, end: datetime) -> list[Transaction]:
    return await Transaction.find({"created_at": {"$gte": start, "$lte": end}}).to_list()


def line_revenue(item: TransactionItem) -> float:
    return item.price * item.quantity - item.discount * item.quantity


def line_cogs(item: TransactionItem, product: Product | None) -> float:
    unit_cost = getattr(item, "unit_cost", 0.0) or 0.0
    if unit_cost > 0:
        return unit_cost * item.quantity
    if product:
        return product.cost_price * item.quantity
    return 0.0


def _object_ids(product_ids: set[str]) -> list[PydanticObjectId]:
    ids: list[PydanticObjectId] = []
    for pid in product_ids:
        try:
            ids.append(PydanticObjectId(pid))
        except Exception:
            continue
    return ids


async def build_product_cache(product_ids: set[str]) -> dict[str, Product]:
    """Load products in a single query instead of one get() per id."""
    if not product_ids:
        return {}
    oids = _object_ids(product_ids)
    if not oids:
        return {}
    products = await Product.find({"_id": {"$in": oids}}).to_list()
    return {str(product.id): product for product in products}


async def aggregate_sales_total(
    since: datetime,
    until: datetime | None = None,
) -> float:
    match: dict[str, Any] = {"created_at": {"$gte": since}}
    if until is not None:
        match["created_at"]["$lte"] = until
    pipeline = [
        {"$match": match},
        {"$group": {"_id": None, "total": {"$sum": "$total"}}},
    ]
    rows = await Transaction.aggregate(pipeline).to_list()
    return float(rows[0]["total"]) if rows else 0.0


async def aggregate_sales_by_day(start: datetime, end: datetime) -> dict[str, float]:
    pipeline = [
        {"$match": {"created_at": {"$gte": start, "$lte": end}}},
        {
            "$group": {
                "_id": {"$dateToString": {"format": "%Y-%m-%d", "date": "$created_at"}},
                "revenue": {"$sum": "$total"},
            },
        },
    ]
    rows = await Transaction.aggregate(pipeline).to_list()
    return {row["_id"]: float(row["revenue"]) for row in rows}


async def aggregate_product_inventory_stats() -> dict[str, float | int]:
    pipeline = [
        {"$match": {"is_active": True}},
        {
            "$group": {
                "_id": None,
                "total_products": {"$sum": 1},
                "inventory_value": {"$sum": {"$multiply": ["$stock", "$cost_price"]}},
                "low_stock": {
                    "$sum": {
                        "$cond": [
                            {
                                "$and": [
                                    {"$gt": ["$stock", 0]},
                                    {"$lte": ["$stock", "$low_stock_threshold"]},
                                ],
                            },
                            1,
                            0,
                        ],
                    },
                },
                "out_of_stock": {"$sum": {"$cond": [{"$eq": ["$stock", 0]}, 1, 0]}},
            },
        },
    ]
    rows = await Product.aggregate(pipeline).to_list()
    if not rows:
        return {
            "total_products": 0,
            "inventory_value": 0.0,
            "low_stock": 0,
            "out_of_stock": 0,
        }
    row = rows[0]
    return {
        "total_products": int(row["total_products"]),
        "inventory_value": float(row["inventory_value"]),
        "low_stock": int(row["low_stock"]),
        "out_of_stock": int(row["out_of_stock"]),
    }


async def aggregate_expense_total_since(date_gte: str) -> float:
    pipeline = [
        {"$match": {"date": {"$gte": date_gte}}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}},
    ]
    rows = await Expense.aggregate(pipeline).to_list()
    return float(rows[0]["total"]) if rows else 0.0


async def aggregate_sold_product_ids(since: datetime) -> set[str]:
    pipeline = [
        {"$match": {"created_at": {"$gte": since}}},
        {"$unwind": "$items"},
        {"$group": {"_id": "$items.product_id"}},
    ]
    rows = await Transaction.aggregate(pipeline).to_list()
    return {row["_id"] for row in rows if row["_id"]}


async def aggregate_last_sale_before(
    product_ids: list[str],
    before: datetime,
) -> dict[str, datetime]:
    if not product_ids:
        return {}
    pipeline = [
        {"$match": {"created_at": {"$lt": before}}},
        {"$unwind": "$items"},
        {"$match": {"items.product_id": {"$in": product_ids}}},
        {"$group": {"_id": "$items.product_id", "last_sale": {"$max": "$created_at"}}},
    ]
    rows = await Transaction.aggregate(pipeline).to_list()
    return {row["_id"]: row["last_sale"] for row in rows}


def collect_product_ids(txns: list[Transaction]) -> set[str]:
    ids: set[str] = set()
    for txn in txns:
        for item in txn.items:
            ids.add(item.product_id)
    return ids


def days_until(expiry: str) -> int:
    expiry_date = date.fromisoformat(expiry)
    return (expiry_date - date.today()).days


async def aggregate_inventory_by_category() -> list[dict[str, Any]]:
    pipeline = [
        {"$match": {"is_active": True}},
        {
            "$group": {
                "_id": "$category",
                "sku_count": {"$sum": 1},
                "total_stock": {"$sum": "$stock"},
                "stock_value": {"$sum": {"$multiply": ["$stock", "$cost_price"]}},
            },
        },
        {"$sort": {"stock_value": -1}},
    ]
    return await Product.aggregate(pipeline).to_list()


def fill_daily_revenue(
    start: datetime,
    end: datetime,
    daily_totals: dict[str, float],
) -> list[tuple[str, float]]:
    daily: dict[str, float] = {}
    current = start.replace(hour=0, minute=0, second=0, microsecond=0)
    end_day = end.replace(hour=0, minute=0, second=0, microsecond=0)
    while current <= end_day:
        key = current.strftime("%Y-%m-%d")
        daily[key] = daily_totals.get(key, 0.0)
        current += timedelta(days=1)
    return sorted(daily.items())
