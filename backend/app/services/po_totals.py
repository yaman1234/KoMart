"""Purchase order payable totals (subtotal, VAT, discount, additional charges)."""

from __future__ import annotations

from typing import Any, Sequence

# StoreSettings.tax_rate default. Used only when a VAT bill is computed
# without an explicit rate (callers that already loaded settings pass that rate).
DEFAULT_VAT_RATE_PERCENT = 13.0


def _round2(value: float) -> float:
    return round(value, 2)


def _strip_vat_unit_cost(inclusive: float, tax_rate_percent: float) -> float:
    """Inclusive unit cost → cost before VAT, rounded to 2 dp. Mirrors the PO form."""
    incl = inclusive if inclusive > 0 else 0.0
    rate = tax_rate_percent if tax_rate_percent > 0 else 0.0
    if rate <= 0:
        return incl
    return _round2(incl / (1 + rate / 100.0))


def _line_extension(item: Any, *, vat_bill: bool, tax_rate_percent: float) -> float:
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
    if vat_bill:
        return qty * _strip_vat_unit_cost(cost, tax_rate_percent)
    return qty * cost


def _coerce_rate(tax_rate: float | None, *, vat_bill: bool) -> float:
    if not vat_bill:
        return 0.0
    raw = DEFAULT_VAT_RATE_PERCENT if tax_rate is None else tax_rate
    try:
        rate = float(raw)
    except (TypeError, ValueError):
        rate = DEFAULT_VAT_RATE_PERCENT
    if rate < 0:
        return 0.0
    return rate


def compute_po_totals(
    items: Sequence[Any] | None,
    discount: float | None = 0.0,
    additional_charges: float | None = 0.0,
    *,
    vat_bill: bool = False,
    tax_rate: float | None = None,
) -> dict[str, float]:
    """
    Non-VAT: order total = max(0, subtotal − discount) + additional_charges.
    Subtotal is the sum of qty × VAT-inclusive unit cost.

    VAT bill: subtotal is the sum of qty × cost before VAT. VAT is tax_rate% of
    that subtotal only (discount and additional charges do not change VAT).
    Order total = max(0, subtotal − discount) + VAT + additional_charges.

    Discount is clamped to [0, subtotal]. All money values rounded to 2 dp.
    A missing/false vat_bill flag is the historical non-VAT formula.
    """
    is_vat = bool(vat_bill)
    rate = _coerce_rate(tax_rate, vat_bill=is_vat)
    subtotal = _round2(
        sum(_line_extension(i, vat_bill=is_vat, tax_rate_percent=rate) for i in (items or []))
    )
    try:
        discount_raw = float(discount if discount is not None else 0.0)
    except (TypeError, ValueError):
        discount_raw = 0.0
    try:
        charges_raw = float(additional_charges if additional_charges is not None else 0.0)
    except (TypeError, ValueError):
        charges_raw = 0.0

    discount_n = _round2(max(0.0, min(discount_raw, subtotal)))
    charges_n = _round2(max(0.0, charges_raw))
    vat_amount = _round2(subtotal * (rate / 100.0)) if is_vat else 0.0
    total_amount = _round2(max(0.0, subtotal - discount_n) + vat_amount + charges_n)
    return {
        "subtotal": subtotal,
        "discount": discount_n,
        "additional_charges": charges_n,
        "vat_amount": vat_amount,
        "vat_rate": rate if is_vat else 0.0,
        "total_amount": total_amount,
    }
