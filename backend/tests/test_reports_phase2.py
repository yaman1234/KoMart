"""Phase 2 Backend Verification Tests for KoMart Reports & Accounting Engines.

Covers:
1. Executive Financial Summary (Trading P&L Waterfall, Working Capital, Tax/VAT, Cash-to-Profit Bridge).
2. Sales & Merchandising Performance (Category Contribution %, Tender Mix, Daily Trend).
3. Items Sold with Margin & Proportional Bill Discount Allocation (zero synthetic rows).
4. Procurement, Supplier Ledger, AP Aging (0-30d, 31-60d, 61-90d, 90d+) & Purchase Returns.
5. Inventory Health & Valuation Reconciled with Batch Acquisition Costs.
6. Multi-Wallet Cash Flow Statement (Cash, Bank, eSewa).
"""

from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta, timezone

import pytest
from httpx import ASGITransport, AsyncClient

from app.auth.jwt import hash_password
from app.database import init_db
from app.main import app
from app.models.expense import Expense
from app.models.inventory import InventoryBatch
from app.models.product import Product, ProductStatus
from app.models.purchase_order import POStatus, PurchaseOrder, PurchaseOrderItem
from app.models.purchase_return import (
    PurchaseReturn,
    PurchaseReturnItem,
    PurchaseReturnMode,
    PurchaseReturnStatus,
    ReturnSettlementType,
)
from app.models.supplier import Supplier
from app.models.transaction import (
    PaymentMethod,
    Transaction,
    TransactionItem,
    TransactionStatus,
)
from app.models.user import User, UserRole
from app.services.reporting import parse_date_range
from app.services.time_nepal import NPT, to_npt


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
    email = f"phase2-mgr-{uuid.uuid4().hex[:8]}@komart.com"
    user = User(
        email=email,
        name="Phase2 Accounting Manager",
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
# 1. Executive Summary & P&L Waterfall Verification
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_executive_summary_waterfall_and_bridge(
    client: AsyncClient,
    auth_headers: dict[str, str],
):
    # Isolated test date in the future so test runs cleanly without seed collisions
    test_day = "2029-06-15"
    start_dt, end_dt = parse_date_range(test_day, test_day)

    # 1. Product & Sale
    p = Product(
        name="P2 Test Rice",
        sku="P2-RICE-1",
        barcode="P2-RICE-1",
        brand="Test",
        country_of_origin="Nepal",
        category="Groceries",
        supplier_id="sup-p2",
        supplier_name="P2 Grains Ltd",
        cost_price=1200.0,
        selling_price=1500.0,
        low_stock_threshold=5,
        is_active=True,
    )
    await p.insert()

    # Sale: 2 bags sold at 1500 = 3000 gross. Item discount 100, Bill discount 100.
    # Net sales = 2800. Unit cost = 1200 * 2 = 2400 COGS. Gross Profit = 400.
    txn = Transaction(
        transaction_number=f"TXN-P2-{uuid.uuid4().hex[:6]}",
        customer_name="P2 Customer",
        items=[
            TransactionItem(
                product_id=str(p.id),
                name=p.name,
                sku=p.sku,
                price=1500.0,
                quantity=2,
                discount=50.0,  # 50 * 2 = 100 line discount
                unit_cost=1200.0,
                unit_factor=1,
            )
        ],
        subtotal=2900.0,
        discount=100.0,  # bill discount
        tax=0.0,
        round_off=0.0,
        total=2800.0,
        total_cost=2400.0,
        payment_method=PaymentMethod.cash,
        status=TransactionStatus.completed,
        created_by="Manager",
        created_at=start_dt + timedelta(hours=4),
    )
    await txn.insert()

    # 2. Operating Expense: Store Electricity Rs 150
    # 3. PO Supplier Payment: Rs 500 (must be excluded from OpEx!)
    exp_op = Expense(
        title="Store Electricity P2",
        amount=150.0,
        category="utilities",
        date=test_day,
    )
    await exp_op.insert()

    exp_po = Expense(
        title="Supplier Grains PO Payment",
        amount=500.0,
        category="purchase_order",
        purchase_order_id="PO-P2-01",
        date=test_day,
    )
    await exp_po.insert()

    try:
        res = await client.get(
            "/api/v1/reports/executive-summary",
            params={"start_date": test_day, "end_date": test_day},
            headers=auth_headers,
        )
        assert res.status_code == 200, res.text
        data = res.json()

        pnl = data["pnl"]
        assert pnl["gross_sales"] == 3000.0
        assert pnl["item_markdowns"] == 100.0
        assert pnl["bill_discounts"] == 100.0
        assert pnl["total_discounts"] == 200.0
        assert pnl["net_sales"] == 2800.0
        assert pnl["total_cogs"] == 2400.0
        assert pnl["gross_profit"] == 400.0
        # OpEx MUST only be 150 (not 650!)
        assert pnl["operating_expenses"] == 150.0
        # Operating Profit (EBIT) = 400 - 150 = 250
        assert pnl["operating_profit"] == 250.0

        # Cash-to-Profit Bridge validation:
        # Net Cash Flow = bridge.accrual_operating_profit + non_cash + cogs - po_payments + refunds + timing
        bridge = data["cash_bridge"]
        assert bridge["accrual_operating_profit"] == 250.0
        assert bridge["cogs_inventory_reduction"] == 2400.0
        assert bridge["supplier_po_payments"] == 500.0
        expected_ncf = (
            bridge["accrual_operating_profit"]
            + bridge["non_cash_consumption"]
            + bridge["cogs_inventory_reduction"]
            - bridge["supplier_po_payments"]
            + bridge["supplier_refunds_collected"]
            + bridge["timing_float_difference"]
        )
        assert round(expected_ncf, 2) == round(bridge["net_cash_flow"], 2)

        # Working Capital structure exists
        assert "inventory_value" in data["working_capital"]
        assert "accounts_payable" in data["working_capital"]
        assert "accounts_receivable" in data["working_capital"]
    finally:
        await exp_po.delete()
        await exp_op.delete()
        await txn.delete()
        await p.delete()


# ---------------------------------------------------------------------------
# 2. Sales Performance & Category Contribution
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_sales_performance_report_structure(
    client: AsyncClient,
    auth_headers: dict[str, str],
):
    test_day = "2029-07-20"
    start_dt, end_dt = parse_date_range(test_day, test_day)

    p1 = Product(
        name="Juice Apple",
        sku="J-APP-1",
        barcode="J-APP-1",
        brand="Test",
        country_of_origin="Nepal",
        category="Beverages",
        supplier_id="sup-1",
        supplier_name="Supplier",
        cost_price=80.0,
        selling_price=120.0,
        low_stock_threshold=5,
        is_active=True,
    )
    p2 = Product(
        name="Snack Chips",
        sku="S-CHP-1",
        barcode="S-CHP-1",
        brand="Test",
        country_of_origin="Nepal",
        category="Snacks",
        supplier_id="sup-1",
        supplier_name="Supplier",
        cost_price=40.0,
        selling_price=60.0,
        low_stock_threshold=5,
        is_active=True,
    )
    await p1.insert()
    await p2.insert()

    txn = Transaction(
        transaction_number=f"TXN-SP-{uuid.uuid4().hex[:6]}",
        items=[
            TransactionItem(
                product_id=str(p1.id),
                name=p1.name,
                sku=p1.sku,
                category=p1.category,
                price=120.0,
                quantity=2,
                unit_cost=80.0,
            ),
            TransactionItem(
                product_id=str(p2.id),
                name=p2.name,
                sku=p2.sku,
                category=p2.category,
                price=60.0,
                quantity=1,
                unit_cost=40.0,
            ),
        ],
        subtotal=300.0,
        discount=0.0,
        tax=0.0,
        total=300.0,
        total_cost=200.0,
        payment_method=PaymentMethod.bank,
        status=TransactionStatus.completed,
        created_by="Cashier 1",
        created_at=start_dt + timedelta(hours=3),
    )
    await txn.insert()

    try:
        res = await client.get(
            "/api/v1/reports/sales-performance",
            params={"start_date": test_day, "end_date": test_day},
            headers=auth_headers,
        )
        assert res.status_code == 200
        data = res.json()

        assert data["total_gross_sales"] == 300.0
        assert data["total_net_revenue"] == 300.0
        assert data["total_cogs"] == 200.0
        assert data["total_gross_profit"] == 100.0
        assert data["transaction_count"] == 1
        assert data["total_units_sold"] == 3

        # Categories check
        cats = {c["category"]: c for c in data["categories"]}
        assert "Beverages" in cats
        assert "Snacks" in cats
        assert cats["Beverages"]["units_sold"] == 2
        assert cats["Beverages"]["gross_sales"] == 240.0
        assert cats["Snacks"]["units_sold"] == 1
        assert cats["Snacks"]["gross_sales"] == 60.0

        # Tender mix check
        bank_tender = next((t for t in data["tender_mix"] if t["method"] == "bank"), None)
        assert bank_tender is not None
        assert bank_tender["amount"] == 300.0
    finally:
        await txn.delete()
        await p1.delete()
        await p2.delete()


# ---------------------------------------------------------------------------
# 3. Items Sold with Margin & Proportional Bill Discount Allocation
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_items_sold_proportional_discount_allocation(
    client: AsyncClient,
    auth_headers: dict[str, str],
):
    test_day = "2029-08-10"
    start_dt, end_dt = parse_date_range(test_day, test_day)

    # Item A: 2 units at 100 = 200. Line discount = 20. Net before bill disc = 180.
    # Item B: 2 units at 50 = 100. Line discount = 0. Net before bill disc = 100.
    # Line nets total = 280.
    # Bill discount = 40.
    # Item A share = 180/280 * 40 = 25.71 bill discount. Revenue = 180 - 25.71 = 154.29.
    # Item B share = 100/280 * 40 = 14.29 bill discount. Revenue = 100 - 14.29 = 85.71.
    pid_a = f"p_a_{uuid.uuid4().hex[:6]}"
    pid_b = f"p_b_{uuid.uuid4().hex[:6]}"

    txn = Transaction(
        transaction_number=f"TXN-DISC-{uuid.uuid4().hex[:6]}",
        items=[
            TransactionItem(
                product_id=pid_a,
                name="Product A",
                sku="SKU-A",
                category="Groceries",
                price=100.0,
                quantity=2,
                discount=10.0,
                unit_cost=60.0,
            ),
            TransactionItem(
                product_id=pid_b,
                name="Product B",
                sku="SKU-B",
                category="Dairy",
                price=50.0,
                quantity=2,
                discount=0.0,
                unit_cost=30.0,
            ),
        ],
        subtotal=280.0,
        discount=40.0,
        tax=0.0,
        total=240.0,
        total_cost=180.0,  # 60*2 + 30*2
        payment_method=PaymentMethod.cash,
        status=TransactionStatus.completed,
        created_by="Cashier",
        created_at=start_dt + timedelta(hours=2),
    )
    await txn.insert()

    try:
        res = await client.get(
            "/api/v1/reports/items-sold",
            params={"start_date": test_day, "end_date": test_day},
            headers=auth_headers,
        )
        assert res.status_code == 200, res.text
        data = res.json()
        assert data["total"] == 2
        rows = {r["product_id"]: r for r in data["data"]}

        assert pid_a in rows
        assert pid_b in rows

        row_a = rows[pid_a]
        assert row_a["gross_sales"] == 200.0
        assert row_a["line_discount"] == 20.0
        assert row_a["bill_discount"] == 25.71
        assert row_a["net_revenue"] == 154.29
        assert row_a["total_cogs"] == 120.0
        assert row_a["gross_profit"] == round(154.29 - 120.0, 2)

        row_b = rows[pid_b]
        assert row_b["gross_sales"] == 100.0
        assert row_b["line_discount"] == 0.0
        assert row_b["bill_discount"] == 14.29
        assert row_b["net_revenue"] == 85.71
        assert row_b["total_cogs"] == 60.0
        assert row_b["gross_profit"] == round(85.71 - 60.0, 2)

        # Total revenue across both items must exactly equal txn.total (240.0) without any synthetic row!
        assert round(row_a["net_revenue"] + row_b["net_revenue"], 2) == 240.0
    finally:
        await txn.delete()


# ---------------------------------------------------------------------------
# 4. Purchasing, Payables & AP Aging
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_purchasing_payables_and_ap_aging(
    client: AsyncClient,
    auth_headers: dict[str, str],
):
    test_day = "2029-09-01"
    start_dt, end_dt = parse_date_range(test_day, test_day)

    supplier = Supplier(
        name="Global Foods Nepal",
        country="Nepal",
        contact_person="Ramesh",
        phone="9841000000",
        address="Kathmandu",
        is_active=True,
    )
    await supplier.insert()
    sid = str(supplier.id)

    # PO 1: 10,000 total, 4,000 paid -> 6,000 outstanding (current < 30 days)
    po1 = PurchaseOrder(
        order_number=f"PO-{uuid.uuid4().hex[:6]}",
        supplier_id=sid,
        supplier_name=supplier.name,
        status=POStatus.received,
        subtotal=10000.0,
        discount=0.0,
        additional_charges=0.0,
        total_amount=10000.0,
        amount_paid=4000.0,
        received_date=test_day,
        created_at=start_dt,
    )
    await po1.insert()

    # Purchase Return: 1,500 total, 500 received refund -> 1,000 pending receivable
    pr1 = PurchaseReturn(
        return_number=f"PR-{uuid.uuid4().hex[:6]}",
        supplier_id=sid,
        supplier_name=supplier.name,
        return_mode=PurchaseReturnMode.supplier,
        items=[
            PurchaseReturnItem(
                product_id="pr-p1",
                product_name="Damaged Oil",
                return_qty=5,
                unit_cost=300.0,
                line_total=1500.0,
            )
        ],
        total_amount=1500.0,
        amount_received=500.0,
        status=PurchaseReturnStatus.requested,
        settlement_type=ReturnSettlementType.refund,
        return_date=test_day,
        created_at=start_dt,
    )
    await pr1.insert()

    try:
        res = await client.get(
            "/api/v1/reports/purchasing-payables",
            params={"start_date": test_day, "end_date": test_day, "date_basis": "received"},
            headers=auth_headers,
        )
        assert res.status_code == 200, res.text
        data = res.json()

        assert data["gross_purchases"] >= 10000.0
        assert data["total_amount_paid"] >= 4000.0
        assert data["total_outstanding_ap"] >= 6000.0

        # Supplier ledger check
        sup_entry = next((s for s in data["supplier_ledger"] if s["supplier_id"] == sid), None)
        assert sup_entry is not None
        assert sup_entry["outstanding_balance"] == 6000.0
        assert sup_entry["amount_paid"] == 4000.0

        # Purchase returns & receivables check
        assert data["total_purchase_returns_value"] >= 1500.0
        assert data["total_return_refunds_received"] >= 500.0
        assert data["total_supplier_receivables"] >= 1000.0
    finally:
        await pr1.delete()
        await po1.delete()
        await supplier.delete()


# ---------------------------------------------------------------------------
# 5. Inventory Health Report
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_inventory_health_report(
    client: AsyncClient,
    auth_headers: dict[str, str],
):
    p = Product(
        name="Health Test Tea",
        sku=f"TEA-{uuid.uuid4().hex[:4]}",
        barcode=f"TEA-{uuid.uuid4().hex[:4]}",
        brand="Test",
        country_of_origin="Nepal",
        category="Beverages",
        supplier_id="sup-1",
        supplier_name="Supplier",
        cost_price=200.0,
        selling_price=300.0,
        low_stock_threshold=10,
        is_active=True,
    )
    await p.insert()
    pid = str(p.id)

    # Batch with 2 units -> low stock (threshold is 10)
    batch = InventoryBatch(
        product_id=pid,
        batch_number=f"B-{uuid.uuid4().hex[:4]}",
        quantity=2,
        unit_cost=200.0,
        expiry_date=(date.today() + timedelta(days=15)).isoformat(),
    )
    await batch.insert()

    try:
        res = await client.get(
            "/api/v1/reports/inventory-health",
            params={"stock_filter": "both", "expiry_days": 30},
            headers=auth_headers,
        )
        assert res.status_code == 200, res.text
        data = res.json()

        assert data["total_skus"] >= 1
        assert data["total_inventory_value"] >= 400.0

        # Reorder candidates check
        reorder = next((r for r in data["reorder_candidates"] if r["product_id"] == pid), None)
        assert reorder is not None
        assert reorder["status"] == "low"
        assert reorder["estimated_reorder_cost"] > 0

        # Near expiry check
        exp_batch = next((b for b in data["near_expiry_batches"] if b["product_id"] == pid), None)
        assert exp_batch is not None
        assert exp_batch["quantity"] == 2
        assert exp_batch["stock_value_at_risk"] == 400.0
    finally:
        await batch.delete()
        await p.delete()


# ---------------------------------------------------------------------------
# 6. Multi-Wallet Cash Flow Statement
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_cash_flow_statement_structure(
    client: AsyncClient,
    auth_headers: dict[str, str],
):
    test_day = "2029-10-01"
    res = await client.get(
        "/api/v1/reports/cash-flow",
        params={"start_date": test_day, "end_date": test_day},
        headers=auth_headers,
    )
    assert res.status_code == 200, res.text
    data = res.json()

    assert "inflows" in data
    assert "outflows" in data
    assert "net_cash_flow" in data
    assert "wallets" in data
    assert "cash_to_profit_bridge" in data

    wallets = {w["wallet"]: w for w in data["wallets"]}
    assert "cash" in wallets
    assert "bank" in wallets
    assert "esewa" in wallets
