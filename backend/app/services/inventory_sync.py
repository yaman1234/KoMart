"""Shared product field updates when receiving stock."""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import HTTPException, Request, status

from app.models.audit_log import AuditModule
from app.models.product import Product
from app.models.supplier import Supplier
from app.models.user import User
from app.services.audit import log_audit, product_snapshot


async def apply_receive_product_updates(
    product: Product,
    *,
    unit_cost: float | None = None,
    unit_selling_price: float | None = None,
    supplier_id: str | None = None,
) -> tuple[Product, bool]:
    """
    Sync product reference fields before receive_stock creates a batch.

    cost_price is the last landed reference cost; batch unit_cost remains authoritative
    for batch-weighted valuation (see reporting.aggregate_batch_inventory_value).
  """
    product_updates: dict = {}
    price_changed = False

    if unit_cost is not None and unit_cost > 0 and unit_cost != product.cost_price:
        product_updates["cost_price"] = unit_cost
        price_changed = True
    if (
        unit_selling_price is not None
        and unit_selling_price >= 0
        and unit_selling_price != product.selling_price
    ):
        product_updates["selling_price"] = unit_selling_price
        price_changed = True
    if supplier_id:
        supplier = await Supplier.get(supplier_id)
        if not supplier or not supplier.is_active:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Supplier not found")
        product_updates["supplier_id"] = str(supplier.id)
        product_updates["supplier_name"] = supplier.name

    if not product_updates:
        return product, price_changed

    product_updates["updated_at"] = datetime.now(timezone.utc)
    await product.set(product_updates)
    refreshed = await Product.get(str(product.id))
    return (refreshed if refreshed else product), price_changed


async def log_receive_price_change(
    *,
    product_id: str,
    before_cost: float,
    before_sell: float,
    product: Product,
    current_user: User,
    request: Request,
    module: AuditModule,
) -> None:
    """Record cost/sell price changes triggered by a receive flow."""
    if before_cost == product.cost_price and before_sell == product.selling_price:
        return
    await log_audit(
        module=module,
        action="price_change",
        user=current_user,
        request=request,
        entity_type="product",
        entity_id=product_id,
        previous={"cost_price": before_cost, "selling_price": before_sell},
        new={"cost_price": product.cost_price, "selling_price": product.selling_price},
    )
