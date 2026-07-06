# Phase 2 — PO receive cost price sync

## Problem

Manual **Inventory Receive** updated `product.cost_price` when a new unit cost was entered. **PO Receive** only created inventory batches, leaving `product.cost_price` stale. Dashboard inventory value (`stock × cost_price`) diverged from actual PO landed cost.

## Solution

1. **`app/services/inventory_sync.py`** — `apply_receive_product_updates()` shared by inventory and PO routers.
2. **`purchase_orders.py`** — Before `receive_stock()`, sync `cost_price` from PO line `unit_cost` and optionally `supplier_id` from the PO.
3. **Audit** — `log_receive_price_change()` records `price_change` when cost or sell price changes.

## Semantics

- `product.cost_price` = **last landed reference cost** from the most recent receive/PO.
- Batch `unit_cost` on each batch remains authoritative for batch-weighted valuation (Phase 6).

## Verification

```bash
cd backend && pytest tests/test_po_receive.py -q
```

1. Create PO with unit cost different from product cost.
2. Receive PO → product cost updates → dashboard inventory value reflects new cost × stock.
