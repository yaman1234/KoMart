"""Supplier returns skip missing catalog products and report return KPIs."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

import pytest
from httpx import ASGITransport, AsyncClient

from app.auth.jwt import hash_password
from app.database import init_db
from app.main import app
from app.models.inventory import InventoryBatch
from app.models.product import Product
from app.models.purchase_order import POStatus, PurchaseOrder
from app.models.purchase_return import (
    PurchaseReturn,
    PurchaseReturnStatus,
    ReturnSettlementType,
)
from app.models.supplier import Supplier
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
    email = f"ret-cat-{uuid.uuid4().hex[:8]}@komart.com"
    user = User(
        email=email,
        name="Return Catalog Tester",
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


async def _product(name: str) -> Product:
    sku = f"CAT-{uuid.uuid4().hex[:8]}"
    product = Product(
        name=name,
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
    return product


def _po(*, order_number: str, supplier_id: str, status: POStatus) -> PurchaseOrder:
    return PurchaseOrder(
        order_number=order_number,
        supplier_id=supplier_id,
        supplier_name="Catalog Supplier",
        status=status,
        items=[],
        total_amount=0,
        amount_paid=0,
    )


async def _batch(*, product_id: str, po_id: str, qty: int) -> None:
    await InventoryBatch(
        product_id=product_id,
        batch_number=f"B-{uuid.uuid4().hex[:6]}",
        quantity=qty,
        unit_cost=10,
        purchase_order_id=po_id,
    ).insert()


@pytest.mark.asyncio
async def test_available_by_supplier_drops_missing_products_and_inactive_pos(
    client: AsyncClient,
    manager_user: User,
):
    token = await _login(client, manager_user.email)
    supplier = Supplier(
        name=f"Catalog Supplier {uuid.uuid4().hex[:6]}",
        country="Nepal",
        contact_person="Asha",
        phone="9800000000",
        address="Kathmandu",
    )
    await supplier.insert()
    supplier_id = str(supplier.id)
    prefix = f"PO-CAT-{uuid.uuid4().hex[:6].upper()}"
    live = await _product("Live Snack")
    legacy_product = await _product("Legacy Snack")
    cancelled_product = await _product("Cancelled Snack")
    missing_id = "6a49ff000000000000000099"
    col = PurchaseOrder.get_motor_collection()

    received = _po(order_number=f"{prefix}-RCV", supplier_id=supplier_id, status=POStatus.received)
    draft = _po(order_number=f"{prefix}-DRF", supplier_id=supplier_id, status=POStatus.draft)
    cancelled = _po(order_number=f"{prefix}-CAN", supplier_id=supplier_id, status=POStatus.cancelled)
    legacy = _po(order_number=f"{prefix}-LEG", supplier_id=supplier_id, status=POStatus.received)
    for po in (received, draft, cancelled, legacy):
        await po.insert()
    await col.update_one({"_id": legacy.id}, {"$set": {"status": "Received"}})
    await col.update_one({"_id": cancelled.id}, {"$set": {"status": "Cancelled"}})

    await _batch(product_id=str(live.id), po_id=str(received.id), qty=5)
    await _batch(product_id=str(live.id), po_id=str(draft.id), qty=9)
    await _batch(product_id=str(cancelled_product.id), po_id=str(cancelled.id), qty=7)
    await _batch(product_id=str(legacy_product.id), po_id=str(legacy.id), qty=3)
    await _batch(product_id=missing_id, po_id=str(received.id), qty=20)

    try:
        res = await client.get(
            "/api/v1/purchase-returns/available-by-supplier",
            headers={"Authorization": f"Bearer {token}"},
            params={"supplier_id": supplier_id},
        )
        assert res.status_code == 200, res.text
        rows = {row["product_id"]: row for row in res.json()}
        assert set(rows) == {str(live.id), str(legacy_product.id)}
        assert rows[str(live.id)]["available_qty"] == 5
        assert rows[str(live.id)]["product_name"] == "Live Snack"
        assert rows[str(live.id)]["sku"]
        assert rows[str(legacy_product.id)]["available_qty"] == 3
        assert missing_id not in rows
        assert str(cancelled_product.id) not in rows

        created = await client.post(
            "/api/v1/purchase-returns",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "return_mode": "supplier",
                "supplier_id": supplier_id,
                "settlement_type": "stock_only",
                "reason": "expired",
                "items": [{"product_id": missing_id, "return_qty": 1}],
            },
        )
        assert created.status_code == 400, created.text
        assert created.status_code != 404
        assert "no longer in the catalog" in created.json()["detail"]
    finally:
        await col.delete_many({"order_number": {"$regex": f"^{prefix}"}})
        await InventoryBatch.get_motor_collection().delete_many(
            {"product_id": {"$in": [str(live.id), str(legacy_product.id), str(cancelled_product.id), missing_id]}}
        )
        await live.delete()
        await legacy_product.delete()
        await cancelled_product.delete()
        await supplier.delete()


@pytest.mark.asyncio
async def test_supplier_summary_return_kpis_do_not_change_payables(
    client: AsyncClient,
    manager_user: User,
):
    token = await _login(client, manager_user.email)
    supplier_id = f"sup-kpi-{uuid.uuid4().hex[:8]}"
    other_id = f"sup-other-{uuid.uuid4().hex[:8]}"
    prefix = f"PO-RKPI-{uuid.uuid4().hex[:6].upper()}"
    ret_prefix = f"RET-{uuid.uuid4().hex[:6].upper()}"
    po = PurchaseOrder(
        order_number=f"{prefix}-RCV",
        supplier_id=supplier_id,
        supplier_name="KPI Supplier",
        status=POStatus.received,
        items=[],
        total_amount=1000,
        amount_paid=200,
    )
    await po.insert()

    async def _return(**kwargs) -> PurchaseReturn:
        doc = PurchaseReturn(
            return_number=f"{ret_prefix}-{uuid.uuid4().hex[:4].upper()}",
            supplier_id=supplier_id,
            supplier_name="KPI Supplier",
            items=[],
            return_date="2026-01-01",
            **kwargs,
        )
        await doc.insert()
        return doc

    stock_only = await _return(
        settlement_type=ReturnSettlementType.stock_only,
        status=PurchaseReturnStatus.closed,
        total_amount=80,
    )
    open_refund = await _return(
        settlement_type=ReturnSettlementType.refund,
        status=PurchaseReturnStatus.requested,
        total_amount=500,
        amount_received=100,
        write_off_amount=50,
    )
    closed_refund = await _return(
        settlement_type=ReturnSettlementType.refund,
        status=PurchaseReturnStatus.closed,
        total_amount=40,
        amount_received=40,
    )
    other = PurchaseReturn(
        return_number=f"{ret_prefix}-OTHER",
        supplier_id=other_id,
        supplier_name="Other",
        settlement_type=ReturnSettlementType.refund,
        status=PurchaseReturnStatus.requested,
        total_amount=999,
        items=[],
        return_date="2026-01-01",
    )
    await other.insert()
    ret_col = PurchaseReturn.get_motor_collection()
    await ret_col.insert_one(
        {
            "return_number": f"{ret_prefix}-CAN",
            "supplier_id": supplier_id,
            "supplier_name": "KPI Supplier",
            "settlement_type": "refund",
            "status": "cancelled",
            "total_amount": 70,
            "amount_received": 0,
            "write_off_amount": 0,
            "items": [],
            "return_date": "2026-01-01",
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc),
        }
    )

    try:
        res = await client.get(
            "/api/v1/purchase-orders",
            headers={"Authorization": f"Bearer {token}"},
            params={"supplier_id": supplier_id, "include_summary": "true", "page_size": 10},
        )
        assert res.status_code == 200, res.text
        summary = res.json()["summary"]
        assert summary["payable_outstanding"] == 800.0
        assert summary["returned_count"] == 3
        assert summary["returned_amount"] == 620.0
        assert summary["receivable_count"] == 1
        assert summary["receivable_amount"] == 350.0

        other_res = await client.get(
            "/api/v1/purchase-orders",
            headers={"Authorization": f"Bearer {token}"},
            params={"supplier_id": other_id, "include_summary": "true"},
        )
        assert other_res.status_code == 200, other_res.text
        other_summary = other_res.json()["summary"]
        assert other_summary["returned_count"] == 1
        assert other_summary["returned_amount"] == 999.0
        assert other_summary["receivable_amount"] == 999.0
        assert other_summary["payable_outstanding"] == 0.0
    finally:
        await PurchaseOrder.get_motor_collection().delete_many({"order_number": {"$regex": f"^{prefix}"}})
        await ret_col.delete_many({"return_number": {"$regex": f"^{ret_prefix}"}})
        for doc in (stock_only, open_refund, closed_refund, other):
            stored = await PurchaseReturn.get(doc.id)
            if stored:
                await stored.delete()
