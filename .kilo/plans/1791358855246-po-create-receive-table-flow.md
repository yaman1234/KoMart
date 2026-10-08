# Purchase Order Create / Receive Table Column Flow

## Scope

Rework the column layouts of the two PO line tables so each table matches its
operator's primary task, and the product master is updated after a PO is
received. No backend changes are required — the product-sync service already
exists.

- `frontend/src/pages/purchase-orders/poLineTableColumns.ts`
- `frontend/src/pages/purchase-orders/components/PoLineItemsGrid.tsx`
- `frontend/src/pages/purchase-orders/PurchaseOrderDetailPage.tsx`

## Assumptions

- "Qty Received" on the create form = the ordered quantity column
  (already named "Buy qty"). Nothing is received at creation time; the receive
  step is where received quantity is verified.
- Existing product-sync behaviour is kept: `sync_product_uoms_from_po_lines`
  runs on create, update, and receive.
- SKU stays as a dedicated column on the create form. `poPasteParser.ts` writes
  pasted rows into `line.skuInput`, which only the SKU text cell renders —
  removing it would make pasted SKUs invisible before blur resolves.

## Create Purchase Order — 11 columns

| # | Key | Label | Editable | Notes |
|---|---|---|---|---|
| 1 | sn | SN | — | |
| 2 | sku | SKU | yes | text; paste target; resolves on blur |
| 3 | product | Product | yes | autocomplete + create + quick-view eye icon |
| 4 | qty | Buy qty | yes | packs ordered |
| 5 | buyUom | Buy unit | yes | dropdown from `useUomOptions()` |
| 6 | unitsPerPack | Units per pack | yes | conversion rate |
| 7 | totalUnits | Total units | — | computed `qty × unitsPerPack` |
| 8 | unitCost | Line price | yes | per buy unit; VAT-inclusive when VAT bill |
| 9 | beforeVat | Before VAT | yes | only when VAT bill |
| 10 | lineTotal | Line total | — | `qty × unitCost` |
| 11 | actions | — | delete | |

Removed: Sell unit, Sell mode, Existing unit cost, Existing selling price,
New selling price.

Those four removed columns are still seeded onto the line by
`applyProductToLine` and persisted via `buildPayload` — they just stop
occupying screen space on the create form.

Paste hint (`PO_PASTE_HINT`) already reads "SKU · Product · Buy qty · Buy
unit · Units per pack · Unit cost" and matches this layout — no change.

## Receive Purchase Order — 15 columns

| # | Key | Label | Editable | Notes |
|---|---|---|---|---|
| 1 | checkbox | — | yes | select rows to receive |
| 2 | sn | SN | — | |
| 3 | product | Product | — | name + `qty × units = total` subcaption + details icon |
| 4 | ordered | Ordered | — | |
| 5 | received | Received | — | already received |
| 6 | buyQty | Buy qty | yes | packs to receive this run |
| 7 | unitsPerPack | Units per pack | yes | editable; default = line value |
| 8 | totalUnits | Total units | — | `buyQty × unitsPerPack` for this run |
| 9 | expiry | Expiry | yes | date, only when selected |
| 10 | status | Status | — | chip |
| 11 | buyPrice | Buy price | — | `formatCurrency(item.unitCost)` |
| 12 | sellPrice | Sell price | — | `formatCurrency(item.sellingPrice)` |
| 13 | sellPcs | Sell price (pcs) | — | per-piece price, `item.sellingPrice` |
| 14 | lastBuy | Last buy | — | tooltip with last purchase details |
| 15 | lineTotal | Line total | — | `qty × unitCost` |

Removed: Existing unit cost, Existing selling price, New selling price,
Before VAT.

Buy price = `item.unitCost` (the VAT-inclusive landed cost when VAT bill).
The receive table is a verification table — it does not need the catalog's
selling-price columns.

## Product update after receive

Already implemented. `backend/app/services/po_product_sync.py` runs on
create, update, and receive; the receive path also updates the product's
conversion when the delivered pack size differs from the ordered one.

## Validation

1. `npx tsc --noEmit` clean in `frontend/`.
2. Backend suite: `python -m pytest -q --ignore=tests/test_excel_update.py`
   (152 passed baseline).
3. Manual: create PO → place order → receive → confirm product `buy_uom`,
   `uom`, `units_per_buy_uom`, `sell_mode` reflect the line values.
4. Manual: paste a tab-separated block into the create grid → confirm all
   pasted fields land and SKUs resolve.
5. Manual: receive a PO with a prior purchase on the product → confirm the
   "Last buy" column shows the previous unit cost.

## Task List

| ID | Task | Files | Depends On | Acceptance |
|----|------|-------|------------|------------|
| T01 | Update column constants | `poLineTableColumns.ts` | — | `PO_FORM_COLUMNS` = 11 entries; `PO_DETAIL_FLAT_COLUMNS` = 15 entries; widths sum to a sane total and `poFormTableMinWidth`/`poDetailTableMinWidth` stay exported |
| T02 | Rewrite create-form header + body | `PoLineItemsGrid.tsx` | T01 | Header renders the 11 columns in order; body cells map 1:1; `poFormColWidths(vatBill)` colgroup matches; paste hint unchanged |
| T03 | Remove dropped create cells | `PoLineItemsGrid.tsx` | T02 | Sell unit, Sell mode, Existing unit cost, Existing selling price, New selling price cells and their `convertSellingPrice`/`packSellOption`/`sellUomOptionsFor` usages deleted from the body; `applyProductToLine` seeding untouched |
| T04 | Rewrite receive table header | `PurchaseOrderDetailPage.tsx` | T01 | Header renders the 15 columns in order; `canReceive` gates checkbox/buyQty/totalUnits/expiry; VAT bill gates nothing here (buy price is already inclusive) |
| T05 | Rewrite receive table body | `PurchaseOrderDetailPage.tsx` | T04 | Body cells map 1:1; `sellPrice` = `item.sellingPrice`; `sellPcs` = per-piece price (`item.sellingPrice`, or `item.sellingPrice / units` when a conversion exists — reuse `pieceSellOption`/`packSellOption` from `uomSell.ts`); `lastBuy` shows "—" with a tooltip when no prior purchase |
| T06 | Fetch last-purchase cost on detail load | `PurchaseOrderDetailPage.tsx` | T05 | On mount, call `productService.getLastPurchaseUnitCost` for each line's product id; store in a `lastBuyMap`; `lastBuy` column renders the previous unit cost and tooltip includes purchased date + PO order number when available; mock mode returns `unitCost: null` (renders "—") |
| T07 | Typecheck + tests | — | T03, T06 | `npx tsc --noEmit` clean; backend suite `python -m pytest -q --ignore=tests/test_excel_update.py` still 152 passed; restore `backend/tests/__pycache__/*.pyc` after running |

## Open question

Should the create form keep a read-only "Sell unit" indicator (no editor) so
operators can see what will be stored on the product, without editing it?
Recommendation: no — the Product detail page already shows it.