"""Correct Stock (POST /inventory/adjust) is admin-only."""

from __future__ import annotations

import uuid

import pytest
from httpx import ASGITransport, AsyncClient

from app.auth.jwt import hash_password
from app.database import init_db
from app.main import app
from app.models.inventory import InventoryBatch, StockAdjustment
from app.models.product import Product, ProductStatus
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
async def admin_user():
    email = f"adjust-admin-{uuid.uuid4().hex[:8]}@komart.com"
    user = User(
        email=email,
        name="Adjust Admin",
        hashed_password=hash_password("adminpass123"),
        role=UserRole.admin,
        is_active=True,
    )
    await user.insert()
    yield user
    await user.delete()


@pytest.fixture
async def manager_user():
    email = f"adjust-mgr-{uuid.uuid4().hex[:8]}@komart.com"
    user = User(
        email=email,
        name="Adjust Manager",
        hashed_password=hash_password("managerpass123"),
        role=UserRole.manager,
        is_active=True,
    )
    await user.insert()
    yield user
    await user.delete()


@pytest.fixture
async def stock_product():
    sku = f"ADJ-{uuid.uuid4().hex[:6]}"
    product = Product(
        name="Adjust Test Snack",
        sku=sku,
        barcode=sku,
        brand="Test",
        country_of_origin="Nepal",
        category="Snacks",
        supplier_id="sup-1",
        supplier_name="Supplier",
        cost_price=10.0,
        selling_price=20.0,
        low_stock_threshold=5,
        status=ProductStatus.active,
        is_active=True,
    )
    await product.insert()
    yield product
    for batch in await InventoryBatch.find(InventoryBatch.product_id == str(product.id)).to_list():
        await batch.delete()
    for adj in await StockAdjustment.find(StockAdjustment.product_id == str(product.id)).to_list():
        await adj.delete()
    await product.delete()


async def _login(client: AsyncClient, email: str, password: str) -> str:
    res = await client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert res.status_code == 200
    return res.json()["access_token"]


def _adjust_body(product_id: str) -> dict:
    return {
        "product_id": product_id,
        "type": "correction",
        "quantity": 5,
        "reason": "Admin count fix",
    }


@pytest.mark.asyncio
async def test_manager_cannot_adjust_stock(
    client: AsyncClient,
    manager_user: User,
    stock_product: Product,
):
    token = await _login(client, manager_user.email, "managerpass123")
    res = await client.post(
        "/api/v1/inventory/adjust",
        json=_adjust_body(str(stock_product.id)),
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_admin_can_adjust_stock(
    client: AsyncClient,
    admin_user: User,
    stock_product: Product,
):
    token = await _login(client, admin_user.email, "adminpass123")
    res = await client.post(
        "/api/v1/inventory/adjust",
        json=_adjust_body(str(stock_product.id)),
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 200, res.text
    assert "Stock adjusted" in res.json()["message"]
