"""PO bill_number / bill_images: status-independent PATCH /{id}/bill."""

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
    email = f"po-bill-{uuid.uuid4().hex[:8]}@komart.com"
    user = User(
        email=email,
        name="PO Bill Tester",
        hashed_password=hash_password("managerpass123"),
        role=UserRole.manager,
        is_active=True,
    )
    await user.insert()
    yield user
    await user.delete()


@pytest.fixture
async def cashier_user():
    email = f"po-bill-cashier-{uuid.uuid4().hex[:8]}@komart.com"
    user = User(
        email=email,
        name="PO Bill Cashier",
        hashed_password=hash_password("cashierpass123"),
        role=UserRole.cashier,
        is_active=True,
    )
    await user.insert()
    yield user
    await user.delete()


async def _login(client: AsyncClient, email: str, password: str) -> str:
    res = await client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert res.status_code == 200
    return res.json()["access_token"]


def _make_po(*, status: POStatus, received_qty: int = 0) -> PurchaseOrder:
    qty = 5
    return PurchaseOrder(
        order_number=f"PO-BILL-{uuid.uuid4().hex[:6].upper()}",
        supplier_id="sup-bill",
        supplier_name="Bill Supplier",
        status=status,
        items=[
            PurchaseOrderItem(
                product_id="p-bill",
                product_name="Bill Item",
                quantity=qty,
                unit_cost=10,
                received_quantity=received_qty,
            )
        ],
        subtotal=50.0,
        discount=0.0,
        additional_charges=0.0,
        total_amount=50.0,
        bill_number=None,
        bill_images=[],
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )


@pytest.mark.asyncio
async def test_update_bill_on_received(client: AsyncClient, manager_user: User):
    token = await _login(client, manager_user.email, "managerpass123")
    po = _make_po(status=POStatus.received, received_qty=5)
    await po.insert()
    try:
        res = await client.patch(
            f"/api/v1/purchase-orders/{po.id}/bill",
            json={
                "bill_number": "INV-RECV-1",
                "bill_images": ["https://cdn.example.com/bill1.jpg"],
            },
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res.status_code == 200, res.text
        data = res.json()
        assert data["bill_number"] == "INV-RECV-1"
        assert data["bill_images"] == ["https://cdn.example.com/bill1.jpg"]
        assert data["status"] == "received"

        refreshed = await PurchaseOrder.get(po.id)
        assert refreshed is not None
        assert refreshed.bill_number == "INV-RECV-1"
        assert refreshed.bill_images == ["https://cdn.example.com/bill1.jpg"]
    finally:
        await po.delete()


@pytest.mark.asyncio
async def test_update_bill_on_cancelled(client: AsyncClient, manager_user: User):
    token = await _login(client, manager_user.email, "managerpass123")
    po = _make_po(status=POStatus.cancelled)
    await po.insert()
    try:
        res = await client.patch(
            f"/api/v1/purchase-orders/{po.id}/bill",
            json={"bill_number": "INV-CXL", "bill_images": []},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res.status_code == 200, res.text
        assert res.json()["bill_number"] == "INV-CXL"
        assert res.json()["status"] == "cancelled"
    finally:
        await po.delete()


@pytest.mark.asyncio
async def test_update_bill_on_partial(client: AsyncClient, manager_user: User):
    token = await _login(client, manager_user.email, "managerpass123")
    po = _make_po(status=POStatus.partial, received_qty=2)
    await po.insert()
    try:
        res = await client.patch(
            f"/api/v1/purchase-orders/{po.id}/bill",
            json={
                "bill_number": "INV-PART",
                "bill_images": [
                    "https://cdn.example.com/a.jpg",
                    "https://cdn.example.com/b.jpg",
                ],
            },
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res.status_code == 200, res.text
        data = res.json()
        assert data["bill_number"] == "INV-PART"
        assert len(data["bill_images"]) == 2
    finally:
        await po.delete()


@pytest.mark.asyncio
async def test_update_bill_clears_empty_number_and_replaces_images(
    client: AsyncClient, manager_user: User
):
    token = await _login(client, manager_user.email, "managerpass123")
    po = _make_po(status=POStatus.received, received_qty=5)
    po.bill_number = "OLD"
    po.bill_images = ["https://cdn.example.com/old.jpg"]
    await po.insert()
    try:
        res = await client.patch(
            f"/api/v1/purchase-orders/{po.id}/bill",
            json={"bill_number": "   ", "bill_images": ["https://cdn.example.com/new.jpg"]},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res.status_code == 200, res.text
        data = res.json()
        assert data["bill_number"] is None
        assert data["bill_images"] == ["https://cdn.example.com/new.jpg"]
    finally:
        await po.delete()


@pytest.mark.asyncio
async def test_update_bill_cashier_forbidden(client: AsyncClient, cashier_user: User):
    token = await _login(client, cashier_user.email, "cashierpass123")
    po = _make_po(status=POStatus.ordered)
    await po.insert()
    try:
        res = await client.patch(
            f"/api/v1/purchase-orders/{po.id}/bill",
            json={"bill_number": "NOPE", "bill_images": []},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res.status_code == 403, res.text
    finally:
        await po.delete()


@pytest.mark.asyncio
async def test_general_patch_still_blocked_on_received(
    client: AsyncClient, manager_user: User
):
    token = await _login(client, manager_user.email, "managerpass123")
    po = _make_po(status=POStatus.received, received_qty=5)
    await po.insert()
    try:
        res = await client.patch(
            f"/api/v1/purchase-orders/{po.id}",
            json={
                "supplier_id": "sup-bill",
                "supplier_name": "Bill Supplier",
                "status": "received",
                "discount": 0,
                "additional_charges": 0,
                "bill_number": "SHOULD-FAIL",
                "bill_images": [],
                "items": [
                    {
                        "product_id": "p-bill",
                        "product_name": "Bill Item",
                        "quantity": 5,
                        "unit_cost": 10,
                        "received_quantity": 5,
                    }
                ],
            },
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res.status_code == 400, res.text
        refreshed = await PurchaseOrder.get(po.id)
        assert refreshed is not None
        assert refreshed.bill_number is None
    finally:
        await po.delete()
