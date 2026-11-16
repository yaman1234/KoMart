"""Selected Products stock counts must snapshot only the chosen SKUs."""

from __future__ import annotations

import uuid

import pytest
from bson import ObjectId
from httpx import ASGITransport, AsyncClient

from app.auth.jwt import hash_password
from app.database import init_db
from app.main import app
from app.models.product import Product, ProductStatus
from app.models.stock_count import StockCount
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
    email = f"sc-selected-{uuid.uuid4().hex[:8]}@komart.com"
    user = User(
        email=email,
        name="Stock Count Manager",
        hashed_password=hash_password("managerpass123"),
        role=UserRole.manager,
        is_active=True,
    )
    await user.insert()
    yield user
    await user.delete()


async def _login(client: AsyncClient, email: str) -> dict[str, str]:
    res = await client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": "managerpass123"},
    )
    assert res.status_code == 200, res.text
    return {"Authorization": f"Bearer {res.json()['access_token']}"}


async def _make_product(
    *,
    name: str,
    sku: str,
    category: str = "Snacks",
    active: bool = True,
) -> Product:
    product = Product(
        name=name,
        sku=sku,
        barcode=sku,
        brand="Test",
        country_of_origin="Nepal",
        category=category,
        supplier_id="sup-1",
        supplier_name="Supplier",
        cost_price=10.0,
        selling_price=20.0,
        low_stock_threshold=10,
        status=ProductStatus.active,
        is_active=active,
    )
    await product.insert()
    return product


async def _delete_products(products: list[Product]) -> None:
    for product in products:
        existing = await Product.get(product.id)
        if existing:
            await existing.delete()


async def _delete_counts_with_notes(notes: str) -> None:
    for sc in await StockCount.find(StockCount.notes == notes).to_list():
        await sc.delete()


def _notes(label: str) -> str:
    return f"UAT04-{label}-{uuid.uuid4().hex}"


@pytest.mark.asyncio
async def test_selected_empty_product_ids_returns_400(
    client: AsyncClient,
    manager_user: User,
):
    """Empty Selected Products must not snapshot the active catalog."""
    prefix = f"UAT04-EMPTY-{uuid.uuid4().hex[:8]}"
    headers = await _login(client, manager_user.email)
    decoy = await _make_product(name=f"{prefix} Decoy", sku=f"{prefix}-DECOY")
    notes_cases = [
        _notes("omit"),
        _notes("empty-list"),
        _notes("blank"),
    ]
    payloads = [
        {"count_type": "selected", "notes": notes_cases[0]},
        {"count_type": "selected", "product_ids": [], "notes": notes_cases[1]},
        {"count_type": "selected", "product_ids": ["", "   "], "notes": notes_cases[2]},
    ]
    try:
        for notes, payload in zip(notes_cases, payloads):
            res = await client.post("/api/v1/stock-counts", json=payload, headers=headers)
            assert res.status_code == 400, res.text
            detail = res.json()["detail"]
            assert isinstance(detail, str)
            assert "product" in detail.lower()
            assert await StockCount.find(StockCount.notes == notes).count() == 0
            # The decoy SKU must not have been pulled into a count.
            created = await StockCount.find(
                {"items.product_id": str(decoy.id), "notes": notes}
            ).count()
            assert created == 0
    finally:
        for notes in notes_cases:
            await _delete_counts_with_notes(notes)
        await _delete_products([decoy])


@pytest.mark.asyncio
async def test_selected_two_products_snapshot_only_those(
    client: AsyncClient,
    manager_user: User,
):
    prefix = f"UAT04-SEL-{uuid.uuid4().hex[:8]}"
    headers = await _login(client, manager_user.email)
    snack_a = await _make_product(name=f"{prefix} Snack A", sku=f"{prefix}-A")
    snack_b = await _make_product(name=f"{prefix} Snack B", sku=f"{prefix}-B")
    snack_c = await _make_product(name=f"{prefix} Snack C", sku=f"{prefix}-C")
    notes = _notes("two")
    try:
        res = await client.post(
            "/api/v1/stock-counts",
            json={
                "count_type": "selected",
                "count_mode": "blind",
                "product_ids": [str(snack_a.id), str(snack_b.id)],
                "notes": notes,
            },
            headers=headers,
        )
        assert res.status_code == 201, res.text
        body = res.json()
        assert body["count_type"] == "selected"
        assert body["total_products"] == 2
        assert len(body["items"]) == 2
        assert {item["product_id"] for item in body["items"]} == {
            str(snack_a.id),
            str(snack_b.id),
        }
        assert str(snack_c.id) not in {item["product_id"] for item in body["items"]}
    finally:
        await _delete_counts_with_notes(notes)
        await _delete_products([snack_a, snack_b, snack_c])


@pytest.mark.asyncio
async def test_selected_invalid_or_partial_ids_do_not_snapshot_catalog(
    client: AsyncClient,
    manager_user: User,
):
    prefix = f"UAT04-BAD-{uuid.uuid4().hex[:8]}"
    headers = await _login(client, manager_user.email)
    snack_a = await _make_product(name=f"{prefix} Snack A", sku=f"{prefix}-A")
    inactive = await _make_product(
        name=f"{prefix} Inactive",
        sku=f"{prefix}-OFF",
        active=False,
    )
    notes_invalid = _notes("invalid")
    notes_partial = _notes("partial")
    notes_inactive = _notes("inactive")
    try:
        invalid = await client.post(
            "/api/v1/stock-counts",
            json={
                "count_type": "selected",
                "product_ids": ["not-an-id"],
                "notes": notes_invalid,
            },
            headers=headers,
        )
        assert invalid.status_code == 400, invalid.text
        assert "invalid" in invalid.json()["detail"].lower()

        partial = await client.post(
            "/api/v1/stock-counts",
            json={
                "count_type": "selected",
                "product_ids": [str(snack_a.id), str(ObjectId())],
                "notes": notes_partial,
            },
            headers=headers,
        )
        assert partial.status_code == 400, partial.text
        assert "not found" in partial.json()["detail"].lower()

        inactive_only = await client.post(
            "/api/v1/stock-counts",
            json={
                "count_type": "selected",
                "product_ids": [str(inactive.id)],
                "notes": notes_inactive,
            },
            headers=headers,
        )
        assert inactive_only.status_code == 400, inactive_only.text

        for notes in (notes_invalid, notes_partial, notes_inactive):
            assert await StockCount.find(StockCount.notes == notes).count() == 0
    finally:
        for notes in (notes_invalid, notes_partial, notes_inactive):
            await _delete_counts_with_notes(notes)
        await _delete_products([snack_a, inactive])


@pytest.mark.asyncio
async def test_full_and_category_counts_ignore_product_selection(
    client: AsyncClient,
    manager_user: User,
):
    """Full and category scopes stay as they were: product_ids does not narrow them."""
    prefix = f"UAT04-SCOPE-{uuid.uuid4().hex[:8]}"
    category_a = f"{prefix}-A"
    category_b = f"{prefix}-B"
    headers = await _login(client, manager_user.email)
    cat_a1 = await _make_product(name=f"{prefix} A1", sku=f"{prefix}-A1", category=category_a)
    cat_a2 = await _make_product(name=f"{prefix} A2", sku=f"{prefix}-A2", category=category_a)
    cat_b = await _make_product(name=f"{prefix} B1", sku=f"{prefix}-B1", category=category_b)
    inactive = await _make_product(
        name=f"{prefix} Inactive",
        sku=f"{prefix}-OFF",
        category=category_a,
        active=False,
    )
    category_notes = _notes("category")
    full_notes = _notes("full")
    try:
        category_res = await client.post(
            "/api/v1/stock-counts",
            json={
                "count_type": "category",
                "category_filter": category_a,
                # Must be ignored — category scope is not a selected-product count.
                "product_ids": [str(cat_b.id)],
                "notes": category_notes,
            },
            headers=headers,
        )
        assert category_res.status_code == 201, category_res.text
        category_body = category_res.json()
        assert category_body["count_type"] == "category"
        assert category_body["total_products"] == 2
        assert {item["product_id"] for item in category_body["items"]} == {
            str(cat_a1.id),
            str(cat_a2.id),
        }

        active_total = await Product.find(Product.is_active == True).count()  # noqa: E712
        full_res = await client.post(
            "/api/v1/stock-counts",
            json={
                "count_type": "full",
                "product_ids": [str(cat_a1.id)],
                "notes": full_notes,
            },
            headers=headers,
        )
        assert full_res.status_code == 201, full_res.text
        full_body = full_res.json()
        assert full_body["count_type"] == "full"
        assert full_body["total_products"] == active_total
        full_ids = {item["product_id"] for item in full_body["items"]}
        assert str(cat_a1.id) in full_ids
        assert str(cat_a2.id) in full_ids
        assert str(cat_b.id) in full_ids
        assert str(inactive.id) not in full_ids
    finally:
        await _delete_counts_with_notes(category_notes)
        await _delete_counts_with_notes(full_notes)
        await _delete_products([cat_a1, cat_a2, cat_b, inactive])
