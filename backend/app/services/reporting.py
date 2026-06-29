"""Shared helpers for report aggregation."""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

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
    if not product:
        return 0.0
    return product.cost_price * item.quantity


async def build_product_cache(product_ids: set[str]) -> dict[str, Product]:
    cache: dict[str, Product] = {}
    for pid in product_ids:
        product = await Product.get(pid)
        if product:
            cache[pid] = product
    return cache


def collect_product_ids(txns: list[Transaction]) -> set[str]:
    ids: set[str] = set()
    for txn in txns:
        for item in txn.items:
            ids.add(item.product_id)
    return ids


def days_until(expiry: str) -> int:
    expiry_date = date.fromisoformat(expiry)
    return (expiry_date - date.today()).days
