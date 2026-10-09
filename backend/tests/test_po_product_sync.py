"""Product UOM sync from PO lines (place order + receive)."""

from __future__ import annotations

import uuid

import pytest

from app.auth.jwt import hash_password
from app.database import init_db
from app.models.product import Product, SellMode
from app.models.purchase_order import PurchaseOrderItem
from app.models.user import User, UserRole
from app.services.po_product_sync import sync_product_uoms_from_po_lines, uom_patch_for_receive_product


@pytest.fixture(autouse=True)
async def setup_db():
    await init_db()


async def _manager() -> User:
    email = f"po-sync-{uuid.uuid4().hex[:8]}@komart.com"
    user = User(
        email=email,
        name="PO Sync Tester",
        hashed_password=hash_password("test"),
        role=UserRole.manager,
        is_active=True,
    )
    await user.insert()
    return user


@pytest.mark.asyncio
async def test_sync_product_uoms_from_po_lines_updates_conversion():
    await _manager()
    sku = f"SYNC-{uuid.uuid4().hex[:6]}"
    product = Product(
        name="Sync Pack",
        sku=sku,
        barcode=sku,
        brand="T",
        country_of_origin="Nepal",
        category="Snacks",
        supplier_id="",
        supplier_name="",
        buy_uom="pcs",
        uom="pcs",
        units_per_buy_uom=1,
        sell_mode=SellMode.unit,
        cost_price=10.0,
        selling_price=20.0,
        pack_selling_price=200.0,
        is_active=True,
    )
    await product.insert()
    pid = str(product.id)

    n = await sync_product_uoms_from_po_lines(
        [
            PurchaseOrderItem(
                product_id=pid,
                product_name=product.name,
                quantity=5,
                unit_cost=120.0,
                order_uom="pack",
                base_uom="pcs",
                units_per_buy_uom=12,
            ),
        ],
    )
    assert n == 1

    refreshed = await Product.get(product.id)
    assert refreshed is not None
    assert refreshed.buy_uom == "pack"
    assert refreshed.uom == "pcs"
    assert refreshed.units_per_buy_uom == 12
    assert refreshed.sell_mode == SellMode.both
    # Sell prices must not be overwritten
    assert refreshed.selling_price == 20.0
    assert refreshed.pack_selling_price == 200.0


@pytest.mark.asyncio
async def test_uom_patch_for_receive_uses_override():
    product = Product(
        name="Recv Pack",
        sku=f"RCV-{uuid.uuid4().hex[:6]}",
        barcode="x",
        brand="T",
        country_of_origin="Nepal",
        category="Snacks",
        supplier_id="",
        supplier_name="",
        buy_uom="pack",
        uom="pcs",
        units_per_buy_uom=12,
        sell_mode=SellMode.both,
        cost_price=2.0,
        selling_price=25.0,
        is_active=True,
    )
    item = PurchaseOrderItem(
        product_id="x",
        product_name="Recv Pack",
        quantity=5,
        unit_cost=120.0,
        order_uom="pack",
        base_uom="pcs",
        units_per_buy_uom=12,
    )
    patch = uom_patch_for_receive_product(product, item, units_override=10)
    assert patch.get("units_per_buy_uom") == 10
    assert product.units_per_buy_uom == 10
