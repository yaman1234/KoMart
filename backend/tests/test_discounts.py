"""Discount rules API tests."""

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.database import init_db
from app.models.user import User, UserRole
from app.models.product import Product, ProductStatus
from app.models.discount_rule import DiscountRule, DiscountRuleType
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
async def manager_user():
    email = "discount-manager@komart.com"
    existing = await User.find_one(User.email == email)
    if existing:
        await existing.delete()
    user = User(
        email=email,
        name="Discount Manager",
        hashed_password=hash_password("managerpass123"),
        role=UserRole.manager,
        is_active=True,
    )
    await user.insert()
    yield user
    await user.delete()


@pytest.fixture
async def snack_product(manager_user: User):
    product = Product(
        name="Discount Snack",
        sku="DISC-SNACK-001",
        barcode="DISC-SNACK-BAR",
        brand="Test",
        country_of_origin="Nepal",
        category="Snacks",
        supplier_id="sup-1",
        supplier_name="Supplier",
        cost_price=50.0,
        selling_price=100.0,
        status=ProductStatus.active,
        is_active=True,
    )
    await product.insert()
    yield product
    await product.delete()


@pytest.fixture
async def category_rule(manager_user: User):
    rule = DiscountRule(
        name="Snacks 10% Off",
        rule_type=DiscountRuleType.category_percent,
        value=10,
        category="Snacks",
        is_active=True,
        priority=10,
    )
    await rule.insert()
    yield rule
    await rule.delete()


async def _login(client: AsyncClient, email: str, password: str) -> str:
    res = await client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert res.status_code == 200
    return res.json()["access_token"]


@pytest.mark.asyncio
async def test_create_discount_rule(
    client: AsyncClient,
    manager_user: User,
    snack_product: Product,
):
    token = await _login(client, manager_user.email, "managerpass123")
    res = await client.post(
        "/api/v1/discounts",
        json={
            "name": "Snack Deal",
            "rule_type": "product_percent",
            "value": 15,
            "product_ids": [str(snack_product.id)],
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 201
    body = res.json()
    assert body["rule_type"] == "product_percent"
    assert body["value"] == 15
    created = await DiscountRule.get(body["id"])
    if created:
        await created.delete()


@pytest.mark.asyncio
async def test_evaluate_category_percent(
    client: AsyncClient,
    manager_user: User,
    snack_product: Product,
    category_rule: DiscountRule,
):
    token = await _login(client, manager_user.email, "managerpass123")
    res = await client.post(
        "/api/v1/discounts/evaluate",
        json={
            "items": [
                {
                    "product_id": str(snack_product.id),
                    "price": 100,
                    "quantity": 2,
                    "category": "Snacks",
                }
            ],
            "coupon_code": "",
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["line_discount_total"] == 20
    assert body["promotion_discount_total"] == 20
    assert len(body["applied_promotions"]) == 1


@pytest.mark.asyncio
async def test_coupon_code_required(
    client: AsyncClient,
    manager_user: User,
    snack_product: Product,
):
    rule = DiscountRule(
        name="Coupon 50 Off",
        code="SAVE50",
        rule_type=DiscountRuleType.cart_flat,
        value=50,
        is_active=True,
    )
    await rule.insert()
    token = await _login(client, manager_user.email, "managerpass123")
    try:
        without = await client.post(
            "/api/v1/discounts/evaluate",
            json={
                "items": [
                    {
                        "product_id": str(snack_product.id),
                        "price": 100,
                        "quantity": 1,
                        "category": "Snacks",
                    }
                ],
            },
            headers={"Authorization": f"Bearer {token}"},
        )
        assert without.json()["cart_discount"] == 0

        with_code = await client.post(
            "/api/v1/discounts/evaluate",
            json={
                "items": [
                    {
                        "product_id": str(snack_product.id),
                        "price": 100,
                        "quantity": 1,
                        "category": "Snacks",
                    }
                ],
                "coupon_code": "SAVE50",
            },
            headers={"Authorization": f"Bearer {token}"},
        )
        assert with_code.json()["cart_discount"] == 50
    finally:
        await rule.delete()


async def _evaluate(
    client: AsyncClient,
    token: str,
    *,
    product_id: str,
    quantity: int,
    price: float = 100,
    category: str = "Snacks",
    sell_uom: str = "",
    coupon_code: str = "",
) -> dict:
    res = await client.post(
        "/api/v1/discounts/evaluate",
        json={
            "items": [
                {
                    "product_id": product_id,
                    "price": price,
                    "quantity": quantity,
                    "category": category,
                    "sell_uom": sell_uom,
                }
            ],
            "coupon_code": coupon_code,
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 200
    return res.json()


@pytest.mark.asyncio
async def test_create_product_bogo_rule(
    client: AsyncClient,
    manager_user: User,
    snack_product: Product,
):
    token = await _login(client, manager_user.email, "managerpass123")
    res = await client.post(
        "/api/v1/discounts",
        json={
            "name": "Snack BOGO",
            "rule_type": "product_bogo",
            "value": 0,
            "product_ids": [str(snack_product.id)],
            "buy_qty": 1,
            "get_qty": 1,
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 201
    body = res.json()
    assert body["rule_type"] == "product_bogo"
    assert body["buy_qty"] == 1
    assert body["get_qty"] == 1
    assert body["value"] == 0
    created = await DiscountRule.get(body["id"])
    if created:
        await created.delete()


@pytest.mark.asyncio
async def test_evaluate_bogo_qty_edge_cases(
    client: AsyncClient,
    manager_user: User,
    snack_product: Product,
):
    rule = DiscountRule(
        name="Buy1Get1",
        rule_type=DiscountRuleType.product_bogo,
        value=0,
        product_ids=[str(snack_product.id)],
        buy_qty=1,
        get_qty=1,
        is_active=True,
        priority=10,
    )
    await rule.insert()
    token = await _login(client, manager_user.email, "managerpass123")
    pid = str(snack_product.id)
    try:
        assert (await _evaluate(client, token, product_id=pid, quantity=1))["line_discount_total"] == 0
        assert (await _evaluate(client, token, product_id=pid, quantity=2))["line_discount_total"] == 100
        assert (await _evaluate(client, token, product_id=pid, quantity=3))["line_discount_total"] == 100
        assert (await _evaluate(client, token, product_id=pid, quantity=4))["line_discount_total"] == 200
    finally:
        await rule.delete()


@pytest.mark.asyncio
async def test_evaluate_buy2_get1(
    client: AsyncClient,
    manager_user: User,
    snack_product: Product,
):
    rule = DiscountRule(
        name="Buy2Get1",
        rule_type=DiscountRuleType.product_bogo,
        value=0,
        product_ids=[str(snack_product.id)],
        buy_qty=2,
        get_qty=1,
        is_active=True,
        priority=10,
    )
    await rule.insert()
    token = await _login(client, manager_user.email, "managerpass123")
    try:
        body = await _evaluate(client, token, product_id=str(snack_product.id), quantity=5)
        assert body["line_discount_total"] == 100
        assert body["applied_promotions"][0]["name"] == "Buy2Get1"
    finally:
        await rule.delete()


@pytest.mark.asyncio
async def test_bogo_max_discount_cap(
    client: AsyncClient,
    manager_user: User,
    snack_product: Product,
):
    rule = DiscountRule(
        name="Capped BOGO",
        rule_type=DiscountRuleType.product_bogo,
        value=0,
        product_ids=[str(snack_product.id)],
        buy_qty=1,
        get_qty=1,
        max_discount=50,
        is_active=True,
        priority=10,
    )
    await rule.insert()
    token = await _login(client, manager_user.email, "managerpass123")
    try:
        body = await _evaluate(client, token, product_id=str(snack_product.id), quantity=4)
        assert body["line_discount_total"] == 50
    finally:
        await rule.delete()


@pytest.mark.asyncio
async def test_bogo_coupon_gated(
    client: AsyncClient,
    manager_user: User,
    snack_product: Product,
):
    rule = DiscountRule(
        name="Coupon BOGO",
        code="BOGO1",
        rule_type=DiscountRuleType.product_bogo,
        value=0,
        product_ids=[str(snack_product.id)],
        buy_qty=1,
        get_qty=1,
        is_active=True,
        priority=10,
    )
    await rule.insert()
    token = await _login(client, manager_user.email, "managerpass123")
    pid = str(snack_product.id)
    try:
        without = await _evaluate(client, token, product_id=pid, quantity=2)
        assert without["line_discount_total"] == 0
        with_code = await _evaluate(client, token, product_id=pid, quantity=2, coupon_code="BOGO1")
        assert with_code["line_discount_total"] == 100
    finally:
        await rule.delete()


@pytest.mark.asyncio
async def test_bogo_vs_percent_best_amount_wins(
    client: AsyncClient,
    manager_user: User,
    snack_product: Product,
):
    bogo = DiscountRule(
        name="BOGO",
        rule_type=DiscountRuleType.product_bogo,
        value=0,
        product_ids=[str(snack_product.id)],
        buy_qty=1,
        get_qty=1,
        is_active=True,
        priority=5,
    )
    percent = DiscountRule(
        name="60% Off",
        rule_type=DiscountRuleType.product_percent,
        value=60,
        product_ids=[str(snack_product.id)],
        is_active=True,
        priority=10,
    )
    await bogo.insert()
    await percent.insert()
    token = await _login(client, manager_user.email, "managerpass123")
    try:
        # qty 2: BOGO = 100, 60% = 120 → percent wins
        body = await _evaluate(client, token, product_id=str(snack_product.id), quantity=2)
        assert body["line_discount_total"] == 120
        assert body["applied_promotions"][0]["name"] == "60% Off"
    finally:
        await bogo.delete()
        await percent.delete()


@pytest.mark.asyncio
async def test_bogo_sell_uom_mismatch(
    client: AsyncClient,
    manager_user: User,
    snack_product: Product,
):
    rule = DiscountRule(
        name="Pack BOGO",
        rule_type=DiscountRuleType.product_bogo,
        value=0,
        product_ids=[str(snack_product.id)],
        buy_qty=1,
        get_qty=1,
        sell_uom="pack",
        is_active=True,
        priority=10,
    )
    await rule.insert()
    token = await _login(client, manager_user.email, "managerpass123")
    pid = str(snack_product.id)
    try:
        mismatch = await _evaluate(client, token, product_id=pid, quantity=2, sell_uom="pcs")
        assert mismatch["line_discount_total"] == 0
        match = await _evaluate(client, token, product_id=pid, quantity=2, sell_uom="pack")
        assert match["line_discount_total"] == 100
    finally:
        await rule.delete()


@pytest.mark.asyncio
async def test_hard_delete_discount_rule(
    client: AsyncClient,
    manager_user: User,
    snack_product: Product,
):
    rule = DiscountRule(
        name="Temp Rule",
        rule_type=DiscountRuleType.product_percent,
        value=10,
        product_ids=[str(snack_product.id)],
        is_active=True,
    )
    await rule.insert()
    rule_id = str(rule.id)
    manager_token = await _login(client, manager_user.email, "managerpass123")

    denied = await client.delete(
        f"/api/v1/discounts/{rule_id}",
        headers={"Authorization": f"Bearer {manager_token}"},
    )
    assert denied.status_code == 403
    assert await DiscountRule.get(rule_id) is not None
    await rule.delete()


@pytest.fixture
async def admin_user():
    email = "discount-admin@komart.com"
    existing = await User.find_one(User.email == email)
    if existing:
        await existing.delete()
    user = User(
        email=email,
        name="Discount Admin",
        hashed_password=hash_password("adminpass123"),
        role=UserRole.admin,
        is_active=True,
    )
    await user.insert()
    yield user
    await user.delete()


@pytest.mark.asyncio
async def test_admin_hard_delete_discount_rule(
    client: AsyncClient,
    admin_user: User,
    snack_product: Product,
):
    rule = DiscountRule(
        name="Admin Delete Rule",
        rule_type=DiscountRuleType.product_percent,
        value=10,
        product_ids=[str(snack_product.id)],
        is_active=True,
    )
    await rule.insert()
    rule_id = str(rule.id)
    token = await _login(client, admin_user.email, "adminpass123")

    res = await client.delete(
        f"/api/v1/discounts/{rule_id}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 204
    assert await DiscountRule.get(rule_id) is None

    missing = await client.delete(
        f"/api/v1/discounts/{rule_id}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert missing.status_code == 404


@pytest.mark.asyncio
async def test_manager_can_toggle_is_active(
    client: AsyncClient,
    manager_user: User,
    snack_product: Product,
):
    rule = DiscountRule(
        name="Toggle Rule",
        rule_type=DiscountRuleType.product_percent,
        value=10,
        product_ids=[str(snack_product.id)],
        is_active=True,
    )
    await rule.insert()
    rule_id = str(rule.id)
    token = await _login(client, manager_user.email, "managerpass123")
    try:
        res = await client.patch(
            f"/api/v1/discounts/{rule_id}",
            json={"is_active": False},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res.status_code == 200
        assert res.json()["is_active"] is False

        res2 = await client.patch(
            f"/api/v1/discounts/{rule_id}",
            json={"is_active": True},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res2.status_code == 200
        assert res2.json()["is_active"] is True
    finally:
        remaining = await DiscountRule.get(rule_id)
        if remaining:
            await remaining.delete()


@pytest.fixture
async def snack_product_b(manager_user: User):
    product = Product(
        name="Discount Snack B",
        sku="DISC-SNACK-002",
        barcode="DISC-SNACK-BAR-B",
        brand="Test",
        country_of_origin="Nepal",
        category="Snacks",
        supplier_id="sup-1",
        supplier_name="Supplier",
        cost_price=40.0,
        selling_price=80.0,
        status=ProductStatus.active,
        is_active=True,
    )
    await product.insert()
    yield product
    await product.delete()


@pytest.mark.asyncio
async def test_exclude_line_promotion_for_one_product(
    client: AsyncClient,
    manager_user: User,
    snack_product: Product,
    snack_product_b: Product,
):
    rule = DiscountRule(
        name="Multi BOGO",
        rule_type=DiscountRuleType.product_bogo,
        value=0,
        product_ids=[str(snack_product.id), str(snack_product_b.id)],
        buy_qty=1,
        get_qty=1,
        is_active=True,
        priority=10,
    )
    await rule.insert()
    token = await _login(client, manager_user.email, "managerpass123")
    try:
        full = await client.post(
            "/api/v1/discounts/evaluate",
            json={
                "items": [
                    {"product_id": str(snack_product.id), "price": 100, "quantity": 2, "category": "Snacks"},
                    {"product_id": str(snack_product_b.id), "price": 80, "quantity": 2, "category": "Snacks"},
                ],
            },
            headers={"Authorization": f"Bearer {token}"},
        )
        assert full.status_code == 200
        assert full.json()["line_discount_total"] == 180

        excluded = await client.post(
            "/api/v1/discounts/evaluate",
            json={
                "items": [
                    {"product_id": str(snack_product.id), "price": 100, "quantity": 2, "category": "Snacks"},
                    {"product_id": str(snack_product_b.id), "price": 80, "quantity": 2, "category": "Snacks"},
                ],
                "excluded_promotions": [
                    {
                        "rule_id": str(rule.id),
                        "product_id": str(snack_product.id),
                        "sell_uom": "",
                    }
                ],
            },
            headers={"Authorization": f"Bearer {token}"},
        )
        assert excluded.status_code == 200
        body = excluded.json()
        assert body["line_discount_total"] == 80
        assert len(body["applied_promotions"]) == 1
        assert body["applied_promotions"][0]["product_id"] == str(snack_product_b.id)
    finally:
        await rule.delete()


@pytest.mark.asyncio
async def test_exclude_cart_promotion(
    client: AsyncClient,
    manager_user: User,
    snack_product: Product,
):
    rule = DiscountRule(
        name="Cart 20 Off",
        rule_type=DiscountRuleType.cart_flat,
        value=20,
        is_active=True,
    )
    await rule.insert()
    token = await _login(client, manager_user.email, "managerpass123")
    try:
        with_cart = await client.post(
            "/api/v1/discounts/evaluate",
            json={
                "items": [
                    {"product_id": str(snack_product.id), "price": 100, "quantity": 1, "category": "Snacks"},
                ],
            },
            headers={"Authorization": f"Bearer {token}"},
        )
        assert with_cart.json()["cart_discount"] == 20

        excluded = await client.post(
            "/api/v1/discounts/evaluate",
            json={
                "items": [
                    {"product_id": str(snack_product.id), "price": 100, "quantity": 1, "category": "Snacks"},
                ],
                "excluded_promotions": [{"rule_id": str(rule.id), "product_id": "", "sell_uom": ""}],
            },
            headers={"Authorization": f"Bearer {token}"},
        )
        assert excluded.json()["cart_discount"] == 0
        assert excluded.json()["applied_promotions"] == []
    finally:
        await rule.delete()
