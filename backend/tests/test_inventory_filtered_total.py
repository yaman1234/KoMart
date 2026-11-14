"""Filtered inventory total covers every matching SKU, not the current page."""

from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta, timezone

import pytest
from httpx import ASGITransport, AsyncClient

from app.auth.jwt import hash_password
from app.database import init_db
from app.main import app
from app.models.inventory import InventoryBatch
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
async def manager_user():
    email = f"inv-total-{uuid.uuid4().hex[:8]}@komart.com"
    user = User(
        email=email,
        name="Inventory Total Manager",
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


async def _make_product(
    *,
    name: str,
    sku: str,
    category: str,
    supplier_id: str,
    cost_price: float,
    threshold: int = 10,
    active: bool = True,
) -> Product:
    product = Product(
        name=name,
        sku=sku,
        barcode=sku,
        brand="Test",
        country_of_origin="Nepal",
        category=category,
        supplier_id=supplier_id,
        supplier_name=supplier_id,
        cost_price=cost_price,
        selling_price=cost_price * 2,
        low_stock_threshold=threshold,
        status=ProductStatus.active,
        is_active=active,
    )
    await product.insert()
    return product


async def _add_batch(
    product: Product,
    quantity: int,
    *,
    unit_cost: float,
    expiry_date: str | None = None,
) -> None:
    await InventoryBatch(
        product_id=str(product.id),
        batch_number=f"{product.sku}-{quantity}",
        quantity=quantity,
        unit_cost=unit_cost,
        expiry_date=expiry_date,
        received_at=datetime.now(timezone.utc),
    ).insert()


def _stock_value(stock: int, cost_price: float) -> float:
    return round(stock * cost_price, 2)


async def _cleanup(products: list[Product]) -> None:
    for product in products:
        await InventoryBatch.find(InventoryBatch.product_id == str(product.id)).delete()
        await product.delete()


@pytest.mark.asyncio
async def test_filtered_total_is_stable_across_pages(
    client: AsyncClient,
    manager_user: User,
):
    prefix = f"TOT-{uuid.uuid4().hex[:8]}"
    token = await _login(client, manager_user.email, "managerpass123")
    headers = {"Authorization": f"Bearer {token}"}

    # Batch unit cost differs from catalog cost so the footer stays on stock × cost_price
    # (the table Value column), summed across the whole filter.
    alpha = await _make_product(
        name=f"{prefix} Alpha", sku=f"{prefix}-A", category="Snacks",
        supplier_id="sup-a", cost_price=10.5, threshold=2,
    )
    bravo = await _make_product(
        name=f"{prefix} Bravo", sku=f"{prefix}-B", category="Snacks",
        supplier_id="sup-b", cost_price=3.0, threshold=5,
    )
    charlie = await _make_product(
        name=f"{prefix} Charlie", sku=f"{prefix}-C", category="Drinks",
        supplier_id="sup-a", cost_price=8.0, threshold=5,
    )
    delta = await _make_product(
        name=f"{prefix} Delta", sku=f"{prefix}-D", category="Drinks",
        supplier_id="sup-b", cost_price=20.25, threshold=1,
    )
    inactive = await _make_product(
        name=f"{prefix} Echo", sku=f"{prefix}-E", category="Snacks",
        supplier_id="sup-a", cost_price=100.0, active=False,
    )
    products = [alpha, bravo, charlie, delta, inactive]

    await _add_batch(alpha, 2, unit_cost=1.0)
    await _add_batch(alpha, 2, unit_cost=99.0)
    await _add_batch(bravo, 2, unit_cost=1.0)
    await _add_batch(delta, 3, unit_cost=1.0)
    await _add_batch(inactive, 9, unit_cost=1.0)

    expected_all = round(
        _stock_value(4, 10.5) + _stock_value(2, 3.0) + _stock_value(0, 8.0) + _stock_value(3, 20.25),
        2,
    )

    try:
        page1 = await client.get(
            f"/api/v1/inventory?search={prefix}&page=1&page_size=1",
            headers=headers,
        )
        page2 = await client.get(
            f"/api/v1/inventory?search={prefix}&page=2&page_size=1",
            headers=headers,
        )
        wide = await client.get(
            f"/api/v1/inventory?search={prefix}&page=1&page_size=50",
            headers=headers,
        )
        assert page1.status_code == 200
        assert page2.status_code == 200
        assert wide.status_code == 200

        body1 = page1.json()
        body2 = page2.json()
        body_wide = wide.json()

        assert body1["total"] == 4
        assert body2["total"] == 4
        assert body_wide["total"] == 4
        assert len(body1["data"]) == 1
        assert len(body2["data"]) == 1
        assert len(body_wide["data"]) == 4

        page_value = round(body1["data"][0]["stock"] * body1["data"][0]["cost_price"], 2)
        assert page_value != expected_all
        assert body1["total_stock_value"] == expected_all
        assert body2["total_stock_value"] == expected_all
        assert body_wide["total_stock_value"] == expected_all

        listed_value = round(
            sum(row["stock"] * row["cost_price"] for row in body_wide["data"]),
            2,
        )
        assert listed_value == expected_all
        assert str(inactive.id) not in {row["id"] for row in body_wide["data"]}
    finally:
        await _cleanup(products)


@pytest.mark.asyncio
async def test_filtered_total_follows_category_supplier_and_stock_filters(
    client: AsyncClient,
    manager_user: User,
):
    prefix = f"FLT2-{uuid.uuid4().hex[:8]}"
    token = await _login(client, manager_user.email, "managerpass123")
    headers = {"Authorization": f"Bearer {token}"}
    soon = (date.today() + timedelta(days=7)).isoformat()

    alpha = await _make_product(
        name=f"{prefix} Alpha", sku=f"{prefix}-A", category="Snacks",
        supplier_id="sup-a", cost_price=10.5, threshold=2,
    )
    bravo = await _make_product(
        name=f"{prefix} Bravo", sku=f"{prefix}-B", category="Snacks",
        supplier_id="sup-b", cost_price=3.0, threshold=5,
    )
    charlie = await _make_product(
        name=f"{prefix} Charlie", sku=f"{prefix}-C", category="Drinks",
        supplier_id="sup-a", cost_price=8.0, threshold=5,
    )
    delta = await _make_product(
        name=f"{prefix} Delta", sku=f"{prefix}-D", category="Drinks",
        supplier_id="sup-b", cost_price=20.25, threshold=1,
    )
    products = [alpha, bravo, charlie, delta]

    await _add_batch(alpha, 4, unit_cost=1.0, expiry_date=soon)
    await _add_batch(bravo, 2, unit_cost=1.0, expiry_date=soon)
    await _add_batch(delta, 3, unit_cost=1.0)

    snacks = round(_stock_value(4, 10.5) + _stock_value(2, 3.0), 2)
    drinks = _stock_value(3, 20.25)
    supplier_a = _stock_value(4, 10.5)
    supplier_b = round(_stock_value(2, 3.0) + _stock_value(3, 20.25), 2)
    low_value = _stock_value(2, 3.0)
    expiring_value = snacks

    async def fetch(query: str) -> dict:
        res = await client.get(f"/api/v1/inventory?search={prefix}&{query}", headers=headers)
        assert res.status_code == 200
        return res.json()

    try:
        category_page1 = await fetch("category=Snacks&page=1&page_size=1")
        category_page2 = await fetch("category=Snacks&page=2&page_size=1")
        assert category_page1["total"] == 2
        assert category_page1["total_stock_value"] == snacks
        assert category_page2["total_stock_value"] == snacks
        assert len(category_page1["data"]) == 1

        drinks_body = await fetch("category=Drinks&page_size=1")
        assert drinks_body["total"] == 2
        assert drinks_body["total_stock_value"] == drinks

        supplier_a_body = await fetch("supplier_id=sup-a&page_size=1")
        supplier_b_body = await fetch("supplier_id=sup-b&page_size=1")
        assert supplier_a_body["total"] == 2
        assert supplier_a_body["total_stock_value"] == supplier_a
        assert supplier_b_body["total"] == 2
        assert supplier_b_body["total_stock_value"] == supplier_b

        low_body = await fetch("filter=low&page_size=1")
        out_body = await fetch("filter=out&page_size=1")
        assert low_body["total"] == 1
        assert low_body["total_stock_value"] == low_value
        assert low_body["data"][0]["id"] == str(bravo.id)
        assert out_body["total"] == 1
        assert out_body["total_stock_value"] == 0.0
        assert out_body["data"][0]["id"] == str(charlie.id)

        # Two expiring SKUs, one per page — footer stays the full expiring subset.
        expiring_page1 = await fetch("filter=expiring&page=1&page_size=1")
        expiring_page2 = await fetch("filter=expiring&page=2&page_size=1")
        assert expiring_page1["total"] == 2
        assert expiring_page1["total_stock_value"] == expiring_value
        assert expiring_page2["total_stock_value"] == expiring_value
        assert expiring_page1["total_stock_value"] != round(
            expiring_page1["data"][0]["stock"] * expiring_page1["data"][0]["cost_price"],
            2,
        )
    finally:
        await _cleanup(products)
