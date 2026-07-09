"""Derived product pricing fields — margin, pack savings, discount sync."""

from __future__ import annotations

from typing import Any, Literal

DiscountSource = Literal["percent", "offered", "auto"]


def _round2(value: float) -> float:
    return round(value, 2)


def margin_percent(cost_price: float, selling_price: float) -> float:
    if selling_price <= 0:
        return 0.0
    return _round2((selling_price - cost_price) / selling_price * 100)


def pack_savings(selling_price: float, units_per_buy_uom: int, pack_selling_price: float) -> float:
    if units_per_buy_uom <= 1 or pack_selling_price <= 0:
        return 0.0
    linear = selling_price * units_per_buy_uom
    return _round2(max(0.0, linear - pack_selling_price))


def _sync_discount_pair(
    base_price: float,
    discount_percent: float,
    offered_price: float,
    *,
    source: DiscountSource,
) -> tuple[float, float]:
    if base_price <= 0:
        return 0.0, 0.0

    if source == "offered":
        offered = max(0.0, min(offered_price, base_price))
        pct = _round2((1.0 - offered / base_price) * 100) if offered < base_price else 0.0
        return pct, _round2(offered)

    if source == "percent" or (source == "auto" and discount_percent > 0):
        pct = max(0.0, min(discount_percent, 100.0))
        offered = _round2(base_price * (1.0 - pct / 100))
        return pct, offered

    if source == "auto" and offered_price > 0 and offered_price < base_price:
        offered = max(0.0, offered_price)
        pct = _round2((1.0 - offered / base_price) * 100)
        return pct, _round2(offered)

    return 0.0, _round2(base_price)


def compute_product_pricing(
    product: Any,
    *,
    unit_discount_source: DiscountSource = "auto",
    pack_discount_source: DiscountSource = "auto",
) -> dict[str, float]:
    """Return pricing fields to persist on the product document."""
    cost = float(getattr(product, "cost_price", 0) or 0)
    selling = float(getattr(product, "selling_price", 0) or 0)
    pack_sell = float(getattr(product, "pack_selling_price", 0) or 0)
    units = int(getattr(product, "units_per_buy_uom", 1) or 1)

    unit_disc = float(getattr(product, "discount_percent", 0) or 0)
    unit_offered = float(getattr(product, "offered_price", 0) or 0)
    pack_disc = float(getattr(product, "pack_discount_percent", 0) or 0)
    pack_offered = float(getattr(product, "pack_offered_price", 0) or 0)

    unit_disc, unit_offered = _sync_discount_pair(
        selling, unit_disc, unit_offered, source=unit_discount_source,
    )
    pack_base = pack_sell if pack_sell > 0 else selling * units if units > 1 else 0.0
    pack_disc, pack_offered = _sync_discount_pair(
        pack_base, pack_disc, pack_offered, source=pack_discount_source,
    )

    return {
        "margin_percent": margin_percent(cost, selling),
        "discounted_amount": pack_savings(selling, units, pack_sell),
        "discount_percent": unit_disc,
        "offered_price": unit_offered,
        "pack_discount_percent": pack_disc,
        "pack_offered_price": pack_offered,
    }


def apply_pricing_to_dict(
    data: dict[str, Any],
    *,
    unit_discount_source: DiscountSource = "auto",
    pack_discount_source: DiscountSource = "auto",
) -> dict[str, float]:
    """Compute pricing from a plain dict (used during bulk updates)."""

    class _Proxy:
        pass

    p = _Proxy()
    for key in (
        "cost_price", "selling_price", "pack_selling_price", "units_per_buy_uom",
        "discount_percent", "offered_price", "pack_discount_percent", "pack_offered_price",
    ):
        setattr(p, key, data.get(key, 0))
    return compute_product_pricing(
        p,
        unit_discount_source=unit_discount_source,
        pack_discount_source=pack_discount_source,
    )
