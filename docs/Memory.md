# Memory — Purchase Order Totals / Inventory UX

running log of completed work — updated after each task, newest entries at top, never compress or delete old entries

## Completed Tasks

### 2026-10-09 — Docs: full PO UX documentation pass
- Synced prd / architecture / Rules / Design / Task / Memory for all recent PO work (terminology, eye modal, full Add Product from PO, receive pack+sell prices, list filters/KPIs/sort)
- F12 Save financials remains **removed** (do not reintroduce); F18 is **full** embedded Product form (not slim)
- Task phases 1–7 + PO polish tasks marked Done to match shipped code; F13b KPI tasks T093–T095 still Not Started

### 2026-10-09 — Remove global 1536px page max-width
- Problem: MUI `Container` `maxWidth="xl"` capped the main content shell at 1536px, so tables/pages did not grow when zooming out or on wide monitors
- [`MainLayout.tsx`](../frontend/src/layouts/MainLayout.tsx): `maxWidth={false}` for every authenticated route; `isFullWidth` still only controls POS / products bulk-add gutters and tighter padding (`disableGutters`, `py`, side padding)
- [`CatalogLayout.tsx`](../frontend/src/layouts/CatalogLayout.tsx): `maxWidth={false}` to match the public catalog shell
- Dialog / form `maxWidth` (xs–lg) unchanged — modal sizes only, not the page shell
- Design Responsive Behavior updated: content area uses full available width beside the sidebar

### 2026-10-09 — PO list sortable columns + filter/column polish
- [`purchase_orders.py`](../backend/app/routers/purchase_orders.py): `sort_by` / `sort_order` on list; whitelist map; aggregation always `$addFields` `_items_count` then `$sort` (lean and full)
- Sortable fields: order number, supplier, bill number, status, payment status, items count, total, paid, ordered by, created, received date, expected delivery (SN not sortable)
- Default: `created_at` desc; tie-break `_id`
- [`PurchaseOrdersPage.tsx`](../frontend/src/pages/purchase-orders/PurchaseOrdersPage.tsx): DataTable `sortable` / `sortKey` / `onSort` wired like Sales; Reset filters restores createdAt desc
- Status / Payment filters default to empty (“All statuses” / “All payments”); Created date column before Expected Delivery; Bill no. shows “—” when empty
- KPI cards: Total Received Value + Outstanding Payable; store-wide (ignore status/payment; still respect search/supplier via `include_summary`)
- Mock [`mockApi.getPurchaseOrders`](../frontend/src/services/mock/mockApi.ts): snake→camel sort map including `items_count`

### 2026-10-09 — PO shared labels + product eye modal + Buy/Sell display
- Canonical copy in [`poTerminology.ts`](../frontend/src/pages/purchase-orders/poTerminology.ts): Buy unit, Per pack, Pcs in pack, Ordered / Already in / Receiving now / Stock added, Cost/Price / pack|pc, Sell as options, paste/receive hints, entry-flow steps
- [`productFieldLabels.ts`](../frontend/src/constants/productFieldLabels.ts) reuses PO qty / buy unit / per pack / cost labels on product form/sheet
- [`ProductCommerceSummary.tsx`](../frontend/src/components/products/ProductCommerceSummary.tsx) + [`PriceWithUom.tsx`](../frontend/src/components/products/PriceWithUom.tsx): Buy (Cost / pack when pack; Cost / pc) admin/manager only; Sell (Price / pack when pack sell; Price / pc); pack rows only when applicable else “—”
- [`ProductQuickViewDialog.tsx`](../frontend/src/components/products/ProductQuickViewDialog.tsx): title “Product details”; loads `productService.getById` (full incl. images); used from PO form grid + PO detail (and POS/sales)
- Eye on PO lines does **not** use lean catalog — always getById for images and commerce fields

### 2026-10-09 — PO Create product = full Add Product modal
- Replaced slim mini-create with [`ProductCreateDialog`](../frontend/src/components/products/ProductCreateDialog.tsx) `maxWidth="lg"` embedding [`ProductFormPage`](../frontend/src/pages/products/ProductFormPage.tsx) (`embedded`)
- Always opens **empty** (same fields as Products → Add Product); no navigate-away; Cancel/Create stay in modal; `onCreated` applies product to focused PO line + refreshes catalog / last-purchase cost
- Pack selling price validation uses full product form rules (not a reduced PO-only form)

### 2026-10-09 — PO receive: per-pack seed + Sell as / prices on receipt
- Detail receive table: Receiving now (packs), editable **Per pack** seeded from **PO line** `unitsPerBuyUom` then catalog; Stock added = Receiving now × Pcs in pack
- Columns: Sell as, Price / pack, Price / pc, Cost / pack, Cost / pc, Last buy, Expiry; validate pack/piece prices before Process Receipt
- `POST /purchase-orders/{id}/receive` accepts optional `units_per_buy_uom`, `sell_mode`, `selling_price`, `pack_selling_price`, `expiry_date` — updates product sell mode/prices/cost on receive; stock still packs × units per pack at line unit cost
- Select-all / open lines + `PO_RECEIVE_HINT`; do not cancel after receive (returns instead)

### 2026-10-02 — Docs: F13b stock-only write-off tracking
- Locked: stock-only returns = inventory write-off **loss at cost** (report/KPI), not silent stock OUT, not sales COGS, not wallet cash
- Updated prd (F13b / F13c), architecture, Rules, Design, Task (T092–T095), guide + TECHNICAL §6.4
- Implementation of KPI/UI still T093–T095 (Not Started)

### 2026-10-02 — Purchase returns user guide
- Added [guides/Purchase_Returns.md](./guides/Purchase_Returns.md): change summary + how-to (modes, settlements, record payment, Movement Ledger / Receivables / Accounts)

### 2026-10-02 — Purchase return cash tracking (phases 1–8)
- Cash-flow chart splits Sales vs Supplier refunds (`salesInflow` / `returnInflow`)
- Return detail shows payment history from wallet ledger; Record payment supports full / partial / write-off + received date
- Create refund no longer asks wallet; money only at Record payment
- Dashboard Receivables drill-down lists open requested refunds; day-wise tile for today’s return inflows
- Accounts deep-link `?entryType=purchase_return&referenceId=`

### 2026-10-02 — Return receivables + partial refund
- Requested refund returns count toward dashboard Receivables (outstanding)
- Month/day received from purchase_return wallet inflows
- Close modal: full remaining or partial amount + payment type + note; partial stays Requested

### 2026-10-02 — Close return: pick payment type
- Confirm payment received modal: Cash / Bank / eSewa
- `POST /purchase-returns/{id}/close` accepts `payment_method`; wallet inflow uses that method

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
