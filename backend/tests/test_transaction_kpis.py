import uuid
import pytest
from httpx import ASGITransport, AsyncClient

from app.auth.jwt import hash_password
from app.database import init_db
from app.main import app
from app.models.transaction import PaymentMethod, Transaction, TransactionStatus
from app.models.user import User, UserRole


@pytest.fixture(autouse=True)
async def setup_db():
    await init_db()


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.fixture
async def admin_user():
    email = f"admin-kpi-{uuid.uuid4().hex[:8]}@komart.com"
    user = User(
        email=email,
        name="Admin KPI Tester",
        hashed_password=hash_password("adminpass123"),
        role=UserRole.admin,
        is_active=True,
    )
    await user.insert()
    yield user
    await user.delete()


@pytest.mark.asyncio
async def test_transaction_list_excludes_voided_and_computes_kpis(
    client: AsyncClient,
    admin_user: User,
):
    res_login = await client.post(
        "/api/v1/auth/login",
        json={"email": admin_user.email, "password": "adminpass123"},
    )
    assert res_login.status_code == 200
    token = res_login.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    uid = uuid.uuid4().hex[:6]
    t1 = Transaction(
        transaction_number=f"KPI-{uid}-001",
        customer_name="Alice",
        items=[],
        subtotal=100.0,
        tax=0.0,
        total=100.0,
        payment_method=PaymentMethod.cash,
        status=TransactionStatus.completed,
        created_by=admin_user.name,
    )
    t2 = Transaction(
        transaction_number=f"KPI-{uid}-002",
        customer_name="Bob",
        items=[],
        subtotal=250.0,
        tax=0.0,
        total=250.0,
        payment_method=PaymentMethod.bank,
        status=TransactionStatus.completed,
        created_by=admin_user.name,
    )
    t3 = Transaction(
        transaction_number=f"KPI-{uid}-003",
        customer_name="Charlie",
        items=[],
        subtotal=150.0,
        tax=0.0,
        total=150.0,
        payment_method=PaymentMethod.esewa,
        status=TransactionStatus.completed,
        created_by=admin_user.name,
    )
    t4 = Transaction(
        transaction_number=f"KPI-{uid}-004",
        customer_name="Dave",
        items=[],
        subtotal=75.0,
        tax=0.0,
        total=75.0,
        payment_method=PaymentMethod.cash,
        status=TransactionStatus.voided,
        void_reason="Cancelled",
        created_by=admin_user.name,
    )

    created_txns = [t1, t2, t3, t4]
    for t in created_txns:
        await t.insert()

    try:
        # 1. Fetch with search query matching our unique batch
        res = await client.get(
            "/api/v1/transactions",
            params={"search": f"KPI-{uid}"},
            headers=headers,
        )
        assert res.status_code == 200
        data = res.json()
        assert data["total"] == 4
        # Total amount must exclude the voided sale (100 + 250 + 150 = 500.0, not 575.0)
        assert data["total_amount"] == 500.0
        assert data["completed_amount"] == 500.0
        assert data["completed_count"] == 3
        assert data["voided_amount"] == 75.0
        assert data["voided_count"] == 1

        pb = data["payment_breakdown"]
        assert pb["cash"]["amount"] == 100.0
        assert pb["cash"]["count"] == 1
        assert pb["bank"]["amount"] == 250.0
        assert pb["bank"]["count"] == 1
        assert pb["esewa"]["amount"] == 150.0
        assert pb["esewa"]["count"] == 1

        # 2. Filter by status: voided
        res_v = await client.get(
            "/api/v1/transactions",
            params={"search": f"KPI-{uid}", "status": "voided"},
            headers=headers,
        )
        assert res_v.status_code == 200
        data_v = res_v.json()
        assert data_v["total"] == 1
        assert data_v["total_amount"] == 75.0

        # 3. Filter by payment_method: cash
        res_c = await client.get(
            "/api/v1/transactions",
            params={"search": f"KPI-{uid}", "payment_method": "cash"},
            headers=headers,
        )
        assert res_c.status_code == 200
        data_c = res_c.json()
        # Only completed cash sale (100.0) should be in total_amount
        assert data_c["total_amount"] == 100.0
    finally:
        for t in created_txns:
            await t.delete()
