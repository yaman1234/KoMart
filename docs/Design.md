# Design — Purchase Order Totals

**Reads:** [prd.md](prd.md)  
**Context:** Extend existing KoMart PO screens; preserve MUI density and Excel-like line grid. Prefer clean, simple composition — no new card chrome.

---

## Design Principles

1. **One job per block** — Order details stay supplier/dates; line grid stays items; a single Order Summary owns money adjustments.
2. **Readable math** — Always show Subtotal → Discount → Additional charges → Order total so staff can match a paper bill.
3. **Edit only what changes** — Subtotal and Order total are read-only; Discount and Additional charges are the only editable money fields.
4. **Same language on detail** — Detail page mirrors the same four rows so create and review never disagree.
5. **Quiet UI** — Compact rows, no badges/stickers on the summary; rely on typography weight for the final total.

---

## Visual System

Align with existing KoMart admin (MUI theme). Use these tokens for the Order Summary:

| Token | Value | Use |
|-------|-------|-----|
| Text primary | theme `text.primary` (approx `#1A1A1A`) | Labels and amounts |
| Text secondary | theme `text.secondary` (approx `#6B7280`) | Row labels for subtotal/discount/charges |
| Accent / total | theme `primary.main` | Order total emphasis (weight 700) |
| Surface | `#FFFFFF` / `Paper` default | Form sections |
| Border | `divider` (approx `#E5E7EB`) | Optional top rule above Order total |
| Error | theme `error.main` | Invalid negative input |
| Spacing unit | 8px | MUI spacing |
| Summary width | max ~360px, right-aligned | Desktop; full width on narrow screens |

**Type scale (summary)**

| Role | Variant | Weight |
|------|---------|--------|
| Section title | `subtitle1` | 600 |
| Row label | `body2` | 400 |
| Row amount | `body2` | 500 |
| Order total label | `subtitle1` | 700 |
| Order total amount | `subtitle1` | 700 |

**Iconography:** none required for v1 summary. v1.1 bill photos may use existing upload/image icons from product form.

---

## Core Components

### OrderSummary (create/edit)

| Element | States |
|---------|--------|
| Subtotal row | **default** read-only currency |
| Discount `TextField` | **default** empty/0; **hover** standard MUI; **active** focused; **disabled** when form submitting or status not editable; **error** if &lt; 0 or &gt; subtotal after blur/submit |
| Additional charges `TextField` | same states as Discount (error if &lt; 0) |
| Order total row | **default** emphasized; updates live as lines or fields change |

Layout: vertical stack, each row `display: flex; justify-content: space-between; gap: 16px`. Inputs are `size="small"`, number, right-aligned text, currency adornment if the app already uses one elsewhere; otherwise plain number with formatted total below.

### OrderSummaryReadOnly (detail)

Same four rows; Discount and Additional charges shown as formatted currency (hide or show `0.00` consistently — prefer always show for audit clarity).

### Header chip (optional keep)

Existing “N items · total” chip should use **Order total** (adjusted), not raw subtotal, so it matches the payable amount.

---

## Key Screens / Flows

### Terminology (source of truth)

All PO create/edit/receive labels come from [`poTerminology.ts`](../frontend/src/pages/purchase-orders/poTerminology.ts) (`PO_LABELS`, `PO_SELL_AS_OPTIONS`, paste/receive/entry-flow hints). Product form/sheet share qty / Buy unit / Per pack / Cost via [`productFieldLabels.ts`](../frontend/src/constants/productFieldLabels.ts). Do not invent alternate strings (e.g. “Conversion Rate”, “Units per buy UOM”) in UI copy.

| Concept | Label |
|---------|--------|
| Buy UOM | Buy unit |
| Units per buy | Per pack (grid) / Pcs in pack (product details) |
| Cost pack / piece | Cost / pack · Cost / pc |
| Sell pack / piece | Price / pack · Price / pc |
| Sell mode | Sell as — Pack only / Piece only / Pack & piece |
| Receive qty | Receiving now (packs) |
| Prior receive | Already in |
| Stock delta | Stock added (= Receiving now × Pcs in pack) |

### Must-Have F1–F5 — Create / Edit PO with Discount & Charges

**Screen:** `/purchase-orders/new` and `/purchase-orders/:id/edit` (`PurchaseOrderFormPage`)

1. User fills Order details (supplier, delivery, ordered by).
2. User adds line items in `PoLineItemsGrid`: SKU / Product / Qty / Buy unit / Per pack / Total units / Cost / Amount; toolbar **Create product**, paste, add row; eye opens product quick view; cost cell may show ↑/↓ vs last purchase Unit Cost.
3. Below the grid, **Order Summary** appears (right-aligned on desktop):
   - Subtotal = sum of valid lines (qty × unit cost).
   - Discount — editable; default 0.
   - Additional charges — editable; default 0.
   - Order total — read-only formula result.
4. Save as Draft / Place Order / Save Changes sends `discount`, `additionalCharges`, and server-confirmed `totalAmount`.
5. Validation: supplier/items rules unchanged; discount/charges cannot be negative; discount cannot exceed subtotal on submit; if API returns total &lt; amount paid, show error Alert.

**Empty / zero state:** both fields show `0` or empty treated as 0; Order total equals Subtotal.

### F18 — Create product from PO

**UI:** toolbar **Create product** → Dialog title **Add Product**, `maxWidth="lg"`, embeds full `ProductFormPage` (`embedded`). Always empty on open (same fields as Products → Add Product). Cancel/Create stay in modal; on success apply product to focused line and close — no route change.

### F22 — Product eye / quick view

**UI:** eye on PO form line or detail line → `ProductQuickViewDialog` (“Product details”). Loads `getById` (images + full commerce). Body: image, name, stock chip, optional discount chip, `ProductCommerceSummary` (Buy admin/manager only; Sell for all), then SKU / Buy unit / Sell unit / Sell as / Pcs in pack and other product meta. Pack price/cost rows show only when pack conversion applies; otherwise “—”.

### Must-Have F6 — Detail read-only breakdown

**Screen:** `/purchase-orders/:id` (`PurchaseOrderDetailPage`)

- Near existing “Order Total” display, show the four-row summary.
- Received/cancelled POs: summary remains visible; no edit controls for discount/charges (Save financials removed).
- Payments section unchanged; remaining balance uses Order total.

### F23 — Receive goods

**Screen:** same detail page, receive section

1. Select open lines (select-all supported). Hint: `PO_RECEIVE_HINT`.
2. Editable: **Receiving now** (packs), **Per pack** (seed from PO line `unitsPerBuyUom`, else catalog), Sell as, Price / pack, Price / pc, Expiry.
3. Read-only helpers: Ordered, Already in, Stock added, Cost / pack, Cost / pc, Last buy, Status.
4. Validate required pack/piece prices for chosen Sell as → confirm → Process Receipt.
5. Stock added = Receiving now × Pcs in pack; product sell mode/prices/cost update from receive payload.

### Supplier bill (Detail — any status)

**Screen:** `/purchase-orders/:id` Supplier bill block

- Manager+: outlined **Edit bill** (edit icon) always available for every status — same dialog; saves via `PATCH /bill`.
- Panel: subtitle “Supplier bill”; bill number as outlined chip when set; 72px photo thumbnails; muted empty states.
- Dialog: helper “You can update this in any order status.”; photo add with image icon; remove via IconButton.
- Cashiers: read-only gallery. Not tied to `canEditPurchaseOrder` / Edit Order.

### Must-Have F7–F8 — Payments & legacy

- No new payment UI fields for v1.
- Opening an old PO shows Discount `0.00`, Additional charges `0.00`, Subtotal ≈ historical total.

### Form bill fields (create/edit)

- Bill number text field + thumbnail strip on Form for editable POs (draft/ordered/partial).
- Encourage attach with helper text: “Add supplier bill photo (optional)”.

### Must-Have F9–F10 / F24 — PO list

**Screen:** `/purchase-orders` (`PurchaseOrdersPage`)

- KPI papers (top): **Total Received Value**, **Outstanding Payable** — store-wide; ignore status/payment filters; still respect search/supplier.
- Filters: search (PO number / supplier); Status default empty = All statuses; Payment default empty = All payments; **Reset filters** clears all and restores Created date desc.
- Columns: SN (not sortable), PO Number, Supplier, **Bill no.** (`—` if empty), Status, Payment, Items, Total, Paid, Ordered By, **Created date**, Received Date, Expected Delivery.
- Every data column sortable via DataTable header. Default sort: Created date descending. New column click starts at desc; click again toggles.
- Row click → detail. Manager+ **Create Order** CTA.

### Must-Have F13 — Purchase returns

**User guide:** [guides/Purchase_Returns.md](./guides/Purchase_Returns.md)

**List** (`/purchase-returns`): **Create return** picks a PO or supplier, then the same line dialog. Status chip Requested / Closed. Refund rows expose **Record payment** (full or partial). Requested refund balance shows under Receivable and feeds dashboard Receivables.

**PO-linked** (`PurchaseOrderDetailPage`): header **Return to supplier** when leftover exists; dialog with search (if many lines), Line Total column, total under Line Total; Refund or Reduce payable. Refund stays Requested until payment is confirmed.

**Supplier** (`SupplierDetailPage`): **Return goods** — search-first filtered scrollable list of returnable leftover only; Line Total + footer total; Refund or Stock only.

**List page** `/purchase-returns`: all returns with mode/settlement/search filters; row opens PO or supplier.

**Dashboard:** purchase-return **refund** wallet inflows count toward cash/bank/eSewa **inflow** (recovery), not Sales KPI.

**Stock-only loss (F13b):**

- Return detail (stock_only): show **Stock-only loss** = formatted `totalAmount` with short helper: “Inventory write-off at cost — no cash or payable change.”
- Dashboard / day cash: tile or row **Stock-only write-offs** (today + month) beside return inflows — use warning/muted tone, not success green used for cash in.
- Do not mix stock-only amounts into Sales or Supplier refund chart series.
- List filter already has settlement = Stock only; optional subtitle on those rows: “Write-off”.

---

## Responsive Behavior

| Breakpoint | Behavior |
|------------|----------|
| ≥ 900px | Summary block ~360px wide, `margin-left: auto` under the grid |
| &lt; 900px | Summary full width under grid; inputs full width of summary |
| Touch | Number fields still `size="small"` but min tap height 40px if theme allows |

**App shell width:** `MainLayout` and `CatalogLayout` use MUI `Container` with `maxWidth={false}` — page content (lists, tables, forms) fills the available width beside the sidebar / under the catalog header. Do not reintroduce `maxWidth="xl"` (1536px) on those shells. POS and products bulk-add keep tighter gutters via layout `isFullWidth` only. Dialogs may still use xs–lg `maxWidth`.

Do not place summary in a side column that competes with the line grid on mobile.

---

## Accessibility Requirements

1. Discount and Additional charges inputs have visible `<label>` / `TextField` label (not placeholder-only).
2. Error text linked via MUI `helperText` / `aria-describedby`.
3. Order total announced as text, not color alone (weight + label “Order total”).
4. Keyboard: tab order after last grid action → Discount → Additional charges → page actions.
5. Contrast meets existing theme AA for text.secondary on white.

---

## Tone of Voice

- Direct store-ops language: “Discount”, “Additional charges”, “Order total”.
- Helper text short: “Supplier discount on this bill” / “Freight or other charges”.
- Errors specific: “Discount cannot be greater than subtotal.”
- Avoid accounting jargon (“contra”, “accrual”) in the UI.
