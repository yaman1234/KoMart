# Release Notes - Release 26121 (UAT → Main)

**Document:** `release_26121.md`  
**Generated Date:** November 24, 2026  
**Source Branch:** `uat`  
**Target Branch:** `main`  
**Git Range:** `main..uat` (`9879b63` ... `b6170b6`)  
**Release Readiness:** Ready for Main Production Merge & Deployment  

---

## 1. Executive Summary

This document serves as the comprehensive Release Manifest for **Release 26121**, staging all changes from **`uat`** into **`main`**. All pending feature and fix pull requests in UAT—including Supplier Payment Profiles & Financial KPIs (PR #106) and Purchase Order Line Totals (PR #108)—have been validated and merged into `uat`.

This release delivers major upgrades to purchase order accounting accuracy, supplier financial management, POS operational efficiency, barcode and receipt thermal printing, inventory valuation fidelity, and multi-environment deployment routing.

### Key Highlights
- **Purchase Order Line Totals (PR #108):** Computed real-time line total values (`quantity × unit_cost`) surfaced across backend models, schema responses (`line_total`), mock API fixtures, and rendered as a dedicated column in the PO items detail table (`PurchaseOrderDetailPage`).
- **Supplier Payment Profiles & Committed PO KPIs (PR #106):** Multi-method payment profiles (eSewa, Fonepay, Khalti, Bank Transfer, QR image preview), committed purchase order financial KPIs (ordered, partial, received), supplier return receivable metrics, and server-side table pagination.
- **Barcode & Thermal Label Printing (PR #104, PR #98):** Code 128 thermal label generation (38mm × 25mm), layout polish for thermal label printers, receipt formatting alignment, and barcode-SKU collision guards.
- **Purchase Order Stability & VAT Engine (PR #100, PR #96, PR #81):** Compliant 13% VAT calculation and persistence rules, strict quantity validation bounds (1 – 100,000), and resolution of the 500 error on lean PO listing queries (`include_summary=false`).
- **Inventory & Ledger Integrity (PR #83, PR #82, PR #79):** Accurate filtered inventory stock valuation across all paginated records, refined selected-products stock counting, and strict validation against redundant ledger reconciliations.
- **POS & Checkout Usability (PR #94, PR #92, PR #89, PR #80):** Ability for managers/admins to inspect and edit products directly from POS without abandoning the current cart, Kathmandu timezone defaults for sales reporting, prevention of auth 401 token refresh race conditions, and duplicate barcode resolution dialogs.
- **Infrastructure & Multi-Environment Deployments:** Automated frontend routing distinguishing UAT (Render) and Production (Vercel) builds, with API proxy and redirect fallbacks.

---

## 2. Pull Request Ingestion & Staging Status

All PRs intended for Release 26121 have been reviewed, tested, and cleanly merged into the `uat` branch:

| PR # | Branch Name | Target | Merged Commit | Status | Summary |
|---|---|---|---|---|---|
| **#108** | `fix/PO_lineTotal-uat` | `uat` | `b6170b6` | **Merged** | Line Total column on PO Detail item list & API response |
| **#106** | `feat/supplier-payment-kpis-uat` | `uat` | `c2526d7` | **Merged** | Supplier payment profiles, committed PO KPIs, return KPIs & pagination |
| **#104** | `feat/update_print` | `uat` | `2a7fda2` | **Merged** | Thermal label print formatting & POS receipt layout fixes |
| **#100** | `fix/po-list-include-summary-uat` | `uat` | `49db5fb` | **Merged** | Resolved 500 error on PO listing when `include_summary=false` |
| **#98** | `feat/barcode-label-print-uat` | `uat` | `26dfce4` | **Merged** | Code 128 shelf label printing & Barcode/SKU collision prevention |
| **#96** | `feat/po-vat-bill-totals-uat` | `uat` | `e74479a` | **Merged** | VAT bill totals calculation & persistence (13% tax rule) |
| **#94** | `feat/api-timeout-refresh-message-uat` | `uat` | `f224ee1` | **Merged** | App-wide refresh prompt on backend timeout/cold start |
| **#92** | `feat/pos-go-to-product-uat` | `uat` | `b17cae2` | **Merged** | POS "Go to Product" with cart preservation & session 401 cleanup |
| **#89** | `fix/sales-default-today-uat` | `uat` | `9b5feac` | **Merged** | Default sales date filter to current Kathmandu calendar day |
| **#87** | `fix/pagination-rows-per-page` | `uat` | `aef61a8` | **Merged** | Preserved rows-per-page selection across table page resets |
| **#84** | `fix/uat-06-dashboard-payables` | `uat` | `75b6c11` | **Merged** | Excluded unconfirmed draft POs from Dashboard Accounts Payable |
| **#83** | `fix/uat-05-ledger-closing-mismatch` | `uat` | `884f789` | **Merged** | Ledger reconciliation validation & sync mismatch handling |
| **#82** | `fix/uat-04-stock-count-selected-products` | `uat` | `89cb5b0` | **Merged** | Prevented selected-product stock counts from snapshotting full catalog |
| **#81** | `fix/uat-03-po-quantity-validation` | `uat` | `bc80804` | **Merged** | Enforced 1–100,000 integer quantity boundary on PO lines |
| **#80** | `fix/uat-02-duplicate-barcode` | `uat` | `bf4e328` | **Merged** | Barcode unique constraints & POS duplicate barcode picker dialog |
| **#79** | `fix/uat-01-inventory-filtered-total` | `uat` | `304f502` | **Merged** | Calculated inventory total valuation across full filtered query |

---

## 3. Branches & Features Summary Table

| # | Branch Name | PR | Status in UAT | Type | High-Level Scope |
|---|---|---|---|---|---|
| 1 | `fix/PO_lineTotal-uat` | PR #108 | **Merged** (`b6170b6`) | Fix / UX | Display Line Total in purchase order items table and API response |
| 2 | `feat/supplier-payment-kpis-uat` | PR #106 | **Merged** (`c2526d7`) | Feature | Supplier payment methods, committed PO KPIs, return KPIs & pagination |
| 3 | `feat/update_print` | PR #104 | **Merged** (`2a7fda2`) | Feature / Fix | Thermal barcode label print formatting updates & POS receipt layout fixes |
| 4 | `feat/barcode-label-print-uat` | PR #98 | **Merged** (`26dfce4`) | Feature | Code 128 shelf label printing & Barcode/SKU collision prevention |
| 5 | `fix/po-list-include-summary-uat` | PR #100 | **Merged** (`49db5fb`) | Bug Fix | Resolved 500 error on PO listing when `include_summary=false` |
| 6 | `feat/po-vat-bill-totals-uat` | PR #96 | **Merged** (`e74479a`) | Feature | VAT bill totals calculation & persistence (13% tax rule) |
| 7 | `feat/api-timeout-refresh-message-uat` | PR #94 | **Merged** (`f224ee1`) | Feature | App-wide refresh prompt on backend timeout/cold start |
| 8 | `feat/pos-go-to-product-uat` | PR #92 | **Merged** (`b17cae2`) | Feature | POS "Go to Product" with cart preservation & session 401 cleanup |
| 9 | `fix/sales-default-today-uat` | PR #89 | **Merged** (`9b5feac`) | Bug Fix | Default sales date filter to current Kathmandu calendar day |
| 10 | `fix/pagination-rows-per-page` | PR #87 | **Merged** (`aef61a8`) | Bug Fix | Preserved rows-per-page selection across table page resets |
| 11 | `fix/uat-06-dashboard-payables` | PR #84 | **Merged** (`75b6c11`) | Bug Fix | Excluded unconfirmed draft POs from Dashboard Accounts Payable |
| 12 | `fix/uat-05-ledger-closing-mismatch` | PR #83 | **Merged** (`884f789`) | Bug Fix | Ledger reconciliation validation & sync mismatch handling |
| 13 | `fix/uat-04-stock-count-selected-products` | PR #82 | **Merged** (`89cb5b0`) | Bug Fix | Prevented selected-product stock counts from snapshotting full catalog |
| 14 | `fix/uat-03-po-quantity-validation` | PR #81 | **Merged** (`bc80804`) | Bug Fix | Enforced 1–100,000 integer quantity boundary on PO lines |
| 15 | `fix/uat-02-duplicate-barcode` | PR #80 | **Merged** (`bf4e328`) | Bug Fix | Barcode unique constraints & POS duplicate barcode picker dialog |
| 16 | `fix/uat-01-inventory-filtered-total` | PR #79 | **Merged** (`304f502`) | Bug Fix | Calculated inventory total valuation across full filtered query |
| 17 | `uat` (Direct Infra/Deploy Commits) | — | **Merged** (`10d43ea` .. `be4aa1c`) | Infra / Build | Environment routing (Render vs Vercel), Netlify proxy & build fixes |

---

## 4. Detailed Feature & Task Descriptions

### 4.1 Fix / UX: Purchase Order Line Total Display in Table & API
- **Branch:** `fix/PO_lineTotal-uat` (Dev: `fix/PO_lineTotal`)
- **PR:** #108
- **Commits:** `b6170b6`, `2797999`, `85dbe66`
- **Key Files:** 
  - Backend: `backend/app/models/purchase_order.py`, `backend/app/schemas/purchase_order.py`, `backend/tests/test_po_totals.py`
  - Frontend: `frontend/src/pages/purchase-orders/PurchaseOrderDetailPage.tsx`, `frontend/src/pages/purchase-orders/poLineTableColumns.ts`, `frontend/src/pages/purchase-orders/poTerminology.ts`, `frontend/src/pages/purchase-orders/PurchaseOrderDetailPage.test.tsx`, `frontend/src/services/mock/mockApi.ts`, `frontend/src/types/index.ts`
- **Description:**
  - Added computed property `@property def line_total(self) -> float` on `PurchaseOrderItem` calculating `round((self.quantity or 0) * (self.unit_cost or 0.0), 2)`.
  - Exposed `line_total: Optional[float]` in `PurchaseOrderItemResponse` schema and wired it through `item_to_response()`.
  - Added dedicated "Line Total" column in `PurchaseOrderDetailPage` positioned directly adjacent to unit cost figures, styled in bold and formatted with currency.
  - Updated `poLineTableColumns.ts` and `poDetailTableMinWidth` to support dynamic width adjustments with the new column (96px).
  - Configured mock API responses to return `lineTotal` across mock PO creation and receiving flows.
  - Added frontend test suite verifying Line Total calculation and table display in `PurchaseOrderDetailPage.test.tsx`, mocking `EntityAuditLog` to prevent render crashes.

---

### 4.2 Feature: Supplier Payment Details, Committed PO KPIs & Server Pagination
- **Branches:** `feat/supplier-payment-kpis-uat` (Dev: `feat/supplier-payment-kpis`)
- **PR:** [PR #106](https://github.com/yaman1234/KoMart/pull/106)
- **Commits:** `c2526d7`, `d1a9068`, `82bb918`, `33ccd70`
- **Key Files:** 
  - Backend: `backend/app/models/supplier.py`, `backend/app/models/purchase_order.py`, `backend/app/routers/suppliers.py`, `backend/app/services/purchase_returns.py`, `backend/tests/test_supplier_payment_details.py`, `backend/tests/test_supplier_po_kpis.py`, `backend/tests/test_supplier_list_and_returns.py`
  - Frontend: `frontend/src/pages/suppliers/SupplierDetailPage.tsx`, `frontend/src/pages/suppliers/components/SupplierPaymentFields.tsx`, `frontend/src/pages/suppliers/components/SupplierFormDialog.tsx`, `frontend/src/pages/suppliers/supplierPoKpis.ts`, `frontend/src/types/index.ts`
- **Description:**
  - **Supplier Payment Profiles:** Adds structured payment details for suppliers supporting eSewa, Fonepay, Khalti, Bank Transfer, and Other methods. Captures account names, numbers, bank branches, and validated HTTPS QR image URLs with inline modal previews.
  - **Committed PO Financial KPIs:** Aggregates purchase orders strictly in committed states (`ordered`, `partial`, `received`), excluding draft and cancelled POs so unconfirmed orders do not distort liabilities. Provides financial metric cards on Supplier detail: Committed Count/Amount, Received Count/Amount, Pending Count/Amount, Total Paid, and Outstanding Payables.
  - **Supplier Returns & Receivables:** Displays return KPIs (receivable count and amount) and ensures stock reversal only deducts inventory batches from committed purchase orders while dropping obsolete or deleted catalog items.
  - **Server-Side Pagination & Hardening:** Paginates supplier purchase orders, returns, and associated products on the server; returns 404 for non-existent supplier IDs; extends supplier search indexing to contact persons and phone numbers; preserves row selection across table pagination.

---

### 4.3 Feature: Barcode Label Printing Updates & Receipt Layout Fixes
- **Branch:** `feat/update_print`
- **PR:** #104
- **Commits:** `2a7fda2`, `8be9a92`, `0fecd11`
- **Key Files:** `frontend/src/utils/labelPrint.ts`, `frontend/src/utils/receiptPrint.ts`, `frontend/src/components/pos/BarcodeLabelPrintDialog.tsx`, `frontend/src/components/pos/ReceiptView.tsx`
- **Description:**
  - Refines layout and CSS dimensions for 38mm × 25mm Code 128 thermal label output to avoid cutoffs across various thermal printer models.
  - Resolves receipt printing alignment issues in POS (`ReceiptView` and `SaleDetailPage`), correcting unit-of-measure (UOM) display strings and spacing.

---

### 4.4 Feature: Code 128 Shelf Label Printing & SKU Collision Guard
- **Branch:** `feat/barcode-label-print-uat` (Local: `feat/barcode-label-print`)
- **PR:** #98
- **Commits:** `26dfce4`, `17cb61d`
- **Key Files:** `frontend/src/pages/products/ProductDetailPage.tsx`, `frontend/src/pages/products/components/ProductSheetView.tsx`, `backend/app/routers/products.py`
- **Description:**
  - Thermal barcode label printing support tailored for standard 38mm × 25mm shelf labels using Code 128 formatting.
  - Direct print triggers from product detail page and in bulk from the product sheet view.
  - Collision guard validation: ensures that an assigned product barcode cannot duplicate any existing active product's SKU, and vice-versa.

---

### 4.5 Bug Fix: PO List 500 when `include_summary=false`
- **Branch:** `fix/po-list-include-summary-uat` (Local: `fix/po-list-include-summary`)
- **PR:** #100
- **Commits:** `49db5fb`, `64e9fbc`
- **Key Files:** `backend/app/routers/purchase_orders.py`, `backend/tests/test_purchase_order_summary_flag.py`
- **Description:**
  - Fixed an `UnboundLocalError` (HTTP 500) occurring when `include_summary=false` was supplied to `list_purchase_orders` (such as in lean supplier views).
  - Defaults `summary` metrics alongside other zeroed KPIs so lean listing queries execute reliably.

---

### 4.6 Feature: Purchase Order VAT Bill Calculations & Persistence
- **Branch:** `feat/po-vat-bill-totals-uat` (Local: `feat/po-vat-bill-totals`)
- **PR:** #96
- **Commits:** `e74479a`, `20c361f`
- **Key Files:** `backend/app/models/purchase_order.py`, `backend/app/schemas/purchase_order.py`, `frontend/src/pages/purchase-orders/PurchaseOrderDetailPage.tsx`, `frontend/src/pages/purchase-orders/PurchaseOrderFormPage.tsx`
- **Description:**
  - Calculates subtotal as `quantity × cost_price` before tax, applies 13% VAT strictly to that subtotal, and persists `order_total = subtotal + VAT - discount + additional_charges`.
  - Non-VAT purchase orders remain unchanged using standard net calculation. Orders missing the tax flag default safely to non-VAT.

---

### 4.7 Feature: API Timeout / Cold-Start User Notification
- **Branch:** `feat/api-timeout-refresh-message-uat` (Local: `feat/api-timeout-refresh-message`)
- **PR:** #94
- **Commits:** `f224ee1`, `bc3d781`
- **Key Files:** `frontend/src/services/apiClient.ts`, `frontend/src/components/common/GlobalTimeoutBanner.tsx`
- **Description:**
  - Handles UX degradation when backend instances experience cold-starts exceeding frontend timeouts.
  - Displays a single, dismissible, app-wide toast prompting the user to refresh the page.
  - Bypasses mock API mode, expected HTTP errors, and background 401 token refresh retries.

---

### 4.8 Feature: POS "Go to Product" Navigation & Cart Preservation
- **Branch:** `feat/pos-go-to-product-uat` (Local: `feat/pos-go-to-product`)
- **PR:** #92
- **Commits:** `b17cae2`, `ecf1282`, `8840722`, `8dbcfda`
- **Key Files:** `frontend/src/pages/pos/POSPage.tsx`, `frontend/src/components/pos/PosQuickViewModal.tsx`, `frontend/src/services/apiClient.ts`
- **Description:**
  - Administrators and managers can transition directly from POS quick-view to product edit or stock ledger without losing in-flight cart items; returning to `/pos` restores cart state and active filters.
  - Dynamically displays "Piece" unit label only when single-piece pack items are inspected.
  - Fixes post-login race conditions causing bursts of 401 errors by queuing requests until the saved access token is validated.

---

### 4.9 Bug Fix: Sales Date Filter Kathmandu Timezone Default
- **Branch:** `fix/sales-default-today-uat` (Local: `fix/sales-default-today`)
- **PR:** #89
- **Commits:** `9b5feac`, `a53771d`
- **Key Files:** `frontend/src/pages/sales/SalesListPage.tsx`
- **Description:**
  - Missing date parameters on `/sales` now automatically resolve to current Kathmandu calendar day (UTC+5:45) instead of a 30-day window, while preserving explicit date query parameters.

---

### 4.10 Bug Fix: Pagination Rows-per-Page Reset Preservation
- **Branch:** `fix/pagination-rows-per-page`
- **PR:** #87
- **Commits:** `aef61a8`, `63c16e6`
- **Key Files:** `frontend/src/hooks/useListState.ts`, `frontend/src/hooks/useListState.test.tsx`
- **Description:**
  - Fixes race condition where changing rows-per-page reset page to 1 using stale URL state, discarding the new page size.
  - Carries pending state forward so pageSize changes persist cleanly. Extends page size support to Customer and Purchase Return tables.

---

### 4.11 Bug Fix: Exclude Draft Purchase Orders from Dashboard Accounts Payable
- **Branch:** `fix/uat-06-dashboard-payables`
- **PR:** #84
- **Commits:** `75b6c11`, `9879b63`
- **Key Files:** `backend/app/routers/dashboard.py`, `backend/tests/test_dashboard_payables.py`
- **Description:**
  - Constrains dashboard outstanding payables metric strictly to `ordered`, `partial`, and `received` statuses, bringing dashboard numbers into parity with Reports Active PO Bills.

---

### 4.12 Bug Fix: Inventory Movement Ledger Closing Balance Mismatch & Sync Validation
- **Branch:** `fix/uat-05-ledger-closing-mismatch`
- **PR:** #83
- **Commits:** `884f789`, `a072c22`
- **Key Files:** `backend/app/routers/inventory.py`, `backend/app/services/inventory_movements.py`, `backend/tests/test_inventory_integrity.py`
- **Description:**
  - Hardens stock movement reconciliation against desynchronization.
  - If a SKU is already in sync, calling manual Align API returns HTTP 400 Bad Request to prevent superfluous diary entries.
  - Clarifies dialog copy that Align updates accounting ledger audit trails without modifying physical on-shelf stock counts.

---

### 4.13 Bug Fix: Stock Count Selected Products Full Catalog Snapshotting
- **Branch:** `fix/uat-04-stock-count-selected-products`
- **PR:** #82
- **Commits:** `89cb5b0`, `a5c6c01`
- **Key Files:** `backend/app/services/stock_count.py`, `frontend/src/pages/stock-count/StockCountFormPage.tsx`
- **Description:**
  - Fixed an issue where submitting a stock count in "Selected Products" mode without picking products snapshotted all active SKUs.
  - UI now enforces selecting at least one product, and backend rejects empty selection payloads.

---

### 4.14 Bug Fix: Purchase Order Line Quantity Validation
- **Branch:** `fix/uat-03-po-quantity-validation`
- **PR:** #81
- **Commits:** `bc80804`, `ae5007b`
- **Key Files:** `backend/app/models/purchase_order.py`, `backend/app/schemas/purchase_order.py`, `frontend/src/pages/purchase-orders/poQuantity.ts`
- **Description:**
  - Eliminates silent clamping of invalid quantities to 1 and enforces integer validation between 1 and 100,000 across lines, paste parsing, and receiving.

---

### 4.15 Bug Fix: Barcode Duplication Handling & POS Ambiguity Selection
- **Branch:** `fix/uat-02-duplicate-barcode`
- **PR:** #80
- **Commits:** `bf4e328`, `7cc4e87`
- **Key Files:** `backend/app/database.py`, `backend/app/routers/products.py`, `frontend/src/components/pos/PosBarcodeChoiceDialog.tsx`
- **Description:**
  - Enforces partial unique index on non-empty barcodes for active products.
  - Introduces `PosBarcodeChoiceDialog` in POS to select between duplicate items if scanning a legacy duplicate barcode.

---

### 4.16 Bug Fix: Inventory Filtered Valuation Calculation Across All Pages
- **Branch:** `fix/uat-01-inventory-filtered-total`
- **PR:** #79
- **Commits:** `304f502`, `444f6bf`
- **Key Files:** `backend/app/routers/inventory.py`, `backend/tests/test_inventory_filtered_total.py`
- **Description:**
  - Updated backend inventory queries to calculate total stock value (`sum(stock_quantity * cost_price)`) across the complete matching filter query set rather than only the current page slice.

---

### 4.17 Infrastructure & Build Updates on UAT
- **Commits:** `10d43ea`, `465a1eb`, `a446714`, `828bce8`, `412f133`, `be4aa1c`
- **Key Files:** `frontend/scripts/generate-redirects.cjs`, `frontend/public/_redirects`, `netlify.toml`, `backend/.env`
- **Description:**
  - Multi-cloud routing: Production directed to Vercel, UAT staging to Render.
  - Netlify API proxy routing and single-page app fallback rewrite rules.
  - Safe parsing guard for catalog categories array.

---

## 5. Release & Deployment Guide: Pushing UAT to Main

Follow these standard operational steps to push `uat` into `main` and execute the production deployment:

### Step 1: Ensure Local Git Working Tree is Clean
```bash
git checkout uat
git pull origin uat
git status
```

### Step 2: Switch to `main` and Synchronize
```bash
git checkout main
git pull origin main
```

### Step 3: Merge `uat` into `main`
Option A — Via CLI:
```bash
# Merge uat into main
git merge uat -m "Release 26121: Merge UAT into main"
```
Option B — Via GitHub Pull Request (Recommended for audit trails):
- Open a PR from base `main` ← compare `uat`.
- Title: `Release 26121: Promotion of UAT to Main`.
- Merge using standard merge commit (to preserve release history).

### Step 4: Tag the Release
```bash
git tag -a v26121 -m "Release 26121 - Supplier payment profiles, PO Line Totals, committed PO KPIs, VAT engine, barcode printing, and stability fixes"
```

### Step 5: Push `main` and Tags to Origin
```bash
git push origin main --tags
```

### Step 6: Post-Deployment Smoke Verification
1. **Frontend (Vercel):** Verify automatic build triggers on Vercel for `main`. Confirm status is green.
2. **Backend (Render):** Verify backend deploy succeeds on Render production environment.
3. **Database Checks:** Confirm partial unique index on products barcode exists.
4. **Smoke Test Production:**
   - Log into production KoMart.
   - Verify PO Detail item line displays the "Line Total" column.
   - Open Supplier Details and confirm Payment Methods (eSewa, Fonepay, Khalti, Bank) & Committed PO KPIs.
   - Verify POS sales and printing actions.

---

## 6. Pre-Merge Verification Checklist (Signed-Off)

- [x] **PR #108 Merged into UAT (`b6170b6`):** PO Line Total display in table & API response.
- [x] **PR #106 Merged into UAT (`c2526d7`):** Supplier payment profiles, committed PO KPIs, return KPIs & pagination.
- [x] **PR #104 Merged into UAT (`2a7fda2`):** Thermal barcode printing & POS receipt format fixes.
- [x] **PR #100 Merged into UAT (`49db5fb`):** PO List 500 error resolved for `include_summary=false`.
- [x] **PR #98 Merged into UAT (`26dfce4`):** Code 128 label printing and barcode collision prevention.
- [x] **PR #96 Merged into UAT (`e74479a`):** VAT Bill 13% tax engine and calculation persistence.
- [x] **PR #94 Merged into UAT (`f224ee1`):** Cold-start timeout toast prompt.
- [x] **PR #92 Merged into UAT (`b17cae2`):** POS "Go to Product" with cart retention.
- [x] **PR #89 Merged into UAT (`9b5feac`):** Sales default Kathmandu date filter.
- [x] **PR #87 Merged into UAT (`aef61a8`):** Rows-per-page pagination preservation.
- [x] **PR #84 Merged into UAT (`75b6c11`):** Dashboard Accounts Payable draft exclusions.
- [x] **PR #83 Merged into UAT (`884f789`):** Inventory movement ledger sync validation.
- [x] **PR #82 Merged into UAT (`89cb5b0`):** Stock count selected products selection guard.
- [x] **PR #81 Merged into UAT (`bc80804`):** Purchase order line quantity bounds (1 - 100,000).
- [x] **PR #80 Merged into UAT (`bf4e328`):** Duplicate barcode resolution & unique constraints.
- [x] **PR #79 Merged into UAT (`304f502`):** Filtered inventory total valuation across full query.
- [x] **Automated Backend Tests Passed:** `pytest` suites green (including `test_po_totals.py` and `test_supplier_payment_details.py`).
- [ ] **Frontend Build Validated:** `npm run build` completed with zero TypeScript errors.
- [ ] **Ready for Merge into `main`:** Approved for production deployment.
