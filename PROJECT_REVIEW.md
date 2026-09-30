# KoMart Project Review Report

**Date:** 2026-09-30  
**Author:** Code Agent  
**Status:** Complete — Analysis Only

---

## Project Overview

KoMart is a Korean & Asian snacks retail management system with:
- **Backend:** FastAPI + Beanie (MongoDB ODM) running on Python 3.12+
- **Frontend:** React + TypeScript + MUI v5 + React Query + Vite

The backend is structured as a monolithic FastAPI app with routers per domain module. The frontend is organized by pages, services, types, and constants.

---

## Architecture Assessment

### Strengths
- Clean separation: `models/` (Beanie documents), `schemas/` (Pydantic DTOs), `services/` (business logic), `routers/` (API endpoints).
- Audit trail infrastructure integrated across modules via `log_audit()` and `AuditModule`.
- Consistent auth dependency chain: `get_current_user` → `require_manager_or_above` / `require_admin_only`.
- Frontend service pattern is consistent: `if (useMock()) return mockApi.<method>(...)` guard before `apiClient`.
- Response cache for dashboard (`response_cache.py`) — avoids recomputation on Vercel cold starts.

### Concerns
- No unit/integration tests for stock count module despite having 26 test files for other modules.
- No `conftest.py` at backend root — test fixtures are per-file, leading to duplication.
- Frontend mock API (`mockApi.ts`) covers auth, dashboard, products, inventory, suppliers, POs, customers, transactions, notifications, settings, expenses, users, discounts — but **not** stock count.

---

## Module-by-Module Review

### 1. Stock Count Module (Primary Focus)

**Files reviewed:**
- `backend/app/models/stock_count.py`
- `backend/app/services/stock_count.py`
- `backend/app/routers/stock_count.py`
- `backend/app/schemas/stock_count.py`
- `frontend/src/pages/stock-count/StockCountDetailPage.tsx`
- `frontend/src/pages/stock-count/StockCountFormPage.tsx`
- `frontend/src/pages/stock-count/StockCountCountPage.tsx`
- `frontend/src/services/index.ts` (stockCountService)
- `frontend/src/types/index.ts` (StockCount types)
- `frontend/src/routes/index.tsx` (routes)
- `frontend/src/constants/index.ts` (NAV_ITEMS, QUERY_KEYS)

#### Overall Status: **Implemented but has correctness gaps**

**Completed correctly:**
- Beanie model `StockCount` with `StockCountItem` (embedded), `StockCountAuditEntry`, status enum, FEFO snapshot logic.
- Service functions for all workflow states: create, record_count, bulk_record_count, submit_count, request_recount, record_recount, set_variance_reason, approve_count, cancel_count, list_stock_counts.
- Router with 10 endpoints, all registered in `main.py:91`.
- Frontend types match backend schemas.
- All 4 frontend pages exist and are fully implemented.
- Routes registered at `/stock-count`, `/stock-count/new`, `/stock-count/:id`, `/stock-count/:id/count` (RoleGuard `admin, manager`).
- Navigation item in `NAV_ITEMS` (`constants/index.ts:49`) and query keys in `QUERY_KEYS` (`constants/index.ts:265-266`).

**Issues found (detailed below):**

---

#### ISSUE-1: `_units_sold_in_window` ignores non-sale adjustments (BUG-01)

**File:** `backend/app/services/stock_count.py:25-37`

The function filters `StockAdjustment` to `type: "sale"` only and uses `abs(quantity)`. It misses:
- **Void transactions** (returns during counting)
- **Manual adjustments**
- **Receive transactions** (new stock arriving mid-count)

This means `adjusted_snapshot_qty = snapshot_qty - units_sold` is calculated incorrectly whenever any non-sale stock movement occurs during the count window.

**Real-world scenario:** A customer returns 5 units of instant ramen while the count is in progress. The void adjustment adds +5 to stock, but it's ignored. The system reports a shortage of 5 that doesn't exist.

**Proposed fix:** Net all movement types, summing signed quantity. Rename function to `_net_movements_in_window`. Change formula to `adjusted_snapshot_qty = snapshot_qty + net_movement`.

---

#### ISSUE-2: `approve_count` lacks transaction safety (BUG-02)

**File:** `backend/app/services/stock_count.py:318-363`

Key problems:
1. **Status advanced before adjustments complete:** Lines 327–329 set `sc.status = approved` and `sc.approved_by` before the adjustment loop runs. If adjustments fail, the count is marked approved with partial changes.
2. **No MongoDB transaction:** `adjust_stock()` is called in a loop without a session/transaction wrapper. If adjustment #3 of 10 fails, the first 2 are committed and the remaining 7 are skipped.
3. **Errors silently swallowed:** Lines 344–355 catch `HTTPException` and log an audit entry but continue. No rollback of already-applied adjustments.
4. **`adjustment_id` uses count_number as reference** (line 357), not actual adjustment IDs — `adj_ids` list is populated with `item.product_id` (line 352), not `adj.id`.

**Real-world scenario:** Manager approves a count of 50 items. Adjustments succeed for 25 products. On the 26th, a race condition depletes a batch and `adjust_stock` fails. The remaining 24 products are never corrected, but the count shows as "completed." Re-approving fails due to the idempotency guard.

**Proposed fix:**
1. Wrap approval in `async with await get_motor_client().start_session() as session:` + `session.start_transaction()`.
2. Move `sc.status = completed` and `sc.save()` to after all adjustments succeed.
3. Set `sc.adjustment_id` to an actual reference (e.g., concatenate adjustment IDs or the count number with a batch suffix).
4. Roll back entire transaction on any failure.
5. Return failed product IDs in the response for retry.

---

#### ISSUE-3: No backend tests for stock count (BUG-03)

**Directory:** `backend/tests/`

There are 26 test files covering sales, inventory, purchases, suppliers, customers, expenses, notifications, auth, discounts, day closes, and reporting — but **zero tests** for stock count.

The existing test pattern (`test_inventory_movements.py:15-83`) uses:
- `@pytest.fixture(autouse=True) async def setup_db(): await init_db()`
- `@pytest.fixture async def manager_user(): ...` — creates and deletes a `User` with `UserRole.manager`
- `@pytest.fixture async def sample_movement(): ...` — creates test data
- `_login(client, email, password)` helper returns JWT
- `AsyncClient` with `ASGITransport(app=app)`

**Proposed:** Create `backend/tests/test_stock_count.py` with fixtures for manager/cashier users, a stocked product, and an inventory batch. Test all 10+ scenarios listed in the full bug report.

---

#### ISSUE-4: Frontend `stockCountService` has no mock mode (BUG-04)

**File:** `frontend/src/services/index.ts:921-1004`

Every other service checks `if (useMock())` before calling the API. The `stockCountService` block has **no such checks** — it always calls the real API. In mock mode (default for development/demos), the Stock Count pages will fail with network errors.

**Real-world scenario:** Developer opens the app in mock mode (`VITE_MOCK=true`), navigates to Stock Count → "New Stock Count" → clicks "Start Count" → network error because `mockApi` has no `createStockCount` method and the `useMock()` guard is missing.

**Proposed fix:**
1. Add mock methods to `mockApi.ts`: `getStockCounts`, `getStockCount`, `createStockCount`, `countStockCountItem`, `countStockCountItemsBulk`, `submitStockCount`, `requestRecountStockCount`, `recountStockCountItem`, `setVarianceReasonStockCount`, `approveStockCount`, `cancelStockCount`.
2. Add `mockStockCounts` data to `mockData.ts`.
3. Add `if (useMock()) return mockApi.<method>(...)` to every method in `stockCountService`.

---

#### ISSUE-5: Count page uses single-item API instead of bulk (BUG-05)

**File:** `frontend/src/pages/stock-count/StockCountCountPage.tsx:49-91`

The counting page saves items one at a time via `stockCountService.countItem()` — a separate API call per product. The backend has `bulk_record_count` and the `POST /stock-counts/{id}/count-items` endpoint exists, but the frontend never uses it.

**Real-world scenario:** A full store count of 300 products requires 300 sequential API round-trips in the counting UI. On a slow network, each save takes 300–500ms, meaning the user waits 2–3 minutes just for saves.

**Proposed fix:** Accumulate changes client-side and flush via `countItemsBulk()`. Implement optimistic UI updates with a debounced sync (every 2s or 10 items, whichever comes first).

---

#### ISSUE-6: No stock count reports endpoints (BUG-06)

**File:** `backend/app/routers/reports.py`

The reports router has endpoints for sales summary, revenue, top products, inventory summary, low stock, dead stock, profit summary, margins, purchasing, loyalty, etc. — but **no stock count reports**.

**Proposed:** Add:
- `GET /reports/stock-count-summary?start_date=&end_date=` → aggregate by date
- `GET /reports/stock-count-variance?start_date=&end_date=&type=shortage|excess|all` → line-item variance list

Add corresponding `reportsService` methods and mock implementations.

---

#### ISSUE-7: No dashboard KPIs for stock counts (BUG-07)

**File:** `backend/app/routers/dashboard.py`, `frontend/src/services/mock/mockData.ts`

The `DashboardKpiSummary` schema includes sales, purchase, receivables, payables, cash/bank — but **no stock count metrics**.

**Proposed:** Add a `stockCount` section to the KPI summary:
```typescript
{
  pendingCounts: number;       // status: counting
  needsApproval: number;       // status: submitted | under_review
  lastCountAccuracy: number;   // most recent completed count's stock_accuracy_pct
  activeVarianceValue: number; // net_variance_value of most recent completed count
}
```

Add `StatCard` widgets on the frontend dashboard.

---

### 2. Inventory Module

**Files reviewed:**
- `backend/app/models/inventory.py`
- `backend/app/services/stock.py`
- `backend/app/routers/inventory.py`

#### Strengths
- `InventoryBatch` with FEFO sorting, expiry dates, and unit cost tracking.
- `adjust_stock()` handles batch-level and FEFO deductions.
- `assert_stock_matches_ledger()` validates batch state after every operation — catches drift.
- `expiring_product_ids()` powers the dashboard expiry alert.

#### Issues
- **No `conftest.py`:** Every test file re-implements `setup_db`, `client`, `manager_user` fixtures (`test_inventory_movements.py:15-42`, `test_inventory_adjust_admin.py`, etc.). Should extract shared fixtures into `tests/conftest.py`.
- **`refresh_all_product_stocks()` iterates sequentially** (`stock.py:108-111`): `for product in products: await refresh_product_stock(product)`. On a catalog of 1,000+ products this is N sequential DB round-trips. Could use batch `update_many` or parallel `asyncio.gather`.

---

### 3. Sales Module

**Files reviewed:**
- `backend/app/models/transaction.py`
- `backend/app/routers/transactions.py`

#### Strengths
- Transaction items carry `product_id`, `quantity`, `price`, `discount` — linked to inventory adjustments.
- Void handling exists (`test_sale_void.py`).

#### Issues
- **No sales return / exchange flow** visible in the codebase — only `void` and `purchase_return` adjustment types. A "return" in the POS appears to be modeled as a void, which may not distinguish between a true customer return (restock) vs a void of an uncompleted sale.
- **Sale creation timestamp precision:** `test_sale_created_at_time.py` exists, suggesting past issues. Verify the `created_at` field uses timezone-aware datetimes consistently.

---

### 4. Purchase Order Module

**Files reviewed:**
- `backend/app/models/purchase_order.py`
- `backend/app/routers/purchase_orders.py`

#### Strengths
- PO receive creates `InventoryBatch` + `StockAdjustment` entries.
- UOM conversion support (`test_po_receive_uom_conversion.py`).
- Chunked receive with timeout (`PO_RECEIVE_CHUNK_SIZE`, `PO_RECEIVE_TIMEOUT_MS`).
- Bill management and payment recording.

#### Issues
- **`receiveItemsInChunks` in frontend** (`services/index.ts:438-457`) uses sequential `for` loop with `await` inside — not truly parallel. If chunks are independent, `Promise.all` would speed up bulk receives.

---

### 5. Authentication & Authorization

**Files reviewed:**
- `backend/app/auth/dependencies.py`
- `backend/app/models/user.py`

#### Strengths
- JWT-based auth with access + refresh tokens.
- Three-tier role model: `admin`, `manager`, `cashier`.
- `require_manager_or_above` / `require_admin_only` dependency functions.
- `oauth2_scheme_optional` for optional auth (catalog routes).

#### Issues
- **`require_admin = require_manager_or_above` alias** (line 65): The comment says "Kept for legacy import compatibility" but `require_admin` actually allows **managers**, not just admins. This is a potential security concern if any caller expects admin-only access.
- **No RBAC audit:** No automated check that every sensitive endpoint has the correct `Depends()` guard. This should be verified per-router.

---

### 6. Reporting Module

**Files reviewed:**
- `backend/app/routers/reports.py`
- `backend/app/services/reporting.py`

#### Strengths
- Comprehensive: sales summary, payment methods, revenue, top products, categories, inventory summary, expiring products, low stock, profit summary, margins, purchasing, top customers, loyalty, dead stock, expense summary, daily summary.

#### Issues
- **No stock count reports** (see ISSUE-6 above).
- **No pagination on aggregate reports:** Endpoints like `getSalesByCategory` return arrays, not `PaginatedResponse`. Fine for small datasets, but `getDeadStock` and `getLowStockReport` do paginate while `getSalesByHour` / `getSalesByDayOfWeek` / `getSalesByCashier` don't. Inconsistent API contract.

---

### 7. Frontend State Management

**Files reviewed:**
- `frontend/src/services/index.ts`
- `frontend/src/services/mock/mockApi.ts`
- `frontend/src/services/mock/mockData.ts`
- `frontend/src/store/`

#### Strengths
- Centralized `apiClient` (axios) with auto camelCase/snakeCase conversion.
- Mock mode via `isMockEnabled()` + `mockApi`.
- React Query for server state with `QUERY_KEYS` for cache invalidation.
- `useAuthStore` (Zustand) for user/role state.

#### Issues
- **Stock count service has no mock mode** (see ISSUE-4 above).
- **`useAuthStore` role check is client-side only:** The `isManager` checks in components (`StockCountDetailPage.tsx:69`) are UI hints. The actual permission enforcement is server-side via `require_manager_or_above` — this is correct, but the frontend should not rely on client-side role checks for rendering destructive buttons (could be bypassed by URL navigation).

---

### 8. Testing Infrastructure

**Files reviewed:**
- `backend/pytest.ini`
- `backend/tests/` (26 files)

#### Strengths
- `asyncio_mode = auto` — no need to decorate every test with `@pytest.mark.asyncio`.
- Consistent fixture pattern across test files.
- Tests use `ASGITransport` — no need for a live server.

#### Issues
- **No `conftest.py`:** Every test file re-implements the same ~30 lines of fixtures (`setup_db`, `client`, `manager_user`, `_login`). A shared `tests/conftest.py` would reduce ~780 lines of duplication across 26 files.
- **No test for `approve_count` or `cancel_count`:** These are the most complex service functions with financial impact (stock adjustments), yet they're untested.
- **No test for `StockCountFormPage` or count submission flow.**

---

## Risk Assessment — Real-World Scenarios

| # | Scenario | Risk Level | Affected Code | Impact |
|---|----------|------------|---------------|--------|
| R1 | Sale + void during count window | **High** | `stock_count.py:25-37, 180-181` | Wrong variance → wrong financial adjustment on approve |
| R2 | Approval fails mid-loop | **High** | `stock_count.py:344-355` | Partial stock corrections, count marked completed, no retry possible |
| R3 | Concurrent approvals of same count | **Medium** | `stock_count.py:322-324` | Idempotency guard uses `adjustment_id` (empty string by default). Could allow double-approval if two requests race past the check. |
| R4 | Product deleted during count | **Medium** | `stock_count.py:344-354` | `adjust_stock` returns 404, silently logged, partial state |
| R5 | Manager starts count for 500 products | **Low** | `create_stock_count` does N+1 (one `Product.get` per batch in `adjust_stock`) | Slow initial creation, but not broken |
| R6 | Count window longer than expiry date | **Low** | `adjusted_snapshot_qty` calculation | Not relevant for stock count (expiry is for FEFO deduction, not count) |
| R7 | `units_sold_in_window` uses `abs()` | **Medium** | `stock_count.py:34` | If a sale adjustment has positive quantity (data corruption), it inflates sold count → phantom shortage |
| R8 | No `categoryService` in stock count form | **Low** | `StockCountFormPage.tsx:27` | `categoryService` is imported but if it has no mock fallback, category loading fails in mock mode |

---

## Improvement Proposals (Prioritized)

### Priority 1 — Correctness (BLOCKER)
1. **Fix `_units_sold_in_window`** (BUG-01): Net all adjustment types, use signed quantity.
2. **Wrap `approve_count` in transaction** (BUG-02): Atomic approval, rollback on failure.
3. **Fix `adjustment_id` assignment** (BUG-02): Store actual adjustment batch reference, not `count_number`.

### Priority 2 — Test Coverage (HIGH)
4. **Create `backend/tests/test_stock_count.py`:** 10+ test scenarios covering all lifecycle states, permissions, and the void/sale-during-count edge case.
5. **Extract shared test fixtures** into `backend/tests/conftest.py`: Eliminate ~780 lines of fixture duplication across 26 test files.

### Priority 3 — Frontend Parity (HIGH)
6. **Add mock mode to `stockCountService`** (BUG-04): Add 11 mock methods to `mockApi.ts`, mock data to `mockData.ts`, and `if (useMock())` guards to every service method.
7. **Use bulk API in count page** (BUG-05): Switch `StockCountCountPage` from single-item `countItem` to `countItemsBulk`.

### Priority 4 — Observability & Reporting (MEDIUM)
8. **Add dashboard KPIs** (BUG-07): Pending counts, needs approval, last accuracy. Add `StatCard` widgets.
9. **Add stock count reports** (BUG-06): Summary + variance line-item endpoints.

### Priority 5 — Code Quality (LOW)
10. **Fix `require_admin` alias** (`auth/dependencies.py:65`): Either rename or add `require_admin_only` as a distinct function.
11. **Parallelize `refresh_all_product_stocks`** (`services/stock.py:108-111`): Use `asyncio.gather` or batch update.
12. **Add request ID to audit context** (`main.py:59-65`): `X-Request-ID` header is set on responses but not passed to audit log entries — makes tracing difficult.

---

## Scope of Changes Required

| Area | Files to Modify/Create | Est. Effort |
|------|------------------------|-------------|
| Backend logic fix | `services/stock_count.py` (rewrite `_units_sold_in_window`, refactor `approve_count`) | 4h |
| Backend tests | `tests/test_stock_count.py` (new), `tests/conftest.py` (new) | 6h |
| Frontend mock | `services/index.ts` (add guards), `services/mock/mockApi.ts` (add 11 methods), `services/mock/mockData.ts` (add data) | 3h |
| Frontend UX | `pages/stock-count/StockCountCountPage.tsx` (use bulk API) | 2h |
| Dashboard | `backend/app/routers/dashboard.py`, `frontend/src/types/index.ts`, `frontend/src/services/index.ts`, `mockData.ts`, dashboard page | 3h |
| Reports | `backend/app/routers/reports.py`, `frontend/src/services/index.ts`, `mockApi.ts`, new `StockCountReportsPage` | 4h |

**Total estimated effort:** ~22 hours for all items. Priority 1+2+3 = ~13 hours.

---

## Verification Checklist

- [ ] `_units_sold_in_window` replaced with `_net_movements_in_window`
- [ ] `approve_count` wrapped in MongoDB session/transaction
- [ ] `adjustment_id` stores actual batch reference
- [ ] `tests/test_stock_count.py` created with 10+ scenarios
- [ ] `tests/conftest.py` created with shared fixtures
- [ ] `stockCountService` has `if (useMock())` guards on all methods
- [ ] `mockApi.ts` has all 11 stock count methods
- [ ] `mockData.ts` has `mockStockCounts`
- [ ] `StockCountCountPage` uses `countItemsBulk`
- [ ] Dashboard KPI includes stock count metrics
- [ ] Reports router has stock count endpoints
- [ ] `npx tsc --noEmit` passes
- [ ] `python -c "from app.main import app"` succeeds
- [ ] `pytest tests/test_stock_count.py -v` passes
