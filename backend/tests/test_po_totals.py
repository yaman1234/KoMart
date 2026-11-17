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
    assert data["vat_bill"] is False
    assert data["vat_amount"] == 0.0
    assert data["vat_rate"] == 0.0
    created = await PurchaseOrder.get(data["id"])
    assert created is not None
    assert created.vat_bill is False
    assert created.vat_amount == 0.0
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
    assert data["vat_bill"] is False
    assert data["vat_amount"] == 0.0
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


def _vat_example_items() -> list[PurchaseOrderItem]:
    """Inclusive unit costs for before-VAT 100 and 250 at 13%."""
    return [
        PurchaseOrderItem(product_id="a", product_name="A", quantity=2, unit_cost=113),
        PurchaseOrderItem(product_id="b", product_name="B", quantity=3, unit_cost=282.5),
    ]


def test_vat_bill_totals_match_spec_example():
    totals = compute_po_totals(_vat_example_items(), discount=0, additional_charges=0, vat_bill=True, tax_rate=13)
    assert totals["subtotal"] == 950.0
    assert totals["vat_amount"] == 123.5
    assert totals["vat_rate"] == 13.0
    assert totals["total_amount"] == 1073.5


def test_non_vat_totals_ignore_inclusive_vat_embedded_in_cost():
    """Same stored unit costs, flag off: subtotal stays qty × unit cost and VAT is zero."""
    items = _vat_example_items()
    totals = compute_po_totals(items, discount=0, additional_charges=0, vat_bill=False, tax_rate=13)
    omitted = compute_po_totals(items, discount=0, additional_charges=0)
    assert totals == omitted
    assert totals["subtotal"] == 1073.5
    assert totals["vat_amount"] == 0.0
    assert totals["vat_rate"] == 0.0
    assert totals["total_amount"] == 1073.5


def test_discount_and_charges_do_not_change_vat():
    base = compute_po_totals(_vat_example_items(), 0, 0, vat_bill=True, tax_rate=13)
    adjusted = compute_po_totals(
        _vat_example_items(),
        discount=40,
        additional_charges=15,
        vat_bill=True,
        tax_rate=13,
    )
    assert adjusted["vat_amount"] == base["vat_amount"] == 123.5
    assert adjusted["subtotal"] == 950.0
    assert adjusted["discount"] == 40.0
    assert adjusted["additional_charges"] == 15.0
    assert adjusted["total_amount"] == 1048.5
    # VAT is not computed on (subtotal − discount + charges).
    assert adjusted["vat_amount"] != round((950 - 40 + 15) * 0.13, 2)


def test_vat_is_rounded_once_on_the_subtotal():
    # Inclusive 11.31 strips back to 10.01. 10.01 × 13% = 1.3013 → 1.30.
    items = [PurchaseOrderItem(product_id="a", product_name="A", quantity=1, unit_cost=11.31)]
    totals = compute_po_totals(items, discount=0, additional_charges=0, vat_bill=True, tax_rate=13)
    assert totals["subtotal"] == 10.01
    assert totals["vat_amount"] == 1.30
    assert totals["total_amount"] == 11.31


async def _set_tax_rate(rate: float) -> float:
    from app.services.store_settings import get_store_settings

    settings_doc = await get_store_settings()
    previous = float(settings_doc.tax_rate)
    if previous != rate:
        await settings_doc.set({"tax_rate": rate})
    return previous


@pytest.mark.asyncio
async def test_vat_bill_flag_persists_on_create_and_edit(client: AsyncClient, manager_user: User):
    token = await _login(client, manager_user.email, "managerpass123")
    previous_rate = await _set_tax_rate(13.0)
    headers = {"Authorization": f"Bearer {token}"}
    payload = {
        "supplier_id": "sup-1",
        "supplier_name": "Supplier",
        "status": "draft",
        "vat_bill": True,
        "discount": 0,
        "additional_charges": 0,
        "items": [
            {
                "product_id": "p1",
                "product_name": "A",
                "quantity": 2,
                "unit_cost": 113,
                "received_quantity": 0,
            },
            {
                "product_id": "p2",
                "product_name": "B",
                "quantity": 3,
                "unit_cost": 282.5,
                "received_quantity": 0,
            },
        ],
    }
    created_id = None
    try:
        res = await client.post("/api/v1/purchase-orders", json=payload, headers=headers)
        assert res.status_code == 201, res.text
        data = res.json()
        created_id = data["id"]
        assert data["vat_bill"] is True
        assert data["vat_rate"] == 13.0
        assert data["subtotal"] == 950.0
        assert data["vat_amount"] == 123.5
        assert data["total_amount"] == 1073.5

        fetched = await client.get(f"/api/v1/purchase-orders/{created_id}", headers=headers)
        assert fetched.status_code == 200, fetched.text
        body = fetched.json()
        assert body["vat_bill"] is True
        assert body["subtotal"] == 950.0
        assert body["vat_amount"] == 123.5
        assert body["total_amount"] == 1073.5

        stored = await PurchaseOrder.get(created_id)
        assert stored is not None
        assert stored.vat_bill is True
        assert stored.vat_amount == 123.5

        edited = await client.patch(
            f"/api/v1/purchase-orders/{created_id}",
            json={**payload, "discount": 40, "additional_charges": 15, "status": "draft"},
            headers=headers,
        )
        assert edited.status_code == 200, edited.text
        edited_body = edited.json()
        assert edited_body["vat_bill"] is True
        assert edited_body["vat_amount"] == 123.5
        assert edited_body["discount"] == 40.0
        assert edited_body["additional_charges"] == 15.0
        assert edited_body["total_amount"] == 1048.5

        cleared = await client.patch(
            f"/api/v1/purchase-orders/{created_id}",
            json={**payload, "vat_bill": False, "status": "draft"},
            headers=headers,
        )
        assert cleared.status_code == 200, cleared.text
        cleared_body = cleared.json()
        assert cleared_body["vat_bill"] is False
        assert cleared_body["vat_amount"] == 0.0
        assert cleared_body["subtotal"] == 1073.5
        assert cleared_body["total_amount"] == 1073.5
    finally:
        if created_id:
            row = await PurchaseOrder.get(created_id)
            if row is not None:
                await row.delete()
        await _set_tax_rate(previous_rate)
