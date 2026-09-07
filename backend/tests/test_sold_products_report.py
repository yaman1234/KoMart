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
from app.services.reporting import line_discount, line_gross, line_revenue
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
            discount=10.0,
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
        # qty = 3; gross = 100*2 + 80*1 = 280; discount = 5*2 + 0 = 10; revenue = 270
        assert match["quantity_sold"] == 3
        assert match["line_total"] == 280.0
        assert match["discount_given"] == 10.0
        assert match["revenue"] == 270.0
        assert match["unit_selling_price"] == round(280 / 3, 2)
        assert len(rows) >= 1
    finally:
        for t in txns:
            await t.delete()
