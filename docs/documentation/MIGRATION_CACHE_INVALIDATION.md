# Phase 1 — Cache invalidation

## Problem

React Query caches were invalidated inconsistently. Product price edits did not refresh Dashboard, Catalog, or Reports. Inventory receive did not refresh Dashboard KPIs.

## Solution

`invalidateCommerceQueries()` in `frontend/src/hooks/invalidateCommerce.ts` with scopes:

| Scope | Invalidates | Used by |
|-------|-------------|---------|
| `stock` | products, inventory, dashboard, reports, inventory movements | adjust, void restock, product CRUD, receive |
| `price` | above + public `catalog` | product edit, receive, discounts |
| `sale` | dashboard, transactions, wallets, `reports('dailySummary')`, plus `product(id)` / `inventoryItem(id)` for sold IDs — **not** full products/inventory lists | POS checkout, transaction edit |

Sale path pairs with `patchProductStockInCache()` so POS infinite/list pages update stock optimistically without a full products refetch.

Void uses `scopes: ['sale', 'stock']` because restock must refresh product lists.

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
| `useVoidTransaction` | sale, stock |
| `useCreate/Update/DeleteDiscountRule` | price |
| `POSPage` checkout | sale + optimistic stock decrement via `patchProductStockInCache` |

## Stale times

| Query | staleTime |
|-------|-----------|
| POS `useInfiniteProducts` | `realtime` (30s) — trusts patched stock briefly |
| `useProductCatalog` (PO index) | `static` (10m); fetched with `includeImages: false` |
| Dashboard stats / KPI / recent txns | `standard` (2m) |
| Dashboard charts | `reports` (5m) |

## Backend Atlas TTL cache

Collection `cache_entries` (`CacheEntry` model) with TTL index on `expires_at`.

| Key | TTL | Endpoint |
|-----|-----|----------|
| `dashboard:stats` | 30s | `GET /dashboard/stats` (`X-Cache: HIT\|MISS`) |
| `inventory:stats` | 30s | `GET /inventory/stats` (`X-Cache: HIT\|MISS`) |

`bump_commerce_caches()` deletes `dashboard:*` and `inventory:stats` after `receive_stock`, `adjust_stock`, `record_sale`, `void_sale`, and wallet-affecting transaction edits.

## Public HTTP cache

Unauthenticated catalog GETs set `Cache-Control`:

| Endpoint | Headers |
|----------|---------|
| `/catalog/store-info`, `/catalog/tags` | `public, max-age=60, s-maxage=300` |
| `/catalog`, `/catalog/offers` | `public, max-age=30, s-maxage=60` |
| `/catalog/{id}` | `public, max-age=60` |

Auth’d `/products` stays uncached at the edge. List returns first image by default (`include_images=true`); PO catalog/export pass `include_images=false`.

## Limitation

Invalidation refreshes the **current browser tab** only. Other open POS tabs refetch when their React Query staleTime expires — not real-time multi-device sync.

## Verification

1. Edit product selling price → POS product grid updates without F5.
2. Receive stock → Dashboard inventory value updates (FE invalidate + Atlas cache bump).
3. Complete sale → POS card stock updates immediately; no full products list refetch; dashboard refreshes via sale scope.
4. Warm `GET /dashboard/stats` within 30s returns `X-Cache: HIT`.
5. Public `/catalog` responses include `Cache-Control`.
