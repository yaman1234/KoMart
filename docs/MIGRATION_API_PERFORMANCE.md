# API Performance Review — Migration Notes

**Date:** June 2026  
**Feature:** Priority 1 #3 — API performance review  
**Breaking changes:** None (response shapes unchanged)

---

## Problems Addressed

| Area | Issue | Fix |
|------|-------|-----|
| Product lookups | `build_product_cache()` did N `get()` calls | Single `$in` query |
| Inventory list | N batch queries per page | `get_batches_for_products()` — one query |
| Dashboard stats | Loaded all products + 3 full txn lists | MongoDB `$group` aggregations |
| Revenue charts | Loaded all transactions in range | `$group` by day |
| Inventory/reports summary | Full product scan in Python | Aggregation pipelines |
| Low-stock report | Loaded all products, paginated in memory | DB filter + skip/limit |
| Expiring report | Loaded all batches + N product gets | DB pagination + batch product cache |
| Dead-stock report | Loaded all recent + all historical txns | `$unwind` aggregations on items |
| Indexes | Missing compounds for common filters | Added on products, transactions, batches, etc. |
| Frontend | Uniform 5m stale time, list flicker on page change | Tiered `STALE_TIME` + `keepPreviousData` |

---

## Backend Changes

### `app/services/reporting.py`
- `build_product_cache()` — batch `$in` fetch
- `aggregate_sales_total()`, `aggregate_sales_by_day()`
- `aggregate_product_inventory_stats()`, `aggregate_inventory_by_category()`
- `aggregate_expense_total_since()`
- `aggregate_sold_product_ids()`, `aggregate_last_sale_before()`
- `fill_daily_revenue()` — shared date-series helper

### `app/services/stock.py`
- `get_batches_for_products()` — batch load for inventory list

### Routers
- `dashboard.py` — aggregation-based stats and revenue
- `inventory.py` — aggregated stats, batch batch-loading
- `reports.py` — optimized inventory, expiring, low-stock, dead-stock, revenue

### New / updated indexes
| Collection | Index |
|------------|-------|
| `products` | `(is_active, name)`, `(is_active, stock)`, `(is_active, category)` |
| `transactions` | `(cashier_id, created_at DESC)` |
| `inventory_batches` | `(product_id, quantity)` |
| `stock_adjustments` | `(type, created_at DESC)` |
| `customers` | `(created_at DESC)` |
| `purchase_orders` | `(order_number)` |

Indexes are created automatically by Beanie on startup.

---

## Frontend Changes

| File | Change |
|------|--------|
| `constants/index.ts` | `STALE_TIME` tiers |
| `hooks/queryClient.ts` | `gcTime` 30m, default `standard` stale |
| `hooks/useDashboard.ts` | 30s stats/recent, 5m charts |
| `hooks/useReports.ts` | 5m stale + `keepPreviousData` |
| `hooks/useInventory.ts` | `keepPreviousData` on lists |
| `hooks/useTransactions.ts` | `keepPreviousData` |
| `hooks/useProducts.ts` | `keepPreviousData` |
| `hooks/useCategories.ts` | 10m stale |
| `hooks/useAuditLogs.ts` | `keepPreviousData` |

### Stale-time tiers

| Tier | Duration | Used for |
|------|----------|----------|
| `realtime` | 30s | Dashboard KPIs, notifications, inventory stats |
| `standard` | 2m | Paginated lists (default) |
| `reports` | 5m | Reports and chart data |
| `static` | 10m | Categories, rarely changing config |

---

## Manual Verification

- [ ] Dashboard loads without loading entire product catalog client-side
- [ ] Inventory page pagination — network tab shows 1 batch query per page (not N)
- [ ] Reports date-range change — previous data visible while fetching (no table flash)
- [ ] Low-stock / expiring reports paginate correctly with large catalogs
- [ ] MongoDB Atlas → Indexes tab shows new compound indexes after deploy

## Future (not in scope)

- Redis caching for dashboard stats
- Materialized report collections
- Text index for product search (regex scans remain for `search` param)
