"""Tests for dynamic expense stats and internal product consumption."""

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.database import init_db
from app.models.user import User, UserRole
from app.models.product import Product
from app.models.inventory import InventoryBatch, StockAdjustment, AdjustmentType
from app.models.expense import Expense
from app.models.wallet_ledger import WalletLedgerEntry
from app.auth.jwt import hash_password, create_access_token


@pytest.fixture(autouse=True)
async def setup_db():
    await init_db()


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.fixture
async def manager_headers():
    email = "exp-mgr@komart.com"
    existing = await User.find_one(User.email == email)
    if existing:
        await existing.delete()
    user = User(
        email=email,
        name="Expense Manager",
        hashed_password=hash_password("pass123"),
        role=UserRole.manager,
        is_active=True,
    )
    await user.insert()
    token = create_access_token({"sub": str(user.id), "role": user.role.value})
    headers = {"Authorization": f"Bearer {token}"}
    yield headers
    await user.delete()


@pytest.mark.asyncio
async def test_expense_stats_dynamic_filtering(client: AsyncClient, manager_headers: dict):
    # Create test expenses with unique titles
    e1 = Expense(
        title="TEST_EXP_FILTER_1",
        amount=100.0,
        category="utilities",
        date="2026-05-10",
        payment_method="cash",
        is_setup_cost=False,
    )
    e2 = Expense(
        title="TEST_EXP_FILTER_2",
        amount=250.0,
        category="supplies",
        date="2026-05-15",
        payment_method="bank",
        is_setup_cost=False,
    )
    e3 = Expense(
        title="TEST_EXP_FILTER_3_SETUP",
        amount=500.0,
        category="setup_investment",
        date="2026-06-01",
        payment_method="bank",
        is_setup_cost=True,
    )
    await e1.insert()
    await e2.insert()
    await e3.insert()

    try:
        # 1. Filter by date range May 2026
        res = await client.get(
            "/api/v1/expenses/summary?start_date=2026-05-01&end_date=2026-05-31",
            headers=manager_headers,
        )
        assert res.status_code == 200
        data = res.json()
        assert data["total_expenses"] == 350.0
        assert data["operating_expenses"] == 350.0
        assert data["setup_investment"] == 0.0
        assert data["expense_count"] == 2

        # 2. Filter by category and search
        res2 = await client.get(
            "/api/v1/expenses/summary?category=utilities&search=TEST_EXP_FILTER_1",
            headers=manager_headers,
        )
        assert res2.status_code == 200
        data2 = res2.json()
        assert data2["total_expenses"] == 100.0
        assert data2["expense_count"] == 1

        # 3. Filter by setup costs and search
        res3 = await client.get(
            "/api/v1/expenses/summary?is_setup_cost=true&search=TEST_EXP_FILTER_3",
            headers=manager_headers,
        )
        assert res3.status_code == 200
        data3 = res3.json()
        assert data3["setup_investment"] == 500.0
        assert data3["expense_count"] == 1
    finally:
        await e1.delete()
        await e2.delete()
        await e3.delete()


@pytest.mark.asyncio
async def test_product_consumption_workflow(client: AsyncClient, manager_headers: dict):
    # 1. Create a product with a batch
    prod = Product(
        name="Staff Test Coffee",
        sku="TEST-STAFF-COFFEE",
        category="Beverages",
        selling_price=150.0,
        cost_price=80.0,
        stock=10,
        is_active=True,
    )
    await prod.insert()

    batch = InventoryBatch(
        product_id=str(prod.id),
        batch_number="BATCH-COFFEE-01",
        quantity=10,
        unit_cost=80.0,
    )
    await batch.insert()

    created_expense_id = None
    try:
        # 2. Record staff consumption of 3 units
        payload = {
            "items": [{"product_id": str(prod.id), "quantity": 3}],
            "staff_name": "Hari Manager",
            "category": "supplies",
            "date": "2026-10-18",
            "remarks": "Coffee for staff lounge",
        }
        res = await client.post(
            "/api/v1/expenses/product-consumption",
            json=payload,
            headers=manager_headers,
        )
        assert res.status_code == 201, res.text
        exp_data = res.json()
        created_expense_id = exp_data["id"]

        # Validate expense fields
        assert exp_data["amount"] == 240.0  # 3 * 80.0 (COGS cost price, NOT 3 * 150 retail price!)
        assert exp_data["payment_method"] == "inventory"
        assert exp_data["paid_to"] == "Hari Manager"
        assert len(exp_data["items"]) == 1
        assert exp_data["items"][0]["quantity"] == 3
        assert exp_data["items"][0]["unitCost"] == 80.0

        # Validate stock deduction
        re_batch = await InventoryBatch.get(batch.id)
        assert re_batch.quantity == 7  # 10 - 3 = 7

        # Validate StockAdjustment record created
        adj = await StockAdjustment.find_one(
            StockAdjustment.reference_id == created_expense_id,
            StockAdjustment.type == AdjustmentType.internal_use,
        )
        assert adj is not None
        assert adj.quantity == -3
        assert adj.unit_cost == 80.0
        assert "Hari Manager" in adj.reason

        # Validate NO wallet ledger entry created (Cash drawer is untouched!)
        wallet_entry = await WalletLedgerEntry.find_one(
            WalletLedgerEntry.reference_id == created_expense_id
        )
        assert wallet_entry is None

        # 3. Test patch protection (cannot change amount or payment method)
        patch_res = await client.patch(
            f"/api/v1/expenses/{created_expense_id}",
            json={"amount": 999.0},
            headers=manager_headers,
        )
        assert patch_res.status_code == 400
        assert "cannot be manually edited" in patch_res.json()["detail"]

        # 4. Delete expense and verify stock is restored
        del_res = await client.delete(
            f"/api/v1/expenses/{created_expense_id}",
            headers=manager_headers,
        )
        assert del_res.status_code == 204

        re_batch2 = await InventoryBatch.get(batch.id)
        assert re_batch2.quantity == 10  # Restored back to 10!

        reversal_adj = await StockAdjustment.find_one(
            StockAdjustment.reference_type == "expense_reversal",
            StockAdjustment.reference_id == created_expense_id,
        )
        assert reversal_adj is not None
        assert reversal_adj.quantity == 3
    finally:
        await prod.delete()
        await batch.delete()
        if created_expense_id:
            exp = await Expense.get(created_expense_id)
            if exp:
                await exp.delete()
