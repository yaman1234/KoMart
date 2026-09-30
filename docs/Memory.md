# Memory — Purchase Order Totals / Inventory UX

running log of completed work — updated after each task, newest entries at top, never compress or delete old entries

## Completed Tasks

### 2026-09-30 — Purchase return requested / closed
- Create return from `/purchase-returns` (PO-linked or supplier leftover)
- Refund creates `requested` (stock reversed, no wallet/payable yet); **Payment received** closes it and posts the refund
- `reduce_payable` and `stock_only` close immediately
- List shows status filter, status chip, and line detail

### 2026-09-30 — Purchase return UX + list page
- Supplier/PO return dialogs: no stale rows when API empty; product name+sku (not ObjectId); Line Total column + total under it; supplier search-first scrollable list
- Dashboard cash-flow + cash/bank/esewa KPI include `purchase_return` wallet refunds as inflow (not Sales)
- New `/purchase-returns` list page + nav; list API filters (mode, settlement, search, dates)
- Tests: `test_purchase_return.py` + `test_purchase_return_cash_flow.py` green

### 2026-09-30 — Phase 8 dual-mode purchase returns
- Backend: `PurchaseReturn` model/API (`/purchase-returns`), `po_stock_reverse`, settlements `refund` / `reduce_payable` (PO-linked) and `refund` / `stock_only` (supplier)
- Wallet `purchase_return` inflow; stock `AdjustmentType.purchase_return`; movement + Accounts filters
- FE: PO detail **Return to supplier** + returns list; Supplier **Return goods** + history
- Tests: `tests/test_purchase_return.py` (8 P0 cases) + PO bill/UX regression green
- Cap return qty by leftover PO-tagged batches (sold stock excluded); cancel from received remains blocked

### 2026-09-30 — Status-independent PO bill number & images
- Added `PATCH /purchase-orders/{id}/bill` (`PurchaseOrderBillUpdate`) — manager+; any status including received/cancelled; no `_po_is_editable`
- Does not rewrite `PurchasePriceHistory` or reopen full PO edit
- FE: `updateBill` service/mock/hook; Detail **Edit bill** dialog (Cloudinary via `VITE_CLOUDINARY_UPLOAD_PRESET_PURCHASEORDER`) for managers on any status
- FE: PO list **Bill no.** column (`PurchaseOrdersPage`)
- Tests: `tests/test_po_bill.py`; docs prd/architecture/Rules/Design/Task/Memory updated

### 2026-09-30 — PO bill Cloudinary preset-only (no folder env)
- [`cloudinaryUpload.ts`](../frontend/src/utils/cloudinaryUpload.ts): uses `VITE_CLOUDINARY_UPLOAD_PRESET_PURCHASEORDER` only; folder comes from the Cloudinary preset
- Removed `VITE_CLOUDINARY_FOLDER_PURCHASEORDER` from code, `.env.example`, and types
- Detail Supplier bill UI polish: chip bill no., 72px thumbs, outlined Edit bill + dialog IconButton remove; Edit bill remains `canManage`-only for all statuses

### 2026-09-27 — Removed Save financials (post-receive amend)
- Removed `PATCH /purchase-orders/{id}/financials`, FE Save financials UI/hook/service, and `test_po_financials.py`
- Discount / additional charges remain editable on PO create/edit; detail Order Summary is read-only
- Updated How-it-works steps (set discount/charges at create; no post-receive amend)

### 2026-09-27 — PO UX fixes (list KPIs, layout, financials vs payment, pack labels, history supplier, cancel block)
- List: Reset filters; KPI aggregation uses search+supplier only (ignores status/payment); card subtitle
- Detail/Form: denser supplier+payment header; bill block lower-left under items; smaller Expiry; PO entry flow alert
- Save financials vs Record payment helpers + effect toasts; Conversion Rate → Units per pack (12×5=60 hint)
- PurchasePriceHistory: supplier_id/name on receive + Inventory history column
- Block cancel from received/partial (FE status options + BE PATCH); tests in `test_po_ux_status_kpis.py`
- React Query: single prefix invalidate for PO mutations (no duplicate detail GET)

### 2026-09-27 — Phases 1–7 implementation + tests
- **Phase 1:** `subtotal`/`discount`/`additional_charges`, `compute_po_totals`, Form/Detail Order Summary; `tests/test_po_totals.py` + legacy/receive regression green
- **Phase 2:** `PATCH /purchase-orders/{id}/financials` (received only, overpay allowed); Detail amend UI + overpay chip; `tests/test_po_financials.py` green
- **Phase 3:** `bill_number`/`bill_images` on PO; Form upload + Detail gallery; payment billNo defaults from PO
- **Phase 4:** Slim `ProductCreateDialog` + PO grid create-product action
- **Phase 5:** `PurchasePriceHistory` model, write on receive, list + last-purchase-unit-cost APIs, Inventory tab; `tests/test_purchase_price_history.py` green
- **Phase 6:** Unit Cost delta icon vs last purchase Unit Cost on PO grid
- **Phase 7:** Batch `received_quantity`; UI columns Received Qty / Remaining Qty / Unit Cost
- Regression pack: `test_po_totals`, `test_po_financials`, `test_po_legacy_nulls`, `test_po_receive`, `test_purchase_price_history` passed

### 2026-09-27 — Phase 0 docs refresh
- Updated `docs/Task.md` and promoted features in `docs/prd.md`
