"""Purchase price history + last Unit Cost API."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

import pytest
from httpx import ASGITransport, AsyncClient

from app.auth.jwt import hash_password
from app.database import init_db
from app.main import app
from app.models.purchase_price_history import PurchasePriceHistory
from app.models.product import Product
from app.models.user import User, UserRole


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
    email = f"pph-{uuid.uuid4().hex[:8]}@komart.com"
    user = User(
        email=email,
        name="PPH Tester",
        hashed_password=hash_password("managerpass123"),
        role=UserRole.manager,
        is_active=True,
    )
    await user.insert()
    yield user
    await user.delete()


async def _login(client: AsyncClient, email: str, password: str) -> str:
    res = await client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert res.status_code == 200
    return res.json()["access_token"]


@pytest.mark.asyncio
async def test_purchase_price_history_list_and_last(client: AsyncClient, manager_user: User):
    token = await _login(client, manager_user.email, "managerpass123")
    sku = f"PPH-{uuid.uuid4().hex[:6]}"
    product = Product(
        name="Hist Product",
        sku=sku,
        barcode=sku,
        brand="T",
        country_of_origin="NP",
        category="Snacks",
        supplier_id="s1",
        supplier_name="S",
        cost_price=10,
        selling_price=15,
        low_stock_threshold=1,
        is_active=True,
    )
    await product.insert()
    pid = str(product.id)

    empty = await client.get(
        f"/api/v1/products/{pid}/last-purchase-unit-cost",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert empty.status_code == 200
    assert empty.json()["unit_cost"] is None

    await PurchasePriceHistory(
        product_id=pid,
        purchased_at=datetime.now(timezone.utc),
        unit_cost=42.5,
        quantity=3,
        base_quantity=3,
        purchase_order_id="po1",
        order_number="PO-0001",
        bill_number="B-1",
        supplier_id="s1",
        supplier_name="Acme Supplies",
    ).insert()

    last = await client.get(
        f"/api/v1/products/{pid}/last-purchase-unit-cost",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert last.status_code == 200
    assert last.json()["unit_cost"] == 42.5

    hist = await client.get(
        f"/api/v1/products/{pid}/purchase-price-history",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert hist.status_code == 200
    assert hist.json()["total"] == 1
    row = hist.json()["data"][0]
    assert row["unit_cost"] == 42.5
    assert row.get("supplier_name") == "Acme Supplies" or row.get("supplierName") == "Acme Supplies"

    await product.delete()
    await PurchasePriceHistory.find(PurchasePriceHistory.product_id == pid).delete()
