"""Dashboard KPI and chart aggregation helpers."""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Any

from app.models.day_close import DayClose
from app.models.expense import Expense, ExpenseCategory
from app.models.purchase_order import POStatus, PurchaseOrder
from app.models.settings import StoreSettings
from app.models.transaction import Transaction, TransactionStatus
from app.services.expense_helpers import is_setup_investment
from app.services.fiscal_year import (
    current_fiscal_year_start,
    day_bounds,
    fiscal_year_start_datetime,
    month_start_date,
)
from app.services.payment_methods import normalize_payment_method
from app.services.po_payment import remaining_balance
from app.services.reporting import (
    aggregate_sales_total,
    build_product_cache,
    collect_product_ids,
    fetch_transactions,
    line_cogs,
    line_revenue,
)
from app.services.store_settings import get_store_settings


async def _sales_in_range(start: datetime, end: datetime | None = None) -> float:
    return await aggregate_sales_total(start, end)


async def _expense_sum(
    date_gte: str,
    date_lte: str | None = None,
    *,
    category: str | None = None,
    payment_method: str | None = None,
    exclude_setup: bool = False,
    exclude_purchase_order: bool = False,
) -> float:
    match: dict[str, Any] = {"date": {"$gte": date_gte}}
    if date_lte:
        match["date"]["$lte"] = date_lte
    if category:
        match["category"] = category
    expenses = await Expense.find(match).to_list()
    total = 0.0
    for e in expenses:
        if exclude_setup and is_setup_investment(e):
            continue
        if exclude_purchase_order and e.category == ExpenseCategory.purchase_order:
            continue
        if payment_method and normalize_payment_method(e.payment_method) != payment_method:
            continue
        total += float(e.amount or 0)
    return total


async def _sales_by_payment(
    start: datetime,
    end: datetime | None = None,
    *,
    payment_method: str | None = None,
) -> float:
    match: dict[str, Any] = {
        "created_at": {"$gte": start},
        "status": {"$ne": TransactionStatus.voided.value},
    }
    if end is not None:
        match["created_at"]["$lte"] = end
    txns = await Transaction.find(match).to_list()
    total = 0.0
    for t in txns:
        method = normalize_payment_method(
            t.payment_method.value if hasattr(t.payment_method, "value") else str(t.payment_method)
        )
        if payment_method and method != payment_method:
            continue
        total += float(t.total or 0)
    return total


async def current_cash_balance(today: date | None = None) -> float:
    today = today or date.today()
    day_str = today.isoformat()
    day_close = await DayClose.find_one(DayClose.date == day_str)
    opening = float(day_close.opening_cash) if day_close else 0.0

    start, end = day_bounds(today)
    cash_sales = await _sales_by_payment(start, end, payment_method="cash")
    cash_expenses = await _expense_sum(day_str, day_str, payment_method="cash")
    expected = round(opening + cash_sales - cash_expenses, 2)

    if day_close is not None:
        return round(float(day_close.closing_cash or 0), 2)
    return expected


async def current_wallet_balance(
    settings: StoreSettings,
    fy_start: datetime,
    *,
    method: str,
) -> float:
    """Opening + FY sales − FY expenses for bank/esewa (and similar wallets)."""
    opening_attr = {
        "bank": "opening_bank_balance",
        "esewa": "opening_esewa_balance",
    }.get(method)
    opening = float(getattr(settings, opening_attr, 0) or 0) if opening_attr else 0.0
    sales = await _sales_by_payment(fy_start, payment_method=method)
    fy_date = fy_start.date().isoformat()
    expenses = await _expense_sum(fy_date, payment_method=method)
    return round(opening + sales - expenses, 2)


async def current_bank_balance(settings: StoreSettings, fy_start: datetime) -> float:
    return await current_wallet_balance(settings, fy_start, method="bank")


async def total_payables() -> float:
    orders = await PurchaseOrder.find(
        {"status": {"$ne": POStatus.cancelled.value}}
    ).to_list()
    return round(sum(remaining_balance(po) for po in orders), 2)


async def build_kpi_summary() -> dict[str, Any]:
    settings = await get_store_settings()
    today = date.today()
    fy_start_d = current_fiscal_year_start(settings, today)
    fy_start = fiscal_year_start_datetime(settings, today)
    month_start_d = month_start_date(today)
    month_start = datetime(
        month_start_d.year, month_start_d.month, month_start_d.day, tzinfo=timezone.utc
    )
    day_start, day_end = day_bounds(today)
    today_str = today.isoformat()
    month_str = month_start_d.isoformat()
    fy_str = fy_start_d.isoformat()

    sales_fy = await _sales_in_range(fy_start)
    sales_month = await _sales_in_range(month_start)
    sales_day = await _sales_in_range(day_start, day_end)

    purchase_fy = await _expense_sum(fy_str, category=ExpenseCategory.purchase_order.value)
    purchase_month = await _expense_sum(
        month_str, today_str, category=ExpenseCategory.purchase_order.value
    )
    purchase_day = await _expense_sum(
        today_str, today_str, category=ExpenseCategory.purchase_order.value
    )

    payables = await total_payables()
    payables_month_paid = purchase_month
    payables_day_paid = purchase_day

    cash = await current_cash_balance(today)
    bank = await current_wallet_balance(settings, fy_start, method="bank")
    esewa = await current_wallet_balance(settings, fy_start, method="esewa")

    # Month/day net for cash+bank+esewa movement
    async def net_wallets(start_dt: datetime, end_dt: datetime | None, gte: str, lte: str) -> float:
        total = 0.0
        for method in ("cash", "bank", "esewa"):
            total += await _sales_by_payment(start_dt, end_dt, payment_method=method)
            total -= await _expense_sum(gte, lte, payment_method=method)
        return round(total, 2)

    month_net = await net_wallets(month_start, None, month_str, today_str)
    day_net = await net_wallets(day_start, day_end, today_str, today_str)

    return {
        "fiscalYearStart": fy_str,
        "sales": {
            "fiscalYear": round(sales_fy, 2),
            "month": round(sales_month, 2),
            "day": round(sales_day, 2),
        },
        "purchase": {
            "fiscalYear": round(purchase_fy, 2),
            "month": round(purchase_month, 2),
            "day": round(purchase_day, 2),
        },
        "receivables": {
            "fiscalYear": 0.0,
            "month": 0.0,
            "day": 0.0,
        },
        "payables": {
            "outstanding": payables,
            "monthPaid": round(payables_month_paid, 2),
            "dayPaid": round(payables_day_paid, 2),
        },
        "cashBank": {
            "total": round(cash + bank + esewa, 2),
            "cash": cash,
            "bank": bank,
            "esewa": esewa,
            "monthNet": month_net,
            "dayNet": day_net,
        },
    }


async def build_cash_flow(days: int = 30) -> list[dict[str, Any]]:
    today = date.today()
    start_d = today - timedelta(days=max(days - 1, 0))
    start = datetime(start_d.year, start_d.month, start_d.day, tzinfo=timezone.utc)
    end = datetime(today.year, today.month, today.day, 23, 59, 59, 999999, tzinfo=timezone.utc)

    txns = await fetch_transactions(start, end)
    inflows: dict[str, float] = {}
    for t in txns:
        key = t.created_at.astimezone(timezone.utc).strftime("%Y-%m-%d")
        inflows[key] = inflows.get(key, 0.0) + float(t.total or 0)

    expenses = await Expense.find(
        {"date": {"$gte": start_d.isoformat(), "$lte": today.isoformat()}}
    ).to_list()
    outflows: dict[str, float] = {}
    for e in expenses:
        outflows[e.date] = outflows.get(e.date, 0.0) + float(e.amount or 0)

    series: list[dict[str, Any]] = []
    current = start_d
    while current <= today:
        key = current.isoformat()
        series.append(
            {
                "date": key,
                "inflow": round(inflows.get(key, 0.0), 2),
                "outflow": round(outflows.get(key, 0.0), 2),
            }
        )
        current += timedelta(days=1)
    return series


async def build_payment_method_flow(method: str) -> list[dict[str, Any]]:
    """Daily inflow/outflow for one payment method from FY start → today."""
    method = normalize_payment_method(method)
    if method not in ("cash", "bank", "esewa"):
        raise ValueError(f"Unsupported payment method: {method}")

    settings = await get_store_settings()
    today = date.today()
    fy_start_d = current_fiscal_year_start(settings, today)
    start = datetime(fy_start_d.year, fy_start_d.month, fy_start_d.day, tzinfo=timezone.utc)
    end = datetime(today.year, today.month, today.day, 23, 59, 59, 999999, tzinfo=timezone.utc)

    txns = await fetch_transactions(start, end)
    inflows: dict[str, float] = {}
    for t in txns:
        pm = normalize_payment_method(
            t.payment_method.value if hasattr(t.payment_method, "value") else str(t.payment_method)
        )
        if pm != method:
            continue
        key = t.created_at.astimezone(timezone.utc).strftime("%Y-%m-%d")
        inflows[key] = inflows.get(key, 0.0) + float(t.total or 0)

    expenses = await Expense.find(
        {"date": {"$gte": fy_start_d.isoformat(), "$lte": today.isoformat()}}
    ).to_list()
    outflows: dict[str, float] = {}
    for e in expenses:
        if normalize_payment_method(e.payment_method) != method:
            continue
        outflows[e.date] = outflows.get(e.date, 0.0) + float(e.amount or 0)

    series: list[dict[str, Any]] = []
    current = fy_start_d
    while current <= today:
        key = current.isoformat()
        series.append(
            {
                "date": key,
                "inflow": round(inflows.get(key, 0.0), 2),
                "outflow": round(outflows.get(key, 0.0), 2),
            }
        )
        current += timedelta(days=1)
    return series


def _empty_fy_series(fy_start_d: date, today: date) -> list[dict[str, Any]]:
    series: list[dict[str, Any]] = []
    current = fy_start_d
    while current <= today:
        series.append({"date": current.isoformat(), "inflow": 0.0, "outflow": 0.0})
        current += timedelta(days=1)
    return series


async def build_kpi_flow(metric: str) -> list[dict[str, Any]]:
    """FY start → today series for any sticky KPI metric."""
    metric = (metric or "").strip().lower()
    if metric in ("cash", "bank", "esewa"):
        return await build_payment_method_flow(metric)

    settings = await get_store_settings()
    today = date.today()
    fy_start_d = current_fiscal_year_start(settings, today)
    start = datetime(fy_start_d.year, fy_start_d.month, fy_start_d.day, tzinfo=timezone.utc)
    end = datetime(today.year, today.month, today.day, 23, 59, 59, 999999, tzinfo=timezone.utc)

    if metric == "receivables":
        return _empty_fy_series(fy_start_d, today)

    if metric == "sales":
        txns = await fetch_transactions(start, end)
        by_day: dict[str, float] = {}
        for t in txns:
            key = t.created_at.astimezone(timezone.utc).strftime("%Y-%m-%d")
            by_day[key] = by_day.get(key, 0.0) + float(t.total or 0)
        series: list[dict[str, Any]] = []
        current = fy_start_d
        while current <= today:
            key = current.isoformat()
            series.append(
                {
                    "date": key,
                    "inflow": round(by_day.get(key, 0.0), 2),
                    "outflow": 0.0,
                }
            )
            current += timedelta(days=1)
        return series

    if metric in ("purchase", "payables"):
        expenses = await Expense.find(
            {
                "date": {"$gte": fy_start_d.isoformat(), "$lte": today.isoformat()},
                "category": ExpenseCategory.purchase_order.value,
            }
        ).to_list()
        by_day: dict[str, float] = {}
        for e in expenses:
            by_day[e.date] = by_day.get(e.date, 0.0) + float(e.amount or 0)
        series = []
        current = fy_start_d
        while current <= today:
            key = current.isoformat()
            series.append(
                {
                    "date": key,
                    "inflow": 0.0,
                    "outflow": round(by_day.get(key, 0.0), 2),
                }
            )
            current += timedelta(days=1)
        return series

    raise ValueError(f"Unsupported KPI metric: {metric}")


async def build_operational_expenses(days: int = 30) -> list[dict[str, Any]]:
    today = date.today()
    start_d = today - timedelta(days=max(days - 1, 0))
    expenses = await Expense.find(
        {"date": {"$gte": start_d.isoformat(), "$lte": today.isoformat()}}
    ).to_list()

    by_category: dict[str, float] = {}
    for e in expenses:
        if is_setup_investment(e):
            continue
        if e.category == ExpenseCategory.purchase_order:
            continue
        cat = e.category.value if hasattr(e.category, "value") else str(e.category)
        by_category[cat] = by_category.get(cat, 0.0) + float(e.amount or 0)

    return [
        {"name": name, "amount": round(amount, 2)}
        for name, amount in sorted(by_category.items(), key=lambda x: x[1], reverse=True)
    ]


async def build_top_profit_products(days: int = 30, limit: int = 6) -> list[dict[str, Any]]:
    today = date.today()
    start_d = today - timedelta(days=max(days - 1, 0))
    start = datetime(start_d.year, start_d.month, start_d.day, tzinfo=timezone.utc)
    end = datetime(today.year, today.month, today.day, 23, 59, 59, 999999, tzinfo=timezone.utc)
    txns = await fetch_transactions(start, end)
    product_cache = await build_product_cache(collect_product_ids(txns))

    stats: dict[str, dict[str, Any]] = {}
    for t in txns:
        for item in t.items:
            pid = item.product_id
            if pid not in stats:
                stats[pid] = {"name": item.name, "profit": 0.0, "revenue": 0.0, "qty": 0}
            rev = line_revenue(item)
            cogs = line_cogs(item, product_cache.get(pid))
            stats[pid]["profit"] += rev - cogs
            stats[pid]["revenue"] += rev
            stats[pid]["qty"] += item.quantity

    ranked = sorted(stats.items(), key=lambda x: x[1]["profit"], reverse=True)[:limit]
    return [
        {
            "productId": pid,
            "name": v["name"],
            "profit": round(v["profit"], 2),
            "revenue": round(v["revenue"], 2),
            "quantitySold": v["qty"],
        }
        for pid, v in ranked
    ]


async def build_top_sold_products(days: int = 30, limit: int = 6) -> list[dict[str, Any]]:
    today = date.today()
    start_d = today - timedelta(days=max(days - 1, 0))
    start = datetime(start_d.year, start_d.month, start_d.day, tzinfo=timezone.utc)
    end = datetime(today.year, today.month, today.day, 23, 59, 59, 999999, tzinfo=timezone.utc)
    txns = await fetch_transactions(start, end)

    stats: dict[str, dict[str, Any]] = {}
    for t in txns:
        for item in t.items:
            pid = item.product_id
            if pid not in stats:
                stats[pid] = {"name": item.name, "qty": 0, "revenue": 0.0}
            stats[pid]["qty"] += item.quantity
            stats[pid]["revenue"] += line_revenue(item)

    ranked = sorted(stats.items(), key=lambda x: x[1]["qty"], reverse=True)[:limit]
    return [
        {
            "productId": pid,
            "name": v["name"],
            "quantitySold": v["qty"],
            "revenue": round(v["revenue"], 2),
        }
        for pid, v in ranked
    ]


async def build_sales_collection(days: int = 30) -> list[dict[str, Any]]:
    """Sales vs collections (currently equal — all sales paid at sale time)."""
    today = date.today()
    start_d = today - timedelta(days=max(days - 1, 0))
    start = datetime(start_d.year, start_d.month, start_d.day, tzinfo=timezone.utc)
    end = datetime(today.year, today.month, today.day, 23, 59, 59, 999999, tzinfo=timezone.utc)

    daily = await Transaction.aggregate(
        [
            {
                "$match": {
                    "created_at": {"$gte": start, "$lte": end},
                    "status": {"$ne": TransactionStatus.voided.value},
                },
            },
            {
                "$group": {
                    "_id": {"$dateToString": {"format": "%Y-%m-%d", "date": "$created_at"}},
                    "sales": {"$sum": "$total"},
                },
            },
        ]
    ).to_list()
    by_day = {row["_id"]: float(row["sales"]) for row in daily}

    series: list[dict[str, Any]] = []
    current = start_d
    while current <= today:
        key = current.isoformat()
        amount = round(by_day.get(key, 0.0), 2)
        series.append({"date": key, "sales": amount, "collection": amount})
        current += timedelta(days=1)
    return series
