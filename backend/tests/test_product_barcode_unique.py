"""Non-empty product barcodes are unique among active products."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

import pytest
from httpx import ASGITransport, AsyncClient

from app.auth.jwt import hash_password
from app.database import BARCODE_UNIQUE_INDEX, ensure_unique_barcode_index, init_db
from app.main import app
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
async def manager_headers(client: AsyncClient):
    email = f"barcode-{uuid.uuid4().hex[:8]}@komart.com"
    user = User(
        email=email,
        name="Barcode Manager",
        hashed_password=hash_password("managerpass123"),
        role=UserRole.manager,
        is_active=True,
    )
    await user.insert()
    try:
        res = await client.post(
            "/api/v1/auth/login",
            json={"email": email, "password": "managerpass123"},
        )
        assert res.status_code == 200
        yield {"Authorization": f"Bearer {res.json()['access_token']}"}
    finally:
        await user.delete()


def _payload(**overrides) -> dict:
    suffix = uuid.uuid4().hex[:8]
    payload = {
        "name": f"Barcode Product {suffix}",
        "sku": f"BC{suffix}",
        "barcode": "",
        "brand": "Test",
        "country_of_origin": "Nepal",
        "category": "Snacks",
        "supplier_id": "",
        "buy_uom": "pcs",
        "uom": "pcs",
        "units_per_buy_uom": 1,
        "sell_mode": "unit",
        "cost_price": 10.0,
        "selling_price": 20.0,
        "images": [],
        "low_stock_threshold": 5,
    }
    payload.update(overrides)
    return payload


async def _delete_ids(ids: list[str]) -> None:
    for product_id in ids:
        product = await Product.get(product_id)
        if product:
            await product.delete()


@pytest.mark.asyncio
async def test_duplicate_barcode_rejected_on_create_and_update(client: AsyncClient, manager_headers: dict):
    created_ids: list[str] = []
    try:
        first = await client.post(
            "/api/v1/products",
            json=_payload(name="GROKTEST Snack A", barcode="2900000000011"),
            headers=manager_headers,
        )
        assert first.status_code == 201, first.text
        created_ids.append(first.json()["id"])
        assert first.json()["barcode"] == "2900000000011"

        duplicate = await client.post(
            "/api/v1/products",
            json=_payload(name="GROKTEST Duplicate Barcode Check", sku="990099", barcode="2900000000011"),
            headers=manager_headers,
        )
        assert duplicate.status_code == 409
        assert duplicate.json()["detail"] == "Barcode already exists"
        assert await Product.find(Product.barcode == "2900000000011").count() == 1

        other = await client.post(
            "/api/v1/products",
            json=_payload(barcode="2900000000099"),
            headers=manager_headers,
        )
        assert other.status_code == 201, other.text
        other_id = other.json()["id"]
        created_ids.append(other_id)

        conflict = await client.patch(
            f"/api/v1/products/{other_id}",
            json={"barcode": "2900000000011"},
            headers=manager_headers,
        )
        assert conflict.status_code == 409
        assert conflict.json()["detail"] == "Barcode already exists"
        refreshed = await Product.get(other_id)
        assert refreshed is not None
        assert refreshed.barcode == "2900000000099"

        same = await client.patch(
            f"/api/v1/products/{created_ids[0]}",
            json={"barcode": "2900000000011", "brand": "Kept"},
            headers=manager_headers,
        )
        assert same.status_code == 200, same.text
        assert same.json()["barcode"] == "2900000000011"
        assert same.json()["brand"] == "Kept"
    finally:
        await _delete_ids(created_ids)


@pytest.mark.asyncio
async def test_duplicate_sku_message_unchanged(client: AsyncClient, manager_headers: dict):
    created_ids: list[str] = []
    try:
        first = await client.post(
            "/api/v1/products",
            json=_payload(sku="140042", barcode="1111111111111"),
            headers=manager_headers,
        )
        assert first.status_code == 201, first.text
        created_ids.append(first.json()["id"])

        duplicate_sku = await client.post(
            "/api/v1/products",
            json=_payload(sku="140042", barcode="2222222222222"),
            headers=manager_headers,
        )
        assert duplicate_sku.status_code == 409
        assert duplicate_sku.json()["detail"] == "SKU already exists"
    finally:
        await _delete_ids(created_ids)


@pytest.mark.asyncio
async def test_empty_and_omitted_barcodes_are_allowed(client: AsyncClient, manager_headers: dict):
    created_ids: list[str] = []
    try:
        payloads = [
            _payload(barcode=""),
            _payload(barcode="   "),
            _payload(),
        ]
        payloads[2].pop("barcode")
        for payload in payloads:
            res = await client.post("/api/v1/products", json=payload, headers=manager_headers)
            assert res.status_code == 201, res.text
            created_ids.append(res.json()["id"])
            assert res.json()["barcode"] == ""

        cleared = await client.patch(
            f"/api/v1/products/{created_ids[0]}",
            json={"barcode": "   "},
            headers=manager_headers,
        )
        assert cleared.status_code == 200, cleared.text
        assert cleared.json()["barcode"] == ""
    finally:
        await _delete_ids(created_ids)


@pytest.mark.asyncio
async def test_barcode_uniqueness_is_case_insensitive_and_trims(client: AsyncClient, manager_headers: dict):
    created_ids: list[str] = []
    try:
        first = await client.post(
            "/api/v1/products",
            json=_payload(barcode="  AbC-2900  "),
            headers=manager_headers,
        )
        assert first.status_code == 201, first.text
        created_ids.append(first.json()["id"])
        assert first.json()["barcode"] == "AbC-2900"

        second = await client.post(
            "/api/v1/products",
            json=_payload(barcode="abc-2900"),
            headers=manager_headers,
        )
        assert second.status_code == 409
        assert second.json()["detail"] == "Barcode already exists"
    finally:
        await _delete_ids(created_ids)


@pytest.mark.asyncio
async def test_bulk_create_and_update_reject_duplicate_barcode(client: AsyncClient, manager_headers: dict):
    created_ids: list[str] = []
    try:
        existing = await client.post(
            "/api/v1/products",
            json=_payload(barcode="2900000000011"),
            headers=manager_headers,
        )
        assert existing.status_code == 201, existing.text
        existing_id = existing.json()["id"]
        created_ids.append(existing_id)

        row_a = _payload(barcode="5550000000001")
        row_b = _payload(barcode="2900000000011")
        row_c = _payload(barcode="5550000000001")
        bulk = await client.post(
            "/api/v1/products/bulk-create",
            json={
                "products": [
                    {**row_a, "row": 1},
                    {**row_b, "row": 2},
                    {**row_c, "row": 3},
                ],
            },
            headers=manager_headers,
        )
        assert bulk.status_code == 200, bulk.text
        body = bulk.json()
        assert body["created"] == 1
        assert {err["row"]: err["detail"] for err in body["errors"]} == {
            2: "Barcode already exists",
            3: "Barcode already exists",
        }
        saved = await Product.find_one(Product.sku == row_a["sku"])
        assert saved is not None
        created_ids.append(str(saved.id))
        assert await Product.find_one(Product.sku == row_b["sku"]) is None

        other = await client.post(
            "/api/v1/products",
            json=_payload(barcode="5550000000002"),
            headers=manager_headers,
        )
        assert other.status_code == 201, other.text
        other_id = other.json()["id"]
        created_ids.append(other_id)

        updated = await client.post(
            "/api/v1/products/bulk-update",
            json={"updates": [{"id": other_id, "barcode": "2900000000011"}]},
            headers=manager_headers,
        )
        assert updated.status_code == 200, updated.text
        update_body = updated.json()
        assert update_body["updated"] == 0
        assert update_body["errors"][0]["detail"] == "Barcode already exists"
        refreshed = await Product.get(other_id)
        assert refreshed is not None
        assert refreshed.barcode == "5550000000002"
    finally:
        await _delete_ids(created_ids)


@pytest.mark.asyncio
async def test_inactive_product_barcode_can_be_reused(client: AsyncClient, manager_headers: dict):
    created_ids: list[str] = []
    try:
        first = await client.post(
            "/api/v1/products",
            json=_payload(barcode="2900000000077"),
            headers=manager_headers,
        )
        assert first.status_code == 201, first.text
        first_id = first.json()["id"]
        created_ids.append(first_id)

        deleted = await client.delete(f"/api/v1/products/{first_id}", headers=manager_headers)
        assert deleted.status_code == 204, deleted.text

        reused = await client.post(
            "/api/v1/products",
            json=_payload(barcode="2900000000077"),
            headers=manager_headers,
        )
        assert reused.status_code == 201, reused.text
        created_ids.append(reused.json()["id"])
    finally:
        await _delete_ids(created_ids)


@pytest.mark.asyncio
async def test_existing_duplicate_barcodes_do_not_block_startup():
    """Historical duplicates skip the unique index and leave the app queryable."""
    collection = Product.get_motor_collection()
    try:
        await collection.drop_index(BARCODE_UNIQUE_INDEX)
    except Exception:
        pass

    now = datetime.now(timezone.utc)
    suffix = uuid.uuid4().hex[:8]
    inserted = []
    try:
        for index in range(2):
            result = await collection.insert_one({
                "name": f"Historical Dup {suffix} {index}",
                "sku": f"HIST{suffix}{index}",
                "barcode": "2900000000011",
                "brand": "",
                "country_of_origin": "",
                "category": "Snacks",
                "supplier_id": "",
                "supplier_name": "",
                "description": "",
                "buy_uom": "pcs",
                "uom": "pcs",
                "units_per_buy_uom": 1,
                "sell_mode": "unit",
                "cost_price": 10.0,
                "selling_price": 20.0,
                "is_active": True,
                "status": "active",
                "created_at": now,
                "updated_at": now,
            })
            inserted.append(result.inserted_id)

        await ensure_unique_barcode_index()
        info = await collection.index_information()
        assert BARCODE_UNIQUE_INDEX not in info
        assert await collection.count_documents({"sku": {"$regex": f"^HIST{suffix}"}}) == 2

        # Unrelated edits of a historical duplicate still save.
        product = await Product.find_one(Product.sku == f"HIST{suffix}0")
        assert product is not None
        await product.set({"brand": "Legacy"})
        refreshed = await Product.get(product.id)
        assert refreshed is not None
        assert refreshed.brand == "Legacy"
        assert refreshed.barcode == "2900000000011"
    finally:
        if inserted:
            await collection.delete_many({"_id": {"$in": inserted}})
        await ensure_unique_barcode_index()
