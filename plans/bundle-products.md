# Bundle (Combo) Products

Combos are **real, sellable products**, not promotions. A bundle SKU is a single
POS line that is made from other products: it holds no stock of its own, derives
its availability from its components, and deducts each component when sold.

There is no promotion/discount integration. A combo's price is its own selling
price, so a receipt line for a combo needs no special money handling.

Superseded plans for the discarded eligibility-discount design:
`docs/guides/COMBO_OFFERS_PLAN.md` (removed) and the earlier
`plans/combo-offers.md` content.

---

## 1. Core rules

| Rule | Value |
|---|---|
| Stock | Derived: `min(floor(component_stock / component_qty))` |
| Cost at sale | Weighted from the batches actually deducted (FEFO), not `cost_price` |
| Deduction | Per component, in the component's base UOM |
| Revenue | Recorded once, on the bundle SKU line |
| Component movements | Zero sale value (`unit_selling_price = 0`) to avoid double counting |
| Components | 2–20 unique products; duplicates merged by summing quantity |
| Nesting | Not supported (keeps derivation one level deep and cycle-free) |
| Bundle sell fields | Forced `units_per_buy_uom = 1`, `sell_mode = unit`, `pack_selling_price = 0` |
| Description | Generated: `"Combo pack containing: 2 x A, 1 x B"` |
| Excluded from | Stock counts, manual adjustments, purchasing, purchase orders, receiving, inventory lists, stock KPIs, low-stock/dead-stock reports, expiry alerts |

`BatchAllocation.product_id` records the owning component for bundle lines, so
voiding a sale restores stock on the right products.

---

## 2. Backend layout

| Concern | Location |
|---|---|
| Model | `backend/app/models/product.py` — `BundleComponent`, `Product.is_bundle`, `Product.bundle_components` |
| Schema + validation | `backend/app/schemas/product.py` — `normalize_bundle_components`, `MIN_BUNDLE_COMPONENTS` |
| Helpers | `backend/app/services/bundles.py` — `expand_bundle`, `bundle_available`, `resolve_stock_map`, `stock_map_for`, `derived_stock_for`, `bundle_cost`, `build_bundle_description`, `NON_BUNDLE_FILTER` |
| CRUD | `backend/app/routers/products.py` — `_resolve_bundle_fields`, derived stock in responses |
| Sale | `backend/app/services/sales.py` — expansion, availability, FEFO deduction, weighted cost, bundle-aware void |
| Exclusions | `routers/inventory.py`, `routers/reports.py`, `services/stock.py`, `services/stock_count.py`, `services/reporting.py`, `services/notifications.py`, `services/po_receive.py`, `routers/purchase_orders.py` |
| Tests | `backend/tests/test_bundle_products.py` |

`NON_BUNDLE_FILTER = {"is_bundle": {"$ne": True}}` matches legacy documents
written before `is_bundle` existed.

---

## 3. Frontend layout

| Concern | Location |
|---|---|
| Limits | `frontend/src/constants/bundleLimits.ts` |
| Types | `frontend/src/types/index.ts` — `Product.isBundle`, `Product.bundleComponents`, `BundleComponent` |
| Component editor | `frontend/src/components/products/BundleComponentsEditor.tsx` |
| Detail view | `frontend/src/components/products/BundleContentsView.tsx` |
| Form | `frontend/src/pages/products/ProductFormPage.tsx` |
| Detail page | `frontend/src/pages/products/ProductDetailPage.tsx` |
| POS | `frontend/src/pages/pos/POSPage.tsx` — "Combo" chip; stock is the derived count |

A combo is bought, stocked, and counted through its individual products only.

---

## 4. Known unrelated failures

- `backend/tests/test_excel_update.py`: missing `scripts.import_products_from_excel`
- `frontend/src/pages/purchase-returns/PurchaseReturnDetailDialog.tsx`: MUI `Stack flexWrap` type errors (x2)
- `frontend/src/components/tables/DataTable.test.tsx`: `react-transition-group` ESM resolution