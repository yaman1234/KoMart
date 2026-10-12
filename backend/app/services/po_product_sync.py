"""Write PO line packaging (buy unit, sell unit, conversion, sell mode) onto products."""

from __future__ import annotations

from datetime import datetime, timezone

from app.models.product import Product, SellMode
from app.models.purchase_order import PurchaseOrderItem
from app.schemas.product import normalize_product_uoms


def _sell_mode_from_line(raw: str) -> SellMode | None:
    text = (raw or "").strip().lower()
    try:
        return SellMode(text)
    except ValueError:
        return None


def compute_uom_changes(
    product: Product,
    order_uom: str,
    sell_uom: str,
    units_per_buy_uom: int,
    sell_mode: str,
) -> dict:
    """UOM field updates for a product based on a PO line's packaging info."""
    buy = (order_uom or "").strip() or product.buy_uom
    secondary = (sell_uom or "").strip() or product.uom
    units = max(1, int(units_per_buy_uom or 1))
    mode = _sell_mode_from_line(sell_mode) or product.sell_mode
    buy_uom, secondary_uom, conversion, resolved_mode = normalize_product_uoms(
        buy,
        secondary,
        units,
        mode,
    )
    changes: dict = {}
    if buy_uom and buy_uom != product.buy_uom:
        changes["buy_uom"] = buy_uom
    if secondary_uom and secondary_uom != product.uom:
        changes["uom"] = secondary_uom
    if conversion != product.units_per_buy_uom:
        changes["units_per_buy_uom"] = conversion
    if resolved_mode is not None and resolved_mode != product.sell_mode:
        changes["sell_mode"] = resolved_mode
    return changes


async def sync_product_uoms_from_po_lines(items: list[PurchaseOrderItem]) -> int:
    """Persist each line's Buy Unit, Sell Unit, conversion rate and sell mode
    onto its product. Lines pointing at missing products are skipped.

    Returns the number of products updated.
    """
    updated = 0
    now = datetime.now(timezone.utc)
    for item in items:
        try:
            product = await Product.get(item.product_id)
        except Exception:
            product = None
        if product is None:
            continue
        changes = compute_uom_changes(
            product,
            getattr(item, "order_uom", "") or "",
            getattr(item, "sell_uom", "") or "",
            getattr(item, "units_per_buy_uom", 1) or 1,
            getattr(item, "sell_mode", "") or "",
        )
        if not changes:
            continue
        changes["updated_at"] = now
        await product.set(changes)
        updated += 1
    return updated
