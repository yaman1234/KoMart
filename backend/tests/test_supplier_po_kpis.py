"""Supplier PO KPI summary, including legacy stored statuses."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

import pytest
from httpx import ASGITransport, AsyncClient

from app.auth.jwt import hash_password
from app.database import init_db
from app.main import app
from app.models.purchase_order import POStatus, PurchaseOrder, normalize_po_status
from app.models.user import User, UserRole
from app.services.dashboard_kpi import total_payables


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
    email = f"po-kpi-{uuid.uuid4().hex[:8]}@komart.com"
    user = User(
        email=email,
        name="PO KPI Tester",
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


def test_normalize_po_status_matches_list_rules():
    assert normalize_po_status("Received") is POStatus.received
    assert normalize_po_status(" received ") is POStatus.received
    assert normalize_po_status("ORDERED") is POStatus.ordered
    assert normalize_po_status("completed") is POStatus.draft
    assert normalize_po_status(None) is POStatus.draft
    assert normalize_po_status("") is POStatus.draft


def _po(**kwargs) -> PurchaseOrder:
    data = {
        "supplier_name": "KPI Supplier",
        "items": [],
        "amount_paid": 0.0,
    }
    data.update(kwargs)
    return PurchaseOrder(**data)


@pytest.mark.asyncio
async def test_supplier_summary_kpis_and_legacy_received_status(
    client: AsyncClient,
    manager_user: User,
):
    token = await _login(client, manager_user.email, "managerpass123")
    headers = {"Authorization": f"Bearer {token}"}
    supplier_id = f"sup-kpi-{uuid.uuid4().hex[:8]}"
    other_id = f"sup-other-{uuid.uuid4().hex[:8]}"
    prefix = f"PO-KPI-{uuid.uuid4().hex[:6].upper()}"
    col = PurchaseOrder.get_motor_collection()

    docs = [
        _po(order_number=f"{prefix}-DRAFT", supplier_id=supplier_id, status=POStatus.draft, total_amount=100),
        _po(
            order_number=f"{prefix}-CAN",
            supplier_id=supplier_id,
            status=POStatus.cancelled,
            total_amount=200,
            amount_paid=50,
        ),
        _po(
            order_number=f"{prefix}-ORD",
            supplier_id=supplier_id,
            status=POStatus.ordered,
            total_amount=1000,
            amount_paid=100,
        ),
        _po(
            order_number=f"{prefix}-PAR",
            supplier_id=supplier_id,
            status=POStatus.partial,
            total_amount=500,
            amount_paid=0,
        ),
        _po(
            order_number=f"{prefix}-RCV",
            supplier_id=supplier_id,
            status=POStatus.received,
            total_amount=2000,
            amount_paid=350,
        ),
        _po(
            order_number=f"{prefix}-OTHER",
            supplier_id=other_id,
            status=POStatus.received,
            total_amount=400,
            amount_paid=0,
        ),
    ]

    before = await total_payables()
    for doc in docs:
        await doc.insert()
    # Stored exactly as legacy UAT text. List/GET coerce this to received.
    await col.insert_one(
        {
            "order_number": f"{prefix}-LEGACY",
            "supplier_id": supplier_id,
            "supplier_name": "KPI Supplier",
            "status": "Received",
            "items": [],
            "total_amount": 566039.80,
            "amount_paid": 1000,
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc),
        }
    )
    # Unknown alias stays draft, matching list/GET, and is not a payable.
    await col.insert_one(
        {
            "order_number": f"{prefix}-DONE",
            "supplier_id": supplier_id,
            "supplier_name": "KPI Supplier",
            "status": " completed ",
            "items": [],
            "total_amount": 999,
            "amount_paid": 0,
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc),
        }
    )

    try:
        after = await total_payables()
        res = await client.get(
            "/api/v1/purchase-orders",
            headers=headers,
            params={"supplier_id": supplier_id, "page_size": 20, "include_summary": "true"},
        )
        assert res.status_code == 200, res.text
        body = res.json()
        summary = body["summary"]

        rows = {row["order_number"]: row for row in body["data"]}
        assert rows[f"{prefix}-LEGACY"]["status"] == "received"
        assert rows[f"{prefix}-DONE"]["status"] == "draft"

        # ordered 1000 + partial 500 + received 2000 + legacy 566039.80
        assert summary["committed_count"] == 4
        assert summary["committed_amount"] == 569539.80
        assert summary["received_count"] == 2
        assert summary["received_amount"] == 568039.80
        assert summary["pending_count"] == 2
        assert summary["pending_amount"] == 1500.0
        # 100 + 0 + 350 + 1000
        assert summary["paid_amount"] == 1450.0
        # 900 + 500 + 1650 + 565039.80
        assert summary["payable_outstanding"] == 568089.80
        assert body["received_total_amount"] == 568039.80

        # Other supplier is excluded from this summary.
        assert summary["committed_amount"] != 569539.80 + 400

        # Same outstanding rule as dashboard payables, including the legacy doc
        # and the other supplier, excluding draft / cancelled / unknown alias.
        assert round(after - before, 2) == round(568089.80 + 400.0, 2)
        assert summary["payable_outstanding"] == round(after - before - 400.0, 2)
    finally:
        await col.delete_many({"order_number": {"$regex": f"^{prefix}"}})
