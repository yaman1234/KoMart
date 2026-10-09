"""Sync product purchase UOM fields from PO lines (place order + receive)."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Mapping, Sequence

from beanie import PydanticObjectId

from app.models.product import Product, SellMode
from app.models.purchase_order import PurchaseOrderItem


def _uom_fields_from_line(
    item: PurchaseOrderItem | Mapping[str, Any],
    *,
    units_override: int | None = None,
) -> dict[str, Any]:
    if isinstance(item, Mapping):
        order_uom = (item.get("order_uom") or item.get("orderUom") or "pcs") or "pcs"
        base_uom = (item.get("base_uom") or item.get("baseUom") or "") or ""
        units = units_override
        if units is None:
            units = int(item.get("units_per_buy_uom") or item.get("unitsPerBuyUom") or 1)
    else:
        order_uom = getattr(item, "order_uom", None) or "pcs"
        base_uom = getattr(item, "base_uom", None) or ""
        units = units_override
        if units is None:
            units = int(getattr(item, "units_per_buy_uom", None) or 1)

    units = max(1, int(units))
    buy_uom = str(order_uom).strip() or "pcs"
    if units > 1:
        uom = str(base_uom).strip() or "pcs"
        sell_mode = SellMode.both
    else:
        uom = buy_uom
        sell_mode = SellMode.unit

    return {
        "buy_uom": buy_uom,
        "uom": uom,
        "units_per_buy_uom": units,
        "sell_mode": sell_mode,
    }


async def sync_product_uoms_from_po_lines(
    items: Sequence[PurchaseOrderItem | Mapping[str, Any]],
    *,
    units_override_by_product_id: Mapping[str, int] | None = None,
) -> int:
    """
    Update product buy_uom / uom / units_per_buy_uom / sell_mode from PO lines.

    Does not touch selling_price or pack_selling_price.
    Returns the number of products updated.
    """
    overrides = units_override_by_product_id or {}
    # Last line wins per product
    by_product: dict[str, tuple[PurchaseOrderItem | Mapping[str, Any], int | None]] = {}
    for item in items:
        if isinstance(item, Mapping):
            pid = str(item.get("product_id") or item.get("productId") or "")
        else:
            pid = str(getattr(item, "product_id", "") or "")
        if not pid:
            continue
        by_product[pid] = (item, overrides.get(pid))

    if not by_product:
        return 0

    updated = 0
    now = datetime.now(timezone.utc)
    for pid, (item, units_override) in by_product.items():
        try:
            product = await Product.get(PydanticObjectId(pid))
        except Exception:
            product = None
        if not product:
            continue

        fields = _uom_fields_from_line(item, units_override=units_override)
        patch: dict[str, Any] = {}
        if (product.buy_uom or "") != fields["buy_uom"]:
            patch["buy_uom"] = fields["buy_uom"]
        if (product.uom or "") != fields["uom"]:
            patch["uom"] = fields["uom"]
        if int(product.units_per_buy_uom or 1) != fields["units_per_buy_uom"]:
            patch["units_per_buy_uom"] = fields["units_per_buy_uom"]
        current_mode = product.sell_mode if isinstance(product.sell_mode, SellMode) else SellMode(product.sell_mode)
        if current_mode != fields["sell_mode"]:
            patch["sell_mode"] = fields["sell_mode"]

        if not patch:
            continue
        patch["updated_at"] = now
        await product.set(patch)
        updated += 1

    return updated


def uom_patch_for_receive_product(
    product: Product,
    item: PurchaseOrderItem,
    *,
    units_override: int | None = None,
) -> dict[str, Any]:
    """Compute in-memory UOM field patch for the receive transaction path."""
    fields = _uom_fields_from_line(item, units_override=units_override)
    patch: dict[str, Any] = {}
    if (product.buy_uom or "") != fields["buy_uom"]:
        patch["buy_uom"] = fields["buy_uom"]
        product.buy_uom = fields["buy_uom"]
    if (product.uom or "") != fields["uom"]:
        patch["uom"] = fields["uom"]
        product.uom = fields["uom"]
    if int(product.units_per_buy_uom or 1) != fields["units_per_buy_uom"]:
        patch["units_per_buy_uom"] = fields["units_per_buy_uom"]
        product.units_per_buy_uom = fields["units_per_buy_uom"]
    current_mode = product.sell_mode if isinstance(product.sell_mode, SellMode) else SellMode(product.sell_mode)
    if current_mode != fields["sell_mode"]:
        # Motor $set needs the enum value string
        patch["sell_mode"] = fields["sell_mode"].value
        product.sell_mode = fields["sell_mode"]
    return patch
