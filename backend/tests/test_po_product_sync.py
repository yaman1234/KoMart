"""PO packaging (buy unit, sell unit, conversion, sell mode) syncs into products."""

from __future__ import annotations

import uuid
from unittest.mock import MagicMock

import pytest
from httpx import ASGITransport, AsyncClient

from app.auth.jwt import hash_password
from app.database import init_db
from app.main import app
from app.models.product import Product, SellMode
from app.models.purchase_order import POStatus, PurchaseOrder, PurchaseOrderItem
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


async def _manager() -> User:
    email = f"po-sync-{uuid.uuid4().hex[:8]}@komart.com"
    user = User(
        email=email,
        name="PO Sync Tester",
        hashed_password=hash_password("managerpass123"),
        role=UserRole.manager,
        is_active=True,
    )
    await user.insert()
    return user


async def _login_token(client: AsyncClient, manager: User) -> str:
    login = await client.post(
        "/api/v1/auth/login",
        json={"email": manager.email, "password": "managerpass123"},
    )
    assert login.status_code == 200
    return login.json()["access_token"]


def _mock_request() -> MagicMock:
    req = MagicMock()
    req.headers.get.return_value = ""
    req.client.host = "127.0.0.1"
    req.state.request_id = "test-request"
    return req


def _po_payload(product_id: str, product_name: str, **overrides) -> dict:
    item = {
        "product_id": product_id,
        "product_name": product_name,
        "quantity": 2,
        "unit_cost": 10,
        "order_uom": "box",
        "base_uom": "bottle",
        "units_per_buy_uom": 6,
        "sell_uom": "bottle",
        "sell_mode": "both",
    }
    item.update(overrides)
    return {
        "supplier_id": "",
        "supplier_name": "Sync Supplier",
        "status": "draft",
        "discount": 0,
        "additional_charges": 0,
        "items": [item],
    }


@pytest.mark.asyncio
async def test_create_po_syncs_packaging_into_product(client: AsyncClient):
    sku = f"SYNC-{uuid.uuid4().hex[:6]}"
    product = Product(
        name="Packaging Item",
        sku=sku,
        barcode=sku,
        brand="T",
        country_of_origin="Nepal",
        category="Snacks",
        cost_price=10.0,
        selling_price=20.0,
        buy_uom="pcs",
        uom="pcs",
        units_per_buy_uom=1,
        sell_mode=SellMode.unit,
        is_active=True,
    )
    await product.insert()
    manager = await _manager()
    token = await _login_token(client, manager)

    res = await client.post(
        "/api/v1/purchase-orders",
        headers={"Authorization": f"Bearer {token}"},
        json=_po_payload(str(product.id), product.name),
    )
    assert res.status_code == 201, res.text

    refreshed = await Product.get(product.id)
    assert refreshed is not None
    assert refreshed.buy_uom == "box"
    assert refreshed.uom == "bottle"
    assert refreshed.units_per_buy_uom == 6
    assert refreshed.sell_mode == SellMode.both


@pytest.mark.asyncio
async def test_update_po_syncs_packaging_into_product(client: AsyncClient):
    sku = f"UPDSYNC-{uuid.uuid4().hex[:6]}"
    product = Product(
        name="Update Packaging Item",
        sku=sku,
        barcode=sku,
        brand="T",
        country_of_origin="Nepal",
        category="Snacks",
        cost_price=10.0,
        selling_price=20.0,
        buy_uom="pcs",
        uom="pcs",
        units_per_buy_uom=1,
        sell_mode=SellMode.unit,
        is_active=True,
    )
    await product.insert()
    manager = await _manager()
    token = await _login_token(client, manager)

    created = await client.post(
        "/api/v1/purchase-orders",
        headers={"Authorization": f"Bearer {token}"},
        json=_po_payload(str(product.id), product.name),
    )
    assert created.status_code == 201, created.text
    po_id = created.json()["id"]

    res = await client.patch(
        f"/api/v1/purchase-orders/{po_id}",
        headers={"Authorization": f"Bearer {token}"},
        json=_po_payload(
            str(product.id),
            product.name,
            order_uom="pack",
            sell_uom="sachet",
            units_per_buy_uom=12,
            sell_mode="piece",
        ),
    )
    assert res.status_code == 200, res.text

    refreshed = await Product.get(product.id)
    assert refreshed is not None
    assert refreshed.buy_uom == "pack"
    assert refreshed.uom == "sachet"
    assert refreshed.units_per_buy_uom == 12
    assert refreshed.sell_mode == SellMode.piece


@pytest.mark.asyncio
async def test_create_po_with_no_conversion_mirrors_buy_uom(client: AsyncClient):
    sku = f"MIRROR-{uuid.uuid4().hex[:6]}"
    product = Product(
        name="Mirror Item",
        sku=sku,
        barcode=sku,
        brand="T",
        country_of_origin="Nepal",
        category="Snacks",
        cost_price=10.0,
        selling_price=20.0,
        buy_uom="pcs",
        uom="sachet",
        units_per_buy_uom=1,
        sell_mode=SellMode.both,
        is_active=True,
    )
    await product.insert()
    manager = await _manager()
    token = await _login_token(client, manager)

    res = await client.post(
        "/api/v1/purchase-orders",
        headers={"Authorization": f"Bearer {token}"},
        json=_po_payload(
            str(product.id),
            product.name,
            order_uom="pack",
            sell_uom="sachet",
            units_per_buy_uom=1,
            sell_mode="both",
        ),
    )
    assert res.status_code == 201, res.text

    refreshed = await Product.get(product.id)
    assert refreshed is not None
    assert refreshed.buy_uom == "pack"
    assert refreshed.uom == "pack"
    assert refreshed.units_per_buy_uom == 1
    assert refreshed.sell_mode == SellMode.unit


@pytest.mark.asyncio
async def test_create_po_skips_lines_for_missing_products(client: AsyncClient):
    manager = await _manager()
    token = await _login_token(client, manager)
    res = await client.post(
        "/api/v1/purchase-orders",
        headers={"Authorization": f"Bearer {token}"},
        json=_po_payload("product-that-does-not-exist", "Ghost Item"),
    )
    assert res.status_code == 201, res.text


@pytest.mark.asyncio
async def test_receive_with_different_pack_size_updates_product_conversion():
    sku = f"RECVSYNC-{uuid.uuid4().hex[:6]}"
    product = Product(
        name="Receive Sync Item",
        sku=sku,
        barcode=sku,
        brand="T",
        country_of_origin="Nepal",
        category="Snacks",
        cost_price=10.0,
        selling_price=20.0,
        buy_uom="box",
        uom="bottle",
        units_per_buy_uom=6,
        sell_mode=SellMode.both,
        is_active=True,
    )
    await product.insert()
    po = PurchaseOrder(
        order_number=f"PO-RSYNC-{uuid.uuid4().hex[:6]}",
        supplier_id="",
        supplier_name="",
        status=POStatus.ordered,
        bill_number=f"BILL-RSYNC-{uuid.uuid4().hex[:6]}",
        bill_images=["https://example.com/bill-rsync.png"],
        items=[
            PurchaseOrderItem(
                product_id=str(product.id),
                product_name=product.name,
                quantity=2,
                unit_cost=10.0,
                order_uom="box",
                base_uom="bottle",
                units_per_buy_uom=6,
                sell_uom="bottle",
                sell_mode="both",
            )
        ],
        total_amount=20.0,
    )
    await po.insert()
    manager = await _manager()
    await receive_purchase_order_items(
        str(po.id),
        [
            PurchaseOrderReceiveItem(
                product_id=str(product.id),
                receive_quantity=2,
                units_per_buy_uom=12,
            )
        ],
        created_by=manager.name,
        current_user=manager,
        request=_mock_request(),
    )
    refreshed = await Product.get(product.id)
    assert refreshed is not None
    assert refreshed.units_per_buy_uom == 12
    assert refreshed.buy_uom == "box"
    assert refreshed.uom == "bottle"
