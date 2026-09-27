"""PO status: cannot cancel received/partial POs."""

from __future__ import annotations

import uuid

import pytest
from httpx import ASGITransport, AsyncClient

from app.auth.jwt import hash_password
from app.database import init_db
from app.main import app
from app.models.product import Product
from app.models.purchase_order import POStatus, PurchaseOrder, PurchaseOrderItem
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
    email = f"pocancel-{uuid.uuid4().hex[:8]}@komart.com"
    user = User(
        email=email,
        name="Cancel Tester",
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
async def test_cannot_cancel_received_po(client: AsyncClient, manager_user: User):
    token = await _login(client, manager_user.email, "managerpass123")
    sku = f"CXL-{uuid.uuid4().hex[:6]}"
    product = Product(
        name="Cancel Product",
        sku=sku,
        barcode=sku,
        brand="T",
        country_of_origin="NP",
        category="Snacks",
        cost_price=10,
        selling_price=15,
        low_stock_threshold=1,
        is_active=True,
    )
    await product.insert()

    po = PurchaseOrder(
        order_number=f"PO-CXL-{uuid.uuid4().hex[:6].upper()}",
        supplier_id="s1",
        supplier_name="Supplier",
        status=POStatus.received,
        items=[
            PurchaseOrderItem(
                product_id=str(product.id),
                product_name=product.name,
                quantity=2,
                received_quantity=2,
                unit_cost=10,
            )
        ],
        total_amount=20,
        amount_paid=0,
    )
    await po.insert()
    po_id = str(po.id)

    res = await client.patch(
        f"/api/v1/purchase-orders/{po_id}/status",
        headers={"Authorization": f"Bearer {token}"},
        json={"status": "cancelled"},
    )
    assert res.status_code == 400
    detail = res.json().get("detail", "")
    assert "cannot be cancelled" in str(detail).lower() or "purchase return" in str(detail).lower()

    await po.delete()
    await product.delete()


@pytest.mark.asyncio
async def test_list_kpis_ignore_status_payment_filters(client: AsyncClient, manager_user: User):
    token = await _login(client, manager_user.email, "managerpass123")
    suffix = uuid.uuid4().hex[:6].upper()
    received = PurchaseOrder(
        order_number=f"PO-KPI-R-{suffix}",
        supplier_id="kpi-s",
        supplier_name="KPI Supplier",
        status=POStatus.received,
        items=[],
        total_amount=100,
        amount_paid=40,
    )
    ordered = PurchaseOrder(
        order_number=f"PO-KPI-O-{suffix}",
        supplier_id="kpi-s",
        supplier_name="KPI Supplier",
        status=POStatus.ordered,
        items=[],
        total_amount=50,
        amount_paid=0,
    )
    await received.insert()
    await ordered.insert()

    res = await client.get(
        "/api/v1/purchase-orders",
        headers={"Authorization": f"Bearer {token}"},
        params={"status": "ordered", "payment_status": "unpaid", "search": suffix},
    )
    assert res.status_code == 200
    body = res.json()
    # Table filtered to ordered only, but KPIs include received total for search match
    received_kpi = body.get("received_total_amount", body.get("receivedTotalAmount"))
    outstanding = body.get("outstanding_amount", body.get("outstandingAmount"))
    assert float(received_kpi) == 100.0
    assert float(outstanding) == 110.0  # (100-40) + (50-0)

    await received.delete()
    await ordered.delete()
