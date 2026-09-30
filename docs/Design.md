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

### Must-Have F1–F5 — Create / Edit PO with Discount & Charges

**Screen:** `/purchase-orders/new` and `/purchase-orders/:id/edit` (`PurchaseOrderFormPage`)

1. User fills Order details (supplier, delivery, ordered by) — unchanged.
2. User adds line items — unchanged grid.
3. Below the grid, **Order Summary** appears (right-aligned on desktop):
   - Subtotal = sum of valid lines (qty × unit cost).
   - Discount — editable; default 0.
   - Additional charges — editable; default 0.
   - Order total — read-only formula result.
4. Save as Draft / Place Order / Save Changes sends `discount`, `additionalCharges`, and server-confirmed `totalAmount`.
5. Validation: supplier/items rules unchanged; discount/charges cannot be negative; discount cannot exceed subtotal on submit; if API returns total &lt; amount paid, show error Alert.

**Empty / zero state:** both fields show `0` or empty treated as 0; Order total equals Subtotal.

### Must-Have F6 — Detail read-only breakdown

**Screen:** `/purchase-orders/:id` (`PurchaseOrderDetailPage`)

- Near existing “Order Total” display, show the four-row summary.
- Received/cancelled POs: summary remains visible; no edit controls for discount/charges.
- Payments section unchanged; remaining balance uses Order total.

### Supplier bill (Detail — any status)

**Screen:** `/purchase-orders/:id` Supplier bill block

- Manager+: **Edit bill** always available (draft through cancelled) — bill number + photo upload/remove; saves via `PATCH /bill`, not Edit Order.
- Cashiers: read-only bill number + thumbnail gallery.
- Not tied to `canEditPurchaseOrder` / Edit Order button.

### Must-Have F7–F8 — Payments & legacy

- No new payment UI fields for v1.
- Opening an old PO shows Discount `0.00`, Additional charges `0.00`, Subtotal ≈ historical total.

### Form bill fields (create/edit)

- Bill number text field + thumbnail strip on Form for editable POs (draft/ordered/partial).
- Encourage attach with helper text: “Add supplier bill photo (optional)”.

### Must-Have F9–F10 — PO list Bill no.

**Screen:** `/purchase-orders` (`PurchaseOrdersPage`)

- Column **Bill no.** after Supplier: show `billNumber` when set, else “—”.
- Read-only; not a filter (F11 later). Does not change row click / Edit behavior.

---

## Responsive Behavior

| Breakpoint | Behavior |
|------------|----------|
| ≥ 900px | Summary block ~360px wide, `margin-left: auto` under the grid |
| &lt; 900px | Summary full width under grid; inputs full width of summary |
| Touch | Number fields still `size="small"` but min tap height 40px if theme allows |

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
