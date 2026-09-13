"""Inventory movement ledger API tests."""

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.database import init_db
from app.models.user import User, UserRole
from app.models.product import Product
from app.models.inventory import AdjustmentType, InventoryBatch, StockAdjustment
from app.auth.jwt import hash_password
from app.services.stock import adjust_stock, receive_stock


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
    email = "ledger-manager@komart.com"
    existing = await User.find_one(User.email == email)
    if existing:
        await existing.delete()
    user = User(
        email=email,
        name="Ledger Manager",
        hashed_password=hash_password("managerpass123"),
        role=UserRole.manager,
        is_active=True,
    )
    await user.insert()
    yield user
    await user.delete()


@pytest.fixture
async def sample_movement(manager_user: User):
    product = Product(
        name="Ledger Test Product",
        sku="LEDGER-SKU-001",
        barcode="LEDGER-BAR-001",
        brand="Test",
        country_of_origin="Nepal",
        category="Snacks",
        supplier_id="sup-1",
        supplier_name="Supplier",
        cost_price=10.0,
        selling_price=20.0,
        is_active=True,
    )
    await product.insert()
    entry = StockAdjustment(
        product_id=str(product.id),
        product_name=product.name,
        product_sku=product.sku,
        type=AdjustmentType.receive,
        quantity=5,
        stock_before=0,
        stock_after=5,
        reason="Test receive",
        created_by=manager_user.name,
        reference_type="receive",
        reference_id="batch-test",
    )
    await entry.insert()
    yield entry, product
    await entry.delete()
    await product.delete()


async def _login(client: AsyncClient, email: str, password: str) -> str:
    res = await client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert res.status_code == 200
    return res.json()["access_token"]


@pytest.mark.asyncio
async def test_list_movements(client: AsyncClient, manager_user: User, sample_movement):
    entry, _ = sample_movement
    token = await _login(client, manager_user.email, "managerpass123")
    res = await client.get(
        "/api/v1/inventory/movements",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["total"] >= 1
    row = next(r for r in body["data"] if r["id"] == str(entry.id))
    assert row["direction"] == "in"
    assert row["product_sku"] == "LEDGER-SKU-001"
    assert row["movement_label"] == "Stock In"


@pytest.mark.asyncio
async def test_movement_summary(client: AsyncClient, manager_user: User, sample_movement):
    token = await _login(client, manager_user.email, "managerpass123")
    res = await client.get(
        "/api/v1/inventory/movements/summary",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["movement_count"] >= 1
    assert body["total_in"] >= 5


@pytest.mark.asyncio
async def test_filter_movements_by_direction_out(
    client: AsyncClient,
    manager_user: User,
    sample_movement,
):
    entry, product = sample_movement
    sale = StockAdjustment(
        product_id=str(product.id),
        product_name=product.name,
        product_sku=product.sku,
        type=AdjustmentType.sale,
        quantity=-2,
        stock_before=5,
        stock_after=3,
        reason="Test sale",
        created_by=manager_user.name,
        reference_type="sale",
        reference_id="txn-test",
    )
    await sale.insert()
    try:
        token = await _login(client, manager_user.email, "managerpass123")
        res = await client.get(
            "/api/v1/inventory/movements",
            params={"direction": "out"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res.status_code == 200
        assert all(r["direction"] == "out" for r in res.json()["data"])
    finally:
        await sale.delete()


@pytest.mark.asyncio
async def test_void_movement_label(
    client: AsyncClient,
    manager_user: User,
    sample_movement,
):
    _, product = sample_movement
    pid = str(product.id)
    void_row = StockAdjustment(
        product_id=pid,
        product_name=product.name,
        product_sku=product.sku,
        type=AdjustmentType.void,
        quantity=2,
        stock_before=3,
        stock_after=5,
        reason="Void TXN-TEST",
        created_by=manager_user.name,
        reference_type="sale",
        reference_id="txn-void",
    )
    await void_row.insert()
    try:
        token = await _login(client, manager_user.email, "managerpass123")
        res = await client.get(
            "/api/v1/inventory/movements",
            params={"product_id": pid, "movement_type": "void"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res.status_code == 200
        row = next(r for r in res.json()["data"] if r["id"] == str(void_row.id))
        assert row["movement_label"] == "Sale void"
        assert row["direction"] == "in"
        assert row["reference_type"] == "sale"
    finally:
        await void_row.delete()


@pytest.mark.asyncio
async def test_movement_reference_shows_batch_number(
    client: AsyncClient,
    manager_user: User,
    sample_movement,
):
    _, product = sample_movement
    pid = str(product.id)
    batch = await receive_stock(pid, "CORR-BATCH-01", 10, unit_cost=10.0, created_by="test")
    await adjust_stock(
        pid,
        -3,
        AdjustmentType.correction,
        "count fix",
        manager_user.name,
        batch_id=str(batch.id),
    )

    token = await _login(client, manager_user.email, "managerpass123")
    res = await client.get(
        "/api/v1/inventory/movements",
        params={"product_id": pid},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 200
    rows = res.json()["data"]
    receive_row = next(r for r in rows if r["type"] == "receive" and r["quantity"] == 10)
    correction_row = next(r for r in rows if r["type"] == "correction")
    assert receive_row["reference_label"] == "CORR-BATCH-01"
    assert correction_row["reference_label"] == "CORR-BATCH-01"

    for leftover in await InventoryBatch.find(InventoryBatch.product_id == pid).to_list():
        await leftover.delete()
    for leftover in await StockAdjustment.find(StockAdjustment.product_id == pid).to_list():
        if leftover.type != AdjustmentType.receive or leftover.reason != "Test receive":
            await leftover.delete()


@pytest.mark.asyncio
async def test_movement_summary_rollforward_matches_on_hand(
    client: AsyncClient,
    manager_user: User,
    sample_movement,
):
    _, product = sample_movement
    pid = str(product.id)
    await receive_stock(pid, "RF-A", 20, unit_cost=10.0, created_by="test")
    await receive_stock(pid, "RF-B", 10, unit_cost=10.0, created_by="test")
    await adjust_stock(pid, -4, AdjustmentType.correction, "count", manager_user.name)

    token = await _login(client, manager_user.email, "managerpass123")
    res = await client.get(
        "/api/v1/inventory/movements/summary",
        params={"product_id": pid},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["opening_stock"] == 0
    assert body["opening_stock"] + body["period_in"] - body["period_out"] == body["closing_stock"]
    assert "on_hand" in body


@pytest.mark.asyncio
async def test_opening_uses_first_ledger_before_not_batch_qty(
    client: AsyncClient,
    manager_user: User,
):
    """Leftover batch units must not invent an opening balance."""
    from datetime import datetime, timezone
    from app.models.product import ProductStatus

    product = Product(
        name="Chic-like",
        sku="CHIC-OPEN-1",
        barcode="CHIC-OPEN-1",
        brand="Test",
        country_of_origin="Nepal",
        category="Snacks",
        supplier_id="sup-1",
        supplier_name="Supplier",
        cost_price=10.0,
        selling_price=20.0,
        status=ProductStatus.active,
        is_active=True,
    )
    await product.insert()
    pid = str(product.id)
    await receive_stock(pid, "GHOST", 2, unit_cost=10.0, created_by="seed")
    ghost = await StockAdjustment.find_one(
        StockAdjustment.product_id == pid,
        StockAdjustment.type == AdjustmentType.receive,
    )
    if ghost:
        await ghost.delete()

    day = datetime(2026, 8, 8, 11, 15, tzinfo=timezone.utc)
    await StockAdjustment(
        product_id=pid,
        product_name=product.name,
        product_sku=product.sku,
        type=AdjustmentType.adjustment,
        quantity=24,
        stock_before=0,
        stock_after=24,
        reason="counted",
        created_by=manager_user.name,
        created_at=day,
        reference_type="adjustment",
        reference_id="",
    ).insert()

    token = await _login(client, manager_user.email, "managerpass123")
    res = await client.get(
        "/api/v1/inventory/movements/summary",
        params={"product_id": pid, "start_date": "2026-06-13", "end_date": "2026-09-13"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["opening_stock"] == 0
    assert body["period_in"] == 24
    assert body["closing_stock"] == 24

    for leftover in await InventoryBatch.find(InventoryBatch.product_id == pid).to_list():
        await leftover.delete()
    for leftover in await StockAdjustment.find(StockAdjustment.product_id == pid).to_list():
        await leftover.delete()
    await product.delete()

    for leftover in await InventoryBatch.find(InventoryBatch.product_id == pid).to_list():
        await leftover.delete()
    for leftover in await StockAdjustment.find(StockAdjustment.product_id == pid).to_list():
        if leftover.reason != "Test receive":
            await leftover.delete()

