"""PO payable totals: discount + additional charges."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

import pytest
from httpx import ASGITransport, AsyncClient

from app.auth.jwt import hash_password
from app.database import init_db
from app.main import app
from app.models.purchase_order import PurchaseOrder, PurchaseOrderItem, POStatus
from app.models.user import User, UserRole
from app.services.po_totals import compute_po_totals


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
    email = f"po-totals-{uuid.uuid4().hex[:8]}@komart.com"
    user = User(
        email=email,
        name="PO Totals Tester",
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


def test_compute_po_totals_formula():
    items = [
        PurchaseOrderItem(product_id="a", product_name="A", quantity=2, unit_cost=100),
        PurchaseOrderItem(product_id="b", product_name="B", quantity=1, unit_cost=50),
    ]
    t = compute_po_totals(items, discount=25, additional_charges=10)
    assert t["subtotal"] == 250.0
    assert t["discount"] == 25.0
    assert t["additional_charges"] == 10.0
    assert t["total_amount"] == 235.0


def test_compute_po_totals_clamps_discount():
    items = [PurchaseOrderItem(product_id="a", product_name="A", quantity=1, unit_cost=100)]
    t = compute_po_totals(items, discount=999, additional_charges=0)
    assert t["discount"] == 100.0
    assert t["total_amount"] == 0.0


@pytest.mark.asyncio
async def test_create_po_with_discount_and_charges(client: AsyncClient, manager_user: User):
    token = await _login(client, manager_user.email, "managerpass123")
    payload = {
        "supplier_id": "sup-1",
        "supplier_name": "Supplier",
        "status": "draft",
        "discount": 20,
        "additional_charges": 15,
        "items": [
            {
                "product_id": "p1",
                "product_name": "Snack",
                "quantity": 2,
                "unit_cost": 50,
                "received_quantity": 0,
            }
        ],
    }
    res = await client.post(
        "/api/v1/purchase-orders",
        json=payload,
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 201, res.text
    data = res.json()
    assert data["subtotal"] == 100.0
    assert data["discount"] == 20.0
    assert data["additional_charges"] == 15.0
    assert data["total_amount"] == 95.0
    created = await PurchaseOrder.get(data["id"])
    assert created is not None
    await created.delete()


@pytest.mark.asyncio
async def test_legacy_po_read_normalizes_zeros(client: AsyncClient, manager_user: User):
    token = await _login(client, manager_user.email, "managerpass123")
    po = PurchaseOrder(
        order_number=f"PO-LEG-{uuid.uuid4().hex[:6]}",
        supplier_id="sup-1",
        supplier_name="Supplier",
        status=POStatus.ordered,
        items=[
            PurchaseOrderItem(
                product_id="p1",
                product_name="Snack",
                quantity=2,
                unit_cost=40,
                received_quantity=0,
            )
        ],
        total_amount=80.0,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    await po.insert()
    res = await client.get(
        f"/api/v1/purchase-orders/{po.id}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["discount"] == 0.0
    assert data["additional_charges"] == 0.0
    assert data["subtotal"] == 80.0
    assert data["total_amount"] == 80.0
    await po.delete()


@pytest.mark.asyncio
async def test_update_rejects_total_below_amount_paid(client: AsyncClient, manager_user: User):
    token = await _login(client, manager_user.email, "managerpass123")
    po = PurchaseOrder(
        order_number=f"PO-PAY-{uuid.uuid4().hex[:6]}",
        supplier_id="sup-1",
        supplier_name="Supplier",
        status=POStatus.ordered,
        items=[
            PurchaseOrderItem(
                product_id="p1",
                product_name="Snack",
                quantity=10,
                unit_cost=10,
                received_quantity=0,
            )
        ],
        subtotal=100.0,
        discount=0.0,
        additional_charges=0.0,
        total_amount=100.0,
        amount_paid=90.0,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    await po.insert()
    res = await client.patch(
        f"/api/v1/purchase-orders/{po.id}",
        json={
            "supplier_id": "sup-1",
            "supplier_name": "Supplier",
            "status": "ordered",
            "discount": 50,
            "additional_charges": 0,
            "items": [
                {
                    "product_id": "p1",
                    "product_name": "Snack",
                    "quantity": 10,
                    "unit_cost": 10,
                    "received_quantity": 0,
                }
            ],
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 400, res.text
    await po.delete()
