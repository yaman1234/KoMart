"""Audit log API integration tests."""

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.database import init_db
from app.models.user import User, UserRole
from app.models.audit_log import AuditLog, AuditModule
from app.auth.jwt import hash_password
from app.services.audit import log_audit


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
    email = "audit-manager@komart.com"
    existing = await User.find_one(User.email == email)
    if existing:
        await existing.delete()
    user = User(
        email=email,
        name="Audit Manager",
        hashed_password=hash_password("managerpass123"),
        role=UserRole.manager,
        is_active=True,
    )
    await user.insert()
    yield user
    await user.delete()


@pytest.fixture
async def cashier_user():
    email = "audit-cashier@komart.com"
    existing = await User.find_one(User.email == email)
    if existing:
        await existing.delete()
    user = User(
        email=email,
        name="Audit Cashier",
        hashed_password=hash_password("cashierpass123"),
        role=UserRole.cashier,
        is_active=True,
    )
    await user.insert()
    yield user
    await user.delete()


async def _login(client: AsyncClient, email: str, password: str) -> str:
    res = await client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert res.status_code == 200
    return res.json()["access_token"]


@pytest.fixture
async def sample_audit_log(manager_user: User):
    entry = await log_audit(
        module=AuditModule.products,
        action="create",
        user=manager_user,
        entity_type="product",
        entity_id="prod-test-001",
        new={"name": "Test Product", "sku": "SKU-001"},
    )
    yield entry
    await entry.delete()


@pytest.mark.asyncio
async def test_list_audit_logs_requires_manager(
    client: AsyncClient,
    cashier_user: User,
    manager_user: User,
    sample_audit_log: AuditLog,
):
    cashier_token = await _login(client, cashier_user.email, "cashierpass123")
    denied = await client.get(
        "/api/v1/audit-logs",
        headers={"Authorization": f"Bearer {cashier_token}"},
    )
    assert denied.status_code == 403

    manager_token = await _login(client, manager_user.email, "managerpass123")
    res = await client.get(
        "/api/v1/audit-logs",
        headers={"Authorization": f"Bearer {manager_token}"},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["total"] >= 1
    assert any(row["id"] == str(sample_audit_log.id) for row in body["data"])


@pytest.mark.asyncio
async def test_filter_audit_logs_by_module(
    client: AsyncClient,
    manager_user: User,
    sample_audit_log: AuditLog,
):
    await log_audit(
        module=AuditModule.auth,
        action="login",
        user=manager_user,
        entity_type="user",
        entity_id=str(manager_user.id),
    )

    token = await _login(client, manager_user.email, "managerpass123")
    res = await client.get(
        "/api/v1/audit-logs",
        params={"module": "products"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["total"] >= 1
    assert all(row["module"] == "products" for row in body["data"])


@pytest.mark.asyncio
async def test_get_audit_log_by_id(
    client: AsyncClient,
    manager_user: User,
    sample_audit_log: AuditLog,
):
    token = await _login(client, manager_user.email, "managerpass123")
    res = await client.get(
        f"/api/v1/audit-logs/{sample_audit_log.id}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["action"] == "create"
    assert body["entity_id"] == "prod-test-001"
    assert body["new_value"]["sku"] == "SKU-001"
