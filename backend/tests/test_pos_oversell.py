"""POS sale must reject quantities above on-hand stock before any ledger write."""

from __future__ import annotations

import uuid

import pytest
from fastapi import HTTPException
from httpx import ASGITransport, AsyncClient

from app.auth.jwt import hash_password
from app.database import init_db
from app.main import app
from app.models.inventory import InventoryBatch, StockAdjustment
from app.models.product import Product, ProductStatus, SellMode
from app.models.transaction import PaymentMethod, Transaction
from app.models.user import User, UserRole
from app.schemas.transaction import TransactionCreate, TransactionItem
from app.services.sales import record_sale
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
async def cashier_user():
    email = f"oversell-{uuid.uuid4().hex[:8]}@komart.com"
    user = User(
        email=email,
        name="Oversell Cashier",
        hashed_password=hash_password("cashierpass123"),
        role=UserRole.cashier,
        is_active=True,
    )
    await user.insert()
    yield user
    await user.delete()


def _sale_body(
    product: Product,
    qty: int,
    *,
    sell_uom: str = "",
    unit_factor: int = 1,
    price: float | None = None,
) -> TransactionCreate:
    unit_price = product.selling_price if price is None else price
    return TransactionCreate(
        items=[
            TransactionItem(
                product_id=str(product.id),
                name=product.name,
                sku=product.sku,
                price=unit_price,
                quantity=qty,
                discount=0.0,
                sell_uom=sell_uom,
                unit_factor=unit_factor,
            )
        ],
        subtotal=unit_price * qty,
        discount=0.0,
        tax=0.0,
        total=unit_price * qty,
        payment_method=PaymentMethod.cash,
        created_by="test",
    )


async def _product(
    *,
    stock: int,
    units_per_buy_uom: int = 1,
    sell_mode: SellMode = SellMode.piece,
    pack_selling_price: float = 0.0,
) -> Product:
    sku = f"OVS-{uuid.uuid4().hex[:6]}"
    product = Product(
        name=f"Oversell {sku}",
        sku=sku,
        barcode=sku,
        brand="Test",
        country_of_origin="Nepal",
        category="Snacks",
        supplier_id="sup-1",
        supplier_name="Supplier",
        cost_price=10.0,
        selling_price=20.0,
        pack_selling_price=pack_selling_price,
        buy_uom="pack" if units_per_buy_uom > 1 else "pcs",
        uom="pcs",
        units_per_buy_uom=units_per_buy_uom,
        sell_mode=sell_mode,
        low_stock_threshold=1,
        status=ProductStatus.active,
        is_active=True,
    )
    await product.insert()
    await receive_stock(str(product.id), f"B-{sku}", stock, unit_cost=10.0, created_by="test")
    return product


async def _cleanup(product: Product):
    pid = str(product.id)
    for txn in await Transaction.find({"items.product_id": pid}).to_list():
        await txn.delete()
    for batch in await InventoryBatch.find(InventoryBatch.product_id == pid).to_list():
        await batch.delete()
    for row in await StockAdjustment.find(StockAdjustment.product_id == pid).to_list():
        await row.delete()
    await product.delete()


@pytest.mark.asyncio
async def test_sale_rejects_quantity_above_on_hand_and_allows_exact_stock():
    product = await _product(stock=10)
    try:
        with pytest.raises(HTTPException) as exc:
            await record_sale(
                _sale_body(product, 11),
                cashier_id="c1",
                apply_loyalty=False,
                skip_server_pricing=True,
            )
        assert exc.value.status_code == 400
        assert "Insufficient stock" in str(exc.value.detail)
        assert "Available: 10" in str(exc.value.detail)
        assert "requested: 11" in str(exc.value.detail)
        assert await get_current_stock(str(product.id)) == 10

        txn = await record_sale(
            _sale_body(product, 10),
            cashier_id="c1",
            apply_loyalty=False,
            skip_server_pricing=True,
        )
        assert txn.total == 200.0
        assert await get_current_stock(str(product.id)) == 0
    finally:
        await _cleanup(product)


@pytest.mark.asyncio
async def test_sale_rejects_split_lines_that_together_exceed_stock():
    product = await _product(
        stock=10,
        units_per_buy_uom=6,
        sell_mode=SellMode.both,
        pack_selling_price=100.0,
    )
    pid = str(product.id)
    try:
        body = TransactionCreate(
            items=[
                TransactionItem(
                    product_id=pid,
                    name=product.name,
                    sku=product.sku,
                    price=20.0,
                    quantity=6,
                    discount=0.0,
                    sell_uom="pcs",
                    unit_factor=1,
                ),
                TransactionItem(
                    product_id=pid,
                    name=product.name,
                    sku=product.sku,
                    price=100.0,
                    quantity=1,
                    discount=0.0,
                    sell_uom="pack",
                    unit_factor=6,
                ),
            ],
            subtotal=220.0,
            discount=0.0,
            tax=0.0,
            total=220.0,
            payment_method=PaymentMethod.cash,
            created_by="test",
        )
        with pytest.raises(HTTPException) as exc:
            await record_sale(body, cashier_id="c1", apply_loyalty=False, skip_server_pricing=True)
        assert exc.value.status_code == 400
        assert "Insufficient stock" in str(exc.value.detail)
        assert "requested: 12" in str(exc.value.detail)
        assert await get_current_stock(pid) == 10
        assert await Transaction.find({"items.product_id": pid}).count() == 0
    finally:
        await _cleanup(product)


@pytest.mark.asyncio
async def test_sale_rejects_pack_oversell_even_if_client_sends_unit_factor_one():
    """Server pricing rewrites pack factor, so a forged factor cannot bypass the cap."""
    product = await _product(
        stock=10,
        units_per_buy_uom=6,
        sell_mode=SellMode.both,
        pack_selling_price=100.0,
    )
    try:
        with pytest.raises(HTTPException) as exc:
            await record_sale(
                _sale_body(product, 2, sell_uom="pack", unit_factor=1, price=1.0),
                cashier_id="c1",
                apply_loyalty=False,
                skip_server_pricing=False,
            )
        assert exc.value.status_code == 400
        detail = str(exc.value.detail)
        assert "Insufficient stock" in detail
        assert "requested: 12" in detail
        assert await get_current_stock(str(product.id)) == 10
    finally:
        await _cleanup(product)


@pytest.mark.asyncio
async def test_transactions_api_rejects_oversell(
    client: AsyncClient,
    cashier_user: User,
):
    product = await _product(stock=10)
    token = await _login(client, cashier_user.email, "cashierpass123")
    headers = {"Authorization": f"Bearer {token}"}
    try:
        over = await client.post(
            "/api/v1/transactions",
            json=_payload(product, 11),
            headers=headers,
        )
        assert over.status_code == 400
        assert "Insufficient stock" in over.json()["detail"]
        assert await get_current_stock(str(product.id)) == 10

        exact = await client.post(
            "/api/v1/transactions",
            json=_payload(product, 10),
            headers=headers,
        )
        assert exact.status_code == 201
        assert exact.json()["total"] == 200.0
        assert await get_current_stock(str(product.id)) == 0
    finally:
        await _cleanup(product)


def _payload(product: Product, qty: int) -> dict:
    return {
        "customer_name": "Walk-in",
        "items": [
            {
                "product_id": str(product.id),
                "name": product.name,
                "sku": product.sku,
                "quantity": qty,
                "price": product.selling_price,
                "discount": 0,
            }
        ],
        "subtotal": product.selling_price * qty,
        "discount": 0,
        "tax": 0,
        "loyalty_points_redeemed": 0,
        "total": product.selling_price * qty,
        "payment_method": "cash",
        "created_by": "test",
    }


async def _login(client: AsyncClient, email: str, password: str) -> str:
    res = await client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert res.status_code == 200
    return res.json()["access_token"]
