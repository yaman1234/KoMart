# Memory — Purchase Order Totals / Inventory UX

running log of completed work — updated after each task, newest entries at top, never compress or delete old entries

## Completed Tasks

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
