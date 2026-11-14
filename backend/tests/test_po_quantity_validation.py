"""PO line quantity must be a whole number from 1 through MAX_PO_LINE_QUANTITY."""

from __future__ import annotations

import uuid

import pytest
from httpx import ASGITransport, AsyncClient
from pydantic import ValidationError

from app.auth.jwt import hash_password
from app.database import init_db
from app.main import app
from app.models.purchase_order import MAX_PO_LINE_QUANTITY, PurchaseOrder, PurchaseOrderItem
from app.models.user import User, UserRole
from app.schemas.purchase_order import PurchaseOrderReceiveItem


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
    email = f"po-qty-{uuid.uuid4().hex[:8]}@komart.com"
    user = User(
        email=email,
        name="PO Qty Tester",
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


def _item(quantity):
    return {
        "product_id": "p1",
        "product_name": "Snack",
        "quantity": quantity,
        "unit_cost": 10,
        "received_quantity": 0,
    }


def _payload(quantity):
    return {
        "supplier_id": "sup-1",
        "supplier_name": "Supplier",
        "status": "draft",
        "items": [_item(quantity)],
    }


def test_model_rejects_out_of_range_and_non_integers():
    with pytest.raises(ValidationError):
        PurchaseOrderItem(product_id="p", product_name="Snack", quantity=0, unit_cost=1)
    with pytest.raises(ValidationError):
        PurchaseOrderItem(product_id="p", product_name="Snack", quantity=-1, unit_cost=1)
    with pytest.raises(ValidationError):
        PurchaseOrderItem(product_id="p", product_name="Snack", quantity=1.5, unit_cost=1)
    with pytest.raises(ValidationError):
        PurchaseOrderItem(product_id="p", product_name="Snack", quantity=None, unit_cost=1)
    with pytest.raises(ValidationError):
        PurchaseOrderItem(product_id="p", product_name="Snack", quantity="", unit_cost=1)
    with pytest.raises(ValidationError):
        PurchaseOrderItem(
            product_id="p",
            product_name="Snack",
            quantity=MAX_PO_LINE_QUANTITY + 1,
            unit_cost=1,
        )

    ok = PurchaseOrderItem(product_id="p", product_name="Snack", quantity=3, unit_cost=1)
    assert ok.quantity == 3
    at_max = PurchaseOrderItem(
        product_id="p",
        product_name="Snack",
        quantity=MAX_PO_LINE_QUANTITY,
        unit_cost=1,
    )
    assert at_max.quantity == MAX_PO_LINE_QUANTITY


def test_receive_schema_rejects_out_of_range():
    with pytest.raises(ValidationError):
        PurchaseOrderReceiveItem(product_id="p", receive_quantity=0)
    with pytest.raises(ValidationError):
        PurchaseOrderReceiveItem(product_id="p", receive_quantity=-1)
    with pytest.raises(ValidationError):
        PurchaseOrderReceiveItem(product_id="p", receive_quantity=1.5)
    with pytest.raises(ValidationError):
        PurchaseOrderReceiveItem(product_id="p", receive_quantity=MAX_PO_LINE_QUANTITY + 1)
    ok = PurchaseOrderReceiveItem(product_id="p", receive_quantity=3)
    assert ok.receive_quantity == 3


@pytest.mark.asyncio
async def test_api_rejects_below_min_and_above_max(client: AsyncClient, manager_user: User):
    token = await _login(client, manager_user.email, "managerpass123")
    headers = {"Authorization": f"Bearer {token}"}

    for bad in (0, -1, 1.5, None, "", "abc", MAX_PO_LINE_QUANTITY + 1):
        res = await client.post(
            "/api/v1/purchase-orders",
            json=_payload(bad),
            headers=headers,
        )
        assert res.status_code == 422, (bad, res.text)
        assert "quantity" in res.text

    receive_url = "/api/v1/purchase-orders/000000000000000000000000/receive"
    for bad_receive in (0, -1, MAX_PO_LINE_QUANTITY + 1):
        res = await client.post(
            receive_url,
            json={"items": [{"product_id": "p1", "receive_quantity": bad_receive}]},
            headers=headers,
        )
        assert res.status_code == 422, (bad_receive, res.text)
        assert "receive_quantity" in res.text


@pytest.mark.asyncio
async def test_api_accepts_normal_quantity_and_keeps_it(client: AsyncClient, manager_user: User):
    token = await _login(client, manager_user.email, "managerpass123")
    headers = {"Authorization": f"Bearer {token}"}
    res = await client.post(
        "/api/v1/purchase-orders",
        json=_payload(3),
        headers=headers,
    )
    assert res.status_code == 201, res.text
    data = res.json()
    assert data["items"][0]["quantity"] == 3
    po_id = data["id"]

    blocked = await client.patch(
        f"/api/v1/purchase-orders/{po_id}",
        json={
            "supplier_id": "sup-1",
            "supplier_name": "Supplier",
            "status": "draft",
            "items": [_item(0)],
        },
        headers=headers,
    )
    assert blocked.status_code == 422, blocked.text
    assert "quantity" in blocked.text

    still = await client.get(f"/api/v1/purchase-orders/{po_id}", headers=headers)
    assert still.status_code == 200, still.text
    assert still.json()["items"][0]["quantity"] == 3

    created = await PurchaseOrder.get(po_id)
    assert created is not None
    await created.delete()


@pytest.mark.asyncio
async def test_api_accepts_max_quantity(client: AsyncClient, manager_user: User):
    token = await _login(client, manager_user.email, "managerpass123")
    res = await client.post(
        "/api/v1/purchase-orders",
        json=_payload(MAX_PO_LINE_QUANTITY),
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 201, res.text
    data = res.json()
    assert data["items"][0]["quantity"] == MAX_PO_LINE_QUANTITY
    created = await PurchaseOrder.get(data["id"])
    assert created is not None
    await created.delete()
