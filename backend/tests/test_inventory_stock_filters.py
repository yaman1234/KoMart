"""Inventory Low / Out / Expiring cards must match the filtered table."""

from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta, timezone

import pytest
from bson import ObjectId
from httpx import ASGITransport, AsyncClient

from app.auth.jwt import hash_password
from app.database import init_db
from app.main import app
from app.models.inventory import InventoryBatch
from app.models.product import Product, ProductStatus
from app.models.user import User, UserRole
from app.models.cache_entry import CacheEntry
from app.services.response_cache import INVENTORY_STATS_KEY
from app.services.stock import expiring_product_ids


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
    email = f"inv-filter-{uuid.uuid4().hex[:8]}@komart.com"
    user = User(
        email=email,
        name="Inventory Filter Manager",
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


async def _make_product(*, name: str, sku: str, threshold: int = 10, active: bool = True) -> Product:
    product = Product(
        name=name,
        sku=sku,
        barcode=sku,
        brand="Test",
        country_of_origin="Nepal",
        category="Snacks",
        supplier_id="sup-1",
        supplier_name="Supplier",
        cost_price=10.0,
        selling_price=20.0,
        low_stock_threshold=threshold,
        status=ProductStatus.active,
        is_active=active,
    )
    await product.insert()
    return product


async def _set_legacy_stock_field(product: Product, stock: int) -> None:
    await Product.get_motor_collection().update_one(
        {"_id": product.id},
        {"$set": {"stock": stock}},
    )


@pytest.mark.asyncio
async def test_low_and_out_filters_use_batch_stock_not_legacy_field(
    client: AsyncClient,
    manager_user: User,
):
    prefix = f"FLT-{uuid.uuid4().hex[:8]}"
    token = await _login(client, manager_user.email, "managerpass123")
    headers = {"Authorization": f"Bearer {token}"}

    low_product = await _make_product(name=f"{prefix} Low", sku=f"{prefix}-LOW", threshold=10)
    out_product = await _make_product(name=f"{prefix} Out", sku=f"{prefix}-OUT", threshold=10)
    ok_product = await _make_product(name=f"{prefix} Ok", sku=f"{prefix}-OK", threshold=2)

    # Stale denormalized field: opposite of real on-hand.
    await _set_legacy_stock_field(low_product, 0)
    await _set_legacy_stock_field(out_product, 4)
    await InventoryBatch(
        product_id=str(low_product.id),
        batch_number="LOW-1",
        quantity=3,
        unit_cost=10.0,
        received_at=datetime.now(timezone.utc),
    ).insert()
    await InventoryBatch(
        product_id=str(ok_product.id),
        batch_number="OK-1",
        quantity=8,
        unit_cost=10.0,
        received_at=datetime.now(timezone.utc),
    ).insert()

    try:
        low_res = await client.get(
            f"/api/v1/inventory?filter=low&search={prefix}&page_size=50",
            headers=headers,
        )
        out_res = await client.get(
            f"/api/v1/inventory?filter=out&search={prefix}&page_size=50",
            headers=headers,
        )
        all_res = await client.get(
            f"/api/v1/inventory?search={prefix}&page_size=50",
            headers=headers,
        )
        assert low_res.status_code == 200
        assert out_res.status_code == 200
        assert all_res.status_code == 200

        low_ids = {row["id"] for row in low_res.json()["data"]}
        out_ids = {row["id"] for row in out_res.json()["data"]}
        all_by_id = {row["id"]: row for row in all_res.json()["data"]}

        assert low_res.json()["total"] == 1
        assert str(low_product.id) in low_ids
        assert str(out_product.id) not in low_ids
        assert all_by_id[str(low_product.id)]["stock"] == 3

        assert out_res.json()["total"] == 1
        assert str(out_product.id) in out_ids
        assert str(low_product.id) not in out_ids
        assert all_by_id[str(out_product.id)]["stock"] == 0
        assert str(ok_product.id) not in low_ids
        assert str(ok_product.id) not in out_ids
    finally:
        for product in (low_product, out_product, ok_product):
            await InventoryBatch.find(InventoryBatch.product_id == str(product.id)).delete()
            await product.delete()


@pytest.mark.asyncio
async def test_expiring_count_matches_active_catalog_only(
    client: AsyncClient,
    manager_user: User,
):
    prefix = f"EXP-{uuid.uuid4().hex[:8]}"
    token = await _login(client, manager_user.email, "managerpass123")
    headers = {"Authorization": f"Bearer {token}"}
    soon = (date.today() + timedelta(days=7)).isoformat()

    active = await _make_product(name=f"{prefix} Active", sku=f"{prefix}-ACT")
    inactive = await _make_product(name=f"{prefix} Inactive", sku=f"{prefix}-INA", active=False)
    orphan_id = str(ObjectId())

    await InventoryBatch(
        product_id=str(active.id),
        batch_number="EXP-A",
        quantity=2,
        unit_cost=10.0,
        expiry_date=soon,
        received_at=datetime.now(timezone.utc),
    ).insert()
    await InventoryBatch(
        product_id=str(inactive.id),
        batch_number="EXP-I",
        quantity=4,
        unit_cost=10.0,
        expiry_date=soon,
        received_at=datetime.now(timezone.utc),
    ).insert()
    await InventoryBatch(
        product_id=orphan_id,
        batch_number="EXP-O",
        quantity=9,
        unit_cost=10.0,
        expiry_date=soon,
        received_at=datetime.now(timezone.utc),
    ).insert()

    try:
        expiring_ids = await expiring_product_ids()
        assert str(active.id) in expiring_ids
        assert str(inactive.id) not in expiring_ids
        assert orphan_id not in expiring_ids

        listed = await client.get(
            f"/api/v1/inventory?filter=expiring&search={prefix}&page_size=50",
            headers=headers,
        )
        assert listed.status_code == 200
        listed_ids = {row["id"] for row in listed.json()["data"]}
        assert listed.json()["total"] == 1
        assert str(active.id) in listed_ids
        assert str(inactive.id) not in listed_ids
    finally:
        for pid in (str(active.id), str(inactive.id), orphan_id):
            await InventoryBatch.find(InventoryBatch.product_id == pid).delete()
        await active.delete()
        await inactive.delete()


@pytest.mark.asyncio
async def test_inventory_stats_match_unfiltered_table_totals(
    client: AsyncClient,
    manager_user: User,
):
    await CacheEntry.find(CacheEntry.key == INVENTORY_STATS_KEY).delete()
    token = await _login(client, manager_user.email, "managerpass123")
    headers = {"Authorization": f"Bearer {token}"}

    stats_res = await client.get("/api/v1/inventory/stats", headers=headers)
    assert stats_res.status_code == 200
    stats = stats_res.json()

    async def filter_total(stock_filter: str) -> int:
        res = await client.get(
            f"/api/v1/inventory?filter={stock_filter}&page_size=1",
            headers=headers,
        )
        assert res.status_code == 200
        return res.json()["total"]

    assert stats["low_stock"] == await filter_total("low")
    assert stats["out_of_stock"] == await filter_total("out")
    assert stats["expiring"] == await filter_total("expiring")
