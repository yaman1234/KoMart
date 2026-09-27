# Phase 5 — Mock mode stock parity

## Changes

- `mockApi.receiveBatch` increments product/inventory stock (was no-op via empty resolve).
- `mockApi.receivePurchaseOrderItems` applies stock delta per received line.
- `mockApi.createTransaction` decrements stock per sold line.
- `mockApi.adjustStock` refactored to shared `applyMockStockDelta` helper.
- **Dev banner** in `App.tsx` when `VITE_USE_MOCK=true`.

## Limitation

Mock data is in-memory only — lost on page reload.

## Verification

1. Set `VITE_USE_MOCK=true` in `frontend/.env`.
2. Receive stock → product stock increases on Products page.
3. Complete POS sale → stock decreases.
4. Warning banner visible at top of app.
