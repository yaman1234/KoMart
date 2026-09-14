"""Cancel purchase orders — unwind payments and leftover stock."""

from __future__ import annotations

import uuid
from datetime import date
from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException
from httpx import ASGITransport, AsyncClient

from app.auth.jwt import hash_password
from app.database import init_db
from app.main import app
from app.models.expense import Expense
from app.models.inventory import InventoryBatch, StockAdjustment
from app.models.product import Product
from app.models.purchase_order import (
    POStatus,
    PaymentStatus,
    PurchaseOrder,
    PurchaseOrderItem,
)
from app.models.user import User, UserRole
from app.schemas.purchase_order import PurchaseOrderPaymentCreate, PurchaseOrderReceiveItem
from app.services.po_cancel import cancel_purchase_order
from app.services.po_payment import record_payment
from app.services.po_receive import receive_purchase_order_items
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
    email = f"po-cancel-{uuid.uuid4().hex[:8]}@komart.com"
    user = User(
        email=email,
        name="PO Cancel Tester",
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


async def _product(name: str, cost: float = 10.0) -> Product:
    sku = f"CNL-{uuid.uuid4().hex[:8]}"
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
        is_active=True,
    )
    await product.insert()
    return product


async def _ordered_po(product: Product, qty: int = 5, cost: float = 10.0) -> tuple[PurchaseOrder, User]:
    user = await _manager()
    po = PurchaseOrder(
        order_number=f"PO-CNL-{uuid.uuid4().hex[:6]}",
        supplier_id="sup-1",
        supplier_name="Supplier",
        status=POStatus.ordered,
        items=[
            PurchaseOrderItem(
                product_id=str(product.id),
                product_name=product.name,
                quantity=qty,
                unit_cost=cost,
                received_quantity=0,
            )
        ],
        total_amount=qty * cost,
        ordered_by=user.name,
    )
    await po.insert()
    return po, user


async def _receive_po(
    product: Product,
    qty: int = 5,
    cost: float = 10.0,
) -> tuple[PurchaseOrder, User]:
    po, user = await _ordered_po(product, qty, cost)
    await receive_purchase_order_items(
        str(po.id),
        [PurchaseOrderReceiveItem(product_id=str(product.id), receive_quantity=qty)],
        created_by=user.name,
        current_user=user,
        request=_mock_request(),
    )
    refreshed = await PurchaseOrder.get(str(po.id))
    assert refreshed is not None
    return refreshed, user


async def _cleanup(po: PurchaseOrder, *products: Product, user: User | None = None) -> None:
    pid = str(po.id)
    await Expense.find(Expense.purchase_order_id == pid).delete()
    await InventoryBatch.find(InventoryBatch.purchase_order_id == pid).delete()
    for product in products:
        await InventoryBatch.find(InventoryBatch.product_id == str(product.id)).delete()
        await StockAdjustment.find(StockAdjustment.product_id == str(product.id)).delete()
        await product.delete()
    await PurchaseOrder.find(PurchaseOrder.order_number == po.order_number).delete()
    if user:
        await user.delete()


@pytest.mark.asyncio
async def test_cancel_unpaid_ordered_po():
    product = await _product("Cancel Unpaid")
    po, user = await _ordered_po(product)
    cancelled = await cancel_purchase_order(po, current_user=user, request=_mock_request())
    assert cancelled.status == POStatus.cancelled
    assert cancelled.amount_paid == 0
    assert cancelled.payment_status == PaymentStatus.unpaid
    assert cancelled.payments == []
    await _cleanup(po, product, user=user)


@pytest.mark.asyncio
async def test_cancel_paid_po_reverses_expense():
    product = await _product("Cancel Paid")
    po, user = await _receive_po(product, qty=4, cost=12.5)
    await record_payment(
        str(po.id),
        PurchaseOrderPaymentCreate(
            amount=50.0,
            date=date.today().isoformat(),
            payment_method="cash",
            notes="full pay",
        ),
        current_user=user,
        request=_mock_request(),
    )
    po = await PurchaseOrder.get(str(po.id))
    assert po is not None
    assert po.amount_paid == 50.0
    expense_count = await Expense.find(Expense.purchase_order_id == str(po.id)).count()
    assert expense_count == 1

    cancelled = await cancel_purchase_order(po, current_user=user, request=_mock_request())
    assert cancelled.status == POStatus.cancelled
    assert cancelled.amount_paid == 0
    assert cancelled.payment_status == PaymentStatus.unpaid
    assert cancelled.payments == []
    assert await Expense.find(Expense.purchase_order_id == str(po.id)).count() == 0
    assert await get_current_stock(str(product.id)) == 0

    await _cleanup(po, product, user=user)


@pytest.mark.asyncio
async def test_cancel_received_reverses_leftover_stock_and_ledger():
    product = await _product("Cancel Stock")
    po, user = await _receive_po(product, qty=6, cost=10.0)
    assert await get_current_stock(str(product.id)) == 6

    cancelled = await cancel_purchase_order(po, current_user=user, request=_mock_request())
    assert cancelled.status == POStatus.cancelled
    assert await get_current_stock(str(product.id)) == 0
    leftover = await InventoryBatch.find(
        InventoryBatch.purchase_order_id == str(po.id),
        InventoryBatch.quantity > 0,
    ).to_list()
    assert leftover == []
    ledger = await StockAdjustment.find(
        StockAdjustment.product_id == str(product.id),
        StockAdjustment.reason == "PO cancel — reverse receive",
    ).to_list()
    assert ledger
    assert sum(row.quantity for row in ledger) == -6

    await _cleanup(po, product, user=user)


@pytest.mark.asyncio
async def test_cancel_blocks_when_stock_already_sold():
    product = await _product("Cancel Sold")
    po, user = await _receive_po(product, qty=5, cost=10.0)
    await deduct_stock_fefo(str(product.id), 2)

    with pytest.raises(HTTPException) as exc:
        await cancel_purchase_order(po, current_user=user, request=_mock_request())
    assert exc.value.status_code == 400
    assert "already been sold" in str(exc.value.detail)

    still = await PurchaseOrder.get(str(po.id))
    assert still is not None
    assert still.status == POStatus.received
    assert await get_current_stock(str(product.id)) == 3

    await _cleanup(po, product, user=user)


@pytest.mark.asyncio
async def test_cancel_already_cancelled_is_400():
    product = await _product("Cancel Twice")
    po, user = await _ordered_po(product)
    await cancel_purchase_order(po, current_user=user, request=_mock_request())
    po = await PurchaseOrder.get(str(po.id))
    assert po is not None

    with pytest.raises(HTTPException) as exc:
        await cancel_purchase_order(po, current_user=user, request=_mock_request())
    assert exc.value.status_code == 400
    assert "already cancelled" in str(exc.value.detail)

    await _cleanup(po, product, user=user)


@pytest.mark.asyncio
async def test_status_endpoint_cancel_unwinds(client: AsyncClient):
    product = await _product("Cancel HTTP")
    po, user = await _receive_po(product, qty=3, cost=10.0)
    login = await client.post(
        "/api/v1/auth/login",
        json={"email": user.email, "password": "managerpass123"},
    )
    assert login.status_code == 200
    token = login.json()["access_token"]

    res = await client.patch(
        f"/api/v1/purchase-orders/{po.id}/status",
        headers={"Authorization": f"Bearer {token}"},
        json={"status": "cancelled"},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "cancelled"
    assert body["amount_paid"] == 0
    assert await get_current_stock(str(product.id)) == 0

    await _cleanup(po, product, user=user)
