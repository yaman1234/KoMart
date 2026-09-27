"""Purchase order payable totals (subtotal, discount, additional charges)."""

from __future__ import annotations

from typing import Any, Sequence


def _line_extension(item: Any) -> float:
    try:
        qty = int(getattr(item, "quantity", None) if not isinstance(item, dict) else item.get("quantity") or 0)
    except (TypeError, ValueError):
        qty = 0
    try:
        cost = float(
            getattr(item, "unit_cost", None) if not isinstance(item, dict) else item.get("unit_cost") or 0
        )
    except (TypeError, ValueError):
        cost = 0.0
    if qty < 0:
        qty = 0
    if cost < 0:
        cost = 0.0
    return qty * cost


def compute_po_totals(
    items: Sequence[Any] | None,
    discount: float | None = 0.0,
    additional_charges: float | None = 0.0,
) -> dict[str, float]:
    """
    Order total = max(0, subtotal − discount) + additional_charges.
    Discount is clamped to [0, subtotal]. All values rounded to 2 dp.
    """
    subtotal = round(sum(_line_extension(i) for i in (items or [])), 2)
    try:
        discount_raw = float(discount if discount is not None else 0.0)
    except (TypeError, ValueError):
        discount_raw = 0.0
    try:
        charges_raw = float(additional_charges if additional_charges is not None else 0.0)
    except (TypeError, ValueError):
        charges_raw = 0.0

    discount_n = round(max(0.0, min(discount_raw, subtotal)), 2)
    charges_n = round(max(0.0, charges_raw), 2)
    total_amount = round(max(0.0, subtotal - discount_n) + charges_n, 2)
    return {
        "subtotal": subtotal,
        "discount": discount_n,
        "additional_charges": charges_n,
        "total_amount": total_amount,
    }
