"""Purchase return — stock reverse + wallet credit; draft-only PO edit stays intact."""

from __future__ import annotations

import uuid
from datetime import date
from unittest.mock import MagicMock

import pytest
from httpx import ASGITransport, AsyncClient

from app.auth.jwt import hash_password
from app.database import init_db
from app.main import app
from app.models.inventory import InventoryBatch, StockAdjustment
from app.models.product import Product
from app.models.purchase_invoice import PurchaseInvoice
from app.models.purchase_order import POStatus, PurchaseOrder, PurchaseOrderItem
from app.models.purchase_return import PurchaseReturn
from app.models.user import User, UserRole
from app.models.wallet_ledger import WalletEntryType, WalletLedgerEntry
from app.schemas.purchase_order import PurchaseOrderPaymentCreate, PurchaseOrderReceiveItem
from app.services.goods_receipt_service import create_and_confirm_goods_receipt
from app.services.po_receive import receive_purchase_order_items
from app.services.purchase_invoice_service import pay_po_via_open_invoice
from app.services.stock import deduct_stock_fefo, get_current_stock


@pytest.fixture(autouse=True)
async def setup_db():
    await init_db()


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


async def _manager() -> User:
    user = User(
        email=f"po-ret-{uuid.uuid4().hex[:8]}@komart.com",
        name="PO Return Tester",
        hashed_password=hash_password("managerpass123"),
        role=UserRole.manager,
        is_active=True,
    )
    await user.insert()
    return user


def _mock_request() -> MagicMock:
    req = MagicMock()
    req.headers.get.return_value = ""
    req.client.host = "127.0.0.1"
    req.state.request_id = "test-request"
    return req


async def _product(name: str, cost: float = 10.0, units: int = 1) -> Product:
    sku = f"RET-{uuid.uuid4().hex[:8]}"
    product = Product(
        name=name,
        sku=sku,
        barcode=sku,
        brand="T",
        country_of_origin="Nepal",
        category="Snacks",
        supplier_id="sup-1",
        supplier_name="Supplier",
        cost_price=cost,
        selling_price=cost * 2,
        buy_uom="pack" if units > 1 else "pcs",
        uom="pcs",
        units_per_buy_uom=units,
        is_active=True,
    )
    await product.insert()
    return product


async def _receive_po(
    *products: tuple[Product, int, float],
    user: User | None = None,
) -> tuple[PurchaseOrder, User]:
    user = user or await _manager()
    items = []
    for product, qty, cost in products:
        units = int(getattr(product, "units_per_buy_uom", None) or 1)
        items.append(
            PurchaseOrderItem(
                product_id=str(product.id),
                product_name=product.name,
                quantity=qty,
                unit_cost=cost,
                received_quantity=0,
                order_uom=getattr(product, "buy_uom", None) or "pcs",
                base_uom=getattr(product, "uom", None) or "pcs",
                units_per_buy_uom=units,
            )
        )
    computed = sum(qty * cost for _, qty, cost in products)
    po = PurchaseOrder(
        order_number=f"PO-RET-{uuid.uuid4().hex[:6]}",
        supplier_id="sup-1",
        supplier_name="Supplier",
        status=POStatus.ordered,
        items=items,
        total_amount=computed,
        ordered_by=user.name,
    )
    await po.insert()
    await receive_purchase_order_items(
        str(po.id),
        [
            PurchaseOrderReceiveItem(product_id=str(product.id), receive_quantity=qty)
            for product, qty, _ in products
        ],
        created_by=user.name,
        current_user=user,
        request=_mock_request(),
    )
    refreshed = await PurchaseOrder.get(str(po.id))
    assert refreshed is not None
    return refreshed, user


async def _cleanup(po: PurchaseOrder, *products: Product, user: User | None = None) -> None:
    pid = str(po.id)
    await PurchaseReturn.find(PurchaseReturn.purchase_order_id == pid).delete()
    await PurchaseInvoice.find(PurchaseInvoice.purchase_order_id == pid).delete()
    await WalletLedgerEntry.find(WalletLedgerEntry.reference_type == "purchase_return").delete()
    await InventoryBatch.find(InventoryBatch.purchase_order_id == pid).delete()
    for product in products:
        await InventoryBatch.find(InventoryBatch.product_id == str(product.id)).delete()
        await StockAdjustment.find(StockAdjustment.product_id == str(product.id)).delete()
        await product.delete()
    await PurchaseOrder.find(PurchaseOrder.order_number == po.order_number).delete()
    if user:
        await user.delete()


async def _auth_header(client: AsyncClient, user: User) -> dict[str, str]:
    login = await client.post(
        "/api/v1/auth/login",
        json={"email": user.email, "password": "managerpass123"},
    )
    assert login.status_code == 200
    return {"Authorization": f"Bearer {login.json()['access_token']}"}


@pytest.mark.asyncio
async def test_purchase_return_reverses_stock_and_posts_wallet_credit(client: AsyncClient):
    product = await _product("Return Stock", cost=10.0, units=1)
    user = await _manager()
    po = PurchaseOrder(
        order_number=f"PO-RET-{uuid.uuid4().hex[:6]}",
        supplier_id="sup-1",
        supplier_name="Supplier",
        status=POStatus.ordered,
        items=[
            PurchaseOrderItem(
                product_id=str(product.id),
                product_name=product.name,
                quantity=5,
                unit_cost=10.0,
                received_quantity=0,
            ),
        ],
        total_amount=50.0,
        ordered_by=user.name,
    )
    await po.insert()
    await create_and_confirm_goods_receipt(
        str(po.id),
        [PurchaseOrderReceiveItem(product_id=str(product.id), receive_quantity=5)],
        created_by=user.name,
        current_user=user,
        request=_mock_request(),
    )
    await pay_po_via_open_invoice(
        str(po.id),
        PurchaseOrderPaymentCreate(
            amount=50.0,
            date=date.today().isoformat(),
            payment_method="cash",
        ),
        current_user=user,
        request=_mock_request(),
    )
    stock_before = await get_current_stock(str(product.id))
    assert stock_before == 5

    headers = await _auth_header(client, user)
    res = await client.post(
        "/api/v1/purchase-returns",
        headers=headers,
        json={
            "purchase_order_id": str(po.id),
            "items": [{"product_id": str(product.id), "return_qty": 2}],
            "payment_method": "cash",
            "settlement_type": "refund",
            "remarks": "damaged",
        },
    )
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["total_amount"] == 20.0
    assert body["status"] == "confirmed"
    assert body["items"][0]["return_qty"] == 2

    stock_after = await get_current_stock(str(product.id))
    assert stock_after == 3

    ledger = await WalletLedgerEntry.find(
        WalletLedgerEntry.reference_type == "purchase_return",
        WalletLedgerEntry.reference_id == body["id"],
    ).to_list()
    assert len(ledger) == 1
    assert ledger[0].entry_type == WalletEntryType.purchase_return
    assert ledger[0].amount == 20.0

    refreshed = await PurchaseOrder.get(str(po.id))
    assert refreshed is not None
    assert refreshed.status == POStatus.received

    await _cleanup(po, product, user=user)


@pytest.mark.asyncio
async def test_purchase_return_refund_blocked_when_unpaid(client: AsyncClient):
    product = await _product("Return Unpaid", cost=10.0)
    po, user = await _receive_po((product, 4, 10.0))
    headers = await _auth_header(client, user)
    res = await client.post(
        "/api/v1/purchase-returns",
        headers=headers,
        json={
            "purchase_order_id": str(po.id),
            "items": [{"product_id": str(product.id), "return_qty": 1}],
            "payment_method": "cash",
            "settlement_type": "refund",
        },
    )
    assert res.status_code == 400
    assert "payment" in res.json()["detail"].lower()
    assert await get_current_stock(str(product.id)) == 4
    await _cleanup(po, product, user=user)


@pytest.mark.asyncio
async def test_purchase_return_exceeds_leftover_is_400(client: AsyncClient):
    product = await _product("Return Cap", cost=8.0)
    po, user = await _receive_po((product, 3, 8.0))
    await deduct_stock_fefo(str(product.id), 2)  # sold 2 → leftover 1

    headers = await _auth_header(client, user)
    res = await client.post(
        "/api/v1/purchase-returns",
        headers=headers,
        json={
            "purchase_order_id": str(po.id),
            "items": [{"product_id": str(product.id), "return_qty": 2}],
            "payment_method": "cash",
            "settlement_type": "credit",
        },
    )
    assert res.status_code == 400
    assert "leftover" in res.json()["detail"].lower()
    await _cleanup(po, product, user=user)


@pytest.mark.asyncio
async def test_purchase_return_uses_landed_cost_for_pack_uom(client: AsyncClient):
    product = await _product("Return Pack", cost=5.0, units=10)
    # Pack cost 100 → landed 10 per pcs; receive 2 packs = 20 pcs
    po, user = await _receive_po((product, 2, 100.0))
    assert await get_current_stock(str(product.id)) == 20

    headers = await _auth_header(client, user)
    available = await client.get(
        "/api/v1/purchase-returns/available",
        headers=headers,
        params={"purchase_order_id": str(po.id)},
    )
    assert available.status_code == 200
    lines = available.json()
    assert len(lines) == 1
    assert lines[0]["available_qty"] == 20
    assert lines[0]["unit_cost"] == 10.0

    res = await client.post(
        "/api/v1/purchase-returns",
        headers=headers,
        json={
            "purchase_order_id": str(po.id),
            "items": [{"product_id": str(product.id), "return_qty": 5}],
            "payment_method": "bank",
            "settlement_type": "credit",
        },
    )
    assert res.status_code == 201, res.text
    assert res.json()["total_amount"] == 50.0
    assert await get_current_stock(str(product.id)) == 15
    await _cleanup(po, product, user=user)


@pytest.mark.asyncio
async def test_list_returns_for_purchase_order(client: AsyncClient):
    product = await _product("Return List")
    po, user = await _receive_po((product, 4, 10.0))
    headers = await _auth_header(client, user)

    created = await client.post(
        "/api/v1/purchase-returns",
        headers=headers,
        json={
            "purchase_order_id": str(po.id),
            "items": [{"product_id": str(product.id), "return_qty": 1}],
            "payment_method": "cash",
            "settlement_type": "credit",
        },
    )
    assert created.status_code == 201

    listed = await client.get(
        "/api/v1/purchase-returns",
        headers=headers,
        params={"purchase_order_id": str(po.id)},
    )
    assert listed.status_code == 200
    body = listed.json()
    assert body["total"] >= 1
    assert any(row["purchase_order_id"] == str(po.id) for row in body["data"])
    await _cleanup(po, product, user=user)
