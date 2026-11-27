"""Supplier lookup, list search/sort, and committed-only stock reversal."""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import pytest
from httpx import ASGITransport, AsyncClient

from app.auth.jwt import hash_password
from app.database import init_db
from app.main import app
from app.models.inventory import InventoryBatch
from app.models.product import Product
from app.models.purchase_order import POStatus, PurchaseOrder
from app.models.supplier import Supplier
from app.models.user import User, UserRole
from app.services.po_stock_reverse import reverse_supplier_batches


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
    email = f"sup-list-{uuid.uuid4().hex[:8]}@komart.com"
    user = User(
        email=email,
        name="Supplier List Tester",
        hashed_password=hash_password("managerpass123"),
        role=UserRole.manager,
        is_active=True,
    )
    await user.insert()
    yield user
    await user.delete()


async def _login(client: AsyncClient, email: str) -> str:
    res = await client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": "managerpass123"},
    )
    assert res.status_code == 200
    return res.json()["access_token"]


@pytest.mark.asyncio
async def test_invalid_supplier_id_is_404(client: AsyncClient, manager_user: User):
    token = await _login(client, manager_user.email)
    headers = {"Authorization": f"Bearer {token}"}
    missing = await client.get("/api/v1/suppliers/not-an-id", headers=headers)
    assert missing.status_code == 404, missing.text
    patched = await client.patch(
        "/api/v1/suppliers/not-an-id",
        headers=headers,
        json={"name": "Nope"},
    )
    assert patched.status_code == 404, patched.text


@pytest.mark.asyncio
async def test_supplier_search_matches_contact_and_phone_and_sorts(
    client: AsyncClient,
    manager_user: User,
):
    token = await _login(client, manager_user.email)
    headers = {"Authorization": f"Bearer {token}"}
    token_key = uuid.uuid4().hex[:8]
    now = datetime.now(timezone.utc)
    older = Supplier(
        name=f"Alpha {token_key}",
        country="Nepal",
        contact_person=f"Contact {token_key}",
        phone=f"980{token_key[:4]}",
        address="Kathmandu",
        created_at=now - timedelta(days=2),
    )
    newer = Supplier(
        name=f"Zulu {token_key}",
        country="Japan",
        contact_person="Someone else",
        phone="9700000000",
        address="Tokyo",
        created_at=now,
    )
    await older.insert()
    await newer.insert()
    try:
        by_contact = await client.get(
            "/api/v1/suppliers",
            headers=headers,
            params={"search": f"Contact {token_key}", "page_size": 20},
        )
        assert by_contact.status_code == 200, by_contact.text
        assert [row["name"] for row in by_contact.json()["data"]] == [older.name]

        by_phone = await client.get(
            "/api/v1/suppliers",
            headers=headers,
            params={"search": f"980{token_key[:4]}", "page_size": 20},
        )
        assert by_phone.status_code == 200, by_phone.text
        assert [row["name"] for row in by_phone.json()["data"]] == [older.name]

        by_name = await client.get(
            "/api/v1/suppliers",
            headers=headers,
            params={
                "search": token_key,
                "sort_by": "name",
                "sort_order": "desc",
                "page_size": 20,
            },
        )
        assert by_name.status_code == 200, by_name.text
        assert [row["name"] for row in by_name.json()["data"]] == [newer.name, older.name]

        by_added = await client.get(
            "/api/v1/suppliers",
            headers=headers,
            params={
                "search": token_key,
                "sort_by": "created_at",
                "sort_order": "asc",
                "page_size": 20,
            },
        )
        assert by_added.status_code == 200, by_added.text
        assert [row["name"] for row in by_added.json()["data"]] == [older.name, newer.name]
    finally:
        await older.delete()
        await newer.delete()


@pytest.mark.asyncio
async def test_reverse_supplier_batches_skips_draft_and_cancelled():
    supplier_id = f"sup-rev-{uuid.uuid4().hex[:8]}"
    sku = f"REV-{uuid.uuid4().hex[:8]}"
    product = Product(
        name="Reversible Snack",
        sku=sku,
        barcode=sku,
        brand="T",
        country_of_origin="Nepal",
        category="Snacks",
        cost_price=10,
        selling_price=20,
        is_active=True,
    )
    await product.insert()
    received = PurchaseOrder(
        order_number=f"PO-REV-R-{uuid.uuid4().hex[:4]}",
        supplier_id=supplier_id,
        supplier_name="Rev Supplier",
        status=POStatus.received,
        items=[],
        total_amount=40,
    )
    draft = PurchaseOrder(
        order_number=f"PO-REV-D-{uuid.uuid4().hex[:4]}",
        supplier_id=supplier_id,
        supplier_name="Rev Supplier",
        status=POStatus.draft,
        items=[],
        total_amount=100,
    )
    cancelled = PurchaseOrder(
        order_number=f"PO-REV-C-{uuid.uuid4().hex[:4]}",
        supplier_id=supplier_id,
        supplier_name="Rev Supplier",
        status=POStatus.cancelled,
        items=[],
        total_amount=30,
    )
    await received.insert()
    await draft.insert()
    await cancelled.insert()
    received_batch = InventoryBatch(
        product_id=str(product.id),
        batch_number="R1",
        quantity=4,
        unit_cost=10,
        expiry_date="2030-01-01",
        purchase_order_id=str(received.id),
    )
    draft_batch = InventoryBatch(
        product_id=str(product.id),
        batch_number="D1",
        quantity=10,
        unit_cost=10,
        expiry_date="2020-01-01",
        purchase_order_id=str(draft.id),
    )
    cancelled_batch = InventoryBatch(
        product_id=str(product.id),
        batch_number="C1",
        quantity=6,
        unit_cost=10,
        expiry_date="2019-01-01",
        purchase_order_id=str(cancelled.id),
    )
    await received_batch.insert()
    await draft_batch.insert()
    await cancelled_batch.insert()
    try:
        await reverse_supplier_batches(
            product_id=str(product.id),
            product_name=product.name,
            supplier_id=supplier_id,
            base_qty=4,
            created_by="tester",
            reference_id="ret-1",
        )
        refreshed_received = await InventoryBatch.get(received_batch.id)
        refreshed_draft = await InventoryBatch.get(draft_batch.id)
        refreshed_cancelled = await InventoryBatch.get(cancelled_batch.id)
        assert refreshed_received is not None and refreshed_received.quantity == 0
        assert refreshed_draft is not None and refreshed_draft.quantity == 10
        assert refreshed_cancelled is not None and refreshed_cancelled.quantity == 6
    finally:
        await InventoryBatch.get_motor_collection().delete_many(
            {"product_id": str(product.id)}
        )
        await PurchaseOrder.get_motor_collection().delete_many(
            {"supplier_id": supplier_id}
        )
        await product.delete()


@pytest.mark.asyncio
async def test_supplier_list_kpis_filtering_and_sorting(
    client: AsyncClient,
    manager_user: User,
):
    from app.models.supplier import SupplierPaymentDetail, SupplierPaymentMethod

    token = await _login(client, manager_user.email)
    headers = {"Authorization": f"Bearer {token}"}
    tag = uuid.uuid4().hex[:8]
    sup_due = Supplier(
        name=f"DueCo {tag}",
        country="Nepal",
        contact_person="Asha",
        phone=f"981{tag[:4]}",
        address="Kathmandu",
        payment_details=[SupplierPaymentDetail(method=SupplierPaymentMethod.bank, bank_name="Nabil")],
    )
    sup_open = Supplier(
        name=f"OpenCo {tag}",
        country="India",
        contact_person="Bikash",
        phone=f"982{tag[:4]}",
        address="Delhi",
        payment_details=[],
    )
    await sup_due.insert()
    await sup_open.insert()

    po_due = PurchaseOrder(
        order_number=f"PO-DUE-{tag}",
        supplier_id=str(sup_due.id),
        supplier_name=sup_due.name,
        status=POStatus.received,
        items=[],
        total_amount=500.0,
        amount_paid=200.0,
    )
    po_open = PurchaseOrder(
        order_number=f"PO-OPEN-{tag}",
        supplier_id=str(sup_open.id),
        supplier_name=sup_open.name,
        status=POStatus.ordered,
        items=[],
        total_amount=150.0,
        amount_paid=0.0,
    )
    await po_due.insert()
    await po_open.insert()

    try:
        res = await client.get(
            "/api/v1/suppliers",
            headers=headers,
            params={"search": tag, "include_summary": "true"},
        )
        assert res.status_code == 200, res.text
        body = res.json()
        assert body["page_size"] == 25
        summary = body["summary"]
        assert summary["total_suppliers"] == 2
        assert summary["suppliers_with_due"] == 1
        assert summary["total_due_amount"] == 300.0
        assert summary["suppliers_with_open_orders"] == 1
        assert summary["total_open_orders_amount"] == 150.0
        assert summary["total_spend_amount"] == 650.0
        assert summary["suppliers_missing_payment"] == 1

        has_due = await client.get(
            "/api/v1/suppliers",
            headers=headers,
            params={"search": tag, "kpi_filter": "has_due"},
        )
        assert has_due.status_code == 200, has_due.text
        assert [r["name"] for r in has_due.json()["data"]] == [sup_due.name]

        open_orders = await client.get(
            "/api/v1/suppliers",
            headers=headers,
            params={"search": tag, "kpi_filter": "open_orders"},
        )
        assert open_orders.status_code == 200, open_orders.text
        assert [r["name"] for r in open_orders.json()["data"]] == [sup_open.name]

        missing_payment = await client.get(
            "/api/v1/suppliers",
            headers=headers,
            params={"search": tag, "kpi_filter": "missing_payment"},
        )
        assert missing_payment.status_code == 200, missing_payment.text
        assert [r["name"] for r in missing_payment.json()["data"]] == [sup_open.name]

        sorted_due = await client.get(
            "/api/v1/suppliers",
            headers=headers,
            params={"search": tag, "sort_by": "due_amount", "sort_order": "desc"},
        )
        assert sorted_due.status_code == 200, sorted_due.text
        assert [r["name"] for r in sorted_due.json()["data"]] == [sup_due.name, sup_open.name]

        sorted_country = await client.get(
            "/api/v1/suppliers",
            headers=headers,
            params={"search": tag, "sort_by": "country", "sort_order": "asc"},
        )
        assert sorted_country.status_code == 200, sorted_country.text
        assert [r["name"] for r in sorted_country.json()["data"]] == [sup_open.name, sup_due.name]
    finally:
        await po_due.delete()
        await po_open.delete()
        await sup_due.delete()
        await sup_open.delete()
