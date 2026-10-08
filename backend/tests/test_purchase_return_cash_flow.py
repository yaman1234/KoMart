"""Purchase return refund appears in dashboard cash inflow (not sales)."""

from __future__ import annotations

import uuid
from datetime import date
from unittest.mock import MagicMock

import pytest

from app.auth.jwt import hash_password
from app.database import init_db
from app.models.product import Product
from app.models.purchase_order import POStatus, PaymentStatus, PurchaseOrder, PurchaseOrderItem
from app.models.user import User, UserRole
from app.schemas.purchase_order import PurchaseOrderReceiveItem
from app.services.dashboard_kpi import build_cash_flow, build_payment_method_flow
from app.services.po_receive import receive_purchase_order_items
from app.services.purchase_return import close_purchase_return, create_purchase_return
from app.schemas.purchase_return import PurchaseReturnCreate, PurchaseReturnItemCreate
from app.models.purchase_return import PurchaseReturnMode, ReturnSettlementType


@pytest.fixture(autouse=True)
async def setup_db():
    await init_db()


def _mock_request() -> MagicMock:
    req = MagicMock()
    req.headers.get.return_value = ""
    req.client.host = "127.0.0.1"
    req.state.request_id = "test-request"
    return req


@pytest.mark.asyncio
async def test_purchase_return_refund_in_cash_flow_inflow():
    email = f"cf-{uuid.uuid4().hex[:8]}@komart.com"
    user = User(
        email=email,
        name="Cash Flow Tester",
        hashed_password=hash_password("test"),
        role=UserRole.manager,
        is_active=True,
    )
    await user.insert()

    sku = f"CF-{uuid.uuid4().hex[:6]}"
    product = Product(
        name="CF Product",
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
        order_number=f"PO-CF-{uuid.uuid4().hex[:5].upper()}",
        supplier_id="",
        supplier_name="",
        status=POStatus.ordered,
        bill_number=f"BILL-CF-{uuid.uuid4().hex[:5].upper()}",
        bill_images=["https://example.com/bill-cf.png"],
        items=[
            PurchaseOrderItem(
                product_id=str(product.id),
                product_name=product.name,
                quantity=10,
                unit_cost=10.0,
                received_quantity=0,
            )
        ],
        subtotal=100.0,
        total_amount=100.0,
        amount_paid=100.0,
        payment_status=PaymentStatus.paid,
    )
    await po.insert()
    await receive_purchase_order_items(
        str(po.id),
        [PurchaseOrderReceiveItem(product_id=str(product.id), receive_quantity=10)],
        created_by=user.name,
        current_user=user,
        request=_mock_request(),
    )
    # Re-apply paid after receive
    await po.set({"amount_paid": 100.0, "payment_status": PaymentStatus.paid})

    today = date.today().isoformat()
    before = await build_cash_flow(7)
    before_today = next(
        (r for r in before if r["date"] == today),
        {"inflow": 0, "returnInflow": 0, "salesInflow": 0},
    )
    before_inflow = float(before_today["inflow"])
    before_return = float(before_today.get("returnInflow") or 0)
    before_sales = float(before_today.get("salesInflow") or 0)

    created = await create_purchase_return(
        PurchaseReturnCreate(
            return_mode=PurchaseReturnMode.po_linked,
            purchase_order_id=str(po.id),
            items=[PurchaseReturnItemCreate(product_id=str(product.id), return_qty=4)],
            settlement_type=ReturnSettlementType.refund,
            payment_method="cash",
            return_date=today,
        ),
        current_user=user,
        request=_mock_request(),
    )
    mid = await build_cash_flow(7)
    mid_today = next(
        (r for r in mid if r["date"] == today),
        {"inflow": 0, "returnInflow": 0},
    )
    assert float(mid_today["inflow"]) == pytest.approx(before_inflow, abs=0.01)
    assert float(mid_today.get("returnInflow") or 0) == pytest.approx(before_return, abs=0.01)

    await close_purchase_return(
        str(created.id),
        current_user=user,
        request=_mock_request(),
    )

    after = await build_cash_flow(7)
    after_today = next(
        (r for r in after if r["date"] == today),
        {"inflow": 0, "returnInflow": 0, "salesInflow": 0},
    )
    assert float(after_today["inflow"]) == pytest.approx(before_inflow + 40.0, abs=0.01)
    assert float(after_today.get("returnInflow") or 0) == pytest.approx(before_return + 40.0, abs=0.01)
    assert float(after_today.get("salesInflow") or 0) == pytest.approx(before_sales, abs=0.01)

    cash_flow = await build_payment_method_flow("cash")
    cash_today = next((r for r in cash_flow if r["date"] == today), {"inflow": 0})
    assert float(cash_today["inflow"]) >= 40.0
