from fastapi import APIRouter, Depends, Query
from datetime import datetime, timezone, timedelta

from app.auth.dependencies import get_current_user
from app.models.user import User
from app.models.product import Product
from app.models.customer import Customer
from app.models.transaction import Transaction
from app.schemas.dashboard import DashboardStats, RevenueDataPoint, TopProduct, SalesByCategory

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


@router.get("/stats", response_model=DashboardStats)
async def get_stats(_: User = Depends(get_current_user)):
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start = today_start - timedelta(days=7)
    month_start = today_start - timedelta(days=30)

    all_products = await Product.find(Product.is_active == True).to_list()  # noqa: E712
    total_products = len(all_products)
    low_stock = sum(1 for p in all_products if 0 < p.stock <= p.low_stock_threshold)
    inventory_value = sum(p.stock * p.cost_price for p in all_products)
    customer_count = await Customer.count()

    today_txns = await Transaction.find({"created_at": {"$gte": today_start}}).to_list()
    week_txns = await Transaction.find({"created_at": {"$gte": week_start}}).to_list()
    month_txns = await Transaction.find({"created_at": {"$gte": month_start}}).to_list()

    return DashboardStats(
        today_sales=sum(t.total for t in today_txns),
        weekly_sales=sum(t.total for t in week_txns),
        monthly_sales=sum(t.total for t in month_txns),
        total_products=total_products,
        low_stock_products=low_stock,
        expiring_products=0,
        inventory_value=inventory_value,
        customer_count=customer_count,
    )


@router.get("/revenue", response_model=list[RevenueDataPoint])
async def get_revenue(
    start_date: str = Query(""),
    end_date: str = Query(""),
    _: User = Depends(get_current_user),
):
    now = datetime.now(timezone.utc)
    start = datetime.fromisoformat(start_date) if start_date else now - timedelta(days=30)
    end = datetime.fromisoformat(end_date) if end_date else now

    txns = await Transaction.find({"created_at": {"$gte": start, "$lte": end}}).to_list()

    daily: dict[str, float] = {}
    current = start
    while current <= end:
        daily[current.strftime("%Y-%m-%d")] = 0.0
        current += timedelta(days=1)

    for t in txns:
        day = t.created_at.strftime("%Y-%m-%d")
        if day in daily:
            daily[day] += t.total

    return [RevenueDataPoint(date=d, revenue=v) for d, v in sorted(daily.items())]


@router.get("/top-products", response_model=list[TopProduct])
async def get_top_products(_: User = Depends(get_current_user)):
    txns = await Transaction.find().to_list()
    product_stats: dict[str, dict] = {}

    for t in txns:
        for item in t.items:
            pid = item.product_id
            if pid not in product_stats:
                product_stats[pid] = {"name": item.name, "qty": 0, "revenue": 0.0}
            product_stats[pid]["qty"] += item.quantity
            product_stats[pid]["revenue"] += item.price * item.quantity

    return sorted(
        [
            TopProduct(
                product_id=pid,
                name=v["name"],
                quantity_sold=v["qty"],
                revenue=v["revenue"],
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
async def get_sales_by_category(_: User = Depends(get_current_user)):
    txns = await Transaction.find().to_list()
    category_stats: dict[str, dict] = {}

    product_cache: dict[str, str] = {}
    for t in txns:
        for item in t.items:
            pid = item.product_id
            if pid not in product_cache:
                product = await Product.get(pid)
                product_cache[pid] = product.category if product else "Other"
            cat = product_cache[pid]
            if cat not in category_stats:
                category_stats[cat] = {"revenue": 0.0, "count": 0}
            category_stats[cat]["revenue"] += item.price * item.quantity
            category_stats[cat]["count"] += item.quantity

    return [
        SalesByCategory(category=cat, revenue=v["revenue"], count=v["count"])
        for cat, v in category_stats.items()
    ]
