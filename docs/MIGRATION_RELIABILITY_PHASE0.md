# Phase 0 — Cleanup and foundation

## Removed

| Item | Reason |
|------|--------|
| `frontend/src/pages/PlaceholderPage.tsx` | No imports anywhere in the repo |
| `CreatePurchaseOrderPage` export alias | Unused; routes use `PurchaseOrderFormPage` |
| `backend/app/data/` package | Empty `__init__.py` only |

## Added

| Item | Purpose |
|------|---------|
| `frontend/src/hooks/invalidateCommerce.ts` | Central React Query invalidation with scopes `stock`, `price`, `sale` |

## Baseline verification

Run before Phase 1:

```bash
cd backend && pytest -q
cd frontend && npm run build
```

## Next

Phase 1 wires `invalidateCommerceQueries()` into product, inventory, PO, POS, and discount hooks.
