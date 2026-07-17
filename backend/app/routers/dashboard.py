from fastapi import APIRouter, Depends, Query
from datetime import datetime, timezone, timedelta

from app.auth.dependencies import get_current_user
from app.models.user import User
from app.models.customer import Customer
from app.models.transaction import Transaction
from app.schemas.dashboard import DashboardStats, RevenueDataPoint, TopProduct, SalesByCategory
from app.services.reporting import (
    aggregate_expense_total_since,
    aggregate_operating_expense_total_since,
    aggregate_product_inventory_stats,
    aggregate_sales_by_day,
    aggregate_sales_total,
    build_product_cache,
    collect_product_ids,
    fetch_transactions,
    fill_daily_revenue,
    line_revenue,
    parse_date_range,
)
from app.services.stock import expiring_product_ids

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


@router.get("/stats", response_model=DashboardStats)
async def get_stats(_: User = Depends(get_current_user)):
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start = today_start - timedelta(days=7)
    month_start = today_start - timedelta(days=30)

    product_stats = await aggregate_product_inventory_stats()
    expiring_ids = await expiring_product_ids()
    customer_count = await Customer.count()

    today_sales = await aggregate_sales_total(today_start)
    weekly_sales = await aggregate_sales_total(week_start)
    monthly_sales = await aggregate_sales_total(month_start)
    month_start_str = month_start.strftime("%Y-%m-%d")
    monthly_expenses = await aggregate_expense_total_since(month_start_str)
    monthly_operating = await aggregate_operating_expense_total_since(month_start_str)

    return DashboardStats(
        today_sales=round(today_sales, 2),
        weekly_sales=round(weekly_sales, 2),
        monthly_sales=round(monthly_sales, 2),
        total_products=int(product_stats["total_products"]),
        low_stock_products=int(product_stats["low_stock"]),
        expiring_products=len(expiring_ids),
        inventory_value=round(float(product_stats["inventory_value"]), 2),
        customer_count=customer_count,
        monthly_expenses=round(monthly_expenses, 2),
        net_revenue=round(monthly_sales - monthly_operating, 2),
    )


@router.get("/revenue", response_model=list[RevenueDataPoint])
async def get_revenue(
    start_date: str = Query(""),
    end_date: str = Query(""),
    _: User = Depends(get_current_user),
):
    start, end = parse_date_range(start_date, end_date)
    daily_totals = await aggregate_sales_by_day(start, end)
    return [
        RevenueDataPoint(date=day, revenue=round(revenue, 2))
        for day, revenue in fill_daily_revenue(start, end, daily_totals)
    ]


@router.get("/top-products", response_model=list[TopProduct])
async def get_top_products(
    start_date: str = Query(""),
    end_date: str = Query(""),
    _: User = Depends(get_current_user),
):
    start, end = parse_date_range(start_date, end_date)
    txns = await fetch_transactions(start, end)
    product_stats: dict[str, dict] = {}

    for t in txns:
        for item in t.items:
            pid = item.product_id
            if pid not in product_stats:
                product_stats[pid] = {"name": item.name, "qty": 0, "revenue": 0.0}
            product_stats[pid]["qty"] += item.quantity
            product_stats[pid]["revenue"] += line_revenue(item)

    return sorted(
        [
            TopProduct(
                product_id=pid,
                name=v["name"],
                quantity_sold=v["qty"],
                revenue=round(v["revenue"], 2),
            )
            for pid, v in product_stats.items()
        ],
        key=lambda x: x.revenue,
        reverse=True,
    )[:10]


@router.get("/recent-transactions", response_model=list)
async def get_recent_transactions(_: User = Depends(get_current_user)):
    txns = await Transaction.find().sort("-created_at").limit(10).to_list()
    return [
        {
            "id": str(t.id),
            "transactionNumber": t.transaction_number,
            "customerName": t.customer_name,
            "total": t.total,
            "paymentMethod": t.payment_method,
            "createdAt": t.created_at.isoformat(),
        }
        for t in txns
    ]


@router.get("/sales-by-category", response_model=list[SalesByCategory])
async def get_sales_by_category(
    start_date: str = Query(""),
    end_date: str = Query(""),
    _: User = Depends(get_current_user),
):
    start, end = parse_date_range(start_date, end_date)
    txns = await fetch_transactions(start, end)
    product_cache = await build_product_cache(collect_product_ids(txns))
    category_stats: dict[str, dict] = {}

    for t in txns:
        for item in t.items:
            product = product_cache.get(item.product_id)
            cat = product.category if product else "Other"
            if cat not in category_stats:
                category_stats[cat] = {"revenue": 0.0, "count": 0}
            category_stats[cat]["revenue"] += line_revenue(item)
            category_stats[cat]["count"] += item.quantity

    return [
        SalesByCategory(category=cat, revenue=round(v["revenue"], 2), count=v["count"])
        for cat, v in category_stats.items()
    ]
