"""Phase 1 Backend Verification Tests for KoMart Reports.

Covers:
1. Nepal Timezone Standardization (Asia/Kathmandu day boundaries, crossover sales).
2. Pack / Multi-Unit COGS & Profit calculation (unit_factor multiplication).
3. Exclude PO Payments from Operating Expenses (prevent P&L double-counting).
4. Low Stock Aggregation & Accurate Pagination (stock-filtered before paging).
"""

from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import pytest
from httpx import ASGITransport, AsyncClient

from app.auth.jwt import hash_password
from app.database import init_db
from app.main import app
from app.models.expense import Expense
from app.models.inventory import InventoryBatch
from app.models.product import Product, ProductStatus
from app.models.transaction import (
    BatchAllocation,
    PaymentMethod,
    Transaction,
    TransactionItem,
    TransactionStatus,
)
from app.models.user import User, UserRole
from app.services.expense_helpers import is_purchase_order_payment, is_setup_investment
from app.services.reporting import (
    aggregate_operating_expense_total_since,
    aggregate_sales_by_day,
    fill_daily_revenue,
    line_cogs,
    parse_date_range,
)
from app.services.time_nepal import NPT, npt_day_end_utc, npt_day_start_utc, to_npt


@pytest.fixture(autouse=True)
async def setup_db():
    await init_db()


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.fixture
async def manager_user():
    email = f"phase1-mgr-{uuid.uuid4().hex[:8]}@komart.com"
    user = User(
        email=email,
        name="Phase1 Manager",
        hashed_password=hash_password("managerpass123"),
        role=UserRole.manager,
        is_active=True,
    )
    await user.insert()
    yield user
    await user.delete()


@pytest.fixture
async def auth_headers(client: AsyncClient, manager_user: User):
    login = await client.post(
        "/api/v1/auth/login",
        json={"email": manager_user.email, "password": "managerpass123"},
    )
    assert login.status_code == 200
    token = login.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


# ---------------------------------------------------------------------------
# 1. Nepal Timezone Standardization Tests
# ---------------------------------------------------------------------------


def test_parse_date_range_npt_boundaries():
    start, end = parse_date_range("2026-10-01", "2026-10-18")

    # 2026-10-01 00:00:00 NPT is 2026-09-30 18:15:00 UTC
    assert to_npt(start).strftime("%Y-%m-%d %H:%M:%S") == "2026-10-01 00:00:00"
    assert start.tzinfo == timezone.utc
    assert start.year == 2026 and start.month == 9 and start.day == 30 and start.hour == 18 and start.minute == 15

    # 2026-10-18 23:59:59.999999 NPT is 2026-10-18 18:14:59.999999 UTC
    assert to_npt(end).strftime("%Y-%m-%d %H:%M:%S") == "2026-10-18 23:59:59"
    assert end.tzinfo == timezone.utc
    assert end.year == 2026 and end.month == 10 and end.day == 18 and end.hour == 18 and end.minute == 14


@pytest.mark.asyncio
async def test_npt_midnight_crossover_sales_included():
    """A sale created at 01:00 AM NPT on Oct 10 is 19:15 UTC Oct 09.

    Querying start_date=2026-10-10 must include this transaction!
    """
    # 2026-10-10 01:00:00 NPT
    dt_npt = datetime(2026, 10, 10, 1, 0, 0, tzinfo=NPT)
    dt_utc = dt_npt.astimezone(timezone.utc)

    txn = Transaction(
        transaction_number=f"TXN-TZ-{uuid.uuid4().hex[:6]}",
        customer_name="Midnight Shopper",
        items=[
            TransactionItem(
                product_id="tz-p1",
                name="Late Night Snack",
                sku="TZ-001",
                price=150.0,
                quantity=1,
            )
        ],
        subtotal=150.0,
        tax=0.0,
        total=150.0,
        payment_method=PaymentMethod.cash,
        status=TransactionStatus.completed,
        created_by="Night Cashier",
        created_at=dt_utc,
        updated_at=dt_utc,
    )
    await txn.insert()

    try:
        start, end = parse_date_range("2026-10-10", "2026-10-10")
        assert start <= dt_utc <= end

        # Also verify aggregate_sales_by_day buckets to 2026-10-10
        daily = await aggregate_sales_by_day(start, end)
        assert "2026-10-10" in daily
        assert daily["2026-10-10"] == 150.0

        # Verify fill_daily_revenue generates the single 2026-10-10 key
        filled = dict(fill_daily_revenue(start, end, daily))
        assert "2026-10-10" in filled
        assert filled["2026-10-10"] == 150.0
    finally:
        await txn.delete()


# ---------------------------------------------------------------------------
# 2. Pack / Multi-Unit COGS & Profit Tests
# ---------------------------------------------------------------------------


def test_line_cogs_with_pack_unit_factor():
    # Selling 2 cartons of 24 pieces each at cost Rs 50/piece
    # Total units sold = 48 pieces
    # Expected COGS = 48 * 50 = Rs 2400
    item = TransactionItem(
        product_id="pack-p1",
        name="Carton Noodles",
        sku="NOOD-24",
        price=1500.0,
        quantity=2,
        unit_cost=50.0,
        unit_factor=24,
        sell_uom="Carton",
    )
    cogs = line_cogs(item, None)
    assert cogs == 2400.0


def test_line_cogs_fallback_to_product_cost_with_unit_factor():
    product = Product(
        name="Carton Juice",
        sku="JUICE-12",
        barcode="JUICE-12",
        brand="Test",
        country_of_origin="Nepal",
        category="Beverages",
        supplier_id="sup-1",
        supplier_name="Supplier",
        cost_price=75.0,
        selling_price=1200.0,
        low_stock_threshold=2,
        is_active=True,
    )
    item = TransactionItem(
        product_id="pack-p2",
        name="Carton Juice",
        sku="JUICE-12",
        price=1200.0,
        quantity=3,
        unit_cost=0.0,  # unit_cost not set on line, should fallback to product
        unit_factor=12,
        sell_uom="Case",
    )
    # 3 cases * 12 bottles = 36 bottles * 75 = Rs 2700
    cogs = line_cogs(item, product)
    assert cogs == 2700.0


@pytest.mark.asyncio
async def test_profit_summary_uses_multi_pack_cogs(
    client: AsyncClient,
    auth_headers: dict[str, str],
):
    now = datetime.now(timezone.utc)
    # 1 carton of 20 pieces, cost per piece = Rs 80 -> total cost = Rs 1600.
    # Selling price = Rs 2000. Gross Profit should be Rs 400 (20%), NOT Rs 1920 (96%)!
    txn = Transaction(
        transaction_number=f"TXN-PACK-{uuid.uuid4().hex[:6]}",
        items=[
            TransactionItem(
                product_id="pack-prod-1",
                name="Bulk Biscuits",
                sku="BISC-BOX",
                price=2000.0,
                quantity=1,
                unit_cost=80.0,
                unit_factor=20,
            )
        ],
        subtotal=2000.0,
        tax=0.0,
        total=2000.0,
        total_cost=1600.0,
        payment_method=PaymentMethod.cash,
        status=TransactionStatus.completed,
        created_by="Manager",
        created_at=now,
    )
    await txn.insert()

    try:
        today_npt = to_npt(now).strftime("%Y-%m-%d")
        res = await client.get(
            "/api/v1/reports/profit-summary",
            params={"start_date": today_npt, "end_date": today_npt},
            headers=auth_headers,
        )
        assert res.status_code == 200
        data = res.json()
        assert data["total_revenue"] >= 2000.0
        assert data["total_cogs"] >= 1600.0
        # Margin should be around 20%, definitely under 50%
        assert data["gross_margin_pct"] <= 50.0
    finally:
        await txn.delete()


# ---------------------------------------------------------------------------
# 3. Exclude PO Payments from Operating Expenses Tests
# ---------------------------------------------------------------------------


def test_is_purchase_order_payment_identification():
    po_expense_1 = Expense(
        title="PO Payment for Supplier ABC",
        amount=150000.0,
        category="purchase_order",
        date="2026-10-18",
        purchase_order_id="PO-00123",
    )
    assert is_purchase_order_payment(po_expense_1) is True
    assert is_setup_investment(po_expense_1) is False

    po_expense_2 = Expense(
        title="Supplier Payment",
        amount=50000.0,
        category="supplies",
        date="2026-10-18",
        purchase_order_id="PO-99999",
    )
    assert is_purchase_order_payment(po_expense_2) is True

    rent_expense = Expense(
        title="Store Monthly Rent",
        amount=60000.0,
        category="rent",
        date="2026-10-18",
    )
    assert is_purchase_order_payment(rent_expense) is False
    assert is_setup_investment(rent_expense) is False


@pytest.mark.asyncio
async def test_expense_summary_excludes_po_payments_from_operating(
    client: AsyncClient,
    auth_headers: dict[str, str],
):
    test_date = "2029-10-18"
    expenses = [
        # 1. Operating Expense: Rent Rs 50,000
        Expense(
            title="Monthly Rent Test",
            amount=50000.0,
            category="rent",
            date=test_date,
        ),
        # 2. Setup Cost: Renovation Rs 100,000
        Expense(
            title="Store Fitting Test",
            amount=100000.0,
            category="setup_investment",
            is_setup_cost=True,
            date=test_date,
        ),
        # 3. PO Supplier Payment: Rs 200,000 (Inventory procurement)
        Expense(
            title="Supplier PO Payment Test",
            amount=200000.0,
            category="purchase_order",
            purchase_order_id="PO-TEST-101",
            date=test_date,
        ),
    ]
    for e in expenses:
        await e.insert()

    try:
        # Check expense_summary API
        res = await client.get(
            "/api/v1/reports/expense-summary",
            params={"start_date": test_date, "end_date": test_date},
            headers=auth_headers,
        )
        assert res.status_code == 200
        data = res.json()

        assert data["total_expenses"] == 350000.0
        assert data["setup_investment"] == 100000.0
        assert data["total_po_paid"] == 200000.0
        # Crucial P0 Fix: Operating expenses must ONLY be Rent (Rs 50,000)!
        assert data["operating_expenses"] == 50000.0

        # Also check aggregate_operating_expense_total_since
        op_total = await aggregate_operating_expense_total_since(test_date)
        assert op_total == 50000.0

        # Also check daily-summary
        res_daily = await client.get(
            "/api/v1/reports/daily-summary",
            params={"date": test_date},
            headers=auth_headers,
        )
        assert res_daily.status_code == 200
        daily_data = res_daily.json()
        assert daily_data["expenses"]["total"] == 350000.0
        assert daily_data["expenses"]["setup_investment"] == 100000.0
        assert daily_data["expenses"]["po_paid"] == 200000.0
        assert daily_data["expenses"]["operating"] == 50000.0
    finally:
        for e in expenses:
            await e.delete()


# ---------------------------------------------------------------------------
# 4. Fix Low Stock Aggregation & Accurate Pagination Tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_low_stock_report_accurate_pagination_and_counts(
    client: AsyncClient,
    auth_headers: dict[str, str],
):
    """Ensure catalog with varying stock levels filters BEFORE paging.

    Page 1 must not be empty when low stock items exist.
    """
    prefix = f"LOWTEST-{uuid.uuid4().hex[:4]}"
    products: list[Product] = []
    batches: list[InventoryBatch] = []

    # Create 5 products:
    # Prod 0: Out of stock (0 units, threshold 5)
    # Prod 1: Out of stock (0 units, threshold 5)
    # Prod 2: Low stock (3 units, threshold 5)
    # Prod 3: Low stock (4 units, threshold 5)
    # Prod 4: Healthy stock (50 units, threshold 5)
    for idx in range(5):
        p = Product(
            name=f"A_{prefix}_Product_{idx}",
            sku=f"{prefix}-{idx}",
            barcode=f"{prefix}-{idx}",
            brand="Test",
            country_of_origin="Nepal",
            category="Test",
            supplier_id="sup-1",
            supplier_name="Supplier",
            cost_price=10.0,
            selling_price=20.0,
            low_stock_threshold=5,
            is_active=True,
        )
        await p.insert()
        products.append(p)

        stock_qty = 0
        if idx in (2, 3):
            stock_qty = 3 if idx == 2 else 4
        elif idx == 4:
            stock_qty = 50

        if stock_qty > 0:
            b = InventoryBatch(
                product_id=str(p.id),
                batch_number=f"B-{prefix}-{idx}",
                quantity=stock_qty,
                unit_cost=10.0,
            )
            await b.insert()
            batches.append(b)

    try:
        # Filter: OUT OF STOCK only
        res_out = await client.get(
            "/api/v1/reports/low-stock",
            params={"page": 1, "page_size": 10, "stock_filter": "out"},
            headers=auth_headers,
        )
        assert res_out.status_code == 200
        data_out = res_out.json()
        out_ids = {str(products[0].id), str(products[1].id)}
        found_out = [r for r in data_out["data"] if r["product_id"] in out_ids]
        assert len(found_out) == 2
        assert all(r["status"] == "out" for r in found_out)

        # Filter: LOW STOCK only (stock > 0 and stock <= threshold)
        res_low = await client.get(
            "/api/v1/reports/low-stock",
            params={"page": 1, "page_size": 10, "stock_filter": "low"},
            headers=auth_headers,
        )
        assert res_low.status_code == 200
        data_low = res_low.json()
        low_ids = {str(products[2].id), str(products[3].id)}
        found_low = [r for r in data_low["data"] if r["product_id"] in low_ids]
        assert len(found_low) == 2
        assert all(r["status"] == "low" for r in found_low)

        # Filter: BOTH
        res_both = await client.get(
            "/api/v1/reports/low-stock",
            params={"page": 1, "page_size": 10, "stock_filter": "both"},
            headers=auth_headers,
        )
        assert res_both.status_code == 200
        data_both = res_both.json()
        both_ids = out_ids.union(low_ids)
        found_both = [r for r in data_both["data"] if r["product_id"] in both_ids]
        assert len(found_both) == 4

        # Healthy product (idx 4) MUST NEVER appear in low stock report!
        healthy_id = str(products[4].id)
        assert not any(r["product_id"] == healthy_id for r in data_both["data"])

        # Also verify pageSize alias works
        res_alias = await client.get(
            "/api/v1/reports/low-stock",
            params={"page": 1, "pageSize": 2, "stock_filter": "both"},
            headers=auth_headers,
        )
        assert res_alias.status_code == 200
        assert res_alias.json()["page_size"] == 2
    finally:
        for b in batches:
            await b.delete()
        for p in products:
            await p.delete()
