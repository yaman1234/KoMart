"""Amend received / paid purchase orders — stock, ledger, and payment stay consistent."""

from __future__ import annotations

import uuid
from unittest.mock import MagicMock

import pytest
from httpx import ASGITransport, AsyncClient

from app.auth.jwt import hash_password
from app.database import init_db
from app.main import app
from app.models.inventory import InventoryBatch, StockAdjustment
from app.models.product import Product
from app.models.purchase_order import (
    POStatus,
    PaymentStatus,
    PurchaseOrder,
    PurchaseOrderItem,
)
from app.models.user import User, UserRole
from app.schemas.purchase_order import PurchaseOrderReceiveItem, PurchaseOrderUpdate
from app.services.po_amend import amend_purchase_order
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
    email = f"po-amend-{uuid.uuid4().hex[:8]}@komart.com"
    user = User(
        email=email,
        name="PO Amend Tester",
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
    sku = f"AMD-{uuid.uuid4().hex[:8]}"
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


async def _receive_po(
    *products: tuple[Product, int, float],
    user: User | None = None,
    total: float | None = None,
) -> tuple[PurchaseOrder, User]:
    user = user or await _manager()
    items = [
        PurchaseOrderItem(
            product_id=str(product.id),
            product_name=product.name,
            quantity=qty,
            unit_cost=cost,
            received_quantity=0,
        )
        for product, qty, cost in products
    ]
    computed = sum(qty * cost for _, qty, cost in products)
    po = PurchaseOrder(
        order_number=f"PO-AMD-{uuid.uuid4().hex[:6]}",
        supplier_id="sup-1",
        supplier_name="Supplier",
        status=POStatus.ordered,
        items=items,
        total_amount=total if total is not None else computed,
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


def _update_body(po: PurchaseOrder, items: list[PurchaseOrderItem], total: float) -> PurchaseOrderUpdate:
    return PurchaseOrderUpdate(
        supplier_id=po.supplier_id,
        supplier_name=po.supplier_name,
        items=items,
        total_amount=total,
        expected_delivery=po.expected_delivery,
        status=po.status,
        ordered_by=po.ordered_by,
    )


async def _cleanup(po: PurchaseOrder, *products: Product, user: User | None = None) -> None:
    pid = str(po.id)
    await InventoryBatch.find(InventoryBatch.purchase_order_id == pid).delete()
    for product in products:
        await InventoryBatch.find(InventoryBatch.product_id == str(product.id)).delete()
        await StockAdjustment.find(StockAdjustment.product_id == str(product.id)).delete()
        await product.delete()
    await PurchaseOrder.find(PurchaseOrder.order_number == po.order_number).delete()
    if user:
        await user.delete()


@pytest.mark.asyncio
async def test_amend_cost_only_stays_received_and_paid():
    product = await _product("Amend Cost", 10.0)
    po, user = await _receive_po((product, 5, 12.0))
    await po.set({"amount_paid": 60.0, "payment_status": PaymentStatus.paid})
    po = await PurchaseOrder.get(str(po.id))
    assert po is not None

    items = [
        PurchaseOrderItem(
            product_id=str(product.id),
            product_name=product.name,
            quantity=5,
            unit_cost=15.0,
            received_quantity=5,
        )
    ]
    updated = await amend_purchase_order(
        po, _update_body(po, items, 60.0), current_user=user, request=_mock_request(),
    )
    assert updated.status == POStatus.received
    # Server recomputes total from lines (5 × 15 = 75); paid 60 → partial
    assert updated.total_amount == 75.0
    assert updated.payment_status == PaymentStatus.partial
    assert updated.items[0].unit_cost == 15.0
    assert await get_current_stock(str(product.id)) == 5

    leftover = await InventoryBatch.find(
        InventoryBatch.purchase_order_id == str(po.id),
        InventoryBatch.quantity > 0,
    ).to_list()
    assert leftover
    assert all(abs(b.unit_cost - 15.0) < 0.001 for b in leftover)
    refreshed_product = await Product.get(str(product.id))
    assert refreshed_product is not None
    assert refreshed_product.cost_price == 15.0

    await _cleanup(po, product, user=user)


@pytest.mark.asyncio
async def test_amend_increase_qty_becomes_partial_stock_unchanged():
    product = await _product("Amend Up")
    po, user = await _receive_po((product, 5, 10.0))
    items = [
        PurchaseOrderItem(
            product_id=str(product.id),
            product_name=product.name,
            quantity=8,
            unit_cost=10.0,
            received_quantity=5,
        )
    ]
    updated = await amend_purchase_order(
        po, _update_body(po, items, 80.0), current_user=user, request=_mock_request(),
    )
    assert updated.status == POStatus.partial
    assert updated.items[0].received_quantity == 5
    assert updated.items[0].quantity == 8
    assert await get_current_stock(str(product.id)) == 5
    await _cleanup(po, product, user=user)


@pytest.mark.asyncio
async def test_amend_decrease_qty_reverses_stock_and_ledger():
    product = await _product("Amend Down")
    po, user = await _receive_po((product, 10, 10.0))
    items = [
        PurchaseOrderItem(
            product_id=str(product.id),
            product_name=product.name,
            quantity=8,
            unit_cost=10.0,
            received_quantity=10,
        )
    ]
    updated = await amend_purchase_order(
        po, _update_body(po, items, 80.0), current_user=user, request=_mock_request(),
    )
    assert updated.status == POStatus.received
    assert updated.items[0].received_quantity == 8
    assert await get_current_stock(str(product.id)) == 8

    outs = await StockAdjustment.find(
        StockAdjustment.product_id == str(product.id),
        StockAdjustment.reference_id == str(po.id),
        {"quantity": {"$lt": 0}},
    ).to_list()
    assert outs
    assert sum(row.quantity for row in outs) == -2
    last = max(outs, key=lambda r: r.created_at)
    assert last.stock_after == 8
    await _cleanup(po, product, user=user)


@pytest.mark.asyncio
async def test_amend_decrease_more_than_leftover_is_400():
    product = await _product("Amend Sold")
    po, user = await _receive_po((product, 10, 10.0))
    await deduct_stock_fefo(str(product.id), 8)

    items = [
        PurchaseOrderItem(
            product_id=str(product.id),
            product_name=product.name,
            quantity=5,
            unit_cost=10.0,
            received_quantity=10,
        )
    ]
    with pytest.raises(Exception) as exc:
        await amend_purchase_order(
            po, _update_body(po, items, 50.0), current_user=user, request=_mock_request(),
        )
    assert exc.value.status_code == 400
    unchanged = await PurchaseOrder.get(str(po.id))
    assert unchanged is not None
    assert unchanged.items[0].quantity == 10
    assert unchanged.items[0].received_quantity == 10
    assert await get_current_stock(str(product.id)) == 2
    await _cleanup(po, product, user=user)


@pytest.mark.asyncio
async def test_amend_remove_and_add_line():
    keep = await _product("Amend Keep")
    drop = await _product("Amend Drop")
    add = await _product("Amend Add")
    po, user = await _receive_po((keep, 4, 10.0), (drop, 3, 8.0))

    items = [
        PurchaseOrderItem(
            product_id=str(keep.id),
            product_name=keep.name,
            quantity=4,
            unit_cost=10.0,
            received_quantity=4,
        ),
        PurchaseOrderItem(
            product_id=str(add.id),
            product_name=add.name,
            quantity=2,
            unit_cost=9.0,
            received_quantity=0,
        ),
    ]
    updated = await amend_purchase_order(
        po, _update_body(po, items, 58.0), current_user=user, request=_mock_request(),
    )
    assert updated.status == POStatus.partial
    pids = {item.product_id for item in updated.items}
    assert str(keep.id) in pids
    assert str(drop.id) not in pids
    assert str(add.id) in pids
    add_line = next(i for i in updated.items if i.product_id == str(add.id))
    assert add_line.received_quantity == 0
    assert await get_current_stock(str(keep.id)) == 4
    assert await get_current_stock(str(drop.id)) == 0
    assert await get_current_stock(str(add.id)) == 0
    await _cleanup(po, keep, drop, add, user=user)


@pytest.mark.asyncio
async def test_amend_higher_total_reopens_payment():
    product = await _product("Amend Reopen")
    po, user = await _receive_po((product, 5, 10.0), total=50.0)
    await po.set({"amount_paid": 50.0, "payment_status": PaymentStatus.paid})
    po = await PurchaseOrder.get(str(po.id))
    assert po is not None

    items = [
        PurchaseOrderItem(
            product_id=str(product.id),
            product_name=product.name,
            quantity=6,
            unit_cost=10.0,
            received_quantity=5,
        )
    ]
    updated = await amend_purchase_order(
        po, _update_body(po, items, 60.0), current_user=user, request=_mock_request(),
    )
    assert updated.status == POStatus.partial
    assert updated.payment_status == PaymentStatus.partial
    await _cleanup(po, product, user=user)


@pytest.mark.asyncio
async def test_amend_total_below_paid_is_400():
    product = await _product("Amend Paid")
    po, user = await _receive_po((product, 5, 10.0), total=50.0)
    await po.set({"amount_paid": 50.0, "payment_status": PaymentStatus.paid})
    po = await PurchaseOrder.get(str(po.id))
    assert po is not None

    # Lower line total below amount paid (3 × 10 = 30 < 50 paid)
    items = [
        PurchaseOrderItem(
            product_id=str(product.id),
            product_name=product.name,
            quantity=3,
            unit_cost=10.0,
            received_quantity=3,
        )
    ]
    with pytest.raises(Exception) as exc:
        await amend_purchase_order(
            po, _update_body(po, items, 40.0), current_user=user, request=_mock_request(),
        )
    assert exc.value.status_code == 400
    await _cleanup(po, product, user=user)


@pytest.mark.asyncio
async def test_cancelled_po_cannot_be_amended(client: AsyncClient):
    product = await _product("Amend Cancel")
    po, user = await _receive_po((product, 2, 10.0))
    await po.set({"status": POStatus.cancelled})

    admin = User(
        email=f"po-amend-admin-{uuid.uuid4().hex[:8]}@komart.com",
        name="PO Amend Admin",
        hashed_password=hash_password("adminpass123"),
        role=UserRole.admin,
        is_active=True,
    )
    await admin.insert()

    login = await client.post(
        "/api/v1/auth/login",
        json={"email": admin.email, "password": "adminpass123"},
    )
    assert login.status_code == 200
    token = login.json()["access_token"]
    res = await client.patch(
        f"/api/v1/purchase-orders/{po.id}",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "supplier_id": po.supplier_id,
            "supplier_name": po.supplier_name,
            "items": [
                {
                    "product_id": str(product.id),
                    "product_name": product.name,
                    "quantity": 2,
                    "unit_cost": 10.0,
                    "received_quantity": 2,
                }
            ],
            "total_amount": 20.0,
            "status": "cancelled",
            "ordered_by": user.name,
        },
    )
    assert res.status_code == 400
    assert "Cancelled" in res.json()["detail"]
    await admin.delete()
    await _cleanup(po, product, user=user)


@pytest.mark.asyncio
async def test_manager_cannot_patch_purchase_order(client: AsyncClient):
    product = await _product("Amend Manager Block")
    po, user = await _receive_po((product, 1, 10.0))

    login = await client.post(
        "/api/v1/auth/login",
        json={"email": user.email, "password": "managerpass123"},
    )
    assert login.status_code == 200
    token = login.json()["access_token"]
    res = await client.patch(
        f"/api/v1/purchase-orders/{po.id}",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "supplier_id": po.supplier_id,
            "supplier_name": po.supplier_name,
            "items": [
                {
                    "product_id": str(product.id),
                    "product_name": product.name,
                    "quantity": 1,
                    "unit_cost": 10.0,
                    "received_quantity": 1,
                }
            ],
            "total_amount": 10.0,
            "status": "received",
            "ordered_by": user.name,
        },
    )
    assert res.status_code == 403
    assert "draft" in res.json()["detail"].lower()
    await _cleanup(po, product, user=user)


@pytest.mark.asyncio
async def test_admin_cannot_patch_received_purchase_order(client: AsyncClient):
    product = await _product("Amend Admin Block")
    po, user = await _receive_po((product, 1, 10.0))
    admin = User(
        email=f"po-admin-{uuid.uuid4().hex[:8]}@komart.com",
        name="PO Admin",
        hashed_password=hash_password("adminpass123"),
        role=UserRole.admin,
        is_active=True,
    )
    await admin.insert()

    login = await client.post(
        "/api/v1/auth/login",
        json={"email": admin.email, "password": "adminpass123"},
    )
    assert login.status_code == 200
    token = login.json()["access_token"]
    res = await client.patch(
        f"/api/v1/purchase-orders/{po.id}",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "supplier_id": po.supplier_id,
            "supplier_name": po.supplier_name,
            "items": [
                {
                    "product_id": str(product.id),
                    "product_name": product.name,
                    "quantity": 1,
                    "unit_cost": 12.0,
                    "received_quantity": 1,
                }
            ],
            "total_amount": 12.0,
            "status": "received",
            "ordered_by": user.name,
        },
    )
    assert res.status_code == 403
    assert "draft" in res.json()["detail"].lower()
    await admin.delete()
    await _cleanup(po, product, user=user)


@pytest.mark.asyncio
async def test_manager_can_patch_draft_purchase_order(client: AsyncClient):
    product = await _product("Draft Manager Edit")
    user = await _manager()
    po = PurchaseOrder(
        order_number=f"PO-DFT-{uuid.uuid4().hex[:6]}",
        supplier_id="sup-1",
        supplier_name="Supplier",
        status=POStatus.draft,
        items=[
            PurchaseOrderItem(
                product_id=str(product.id),
                product_name=product.name,
                quantity=2,
                unit_cost=10.0,
                received_quantity=0,
            ),
        ],
        total_amount=20.0,
        ordered_by=user.name,
    )
    await po.insert()

    login = await client.post(
        "/api/v1/auth/login",
        json={"email": user.email, "password": "managerpass123"},
    )
    assert login.status_code == 200
    token = login.json()["access_token"]
    res = await client.patch(
        f"/api/v1/purchase-orders/{po.id}",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "supplier_id": po.supplier_id,
            "supplier_name": po.supplier_name,
            "items": [
                {
                    "product_id": str(product.id),
                    "product_name": product.name,
                    "quantity": 3,
                    "unit_cost": 10.0,
                    "received_quantity": 0,
                }
            ],
            "total_amount": 30.0,
            "discount": 0,
            "tax": 0,
            "remarks": "draft edit",
            "status": "draft",
            "ordered_by": user.name,
        },
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["total_amount"] == 30.0
    assert body["remarks"] == "draft edit"
    assert len(body["items"]) == 1
    assert body["items"][0]["quantity"] == 3
    await _cleanup(po, product, user=user)
