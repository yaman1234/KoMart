"""Shared helpers for report aggregation."""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Any

from beanie import PydanticObjectId

from app.models.expense import Expense
from app.models.inventory import InventoryBatch
from app.models.product import Product
from app.models.transaction import Transaction, TransactionItem, TransactionStatus
from app.schemas.reports import SoldProductWithMargin
from app.services.stock import classify_on_hand_stock, get_current_stock_batch
from app.services.time_nepal import NPT, ensure_utc, npt_day_end_utc, npt_day_start_utc, to_npt


def parse_date_range(start_date: str, end_date: str) -> tuple[datetime, datetime]:
    """
    Parse start_date and end_date into UTC datetimes corresponding to Nepal (Asia/Kathmandu) day boundaries.

    If date-only (YYYY-MM-DD):
      start -> 00:00:00 NPT in UTC
      end   -> 23:59:59.999999 NPT in UTC
    If empty:
      start -> 30 days ago in NPT (00:00:00 NPT in UTC)
      end   -> today in NPT (23:59:59.999999 NPT in UTC)
    """
    now_npt = datetime.now(NPT).date()

    if start_date and str(start_date).strip():
        s = str(start_date).strip()
        if len(s) >= 10 and s[4] == "-" and s[7] == "-":
            start = npt_day_start_utc(s[:10])
        else:
            try:
                dt = datetime.fromisoformat(s)
                start = ensure_utc(dt) if dt.tzinfo else dt.replace(tzinfo=NPT).astimezone(timezone.utc)
            except Exception:
                start = npt_day_start_utc(now_npt - timedelta(days=30))
    else:
        start = npt_day_start_utc(now_npt - timedelta(days=30))

    if end_date and str(end_date).strip():
        e = str(end_date).strip()
        if len(e) >= 10 and e[4] == "-" and e[7] == "-":
            end = npt_day_end_utc(e[:10])
        else:
            try:
                dt = datetime.fromisoformat(e)
                end = ensure_utc(dt) if dt.tzinfo else dt.replace(tzinfo=NPT).astimezone(timezone.utc)
            except Exception:
                end = npt_day_end_utc(now_npt)
    else:
        end = npt_day_end_utc(now_npt)

    return start, end


async def fetch_transactions(start: datetime, end: datetime) -> list[Transaction]:
    return await Transaction.find({
        "created_at": {"$gte": start, "$lte": end},
        "status": {"$ne": TransactionStatus.voided.value},
    }).to_list()


def line_revenue(item: TransactionItem) -> float:
    return item.price * item.quantity - item.discount * item.quantity


def line_gross(item: TransactionItem) -> float:
    """Gross line amount before discount: price × quantity."""
    return float(item.price) * float(item.quantity)


def line_discount(item: TransactionItem) -> float:
    """Total discount on the line: discount × quantity."""
    return float(item.discount) * float(item.quantity)


def allocate_txn_to_lines(txn: Transaction) -> list[dict[str, Any]]:
    """Split bill-level discount and txn.total onto lines by line-net share."""
    items = list(txn.items or [])
    if not items:
        return []

    nets = [max(0.0, float(line_revenue(item))) for item in items]
    line_total = sum(nets)
    bill = max(0.0, float(getattr(txn, "discount", 0) or 0))
    total = float(getattr(txn, "total", 0) or 0)
    n = len(items)

    allocated_bill = 0.0
    allocated_rev = 0.0
    rows: list[dict[str, Any]] = []
    for idx, (item, net) in enumerate(zip(items, nets)):
        if idx == n - 1:
            bill_alloc = round(bill - allocated_bill, 2)
            revenue = round(total - allocated_rev, 2)
        else:
            share = (net / line_total) if line_total else (1.0 / n)
            bill_alloc = round(share * bill, 2)
            revenue = round(share * total, 2)
            allocated_bill += bill_alloc
            allocated_rev += revenue
        line_disc = line_discount(item)
        rows.append({
            "item": item,
            "gross": line_gross(item),
            "line_discount": line_disc,
            "bill_discount": bill_alloc,
            "discount_given": round(line_disc + bill_alloc, 2),
            "revenue": revenue,
        })
    return rows


def line_cogs(item: TransactionItem, product: Product | None) -> float:
    """
    Cost of goods sold for a sale line item.
    unit_cost and product.cost_price are per base inventory unit.
    When a pack or carton is sold (unit_factor > 1), quantity is multiplied by unit_factor.
    """
    factor = max(1, int(getattr(item, "unit_factor", 1) or 1))
    base_qty = float(item.quantity) * factor
    unit_cost = float(getattr(item, "unit_cost", 0.0) or 0.0)
    if unit_cost > 0:
        return round(unit_cost * base_qty, 2)
    if product:
        cost = float(getattr(product, "cost_price", 0.0) or 0.0)
        return round(cost * base_qty, 2)
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
    match: dict[str, Any] = {
        "created_at": {"$gte": since},
        "status": {"$ne": TransactionStatus.voided.value},
    }
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
        {
            "$match": {
                "created_at": {"$gte": start, "$lte": end},
                "status": {"$ne": TransactionStatus.voided.value},
            },
        },
        {
            "$group": {
                "_id": {
                    "$dateToString": {
                        "format": "%Y-%m-%d",
                        "date": "$created_at",
                        "timezone": "Asia/Kathmandu",
                    }
                },
                "revenue": {"$sum": "$total"},
            },
        },
    ]
    rows = await Transaction.aggregate(pipeline).to_list()
    return {row["_id"]: float(row["revenue"]) for row in rows}


async def aggregate_batch_inventory_value() -> float:
    """
    Batch-weighted valuation: sum(qty * unit_cost) per product from active batches.
    """
    batch_pipeline = [
        {"$match": {"quantity": {"$gt": 0}}},
        {
            "$group": {
                "_id": "$product_id",
                "batch_value": {"$sum": {"$multiply": ["$quantity", "$unit_cost"]}},
            },
        },
    ]
    batch_rows = await InventoryBatch.aggregate(batch_pipeline).to_list()
    return round(sum(float(row["batch_value"]) for row in batch_rows), 2)


async def aggregate_product_inventory_stats() -> dict[str, float | int]:
    products = await Product.find(Product.is_active == True).to_list()  # noqa: E712
    product_ids = [str(p.id) for p in products]
    stock_map = await get_current_stock_batch(product_ids)

    total_products = len(products)
    low_stock = 0
    out_of_stock = 0
    for product in products:
        status = classify_on_hand_stock(
            stock_map.get(str(product.id), 0),
            product.low_stock_threshold,
        )
        if status == "out":
            out_of_stock += 1
        elif status == "low":
            low_stock += 1

    inventory_value = await aggregate_batch_inventory_value()
    return {
        "total_products": total_products,
        "inventory_value": inventory_value,
        "low_stock": low_stock,
        "out_of_stock": out_of_stock,
    }


async def aggregate_expense_total_since(date_gte: str) -> float:
    pipeline = [
        {"$match": {"date": {"$gte": date_gte}}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}},
    ]
    rows = await Expense.aggregate(pipeline).to_list()
    return float(rows[0]["total"]) if rows else 0.0


async def aggregate_operating_expense_total_since(date_gte: str) -> float:
    """Sum expenses since date, excluding setup / investment costs and PO supplier payments."""
    from app.services.expense_helpers import SETUP_INVESTMENT_MATCH, PO_PAYMENT_MATCH

    pipeline = [
        {"$match": {"date": {"$gte": date_gte}}},
        {
            "$group": {
                "_id": None,
                "total": {"$sum": "$amount"},
                "setup": {"$sum": {"$cond": [SETUP_INVESTMENT_MATCH, "$amount", 0]}},
                "po_paid": {"$sum": {"$cond": [PO_PAYMENT_MATCH, "$amount", 0]}},
            },
        },
    ]
    rows = await Expense.aggregate(pipeline).to_list()
    if not rows:
        return 0.0
    tot = float(rows[0]["total"] or 0)
    setup = float(rows[0]["setup"] or 0)
    po = float(rows[0]["po_paid"] or 0)
    return max(0.0, tot - setup - po)


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
    """Category inventory valuation reconciled with FEFO batch acquisition cost."""
    products = await Product.find(Product.is_active == True).to_list()  # noqa: E712
    product_ids = [str(p.id) for p in products]
    stock_map = await get_current_stock_batch(product_ids)

    batch_pipeline = [
        {"$match": {"quantity": {"$gt": 0}}},
        {
            "$group": {
                "_id": "$product_id",
                "batch_value": {"$sum": {"$multiply": ["$quantity", "$unit_cost"]}},
            },
        },
    ]
    batch_rows = await InventoryBatch.aggregate(batch_pipeline).to_list()
    batch_val_map = {row["_id"]: float(row["batch_value"]) for row in batch_rows}

    by_category: dict[str, dict[str, Any]] = {}
    for product in products:
        pid = str(product.id)
        stock = stock_map.get(pid, 0)
        cat = product.category or "Uncategorized"
        entry = by_category.setdefault(cat, {
            "category": cat,
            "sku_count": 0,
            "total_stock": 0,
            "stock_value": 0.0,
        })
        entry["sku_count"] += 1
        entry["total_stock"] += stock

        val = batch_val_map.get(pid, 0.0)
        if val <= 0 and stock > 0:
            val = stock * product.cost_price
        entry["stock_value"] += val

    result = [
        {
            "category": v["category"],
            "sku_count": v["sku_count"],
            "total_stock": v["total_stock"],
            "stock_value": round(v["stock_value"], 2),
        }
        for v in by_category.values()
    ]
    result.sort(key=lambda x: x["stock_value"], reverse=True)
    return result


def fill_daily_revenue(
    start: datetime,
    end: datetime,
    daily_totals: dict[str, float],
) -> list[tuple[str, float]]:
    daily: dict[str, float] = {}
    current = to_npt(start).date()
    end_day = to_npt(end).date()
    while current <= end_day:
        key = current.strftime("%Y-%m-%d")
        daily[key] = daily_totals.get(key, 0.0)
        current += timedelta(days=1)
    return sorted(daily.items())


def aggregate_items_sold_with_margin(
    txns: list[Transaction],
    product_cache: dict[str, Product],
) -> list[SoldProductWithMargin]:
    """
    Aggregate sold items across transactions with proportional bill discount allocation
    and accurate FEFO batch COGS.
    """
    stats: dict[str, dict[str, Any]] = {}

    for txn in txns:
        allocated_lines = allocate_txn_to_lines(txn)
        for alloc in allocated_lines:
            item: TransactionItem = alloc["item"]
            pid = item.product_id
            product = product_cache.get(pid)
            cat = product.category if product else (item.category or "Other")
            uom = item.sell_uom or getattr(product, "sell_uom", "pcs") or "pcs"

            if pid not in stats:
                stats[pid] = {
                    "product_id": pid,
                    "name": item.name or (product.name if product else "Unknown"),
                    "sku": item.sku or (product.sku if product else ""),
                    "category": cat or "Other",
                    "sell_uom": uom,
                    "quantity_sold": 0,
                    "gross_sales": 0.0,
                    "line_discount": 0.0,
                    "bill_discount": 0.0,
                    "total_discount": 0.0,
                    "net_revenue": 0.0,
                    "total_cogs": 0.0,
                    "unit_cost_sum": 0.0,
                }

            qty = int(item.quantity)
            line_c = line_cogs(item, product)

            s = stats[pid]
            s["quantity_sold"] += qty
            s["gross_sales"] += float(alloc["gross"])
            s["line_discount"] += float(alloc["line_discount"])
            s["bill_discount"] += float(alloc["bill_discount"])
            s["total_discount"] += float(alloc["discount_given"])
            s["net_revenue"] += float(alloc["revenue"])
            s["total_cogs"] += line_c
            s["unit_cost_sum"] += (float(getattr(item, "unit_cost", 0) or 0) * qty)

    rows: list[SoldProductWithMargin] = []
    for pid, s in stats.items():
        qty = s["quantity_sold"]
        gross = s["gross_sales"]
        net_rev = s["net_revenue"]
        cogs = s["total_cogs"]
        profit = net_rev - cogs
        margin = (profit / net_rev * 100) if net_rev else 0.0
        avg_price = (gross / qty) if qty else 0.0
        avg_unit_cost = (
            (s["unit_cost_sum"] / qty)
            if qty and s["unit_cost_sum"] > 0
            else (cogs / qty if qty else 0.0)
        )

        rows.append(
            SoldProductWithMargin(
                product_id=pid,
                name=s["name"],
                sku=s["sku"],
                category=s["category"],
                sell_uom=s["sell_uom"],
                quantity_sold=qty,
                avg_selling_price=round(avg_price, 2),
                gross_sales=round(gross, 2),
                line_discount=round(s["line_discount"], 2),
                bill_discount=round(s["bill_discount"], 2),
                total_discount=round(s["total_discount"], 2),
                net_revenue=round(net_rev, 2),
                unit_cost=round(avg_unit_cost, 2),
                total_cogs=round(cogs, 2),
                gross_profit=round(profit, 2),
                gross_margin_pct=round(margin, 1),
            )
        )

    rows.sort(key=lambda x: x.net_revenue, reverse=True)
    return rows
