"""Purchase return P0 scenarios — PO-linked and supplier modes."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from unittest.mock import MagicMock

import pytest
from httpx import ASGITransport, AsyncClient

from app.auth.jwt import hash_password
from app.database import init_db
from app.main import app
from app.models.inventory import InventoryBatch
from app.models.product import Product
from app.models.purchase_order import (
    POStatus,
    PaymentStatus,
    PurchaseOrder,
    PurchaseOrderItem,
)
from app.models.purchase_return import PurchaseReturn, ReturnSettlementType
from app.models.supplier import Supplier
from app.models.user import User, UserRole
from app.models.wallet_ledger import WalletEntryType, WalletLedgerEntry
from app.schemas.purchase_order import PurchaseOrderReceiveItem
from app.services.po_receive import receive_purchase_order_items
from app.services.stock import get_current_stock


@pytest.fixture(autouse=True)
async def setup_db():
    await init_db()


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


def _mock_request() -> MagicMock:
    req = MagicMock()
    req.headers.get.return_value = ""
    req.client.host = "127.0.0.1"
    req.state.request_id = "test-request"
    return req


async def _user(role: UserRole, prefix: str) -> User:
    email = f"{prefix}-{uuid.uuid4().hex[:8]}@komart.com"
    user = User(
        email=email,
        name=f"{prefix} User",
        hashed_password=hash_password("testpass123"),
        role=role,
        is_active=True,
    )
    await user.insert()
    return user


async def _login(client: AsyncClient, email: str, password: str = "testpass123") -> str:
    res = await client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert res.status_code == 200
    return res.json()["access_token"]


async def _product(name: str = "Return Item") -> Product:
    sku = f"RET-{uuid.uuid4().hex[:8]}"
    p = Product(
        name=name,
        sku=sku,
        barcode=sku,
        brand="T",
        country_of_origin="Nepal",
        category="Snacks",
        supplier_id="",
        supplier_name="",
        cost_price=10.0,
        selling_price=20.0,
        is_active=True,
    )
    await p.insert()
    return p


async def _receive_po(
    *,
    product: Product,
    qty: int = 10,
    unit_cost: float = 10.0,
    supplier_id: str = "",
    supplier_name: str = "",
    manager: User,
) -> PurchaseOrder:
    po = PurchaseOrder(
        order_number=f"PO-RET-{uuid.uuid4().hex[:6].upper()}",
        supplier_id=supplier_id,
        supplier_name=supplier_name,
        status=POStatus.ordered,
        items=[
            PurchaseOrderItem(
                product_id=str(product.id),
                product_name=product.name,
                quantity=qty,
                unit_cost=unit_cost,
                received_quantity=0,
            )
        ],
        subtotal=qty * unit_cost,
        discount=0.0,
        additional_charges=0.0,
        total_amount=qty * unit_cost,
        amount_paid=0.0,
        payment_status=PaymentStatus.unpaid,
    )
    await po.insert()
    await receive_purchase_order_items(
        str(po.id),
        [PurchaseOrderReceiveItem(product_id=str(product.id), receive_quantity=qty)],
        created_by=manager.name,
        current_user=manager,
        request=_mock_request(),
    )
    refreshed = await PurchaseOrder.get(str(po.id))
    assert refreshed is not None
    return refreshed


@pytest.mark.asyncio
async def test_s01_po_linked_reduce_payable_unpaid(client: AsyncClient):
    manager = await _user(UserRole.manager, "mgr-s01")
    token = await _login(client, manager.email)
    product = await _product()
    po = await _receive_po(product=product, qty=10, unit_cost=10.0, manager=manager)
    assert await get_current_stock(str(product.id)) == 10

    res = await client.post(
        "/api/v1/purchase-returns",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "return_mode": "po_linked",
            "purchase_order_id": str(po.id),
            "items": [{"product_id": str(product.id), "return_qty": 10}],
            "settlement_type": "reduce_payable",
            "reason": "wrong_item",
        },
    )
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["total_amount"] == 100.0
    assert body["settlement_type"] == "reduce_payable"
    assert body["status"] == "closed"

    refreshed = await PurchaseOrder.get(str(po.id))
    assert refreshed is not None
    assert refreshed.status == POStatus.received
    assert refreshed.total_amount == 0.0
    assert await get_current_stock(str(product.id)) == 0


@pytest.mark.asyncio
async def test_s02_po_linked_refund_when_paid(client: AsyncClient):
    manager = await _user(UserRole.manager, "mgr-s02")
    token = await _login(client, manager.email)
    product = await _product()
    po = await _receive_po(product=product, qty=10, unit_cost=10.0, manager=manager)
    await po.set({
        "amount_paid": 100.0,
        "payment_status": PaymentStatus.paid,
        "updated_at": datetime.now(timezone.utc),
    })

    res = await client.post(
        "/api/v1/purchase-returns",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "return_mode": "po_linked",
            "purchase_order_id": str(po.id),
            "items": [{"product_id": str(product.id), "return_qty": 4}],
            "settlement_type": "refund",
            "payment_method": "cash",
            "reason": "damaged",
        },
    )
    assert res.status_code == 201, res.text
    ret = res.json()
    assert ret["total_amount"] == 40.0
    assert ret["status"] == "requested"
    assert await get_current_stock(str(product.id)) == 6

    still_paid = await PurchaseOrder.get(str(po.id))
    assert still_paid is not None
    assert still_paid.amount_paid == 100.0
    pending_ledger = await WalletLedgerEntry.find(
        WalletLedgerEntry.reference_id == ret["id"],
    ).to_list()
    assert pending_ledger == []

    closed = await client.post(
        f"/api/v1/purchase-returns/{ret['id']}/close",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert closed.status_code == 200, closed.text
    assert closed.json()["status"] == "closed"

    refreshed = await PurchaseOrder.get(str(po.id))
    assert refreshed is not None
    assert refreshed.amount_paid == 60.0
    assert refreshed.payment_status == PaymentStatus.partial

    ledger = await WalletLedgerEntry.find(
        WalletLedgerEntry.reference_type == "purchase_return",
        WalletLedgerEntry.reference_id == ret["id"],
    ).to_list()
    assert len(ledger) == 1
    assert ledger[0].entry_type == WalletEntryType.purchase_return
    assert ledger[0].amount == 40.0

    again = await client.post(
        f"/api/v1/purchase-returns/{ret['id']}/close",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert again.status_code == 400


@pytest.mark.asyncio
async def test_s05_cannot_return_sold_qty(client: AsyncClient):
    manager = await _user(UserRole.manager, "mgr-s05")
    token = await _login(client, manager.email)
    product = await _product()
    po = await _receive_po(product=product, qty=10, unit_cost=10.0, manager=manager)

    batches = await InventoryBatch.find(InventoryBatch.purchase_order_id == str(po.id)).to_list()
    assert len(batches) == 1
    await batches[0].set({"quantity": 3})  # simulate 7 sold via FEFO

    avail = await client.get(
        f"/api/v1/purchase-returns/available?purchase_order_id={po.id}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert avail.status_code == 200
    assert avail.json()[0]["available_qty"] == 3

    res = await client.post(
        "/api/v1/purchase-returns",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "return_mode": "po_linked",
            "purchase_order_id": str(po.id),
            "items": [{"product_id": str(product.id), "return_qty": 10}],
            "settlement_type": "reduce_payable",
        },
    )
    assert res.status_code == 400


@pytest.mark.asyncio
async def test_s06_cancel_received_still_blocked(client: AsyncClient):
    manager = await _user(UserRole.manager, "mgr-s06")
    token = await _login(client, manager.email)
    product = await _product()
    po = await _receive_po(product=product, qty=5, unit_cost=10.0, manager=manager)

    res = await client.patch(
        f"/api/v1/purchase-orders/{po.id}/status",
        headers={"Authorization": f"Bearer {token}"},
        json={"status": "cancelled"},
    )
    assert res.status_code == 400
    assert "purchase return" in res.json()["detail"].lower()


@pytest.mark.asyncio
async def test_s07_s08_supplier_stock_only_and_refund(client: AsyncClient):
    manager = await _user(UserRole.manager, "mgr-s07")
    token = await _login(client, manager.email)
    supplier = Supplier(
        name=f"Sup-{uuid.uuid4().hex[:6]}",
        country="Nepal",
        contact_person="",
        phone="",
        email="",
        address="",
        is_active=True,
    )
    await supplier.insert()
    product = await _product("Aged Item")
    po = await _receive_po(
        product=product,
        qty=8,
        unit_cost=12.0,
        supplier_id=str(supplier.id),
        supplier_name=supplier.name,
        manager=manager,
    )
    total_before = po.total_amount
    paid_before = po.amount_paid

    res = await client.post(
        "/api/v1/purchase-returns",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "return_mode": "supplier",
            "supplier_id": str(supplier.id),
            "items": [{"product_id": str(product.id), "return_qty": 3}],
            "settlement_type": "stock_only",
            "reason": "expired",
        },
    )
    assert res.status_code == 201, res.text
    assert res.json()["status"] == "closed"
    assert res.json()["purchase_order_id"] in ("", None)
    assert await get_current_stock(str(product.id)) == 5

    po_after = await PurchaseOrder.get(str(po.id))
    assert po_after is not None
    assert po_after.total_amount == total_before
    assert po_after.amount_paid == paid_before

    res2 = await client.post(
        "/api/v1/purchase-returns",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "return_mode": "supplier",
            "supplier_id": str(supplier.id),
            "items": [{"product_id": str(product.id), "return_qty": 2}],
            "settlement_type": "refund",
            "payment_method": "cash",
            "reason": "expired",
        },
    )
    assert res2.status_code == 201, res2.text
    assert res2.json()["status"] == "requested"
    assert await get_current_stock(str(product.id)) == 3
    closed = await client.post(
        f"/api/v1/purchase-returns/{res2.json()['id']}/close",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert closed.status_code == 200, closed.text
    ledger = await WalletLedgerEntry.find(
        WalletLedgerEntry.reference_id == res2.json()["id"],
    ).to_list()
    assert len(ledger) == 1


@pytest.mark.asyncio
async def test_s09_supplier_reduce_payable_rejected(client: AsyncClient):
    manager = await _user(UserRole.manager, "mgr-s09")
    token = await _login(client, manager.email)
    supplier = Supplier(
        name=f"Sup-{uuid.uuid4().hex[:6]}",
        country="Nepal",
        contact_person="",
        phone="",
        email="",
        address="",
        is_active=True,
    )
    await supplier.insert()
    product = await _product()
    await _receive_po(
        product=product,
        qty=5,
        unit_cost=10.0,
        supplier_id=str(supplier.id),
        supplier_name=supplier.name,
        manager=manager,
    )

    res = await client.post(
        "/api/v1/purchase-returns",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "return_mode": "supplier",
            "supplier_id": str(supplier.id),
            "items": [{"product_id": str(product.id), "return_qty": 1}],
            "settlement_type": "reduce_payable",
        },
    )
    assert res.status_code == 400


@pytest.mark.asyncio
async def test_s11_cashier_forbidden(client: AsyncClient):
    manager = await _user(UserRole.manager, "mgr-s11")
    cashier = await _user(UserRole.cashier, "cash-s11")
    token = await _login(client, cashier.email)
    product = await _product()
    po = await _receive_po(product=product, qty=5, unit_cost=10.0, manager=manager)

    res = await client.post(
        "/api/v1/purchase-returns",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "return_mode": "po_linked",
            "purchase_order_id": str(po.id),
            "items": [{"product_id": str(product.id), "return_qty": 1}],
            "settlement_type": "reduce_payable",
        },
    )
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_s02_refund_blocked_when_unpaid(client: AsyncClient):
    manager = await _user(UserRole.manager, "mgr-unpaid")
    token = await _login(client, manager.email)
    product = await _product()
    po = await _receive_po(product=product, qty=5, unit_cost=10.0, manager=manager)

    res = await client.post(
        "/api/v1/purchase-returns",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "return_mode": "po_linked",
            "purchase_order_id": str(po.id),
            "items": [{"product_id": str(product.id), "return_qty": 2}],
            "settlement_type": "refund",
            "payment_method": "cash",
        },
    )
    assert res.status_code == 400
