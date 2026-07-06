# Phase 6 — Batch-weighted inventory valuation

## Formula

**Inventory Value** = Σ (batch `quantity` × batch `unit_cost`) for all batches with `quantity > 0`.

Per product: if no active batches, fallback to `product.stock × product.cost_price` (legacy data).

## Implementation

- `aggregate_batch_inventory_value()` in `backend/app/services/reporting.py`
- Used by `aggregate_product_inventory_stats()` (dashboard, inventory stats, reports)

## UI

Dashboard **Inventory Value** card subtitle explains batch-weighted vs product cost field.

## Verification

```bash
cd backend && pytest tests/test_reporting.py::test_aggregate_batch_inventory_value_weighted -q
```
