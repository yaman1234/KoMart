"""Dashboard payables must use the same outstanding-AP definition as Reports.

Draft and cancelled purchase orders are not liabilities. Ordered, partial, and
received outstanding (total − paid) is the shared figure behind Dashboard
Payables, Reports Active PO Bills / total AP owed, and the PO list
(Amount Due + in-transit outstanding).
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

import pytest
from httpx import ASGITransport, AsyncClient

from app.auth.jwt import hash_password
from app.database import init_db
from app.main import app
from app.models.purchase_order import POStatus, PurchaseOrder
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
    email = f"ap-def-{uuid.uuid4().hex[:8]}@komart.com"
    user = User(
        email=email,
        name="AP Definition Tester",
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


def _po(
    *,
    order_number: str,
    supplier_id: str,
    status: POStatus,
    total_amount: float,
    amount_paid: float = 0.0,
) -> PurchaseOrder:
    return PurchaseOrder(
        order_number=order_number,
        supplier_id=supplier_id,
        supplier_name="AP Supplier",
        status=status,
        items=[],
        total_amount=total_amount,
        amount_paid=amount_paid,
        created_at=datetime.now(timezone.utc),
    )


@pytest.mark.asyncio
async def test_dashboard_payables_match_reports_and_ignore_drafts(
    client: AsyncClient,
    manager_user: User,
):
    """A Rs 2,700 draft must not make Dashboard payables higher than Reports AP."""
    supplier_id = f"sup-ap-{uuid.uuid4().hex[:8]}"
    prefix = f"PO-AP-{uuid.uuid4().hex[:6].upper()}"
    col = PurchaseOrder.get_motor_collection()

    # UAT gap: a draft of Rs 2,700 was included on the dashboard only.
    draft = _po(
        order_number=f"{prefix}-DRAFT",
        supplier_id=supplier_id,
        status=POStatus.draft,
        total_amount=2700.0,
    )
    cancelled = _po(
        order_number=f"{prefix}-CAN",
        supplier_id=supplier_id,
        status=POStatus.cancelled,
        total_amount=900.0,
    )
    ordered = _po(
        order_number=f"{prefix}-ORD",
        supplier_id=supplier_id,
        status=POStatus.ordered,
        total_amount=1000.0,
    )
    partial = _po(
        order_number=f"{prefix}-PAR",
        supplier_id=supplier_id,
        status=POStatus.partial,
        total_amount=500.0,
    )
    # In-transit order with a payment: PO list pending delivery is the gross
    # total, while AP is the unpaid remainder.
    ordered_partial_paid = _po(
        order_number=f"{prefix}-ORDPAY",
        supplier_id=supplier_id,
        status=POStatus.ordered,
        total_amount=800.0,
        amount_paid=300.0,
    )
    received = _po(
        order_number=f"{prefix}-RCV",
        supplier_id=supplier_id,
        status=POStatus.received,
        total_amount=2000.0,
        amount_paid=350.0,
    )
    received_paid = _po(
        order_number=f"{prefix}-PAID",
        supplier_id=supplier_id,
        status=POStatus.received,
        total_amount=400.0,
        amount_paid=400.0,
    )

    before = await total_payables()
    docs = [draft, cancelled, ordered, partial, ordered_partial_paid, received, received_paid]
    for doc in docs:
        await doc.insert()

    # ordered 1000 + partial 500 + ordered remainder 500 + received remainder 1650
    expected_added = 3650.0
    in_transit_paid = 300.0

    try:
        after = await total_payables()
        assert after == round(before + expected_added, 2)

        token = await _login(client, manager_user.email, "managerpass123")
        headers = {"Authorization": f"Bearer {token}"}

        kpi = await client.get("/api/v1/dashboard/kpi-summary", headers=headers)
        assert kpi.status_code == 200, kpi.text
        dashboard_outstanding = float(kpi.json()["payables"]["outstanding"])
        assert dashboard_outstanding == after

        report = await client.get(
            "/api/v1/reports/purchasing-payables",
            params={"date_basis": "received"},
            headers=headers,
        )
        assert report.status_code == 200, report.text
        total_outstanding_ap = float(report.json()["total_outstanding_ap"])
        assert total_outstanding_ap == dashboard_outstanding

        executive = await client.get("/api/v1/reports/executive-summary", headers=headers)
        assert executive.status_code == 200, executive.text
        active_po_bills = float(executive.json()["working_capital"]["accounts_payable"])
        assert active_po_bills == dashboard_outstanding

        po_list = await client.get(
            "/api/v1/purchase-orders",
            params={"supplier_id": supplier_id, "page": 1, "page_size": 20},
            headers=headers,
        )
        assert po_list.status_code == 200, po_list.text
        summary = po_list.json()["summary"]
        amount_due = float(summary["amount_due"])
        pending_delivery = float(summary["pending_delivery_amount"])
        # Received outstanding only.
        assert amount_due == 1650.0
        # Gross value still in transit (includes the Rs 300 already paid).
        assert pending_delivery == 2300.0
        assert amount_due + pending_delivery - in_transit_paid == expected_added
        # Draft and cancelled are not part of that reconciliation.
        assert float(summary["cancelled_amount"]) == 900.0
    finally:
        await col.delete_many({"order_number": {"$regex": f"^{prefix}"}})
