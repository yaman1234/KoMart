# Phase 7 — Sale void

## API

`POST /transactions/{id}/void` (manager+)

Body: `{ "reason": "..." }`

## Behavior

- Sets `status` to `voided`
- Restocks via stored `batch_allocations` on each line item
- Reverses customer loyalty points and total spent
- Excluded from `aggregate_sales_total` and `fetch_transactions` report queries
- Idempotent: second void returns HTTP 400

## Frontend

- **Void Sale** on `SaleDetailPage` (manager/admin)
- Confirmation dialog with required reason

## Verification

```bash
cd backend && pytest tests/test_sale_void.py -q
```
