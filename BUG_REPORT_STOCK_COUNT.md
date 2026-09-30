# Stock Count Module — Bug Report & Improvement Proposal

**Date:** 2026-09-30  
**Author:** Code Agent  
**Module:** Stock Count / Physical Inventory  
**Status:** Analysis Complete — Awaiting Prioritization

---

## Executive Summary

The Stock Count module is structurally complete: backend models, services, routers, and schemas exist and compile. Frontend types, services, pages, and routes exist and pass `tsc --noEmit`. The router is registered in `main.py:91` and Beanie document models are registered in `database.py:148` and `models/__init__.py:23`.

However, code review has identified **7 issues** spanning correctness bugs (high), missing mock support (high), missing test coverage (medium), atomicity gaps (medium), UX inefficiencies (low), and missing reports/dashboard KPIs (low). Details below.

---

## BUG-01 — `_units_sold_in_window` ignores non-sale stock movements (HIGH — Correctness)

| Field | Value |
|-------|-------|
| **File** | `backend/app/services/stock_count.py` |
| **Function** | `_units_sold_in_window` (lines 25–37) |
| **Severity** | High |
| **Type** | Logic error / incorrect data |

### Description

The function queries `StockAdjustment` filtered to `type: "sale"` with `abs(quantity)`:

```python
async def _units_sold_in_window(product_id: str, since: datetime, until: datetime) -> int:
    col = StockAdjustment.get_motor_collection()
    pipeline = [
        {"$match": {
            "product_id": product_id,
            "type": "sale",
            "created_at": {"$gte": since, "$lte": until},
        }},
        {"$group": {"_id": None, "total": {"$sum": {"$abs": "$quantity"}}}},
    ]
    result = await col.aggregate(pipeline).to_list(1)
    return int(result[0]["total"]) if result else 0
```

### Impact

The adjusted snapshot is calculated as `snapshot_qty - units_sold` (line 40). This only accounts for sales. The following stock movements are **ignored**, causing incorrect `adjusted_snapshot_qty` and cascading incorrect variance:

- **Voids during counting** (`AdjustmentType.void`): A customer returns a product. The void adjustment has positive quantity. Ignored → adjusted snapshot is too low → phantom shortage.
- **Adjustments** (`AdjustmentType.adjustment`): Manual or system corrections during the count window. Ignored → variance corrupted.
- **Receives** (`AdjustmentType.receive`): New stock arrives mid-count. Ignored → phantom shortage.
- **Corrections** (`AdjustmentType.correction`): Alignment fixes. Ignored.

Additionally, `abs($quantity)` on sales is technically redundant (sales are always stored as negative quantities in the ledger), but if any sale entry has a positive quantity by accident, it inflates the "sold" number.

### Affected Call Sites

- `record_count` — `backend/app/services/stock_count.py` (single-item recording)
- `bulk_record_count` — `backend/app/services/stock_count.py` (bulk recording)
- `record_recount` — `backend/app/services/stock_count.py` (recount)

### Proposed Fix

1. Replace `_units_sold_in_window` with `_net_movements_in_window` that matches **all** `AdjustmentType` values and sums the **signed** `$quantity` (no `abs`).
2. Replace the caller formula: `adjusted_snapshot_qty = snapshot_qty + net_movement` (instead of `snapshot_qty - units_sold`).
3. Rename the stored field: keep `units_sold_in_window` for backward-compatible display (store `abs(net_movement)` when negative), but add a new `net_movement_in_window: int` field on `StockCountItem` for full transparency.
4. Update the `StockCountItem` model, schema, and frontend `types/index.ts` to include the new field.

---

## BUG-02 — `approve_count` lacks atomicity / partial-failure handling (MEDIUM — Data Integrity)

| Field | Value |
|-------|-------|
| **File** | `backend/app/services/stock_count.py` |
| **Function** | `approve_count` (lines 318–363) |
| **Severity** | Medium |
| **Type** | Transaction safety / error handling |

### Description

`approve_count` iterates over variance items and calls `adjust_stock()` for each:

```python
for item in sc.items:
    if item.varianceQty == 0:
        continue
    try:
        adj = await adjust_stock(...)
        adjustment_ids.append(str(adj.id))
    except HTTPException:
        # silently swallowed — continues with next item
        pass

sc.status = StockCountStatus.approved
sc.adjustment_id = ...
await sc.save()
```

### Impact

- **No MongoDB session/transaction** wraps the approval loop + `sc.save()`. If the 3rd of 10 adjustments fails (e.g., race condition on a batch, or a product was deleted), the remaining 7 still execute.
- `sc.status` is set to `approved` **before** adjustments are created (or at least, there is no rollback on failure).
- Failed items are silently swallowed — the audit trail logs "count_completed" even though some products weren't adjusted.
- The idempotency guard (`if sc.status in (approved, completed):`) prevents re-approval, so the operator cannot retry the failed items without manual intervention.

### Proposed Fix

1. Wrap the entire approval loop in a MongoDB session/transaction:
   ```python
   async with await get_motor_client().start_session() as session:
       async with session.start_transaction():
           # ... approval logic ...
   ```
2. Move `sc.status = approved` and `sc.save()` to the **end**, after all adjustments succeed.
3. If any adjustment fails, the transaction rolls back all batch updates and the `StockCount` doc save — status stays `under_review`.
4. Collect failed item IDs and surface them in the audit log / API response for manual follow-up.

---

## BUG-03 — No test coverage for stock count (MEDIUM — Quality)

| Field | Value |
|-------|-------|
| **File** | `backend/tests/` |
| **Missing** | `test_stock_count.py` |
| **Severity** | Medium |
| **Type** | Missing test coverage |

### Description

The `backend/tests/` directory contains 26 test files covering every domain (sales, PO, inventory, discounts, cash custody, reports, auth, etc.), but **no tests exist** for the stock count workflow. The existing `test_stock_centralization.py` covers core inventory but not stock count.

### Impact

No automated verification that the snapshot → count → variance → approval → cancel lifecycle works end-to-end. High regression risk for any future changes to the module.

### Proposed Test File

Create `tests/test_stock_count.py` with fixtures for `manager`, `cashier` users, and a stocked `Product` + `InventoryBatch`. Cover the following scenarios:

| # | Scenario | Expected Behavior |
|---|----------|-------------------|
| 1 | Exact match (snapshot == physical) | `variance_qty = 0`, no adjustment created on approve |
| 2 | Shortage (snapshot=10, physical=7) | `variance_qty = -3`, correction adjustment of -3 on approve |
| 3 | Excess (snapshot=10, physical=12) | `variance_qty = +2`, correction adjustment of +2 |
| 4 | Recount after variance | `recount_qty` overrides, variance recalculated |
| 5 | Sale during count window | `adjusted_snapshot_qty` decreases by units sold |
| 6 | Void during count window | `adjusted_snapshot_qty` increases (sale reversed) |
| 7 | Blind count mode hides snapshot | non-manager user sees `snapshot_qty = -1` |
| 8 | Permission: cashier cannot create | HTTP 403 on `POST /stock-counts` |
| 9 | Permission: cashier can count-item | HTTP 200 on `POST /stock-counts/{id}/count-item` |
| 10 | Duplicate approval rejected | HTTP 409 Conflict on second `POST /approve` |
| 11 | Cancel after completion rejected | HTTP 400 Bad Request |
| 12 | Cancel before approve allowed | status → `cancelled`, no stock changes |

### Suggested Fixtures

Use existing test patterns from `test_inventory_movements.py` (mongomock-based async fixtures, `TestClient` with `get_current_user` override).

---

## BUG-04 — `stockCountService` has no mock mode support (HIGH — Developer Experience)

| Field | Value |
|-------|-------|
| **File** | `frontend/src/services/index.ts` |
| **Lines** | 921–1004 |
| **Severity** | High |
| **Type** | Missing feature parity |

### Description

Every other service (`authService`, `dashboardService`, `productService`, `inventoryService`, `supplierService`, `purchaseOrderService`, `customerService`, `transactionService`, `notificationService`, `settingsService`, `reportsService`, `discountService`, `auditLogService`, `expenseService`, `userService`) checks `if (useMock()) return mockApi.<method>(...)` before falling through to `apiClient`.

The `stockCountService` block has **no such checks** — it always calls the real API:

```typescript
export const stockCountService = {
  getAll: async (params?) => {
    const { data } = await apiClient.get('/stock-counts', { params });  // ← no mock check
    return data as StockCountListResponse;
  },
  // ... all other methods have the same issue ...
};
```

### Impact

In mock/demo mode, the Stock Count pages will fail with network errors or 404s. Cannot demo or develop the stock count UI without a running backend.

### Proposed Fix

1. Add mock implementations to `frontend/src/services/mock/mockApi.ts`:
   - `getStockCounts(params)`
   - `getStockCount(id)`
   - `createStockCount(payload)`
   - `countStockCountItem(id, productId, qty)`
   - `countStockCountItemsBulk(id, items)`
   - `submitStockCount(id)`
   - `requestRecountStockCount(id, notes)`
   - `recountStockCountItem(id, productId, qty)`
   - `setVarianceReasonStockCount(id, productId, reason, note, finalQty)`
   - `approveStockCount(id, notes)`
   - `cancelStockCount(id, notes)`

2. Add mock data to `frontend/src/services/mock/mockData.ts`:
   - `mockStockCounts: StockCount[]` — 2–3 counts in various statuses (counting, submitted, approved)
   - `mockStockCountItems` — pre-populated items with variances

3. Add `if (useMock()) return mockApi.<method>(...)` guards to every method in `stockCountService`.

---

## BUG-05 — `StockCountCountPage` does not use bulk recording (LOW — UX)

| Field | Value |
|-------|-------|
| **File** | `frontend/src/pages/stock-count/StockCountCountPage.tsx` |
| **Severity** | Low |
| **Type** | UX inefficiency |

### Description

The counting page saves one item at a time via `stockCountService.countItem(id, productId, physicalQty)` (line 79–91). This triggers a separate API round-trip per product — a POST to `/stock-counts/{id}/count-item` for each save.

The backend already has `bulk_record_count` (service) and `POST /stock-counts/{id}/count-items` (router, line 33+). The frontend `stockCountService.countItemsBulk()` method exists (lines 956–965) but is **never called** by any page.

### Impact

On large counts (100+ items), the UI fires 100+ sequential API calls. On slower networks this is perceptibly slow and blocks the "Save & Next" button between each item.

### Proposed Improvement

1. **Option A (batch on save):** Accumulate pending changes client-side. On each "Save & Next", append to a pending list. On page blur or every 5 seconds, flush via `countItemsBulk()`.
2. **Option B (immediate batch):** Switch `handleSave` to call `countItemsBulk()` with just the current item — still reduces to one request, but uses the bulk endpoint for consistency.
3. **Option C (accumulate-and-flush):** Best UX — collect all items, send batch at "Finish" or periodically. Add `useMutation` for bulk with optimistic updates.

---

## BUG-06 — Missing stock count reports (LOW — Reporting)

| Field | Value |
|-------|-------|
| **Files** | `backend/app/routers/reports.py`, `frontend/src/services/index.ts` (`reportsService`) |
| **Severity** | Low |
| **Type** | Missing feature |

### Description

The reports router has no stock-count-related endpoints. Users cannot pull historical variance summaries, shortage/excess lists, or high-variance product reports from a dedicated reports section.

The frontend `reportsService` has no stock count report methods. The mock API has no stock count report methods.

### Proposed Improvement

Add to `backend/app/routers/reports.py`:

1. `GET /reports/stock-count-summary?start_date=&end_date=`
   - Aggregate by date: total counts created, total counts completed, average stock accuracy %, total shortage value, total excess value.

2. `GET /reports/stock-count-variance?start_date=&end_date=&variance_type=shortage\|excess\|all`
   - List of individual variance line items with: count_number, product_name, sku, snapshot_qty, physical_qty, variance_qty, variance_value, reason, count_date.

Add to `frontend/src/services/index.ts` (`reportsService`):
- `getStockCountSummary(range)` → calls `/reports/stock-count-summary`
- `getStockCountVariance(range, type)` → calls `/reports/stock-count-variance`

Add to `frontend/src/services/mock/mockApi.ts`: mock implementations.
Add to `frontend/src/services/mock/mockData.ts`: `mockStockCountSummary`, `mockStockCountVarianceRows`.

Add a `StockCountReportsPage` at route `/reports/stock-count` in the frontend.

---

## BUG-07 — No dashboard KPIs for stock counts (LOW — Observability)

| Field | Value |
|-------|-------|
| **Files** | `backend/app/routers/dashboard.py`, `frontend/src/services/mock/mockData.ts`, `frontend/src/types/index.ts` |
| **Severity** | Low |
| **Type** | Missing feature |

### Description

The `DashboardKpiSummary` type and `getDashboardKpiSummary()` endpoint include KPIs for sales, purchases, receivables, payables, cash/bank, but **no stock count metrics**. Managers have no visibility into pending counts or approval workflow at a glance.

### Proposed Improvement

1. Extend `DashboardKpiSummary` in `types/index.ts` with:
   ```typescript
   interface StockCountDashboardKpi {
     pendingCounts: number;           // status: counting
     needsApproval: number;           // status: submitted | under_review
     lastCountAccuracy: number;       // stock_accuracy_pct of most recent completed count
     activeVarianceValue: number;     // net_variance_value of the most recent completed count
   }
   ```

2. Add stock count KPIs to `backend/app/routers/dashboard.py` `get_kpi_summary` endpoint.

3. Add mock data to `mockData.ts` (`mockDashboardKpi.stockCount`).

4. Add 2–3 `StatCard` widgets on the frontend dashboard:
   - "Pending Counts" (blue gradient)
   - "Needs Approval" (orange gradient)
   - "Last Count Accuracy" (green gradient if >95%, amber if 90–95%, red if <90%)

---

## Summary Table

| ID | Title | Severity | File(s) | Status |
|----|-------|----------|---------|--------|
| BUG-01 | `_units_sold_in_window` ignores non-sale movements | High | `backend/app/services/stock_count.py:25-37` | Open |
| BUG-02 | `approve_count` lacks atomicity/transaction safety | Medium | `backend/app/services/stock_count.py:318-363` | Open |
| BUG-03 | No test coverage for stock count | Medium | `backend/tests/` (missing) | Open |
| BUG-04 | `stockCountService` has no mock mode support | High | `frontend/src/services/index.ts:921-1004` | Open |
| BUG-05 | `StockCountCountPage` doesn't use bulk recording | Low | `frontend/src/pages/stock-count/StockCountCountPage.tsx:49-91` | Open |
| BUG-06 | Missing stock count reports | Low | `backend/app/routers/reports.py`, `frontend/src/services/index.ts` | Open |
| BUG-07 | No dashboard KPIs for stock counts | Low | `backend/app/routers/dashboard.py`, `frontend/src/types/index.ts` | Open |
