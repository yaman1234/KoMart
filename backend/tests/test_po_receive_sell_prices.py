"""PO receive updates product sell_mode and sell prices."""

from __future__ import annotations

import uuid
from unittest.mock import MagicMock

import pytest

from app.auth.jwt import hash_password
from app.database import init_db
from app.models.product import Product, SellMode
from app.models.purchase_order import POStatus, PurchaseOrder, PurchaseOrderItem
from app.models.user import User, UserRole
from app.schemas.purchase_order import PurchaseOrderReceiveItem
from app.services.po_receive import receive_purchase_order_items


def _mock_request() -> MagicMock:
    req = MagicMock()
    req.headers.get.return_value = ""
    req.client.host = "127.0.0.1"
    req.state.request_id = "test-request"
    return req


@pytest.fixture(autouse=True)
async def setup_db():
    await init_db()


async def _manager() -> User:
    email = f"po-sell-{uuid.uuid4().hex[:8]}@komart.com"
    user = User(
        email=email,
        name="PO Sell Tester",
        hashed_password=hash_password("test"),
        role=UserRole.manager,
        is_active=True,
    )
    await user.insert()
    return user


@pytest.mark.asyncio
async def test_po_receive_updates_product_sell_mode_and_prices():
    user = await _manager()
    sku = f"SELL-{uuid.uuid4().hex[:6]}"
    product = Product(
        name="Sell Pack Item",
        sku=sku,
        barcode=sku,
        brand="T",
        country_of_origin="Nepal",
        category="Snacks",
        supplier_id="",
        supplier_name="",
        buy_uom="pack",
        uom="pcs",
        units_per_buy_uom=12,
        sell_mode=SellMode.unit,
        cost_price=2.0,
        selling_price=25.0,
        pack_selling_price=280.0,
        is_active=True,
    )
    await product.insert()

    po = PurchaseOrder(
        order_number=f"PO-SELL-{uuid.uuid4().hex[:6]}",
        supplier_id="",
        supplier_name="",
        status=POStatus.ordered,
        items=[
            PurchaseOrderItem(
                product_id=str(product.id),
                product_name=product.name,
                quantity=5,
                unit_cost=120.0,
                received_quantity=0,
                order_uom="pack",
                base_uom="pcs",
                units_per_buy_uom=12,
            ),
        ],
        subtotal=600.0,
        total_amount=600.0,
    )
    await po.insert()

    await receive_purchase_order_items(
        str(po.id),
        [
            PurchaseOrderReceiveItem(
                product_id=str(product.id),
                receive_quantity=2,
                units_per_buy_uom=12,
                sell_mode="both",
                selling_price=30.0,
                pack_selling_price=340.0,
            ),
        ],
        created_by=user.name,
        current_user=user,
        request=_mock_request(),
    )

    refreshed = await Product.get(product.id)
    assert refreshed is not None
    assert refreshed.sell_mode == SellMode.both
    assert refreshed.selling_price == 30.0
    assert refreshed.pack_selling_price == 340.0
    assert refreshed.units_per_buy_uom == 12
    assert refreshed.buy_uom == "pack"
    # Landed cost per piece = 120/12 = 10
    assert refreshed.cost_price == 10.0
