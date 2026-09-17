"""PO discount/tax totals and purchase price history on receive."""

from __future__ import annotations

import uuid
from unittest.mock import MagicMock

import pytest
from httpx import ASGITransport, AsyncClient

from app.auth.jwt import hash_password
from app.database import init_db
from app.main import app
from app.models.product import Product
from app.models.purchase_order import POStatus, PurchaseOrder, PurchaseOrderItem
from app.models.purchase_price_history import PurchasePriceHistory
from app.models.user import User, UserRole
from app.schemas.purchase_order import PurchaseOrderReceiveItem
from app.services.po_receive import receive_purchase_order_items


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


async def _user(role: UserRole, password: str) -> User:
    email = f"po-enh-{role.value}-{uuid.uuid4().hex[:8]}@komart.com"
    user = User(
        email=email,
        name=f"PO {role.value}",
        hashed_password=hash_password(password),
        role=role,
        is_active=True,
    )
    await user.insert()
    return user


async def _product() -> Product:
    sku = f"PEH-{uuid.uuid4().hex[:8]}"
    product = Product(
        name="PO Enhance Product",
        sku=sku,
        barcode=sku,
        brand="T",
        country_of_origin="Nepal",
        category="Snacks",
        supplier_id="sup-1",
        supplier_name="Supplier",
        buy_uom="pack",
        uom="pcs",
        units_per_buy_uom=10,
        cost_price=5.0,
        selling_price=12.0,
        is_active=True,
    )
    await product.insert()
    return product


@pytest.mark.asyncio
async def test_create_po_applies_discount_and_tax(client: AsyncClient):
    manager = await _user(UserRole.manager, "managerpass123")
    product = await _product()
    login = await client.post(
        "/api/v1/auth/login",
        json={"email": manager.email, "password": "managerpass123"},
    )
    token = login.json()["access_token"]

    res = await client.post(
        "/api/v1/purchase-orders",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "supplier_id": "sup-1",
            "supplier_name": "Supplier",
            "status": "draft",
            "discount": 50,
            "tax": 20,
            "remarks": "Invoice align",
            "total_amount": 9999,
            "items": [
                {
                    "product_id": str(product.id),
                    "product_name": product.name,
                    "quantity": 10,
                    "unit_cost": 100,
                    "received_quantity": 0,
                    "order_uom": "pack",
                    "base_uom": "pcs",
                    "units_per_buy_uom": 10,
                }
            ],
        },
    )
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["subtotal"] == 1000.0
    assert body["discount"] == 50.0
    assert body["tax"] == 20.0
    assert body["total_amount"] == 970.0
    assert body["remarks"] == "Invoice align"

    po = await PurchaseOrder.get(body["id"])
    assert po is not None
    await po.delete()
    await product.delete()
    await manager.delete()


@pytest.mark.asyncio
async def test_receive_writes_purchase_price_history(client: AsyncClient):
    manager = await _user(UserRole.manager, "managerpass123")
    product = await _product()
    po = PurchaseOrder(
        order_number=f"PO-PEH-{uuid.uuid4().hex[:6]}",
        supplier_id="sup-1",
        supplier_name="Supplier Co",
        status=POStatus.ordered,
        items=[
            PurchaseOrderItem(
                product_id=str(product.id),
                product_name=product.name,
                quantity=4,
                unit_cost=100.0,
                received_quantity=0,
                order_uom="pack",
                base_uom="pcs",
                units_per_buy_uom=10,
            ),
        ],
        total_amount=400.0,
    )
    await po.insert()

    await receive_purchase_order_items(
        str(po.id),
        [
            PurchaseOrderReceiveItem(
                product_id=str(product.id),
                receive_quantity=2,
            ),
        ],
        created_by=manager.name,
        current_user=manager,
        request=_mock_request(),
        bill_no="BILL-77",
    )

    rows = await PurchasePriceHistory.find(
        PurchasePriceHistory.product_id == str(product.id),
    ).to_list()
    assert len(rows) == 1
    row = rows[0]
    assert row.unit_cost == 100.0
    assert row.landed_unit_cost == 10.0
    assert row.quantity == 2
    assert row.bill_no == "BILL-77"
    assert row.order_number == po.order_number
    assert row.purchase_order_id == str(po.id)

    login = await client.post(
        "/api/v1/auth/login",
        json={"email": manager.email, "password": "managerpass123"},
    )
    token = login.json()["access_token"]
    hist = await client.get(
        f"/api/v1/products/{product.id}/purchase-price-history",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert hist.status_code == 200
    payload = hist.json()
    assert payload["total"] == 1
    assert payload["data"][0]["bill_no"] == "BILL-77"
    assert payload["data"][0]["unit_cost"] == 100.0

    # Second partial receive appends another row
    await receive_purchase_order_items(
        str(po.id),
        [
            PurchaseOrderReceiveItem(
                product_id=str(product.id),
                receive_quantity=1,
            ),
        ],
        created_by=manager.name,
        current_user=manager,
        request=_mock_request(),
        bill_no="BILL-78",
    )
    rows2 = await PurchasePriceHistory.find(
        PurchasePriceHistory.product_id == str(product.id),
    ).to_list()
    assert len(rows2) == 2

    for row in rows2:
        await row.delete()
    refreshed = await PurchaseOrder.get(str(po.id))
    if refreshed:
        await refreshed.delete()
    await product.delete()
    await manager.delete()
