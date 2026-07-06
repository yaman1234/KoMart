"""Pack selling price validation and billability."""

from __future__ import annotations

import uuid

import pytest
from httpx import ASGITransport, AsyncClient

from app.auth.jwt import hash_password
from app.database import init_db
from app.main import app
from app.models.product import Product, SellMode, product_is_billable
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
    email = "pack-price-manager@komart.com"
    existing = await User.find_one(User.email == email)
    if existing:
        await existing.delete()
    user = User(
        email=email,
        name="Pack Price Manager",
        hashed_password=hash_password("managerpass123"),
        role=UserRole.manager,
        is_active=True,
    )
    await user.insert()
    yield user
    await user.delete()


@pytest.fixture
async def manager_token(client: AsyncClient, manager_user: User):
    resp = await client.post(
        "/api/v1/auth/login",
        json={"email": manager_user.email, "password": "managerpass123"},
    )
    assert resp.status_code == 200
    return resp.json()["access_token"]


def _pack_product_payload(**overrides):
    sku = f"PACK-{uuid.uuid4().hex[:8]}"
    payload = {
        "name": "Pack Test Product",
        "sku": sku,
        "barcode": sku,
        "brand": "Test",
        "country_of_origin": "Nepal",
        "category": "Snacks",
        "supplier_id": "",
        "buy_uom": "pack",
        "uom": "pcs",
        "units_per_buy_uom": 12,
        "sell_mode": "both",
        "cost_price": 10.0,
        "selling_price": 25.0,
        "pack_selling_price": 0.0,
        "images": [],
        "low_stock_threshold": 5,
    }
    payload.update(overrides)
    return payload


@pytest.mark.asyncio
async def test_create_product_rejects_missing_pack_price(client, manager_token):
    resp = await client.post(
        "/api/v1/products",
        json=_pack_product_payload(),
        headers={"Authorization": f"Bearer {manager_token}"},
    )
    assert resp.status_code == 422
    assert "pack selling price" in resp.text.lower()


@pytest.mark.asyncio
async def test_create_product_accepts_explicit_pack_price(client, manager_token):
    payload = _pack_product_payload(pack_selling_price=280.0)
    resp = await client.post(
        "/api/v1/products",
        json=payload,
        headers={"Authorization": f"Bearer {manager_token}"},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["pack_selling_price"] == 280.0

    product = await Product.get(data["id"])
    if product:
        await product.delete()


@pytest.mark.asyncio
async def test_update_product_rejects_clearing_pack_price(client, manager_token):
    payload = _pack_product_payload(pack_selling_price=280.0)
    create = await client.post(
        "/api/v1/products",
        json=payload,
        headers={"Authorization": f"Bearer {manager_token}"},
    )
    assert create.status_code == 201
    product_id = create.json()["id"]

    resp = await client.patch(
        f"/api/v1/products/{product_id}",
        json={"pack_selling_price": 0},
        headers={"Authorization": f"Bearer {manager_token}"},
    )
    assert resp.status_code == 422

    product = await Product.get(product_id)
    if product:
        await product.delete()


@pytest.mark.asyncio
async def test_product_is_billable_pack_only_with_pack_price():
    product = Product(
        name="Pack Only",
        sku=f"PACK-ONLY-{uuid.uuid4().hex[:6]}",
        buy_uom="pack",
        uom="pcs",
        units_per_buy_uom=12,
        sell_mode=SellMode.unit,
        cost_price=10.0,
        selling_price=0.0,
        pack_selling_price=280.0,
    )
    assert product_is_billable(product) is True


@pytest.mark.asyncio
async def test_product_is_billable_legacy_pack_fallback():
    product = Product(
        name="Legacy Pack",
        sku=f"LEGACY-PACK-{uuid.uuid4().hex[:6]}",
        buy_uom="pack",
        uom="pcs",
        units_per_buy_uom=12,
        sell_mode=SellMode.both,
        cost_price=10.0,
        selling_price=25.0,
        pack_selling_price=0.0,
    )
    assert product_is_billable(product) is True
