"""PO line pricing: VAT-inclusive unit cost and selling-price snapshots."""

from __future__ import annotations

from app.models.purchase_order import PurchaseOrderItem


def inclusive_unit_cost(before_vat: float, tax_rate_percent: float) -> float:
    """Unit cost = before VAT + VAT. VAT amount is before_vat × tax% / 100."""
    before = max(0.0, float(before_vat or 0))
    rate = max(0.0, float(tax_rate_percent or 0))
    return round(before * (1 + rate / 100.0), 4)


def apply_vat_to_items(
    items: list[PurchaseOrderItem],
    *,
    vat_bill: bool,
    tax_rate: float,
) -> list[PurchaseOrderItem]:
    """When vat_bill, recompute inclusive unit_cost from unit_cost_before_vat."""
    if not vat_bill:
        return items
    priced: list[PurchaseOrderItem] = []
    for item in items:
        before = float(getattr(item, "unit_cost_before_vat", 0) or 0)
        if before <= 0:
            priced.append(item)
            continue
        priced.append(
            item.model_copy(
                update={
                    "unit_cost_before_vat": round(before, 4),
                    "unit_cost": inclusive_unit_cost(before, tax_rate),
                }
            )
        )
    return priced
