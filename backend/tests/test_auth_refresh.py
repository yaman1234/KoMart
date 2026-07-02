"""Authentication refresh-token integration tests."""

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.database import init_db
from app.models.user import User, UserRole
from app.auth.jwt import hash_password


@pytest.fixture(autouse=True)
async def setup_db():
    await init_db()


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.fixture
async def test_user():
    email = "refresh-test@komart.com"
    existing = await User.find_one(User.email == email)
    if existing:
        await existing.delete()
    user = User(
        email=email,
        name="Refresh Test",
        hashed_password=hash_password("testpass123"),
        role=UserRole.cashier,
        is_active=True,
    )
    await user.insert()
    yield user
    await user.delete()


@pytest.mark.asyncio
async def test_login_returns_refresh_token(client: AsyncClient, test_user: User):
    res = await client.post(
        "/api/v1/auth/login",
        json={"email": test_user.email, "password": "testpass123"},
    )
    assert res.status_code == 200
    body = res.json()
    assert "access_token" in body
    assert "refresh_token" in body
    assert body["token_type"] == "bearer"
    assert body["expires_in"] > 0


@pytest.mark.asyncio
async def test_refresh_rotates_token(client: AsyncClient, test_user: User):
    login = await client.post(
        "/api/v1/auth/login",
        json={"email": test_user.email, "password": "testpass123"},
    )
    refresh_token = login.json()["refresh_token"]

    res = await client.post("/api/v1/auth/refresh", json={"refresh_token": refresh_token})
    assert res.status_code == 200
    body = res.json()
    assert body["refresh_token"] != refresh_token

    # Reuse old token should fail (rotation / reuse detection)
    reuse = await client.post("/api/v1/auth/refresh", json={"refresh_token": refresh_token})
    assert reuse.status_code == 401


@pytest.mark.asyncio
async def test_logout_revokes_refresh_token(client: AsyncClient, test_user: User):
    login = await client.post(
        "/api/v1/auth/login",
        json={"email": test_user.email, "password": "testpass123"},
    )
    data = login.json()
    access = data["access_token"]
    refresh = data["refresh_token"]

    logout = await client.post(
        "/api/v1/auth/logout",
        json={"refresh_token": refresh},
        headers={"Authorization": f"Bearer {access}"},
    )
    assert logout.status_code == 200

    refresh_res = await client.post("/api/v1/auth/refresh", json={"refresh_token": refresh})
    assert refresh_res.status_code == 401
