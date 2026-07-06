# Phase 1 — Cache invalidation

## Problem

React Query caches were invalidated inconsistently. Product price edits did not refresh Dashboard, Catalog, or Reports. Inventory receive did not refresh Dashboard KPIs.

## Solution

`invalidateCommerceQueries()` in `frontend/src/hooks/invalidateCommerce.ts` with scopes:

| Scope | Invalidates | Used by |
|-------|-------------|---------|
| `stock` | products, inventory, dashboard, notifications, reports | adjust, void restock |
| `price` | above + catalog | product edit, receive, discounts |
| `sale` | above + transactions, customers, reports | POS checkout, transaction edit, void |

## Wired mutations

| Hook / page | Scopes |
|-------------|--------|
| `useCreateProduct` | stock, price |
| `useUpdateProduct` | stock, price |
| `useDeleteProduct` | stock, price |
| `useReceiveBatch` | stock, price |
| `useAdjustStock` | stock |
| `useReceivePurchaseOrderItems` | stock, price |
| `useUpdateTransaction` | sale |
| `useCreate/Update/DeleteDiscountRule` | price |
| `POSPage` checkout | sale (+ optimistic stock decrement) |

## Limitation

Invalidation refreshes the **current browser tab** only. Other open POS tabs refetch on window focus or navigation — not real-time multi-device sync.

## Verification

1. Edit product selling price → POS product grid updates without F5.
2. Receive stock → Dashboard inventory value updates.
3. Complete sale → customer loyalty and transaction list update.
