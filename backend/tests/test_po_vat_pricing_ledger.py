"""VAT-inclusive PO costs, line price snapshots, receive SP, and ledger batch names."""

from __future__ import annotations

import uuid
from unittest.mock import MagicMock

import pytest
from httpx import ASGITransport, AsyncClient

from app.auth.jwt import hash_password
from app.database import init_db
from app.main import app
from app.models.inventory import AdjustmentType, StockAdjustment
from app.models.product import Product
from app.models.purchase_order import POStatus, PurchaseOrder, PurchaseOrderItem, line_can_receive
from app.models.user import User, UserRole
from app.schemas.purchase_order import PurchaseOrderReceiveItem
from app.services.inventory_movements import build_movement_row
from app.services.po_pricing import apply_vat_to_items, inclusive_unit_cost
from app.services.po_receive import receive_purchase_order_items
from app.services.stock import SignedBatchMove, deduct_stock_fefo, get_current_stock, log_signed_batch_moves, receive_stock
from app.services.store_settings import get_store_settings


@pytest.fixture(autouse=True)
async def setup_db():
    await init_db()


def test_inclusive_unit_cost_adds_vat_percent():
    assert inclusive_unit_cost(100, 13) == pytest.approx(113.0)
    assert inclusive_unit_cost(80, 0) == pytest.approx(80.0)
    assert inclusive_unit_cost(0, 13) == pytest.approx(0.0)


def test_apply_vat_to_items_rewrites_unit_cost_only_when_vat_bill():
    item = PurchaseOrderItem(
        product_id="p1",
        product_name="Rice",
        quantity=2,
        unit_cost=1,
        unit_cost_before_vat=100,
        snapshot_unit_cost=90,
        selling_price=150,
        new_selling_price=160,
    )
    plain = apply_vat_to_items([item], vat_bill=False, tax_rate=13)
    assert plain[0].unit_cost == 1

    priced = apply_vat_to_items([item], vat_bill=True, tax_rate=13)
    assert priced[0].unit_cost == pytest.approx(113.0)
    assert priced[0].unit_cost_before_vat == pytest.approx(100.0)
    assert priced[0].snapshot_unit_cost == pytest.approx(90.0)
    assert priced[0].selling_price == pytest.approx(150.0)
    assert priced[0].new_selling_price == pytest.approx(160.0)


def test_line_can_receive_is_false_when_ordered_qty_is_in():
    open_line = PurchaseOrderItem(
        product_id="p",
        product_name="Open",
        quantity=4,
        unit_cost=10,
        received_quantity=1,
    )
    done = PurchaseOrderItem(
        product_id="p",
        product_name="Done",
        quantity=4,
        unit_cost=10,
        received_quantity=4,
    )
    assert line_can_receive(open_line) is True
    assert line_can_receive(done) is False


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


async def _manager() -> User:
    email = f"po-vat-{uuid.uuid4().hex[:8]}@komart.com"
    user = User(
        email=email,
        name="PO VAT Tester",
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


@pytest.mark.asyncio
async def test_create_po_persists_vat_and_snapshots(client: AsyncClient):
    settings = await get_store_settings()
    await settings.set({"tax_rate": 13.0})
    manager = await _manager()
    login = await client.post(
        "/api/v1/auth/login",
        json={"email": manager.email, "password": "managerpass123"},
    )
    assert login.status_code == 200
    token = login.json()["access_token"]

    res = await client.post(
        "/api/v1/purchase-orders",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "supplier_id": "sup-vat",
            "supplier_name": "VAT Supplier",
            "status": "draft",
            "vat_bill": True,
            "discount": 0,
            "additional_charges": 0,
            "items": [
                {
                    "product_id": "p-vat",
                    "product_name": "VAT Item",
                    "quantity": 2,
                    "unit_cost": 100,
                    "unit_cost_before_vat": 100,
                    "snapshot_unit_cost": 90,
                    "selling_price": 150,
                    "new_selling_price": 160,
                }
            ],
        },
    )
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["vat_bill"] is True
    line = body["items"][0]
    assert line["unit_cost"] == pytest.approx(113.0)
    assert line["unit_cost_before_vat"] == pytest.approx(100.0)
    assert line["snapshot_unit_cost"] == pytest.approx(90.0)
    assert line["selling_price"] == pytest.approx(150.0)
    assert line["new_selling_price"] == pytest.approx(160.0)
    assert body["total_amount"] == pytest.approx(226.0)


@pytest.mark.asyncio
async def test_receive_applies_new_selling_price_and_stores_batch_name():
    sku = f"SP-{uuid.uuid4().hex[:6]}"
    product = Product(
        name="Price Snapshot Item",
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
    await product.insert()
    po = PurchaseOrder(
        order_number=f"PO-SP-{uuid.uuid4().hex[:6]}",
        supplier_id="",
        supplier_name="",
        status=POStatus.ordered,
        items=[
            PurchaseOrderItem(
                product_id=str(product.id),
                product_name=product.name,
                quantity=2,
                unit_cost=50.0,
                selling_price=20.0,
                new_selling_price=28.0,
                snapshot_unit_cost=10.0,
            )
        ],
        total_amount=100.0,
    )
    await po.insert()
    manager = await _manager()
    await receive_purchase_order_items(
        str(po.id),
        [PurchaseOrderReceiveItem(product_id=str(product.id), receive_quantity=2)],
        created_by=manager.name,
        current_user=manager,
        request=_mock_request(),
    )
    refreshed = await Product.get(product.id)
    assert refreshed is not None
    assert refreshed.selling_price == pytest.approx(28.0)

    adj = await StockAdjustment.find(
        StockAdjustment.product_id == str(product.id),
        StockAdjustment.reference_type == "purchase_order",
    ).to_list()
    assert len(adj) == 1
    assert adj[0].batch_number.startswith("PO-")
    assert "L01" in adj[0].batch_number


@pytest.mark.asyncio
async def test_receive_rejects_already_received_line():
    sku = f"RCV-{uuid.uuid4().hex[:6]}"
    product = Product(
        name="Already In",
        sku=sku,
        barcode=sku,
        brand="T",
        country_of_origin="Nepal",
        category="Snacks",
        supplier_id="",
        supplier_name="",
        cost_price=5.0,
        selling_price=9.0,
        is_active=True,
    )
    await product.insert()
    open_sku = f"OPEN-{uuid.uuid4().hex[:6]}"
    open_product = Product(
        name="Still Open",
        sku=open_sku,
        barcode=open_sku,
        brand="T",
        country_of_origin="Nepal",
        category="Snacks",
        supplier_id="",
        supplier_name="",
        cost_price=5.0,
        selling_price=9.0,
        is_active=True,
    )
    await open_product.insert()
    po = PurchaseOrder(
        order_number=f"PO-DONE-{uuid.uuid4().hex[:6]}",
        supplier_id="",
        supplier_name="",
        status=POStatus.partial,
        items=[
            PurchaseOrderItem(
                product_id=str(product.id),
                product_name=product.name,
                quantity=3,
                unit_cost=10,
                received_quantity=3,
            ),
            PurchaseOrderItem(
                product_id=str(open_product.id),
                product_name=open_product.name,
                quantity=3,
                unit_cost=10,
                received_quantity=0,
            ),
        ],
        total_amount=60.0,
    )
    await po.insert()
    manager = await _manager()
    with pytest.raises(Exception) as exc:
        await receive_purchase_order_items(
            str(po.id),
            [PurchaseOrderReceiveItem(product_id=str(product.id), receive_quantity=1)],
            created_by=manager.name,
            current_user=manager,
            request=_mock_request(),
        )
    assert exc.value.status_code == 400
    assert "already received" in str(exc.value.detail).lower()


@pytest.mark.asyncio
async def test_sale_ledger_stores_and_displays_batch_name():
    sku = f"LED-{uuid.uuid4().hex[:6]}"
    product = Product(
        name="Ledger Batch Item",
        sku=sku,
        barcode=sku,
        brand="T",
        country_of_origin="Nepal",
        category="Snacks",
        supplier_id="",
        supplier_name="",
        cost_price=8.0,
        selling_price=12.0,
        is_active=True,
    )
    await product.insert()
    batch_name = f"SALE-{uuid.uuid4().hex[:6]}"
    batch = await receive_stock(
        str(product.id),
        batch_name,
        5,
        unit_cost=8.0,
        created_by="test",
    )
    receive_rows = await StockAdjustment.find(
        StockAdjustment.product_id == str(product.id),
        StockAdjustment.type == AdjustmentType.receive,
    ).to_list()
    assert any(row.batch_number == batch_name for row in receive_rows)

    stock_before = await get_current_stock(str(product.id))
    deductions = await deduct_stock_fefo(str(product.id), 1)
    assert deductions[0].batch_number == batch_name
    await log_signed_batch_moves(
        product=product,
        moves=[
            SignedBatchMove(
                batch_id=d.batch_id,
                quantity=-d.quantity,
                unit_cost=d.unit_cost,
                batch_number=d.batch_number,
            )
            for d in deductions
        ],
        stock_before=stock_before,
        adjustment_type=AdjustmentType.sale,
        reason="Sale test",
        created_by="test",
        reference_type="sale",
        reference_id="txn-test",
        unit_selling_price=12.0,
    )
    sale_rows = await StockAdjustment.find(
        StockAdjustment.product_id == str(product.id),
        StockAdjustment.type == AdjustmentType.sale,
    ).to_list()
    assert len(sale_rows) == 1
    assert sale_rows[0].batch_number == batch_name

    presented = await build_movement_row(sale_rows[0])
    assert presented["batch_number"] == batch_name
    assert presented["reference_type"] == "sale"

    legacy = StockAdjustment(
        product_id=str(product.id),
        product_name=product.name,
        product_sku=product.sku,
        batch_id=str(batch.id),
        type=AdjustmentType.sale,
        quantity=-1,
        stock_before=4,
        stock_after=3,
        reason="legacy",
        created_by="test",
        reference_type="sale",
        reference_id="txn-legacy",
    )
    looked_up = await build_movement_row(
        legacy,
        batch_numbers={str(batch.id): batch.batch_number},
    )
    assert looked_up["batch_number"] == batch_name
