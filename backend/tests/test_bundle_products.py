"""Bundle (combo) products: derived stock, component deduction, exclusions."""

from __future__ import annotations

import uuid

import pytest
from fastapi import HTTPException
from httpx import ASGITransport, AsyncClient

from app.auth.jwt import hash_password
from app.database import init_db
from app.main import app
from app.models.inventory import AdjustmentType, InventoryBatch, StockAdjustment
from app.models.product import BundleComponent, Product, ProductStatus
from app.models.transaction import PaymentMethod, Transaction
from app.models.user import User, UserRole
from app.schemas.transaction import TransactionCreate
from app.schemas.transaction import TransactionItem as SaleLine
from app.services.bundles import bundle_available, derived_stock_for, expand_bundle
from app.services.sales import record_sale, void_sale
from app.services.stock import get_current_stock, receive_stock


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
    email = f"bundle-manager-{uuid.uuid4().hex[:6]}@komart.com"
    existing = await User.find_one(User.email == email)
    if existing:
        await existing.delete()
    user = User(
        email=email,
        name="Bundle Manager",
        hashed_password=hash_password("managerpass123"),
        role=UserRole.manager,
        is_active=True,
    )
    await user.insert()
    yield user
    await user.delete()


@pytest.fixture
async def manager_token(client: AsyncClient, manager_user: User):
    resp = await client.post(
        "/api/v1/auth/login",
        json={"email": manager_user.email, "password": "managerpass123"},
    )
    assert resp.status_code == 200
    return resp.json()["access_token"]


@pytest.fixture
async def admin_user():
    email = f"bundle-admin-{uuid.uuid4().hex[:6]}@komart.com"
    existing = await User.find_one(User.email == email)
    if existing:
        await existing.delete()
    user = User(
        email=email,
        name="Bundle Admin",
        hashed_password=hash_password("adminpass123"),
        role=UserRole.admin,
        is_active=True,
    )
    await user.insert()
    yield user
    await user.delete()


@pytest.fixture
async def admin_token(client: AsyncClient, admin_user: User):
    resp = await client.post(
        "/api/v1/auth/login",
        json={"email": admin_user.email, "password": "adminpass123"},
    )
    assert resp.status_code == 200
    return resp.json()["access_token"]


async def _make_component(name: str, stock: int, cost: float) -> tuple[Product, str]:
    sku = f"BND-{uuid.uuid4().hex[:8]}"
    product = Product(
        name=name,
        sku=sku,
        barcode=sku,
        brand="Test",
        country_of_origin="Nepal",
        category="Snacks",
        supplier_id="sup-1",
        supplier_name="Supplier",
        cost_price=cost,
        selling_price=cost * 2,
        low_stock_threshold=2,
        status=ProductStatus.active,
        is_active=True,
    )
    await product.insert()
    batch = None
    if stock:
        batch = await receive_stock(
            str(product.id), f"BND-B-{uuid.uuid4().hex[:6]}", stock,
            unit_cost=cost, created_by="Test",
        )
    return product, str(batch.id) if batch else ""


async def _cleanup(products: list[Product]) -> None:
    pids = [str(p.id) for p in products]
    for batch in await InventoryBatch.find({"product_id": {"$in": pids}}).to_list():
        await batch.delete()
    for adj in await StockAdjustment.find({"product_id": {"$in": pids}}).to_list():
        await adj.delete()
    for txn in await Transaction.find({"items.product_id": {"$in": pids}}).to_list():
        await txn.delete()
    for product in products:
        await product.delete()


def _bundle_product(name: str, components: list[BundleComponent], price: float) -> Product:
    sku = f"BND-COMBO-{uuid.uuid4().hex[:8]}"
    return Product(
        name=name,
        sku=sku,
        barcode=sku,
        brand="Test",
        country_of_origin="Nepal",
        category="Snacks",
        supplier_id="sup-1",
        supplier_name="Supplier",
        cost_price=0.0,
        selling_price=price,
        pack_selling_price=0.0,
        units_per_buy_uom=1,
        low_stock_threshold=1,
        status=ProductStatus.active,
        is_active=True,
        is_bundle=True,
        bundle_components=components,
    )


@pytest.mark.asyncio
async def test_bundle_available_is_limiting_component():
    a, _ = await _make_component("Bundle A", 10, 5.0)
    b, _ = await _make_component("Bundle B", 7, 8.0)
    try:
        stock_map = {str(a.id): 10, str(b.id): 7}
        components = [
            BundleComponent(product_id=str(a.id), quantity=2),
            BundleComponent(product_id=str(b.id), quantity=3),
        ]
        # a: 10 // 2 = 5, b: 7 // 3 = 2 -> 2
        assert bundle_available(components, stock_map) == 2
        assert bundle_available(components, {str(a.id): 10, str(b.id): 2}) == 0
    finally:
        await _cleanup([a, b])


@pytest.mark.asyncio
async def test_expand_bundle_merges_duplicate_components():
    a, _ = await _make_component("Dup A", 100, 1.0)
    try:
        product = _bundle_product(
            "Dup Combo",
            [
                BundleComponent(product_id=str(a.id), quantity=2),
                BundleComponent(product_id=str(a.id), quantity=3),
            ],
            50.0,
        )
        assert expand_bundle(product, 2) == [(str(a.id), 10)]
    finally:
        await _cleanup([a])


@pytest.mark.asyncio
async def test_bundle_stock_is_derived_from_components():
    a, _ = await _make_component("Derived A", 9, 5.0)
    b, _ = await _make_component("Derived B", 4, 6.0)
    bundle = _bundle_product(
        "Derived Combo",
        [
            BundleComponent(product_id=str(a.id), quantity=2),
            BundleComponent(product_id=str(b.id), quantity=2),
        ],
        99.0,
    )
    await bundle.insert()
    try:
        # a: 9 // 2 = 4, b: 4 // 2 = 2 -> 2
        assert await derived_stock_for(bundle) == 2
        # The bundle itself holds no stock of its own.
        assert await get_current_stock(str(bundle.id)) == 0
    finally:
        await _cleanup([a, b, bundle])


@pytest.mark.asyncio
async def test_selling_bundle_deducts_components_and_keeps_revenue_on_bundle():
    a, _ = await _make_component("Sale A", 10, 5.0)
    b, _ = await _make_component("Sale B", 10, 7.0)
    bundle = _bundle_product(
        "Sale Combo",
        [
            BundleComponent(product_id=str(a.id), quantity=2),
            BundleComponent(product_id=str(b.id), quantity=1),
        ],
        30.0,
    )
    await bundle.insert()
    try:
        result = await record_sale(
            TransactionCreate(
                customer_name="Walk-In",
                items=[SaleLine(
                    product_id=str(bundle.id),
                    name=bundle.name,
                    sku=bundle.sku,
                    price=30.0,
                    quantity=2,
                )],
                subtotal=60.0,
                tax=0.0,
                total=60.0,
                payment_method=PaymentMethod.cash,
                created_by="Tester",
            ),
            cashier_id="test",
        )

        # 2 bundles x 2 of A and 1 of B
        assert await get_current_stock(str(a.id)) == 6
        assert await get_current_stock(str(b.id)) == 8

        line = result.items[0]
        assert line.product_id == str(bundle.id)
        assert line.price == pytest.approx(30.0, rel=1e-3)
        # Weighted component cost: (2*5 + 1*7) = 17
        assert line.unit_cost == pytest.approx(17.0, rel=1e-3)

        alloc_products = {alloc.product_id for alloc in line.batch_allocations}
        assert alloc_products == {str(a.id), str(b.id)}
        assert all(alloc.product_id for alloc in line.batch_allocations)

        # Component movements must not double-count the bundle's sale value.
        sale_adjustments = await StockAdjustment.find(
            StockAdjustment.transaction_id == result.id,
            StockAdjustment.type == AdjustmentType.sale,
        ).to_list()
        assert len(sale_adjustments) == 2
        assert all(adj.unit_selling_price == 0.0 for adj in sale_adjustments)
        assert {adj.product_id for adj in sale_adjustments} == {str(a.id), str(b.id)}
    finally:
        await _cleanup([a, b, bundle])


@pytest.mark.asyncio
async def test_bundle_sale_fails_when_component_short():
    a, _ = await _make_component("Short A", 3, 5.0)
    b, _ = await _make_component("Short B", 20, 5.0)
    bundle = _bundle_product(
        "Short Combo",
        [
            BundleComponent(product_id=str(a.id), quantity=2),
            BundleComponent(product_id=str(b.id), quantity=1),
        ],
        25.0,
    )
    await bundle.insert()
    try:
        with pytest.raises(HTTPException):
            await record_sale(
                TransactionCreate(
                    customer_name="Walk-In",
                    items=[SaleLine(
                        product_id=str(bundle.id),
                        name=bundle.name,
                        sku=bundle.sku,
                        price=25.0,
                        quantity=2,
                    )],
                    subtotal=50.0,
                    tax=0.0,
                    total=50.0,
                    payment_method=PaymentMethod.cash,
                    created_by="Tester",
                ),
                cashier_id="test",
            )
        assert await get_current_stock(str(a.id)) == 3
        assert await get_current_stock(str(b.id)) == 20
    finally:
        await _cleanup([a, b, bundle])


@pytest.mark.asyncio
async def test_voiding_bundle_sale_restores_components():
    a, _ = await _make_component("Void A", 10, 5.0)
    b, _ = await _make_component("Void B", 10, 5.0)
    bundle = _bundle_product(
        "Void Combo",
        [
            BundleComponent(product_id=str(a.id), quantity=2),
            BundleComponent(product_id=str(b.id), quantity=1),
        ],
        30.0,
    )
    await bundle.insert()
    try:
        result = await record_sale(
            TransactionCreate(
                customer_name="Walk-In",
                items=[SaleLine(
                    product_id=str(bundle.id),
                    name=bundle.name,
                    sku=bundle.sku,
                    price=30.0,
                    quantity=2,
                )],
                subtotal=60.0,
                tax=0.0,
                total=60.0,
                payment_method=PaymentMethod.cash,
                created_by="Tester",
            ),
            cashier_id="test",
        )
        assert await get_current_stock(str(a.id)) == 6
        await void_sale(result.id, "Customer changed mind", "Manager")
        assert await get_current_stock(str(a.id)) == 10
        assert await get_current_stock(str(b.id)) == 10
    finally:
        await _cleanup([a, b, bundle])


@pytest.mark.asyncio
async def test_create_bundle_product_rejects_single_component(client, manager_token):
    a, _ = await _make_component("Single A", 5, 5.0)
    try:
        resp = await client.post(
            "/api/v1/products",
            json={
                "name": f"One Item Combo {uuid.uuid4().hex[:6]}",
                "sku": f"BND-ONE-{uuid.uuid4().hex[:8]}",
                "brand": "Test",
                "country_of_origin": "Nepal",
                "category": "Snacks",
                "buy_uom": "pcs",
                "uom": "pcs",
                "cost_price": 0.0,
                "selling_price": 10.0,
                "images": [],
                "is_bundle": True,
                "bundle_components": [
                    {"product_id": str(a.id), "quantity": 1},
                ],
            },
            headers={"Authorization": f"Bearer {manager_token}"},
        )
        assert resp.status_code == 422
    finally:
        await _cleanup([a])


@pytest.mark.asyncio
async def test_create_bundle_product_rejects_nested_bundle(client, manager_token):
    a, _ = await _make_component("Nested A", 5, 5.0)
    b, _ = await _make_component("Nested B", 5, 5.0)
    inner = _bundle_product(
        f"Inner Combo {uuid.uuid4().hex[:6]}",
        [
            BundleComponent(product_id=str(a.id), quantity=1),
            BundleComponent(product_id=str(b.id), quantity=1),
        ],
        20.0,
    )
    await inner.insert()
    try:
        resp = await client.post(
            "/api/v1/products",
            json={
                "name": f"Outer Combo {uuid.uuid4().hex[:6]}",
                "sku": f"BND-OUT-{uuid.uuid4().hex[:8]}",
                "brand": "Test",
                "country_of_origin": "Nepal",
                "category": "Snacks",
                "buy_uom": "pcs",
                "uom": "pcs",
                "cost_price": 0.0,
                "selling_price": 40.0,
                "images": [],
                "is_bundle": True,
                "bundle_components": [
                    {"product_id": str(a.id), "quantity": 1},
                    {"product_id": str(inner.id), "quantity": 1},
                ],
            },
            headers={"Authorization": f"Bearer {manager_token}"},
        )
        assert resp.status_code == 400, resp.text
        assert "nested" in resp.text.lower()
    finally:
        await _cleanup([a, b, inner])


@pytest.mark.asyncio
async def test_create_bundle_product_normalizes_sell_fields_and_description(client, manager_token):
    a, _ = await _make_component("Described A", 5, 5.0)
    b, _ = await _make_component("Described B", 5, 7.0)
    try:
        resp = await client.post(
            "/api/v1/products",
            json={
                "name": f"Described Combo {uuid.uuid4().hex[:6]}",
                "sku": f"BND-DESC-{uuid.uuid4().hex[:8]}",
                "brand": "Test",
                "country_of_origin": "Nepal",
                "category": "Snacks",
                "buy_uom": "pack",
                "uom": "pcs",
                "units_per_buy_uom": 6,
                "sell_mode": "both",
                "cost_price": 0.0,
                "selling_price": 40.0,
                "pack_selling_price": 240.0,
                "images": [],
                "is_bundle": True,
                "bundle_components": [
                    {"product_id": str(a.id), "quantity": 2},
                    {"product_id": str(b.id), "quantity": 1},
                ],
            },
            headers={"Authorization": f"Bearer {manager_token}"},
        )
        assert resp.status_code == 201, resp.text
        data = resp.json()
        assert data["units_per_buy_uom"] == 1
        assert data["sell_mode"] == "unit"
        assert data["pack_selling_price"] == 0.0
        assert "2 x Described A" in data["description"]
        assert "1 x Described B" in data["description"]
        assert data["stock"] == 2

        stored = await Product.get(data["id"])
        if stored:
            await stored.delete()
    finally:
        await _cleanup([a, b])


@pytest.mark.asyncio
async def test_inventory_list_excludes_bundles(client, manager_token):
    a, _ = await _make_component("Hidden A", 5, 5.0)
    b, _ = await _make_component("Hidden B", 5, 5.0)
    bundle = _bundle_product(
        f"Hidden Combo {uuid.uuid4().hex[:6]}",
        [
            BundleComponent(product_id=str(a.id), quantity=1),
            BundleComponent(product_id=str(b.id), quantity=1),
        ],
        15.0,
    )
    await bundle.insert()
    try:
        resp = await client.get(
            "/api/v1/inventory?page_size=500",
            headers={"Authorization": f"Bearer {manager_token}"},
        )
        assert resp.status_code == 200
        ids = {row["id"] for row in resp.json()["data"]}
        assert str(bundle.id) not in ids
        assert str(a.id) in ids
    finally:
        await _cleanup([a, b, bundle])


@pytest.mark.asyncio
async def test_bundle_cannot_be_adjusted_or_purchased(client, admin_token, manager_token):
    a, _ = await _make_component("Adjust A", 5, 5.0)
    b, _ = await _make_component("Adjust B", 5, 5.0)
    bundle = _bundle_product(
        f"Adjust Combo {uuid.uuid4().hex[:6]}",
        [
            BundleComponent(product_id=str(a.id), quantity=1),
            BundleComponent(product_id=str(b.id), quantity=1),
        ],
        15.0,
    )
    await bundle.insert()
    bundle_id = str(bundle.id)
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    manager_headers = {"Authorization": f"Bearer {manager_token}"}
    try:
        adjust = await client.post(
            "/api/v1/inventory/adjust",
            json={"product_id": bundle_id, "quantity": 5, "type": "correction", "reason": "test"},
            headers=admin_headers,
        )
        assert adjust.status_code == 400
        assert "combo" in adjust.text.lower()

        po = await client.post(
            "/api/v1/purchase-orders",
            json={
                "supplier_id": "sup-1",
                "supplier_name": "Supplier",
                "items": [
                    {
                        "product_id": bundle_id,
                        "product_name": bundle.name,
                        "quantity": 1,
                        "unit_cost": 10.0,
                    }
                ],
                "total_amount": 10.0,
                "status": "draft",
            },
            headers=manager_headers,
        )
        assert po.status_code == 400
        assert "combo" in po.text.lower()
    finally:
        await _cleanup([a, b, bundle])