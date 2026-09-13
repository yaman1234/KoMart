"""Sold products (Items Sold) report aggregation tests."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

import pytest
from httpx import ASGITransport, AsyncClient

from app.auth.jwt import hash_password
from app.database import init_db
from app.main import app
from app.models.inventory import InventoryBatch, StockAdjustment
from app.models.product import Product, ProductStatus
from app.models.transaction import PaymentMethod, Transaction, TransactionItem, TransactionStatus
from app.models.user import User, UserRole
from app.services.reporting import allocate_txn_to_lines, line_discount, line_gross, line_revenue
from app.services.stock import receive_stock


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
    email = f"sold-mgr-{uuid.uuid4().hex[:8]}@komart.com"
    user = User(
        email=email,
        name="Sold Products Manager",
        hashed_password=hash_password("managerpass123"),
        role=UserRole.manager,
        is_active=True,
    )
    await user.insert()
    yield user
    await user.delete()


@pytest.fixture
async def sold_product():
    sku = f"SOLD-{uuid.uuid4().hex[:6]}"
    product = Product(
        name="Sold Snack",
        sku=sku,
        barcode=sku,
        brand="Test",
        country_of_origin="Nepal",
        category="Snacks",
        supplier_id="sup-1",
        supplier_name="Supplier",
        cost_price=50.0,
        selling_price=100.0,
        stock=0,
        low_stock_threshold=5,
        status=ProductStatus.active,
        is_active=True,
    )
    await product.insert()
    await receive_stock(str(product.id), f"BATCH-{sku}", 100, unit_cost=50.0)
    yield product
    for batch in await InventoryBatch.find(InventoryBatch.product_id == str(product.id)).to_list():
        await batch.delete()
    for adj in await StockAdjustment.find(StockAdjustment.product_id == str(product.id)).to_list():
        await adj.delete()
    await product.delete()


def test_line_helpers_math():
    item = TransactionItem(
        product_id="p1",
        name="X",
        sku="X",
        price=100.0,
        quantity=3,
        discount=10.0,
    )
    assert line_gross(item) == 300.0
    assert line_discount(item) == 30.0
    assert line_revenue(item) == 270.0


def test_allocate_txn_includes_bill_discount():
    item_a = TransactionItem(product_id="a", name="A", sku="A", price=100.0, quantity=2, discount=10.0)
    item_b = TransactionItem(product_id="b", name="B", sku="B", price=50.0, quantity=2, discount=0.0)
    txn = Transaction(
        transaction_number="TXN-ALLOC-1",
        items=[item_a, item_b],
        subtotal=300.0,
        discount=40.0,
        tax=0.0,
        total=240.0,
        payment_method=PaymentMethod.cash,
        status=TransactionStatus.completed,
        created_by="Test",
    )
    # line nets: A=180, B=100, total=280; bill 40 → A 25.71, B 14.29; revenue A=154.29 B=85.71
    rows = allocate_txn_to_lines(txn)
    assert len(rows) == 2
    assert rows[0]["line_discount"] == 20.0
    assert rows[1]["line_discount"] == 0.0
    assert round(sum(r["bill_discount"] for r in rows), 2) == 40.0
    assert round(sum(r["revenue"] for r in rows), 2) == 240.0
    assert round(sum(r["discount_given"] for r in rows), 2) == 60.0
    assert rows[0]["bill_discount"] == 25.71
    assert rows[1]["bill_discount"] == 14.29
    assert rows[0]["revenue"] == 154.29
    assert rows[1]["revenue"] == 85.71


@pytest.mark.asyncio
async def test_top_products_returns_all_sold_with_extended_fields(
    client: AsyncClient,
    manager_user: User,
    sold_product: Product,
):
    pid = str(sold_product.id)
    # Two sales at different prices/discounts for weighted avg
    now = datetime.now(timezone.utc)
    txns = [
        Transaction(
            transaction_number=f"TXN-SOLD-{uuid.uuid4().hex[:6]}",
            customer_name="Walk-In",
            items=[
                TransactionItem(
                    product_id=pid,
                    name=sold_product.name,
                    sku=sold_product.sku,
                    price=100.0,
                    quantity=2,
                    discount=5.0,
                )
            ],
            subtotal=200.0,
            discount=0.0,
            tax=0.0,
            total=190.0,
            payment_method=PaymentMethod.cash,
            status=TransactionStatus.completed,
            created_by=manager_user.name,
            cashier_id=str(manager_user.id),
            created_at=now,
            updated_at=now,
        ),
        Transaction(
            transaction_number=f"TXN-SOLD-{uuid.uuid4().hex[:6]}",
            customer_name="Walk-In",
            items=[
                TransactionItem(
                    product_id=pid,
                    name=sold_product.name,
                    sku=sold_product.sku,
                    price=80.0,
                    quantity=1,
                    discount=0.0,
                )
            ],
            subtotal=80.0,
            discount=0.0,
            tax=0.0,
            total=80.0,
            payment_method=PaymentMethod.cash,
            status=TransactionStatus.completed,
            created_by=manager_user.name,
            cashier_id=str(manager_user.id),
            created_at=now,
            updated_at=now,
        ),
    ]
    for t in txns:
        await t.insert()

    try:
        login = await client.post(
            "/api/v1/auth/login",
            json={"email": manager_user.email, "password": "managerpass123"},
        )
        assert login.status_code == 200
        token = login.json()["access_token"]

        res = await client.get(
            "/api/v1/reports/top-products",
            params={"limit": 5000},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res.status_code == 200, res.text
        rows = res.json()
        match = next((r for r in rows if r["product_id"] == pid), None)
        assert match is not None
        # qty = 3; gross = 100*2 + 80*1 = 280; line discount = 10; no bill discount
        assert match["quantity_sold"] == 3
        assert match["line_total"] == 280.0
        assert match["line_discount"] == 10.0
        assert match["bill_discount"] == 0.0
        assert match["discount_given"] == 10.0
        assert match["revenue"] == 270.0
        assert match["unit_selling_price"] == round(280 / 3, 2)
        assert len(rows) >= 1
    finally:
        for t in txns:
            await t.delete()


@pytest.mark.asyncio
async def test_top_products_line_only_and_summary_reconciles_to_total_revenue(
    client: AsyncClient,
    manager_user: User,
    sold_product: Product,
):
    pid = str(sold_product.id)
    day = datetime(2099, 6, 15, 12, 0, tzinfo=timezone.utc)
    range_params = {"start_date": "2099-06-15", "end_date": "2099-06-15"}
    # line: 100×2 − 5×2 = 190; bill −20 + tax 13 + round-off 0.50 → txn total 183.50
    txn = Transaction(
        transaction_number=f"TXN-BILL-{uuid.uuid4().hex[:6]}",
        customer_name="Walk-In",
        items=[
            TransactionItem(
                product_id=pid,
                name=sold_product.name,
                sku=sold_product.sku,
                price=100.0,
                quantity=2,
                discount=5.0,
            )
        ],
        subtotal=200.0,
        discount=20.0,
        manual_discount=20.0,
        tax=13.0,
        round_off=0.5,
        total=183.5,
        payment_method=PaymentMethod.cash,
        status=TransactionStatus.completed,
        created_by=manager_user.name,
        cashier_id=str(manager_user.id),
        created_at=day,
        updated_at=day,
    )
    await txn.insert()
    try:
        login = await client.post(
            "/api/v1/auth/login",
            json={"email": manager_user.email, "password": "managerpass123"},
        )
        assert login.status_code == 200
        token = login.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        res = await client.get(
            "/api/v1/reports/top-products",
            params={"limit": 5000, **range_params},
            headers=headers,
        )
        assert res.status_code == 200, res.text
        match = next((r for r in res.json() if r["product_id"] == pid), None)
        assert match is not None
        assert match["line_total"] == 200.0
        assert match["line_discount"] == 10.0
        assert match["bill_discount"] == 0.0
        assert match["discount_given"] == 10.0
        assert match["revenue"] == 190.0

        summary_res = await client.get(
            "/api/v1/reports/sales-summary",
            params=range_params,
            headers=headers,
        )
        assert summary_res.status_code == 200, summary_res.text
        summary = summary_res.json()
        assert summary["bill_discount"] == 20.0
        assert summary["tax"] == 13.0
        assert summary["round_off"] == 0.5
        assert summary["total_discount"] == 30.0
        assert summary["total_revenue"] == 183.5

        line_revenue_sum = sum(float(r["revenue"]) for r in res.json())
        reconciled = round(
            line_revenue_sum
            - float(summary["bill_discount"])
            + float(summary["tax"])
            + float(summary["round_off"]),
            2,
        )
        assert reconciled == round(float(summary["total_revenue"]), 2)
    finally:
        await txn.delete()
