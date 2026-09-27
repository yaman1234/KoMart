# PRD — Purchase Order Totals (Discount & Additional Charges)

**Product:** KoMart  
**Feature:** Purchase Order create/edit totals enhancement  
**Version:** v1 planning  
**Status:** Ready for architecture

---

## Problem Statement

Store managers create purchase orders by entering line items (quantity × unit cost). The order total is only the sum of those lines. Real supplier bills often include a supplier discount and extra charges (freight, handling, packaging). Today those amounts cannot be recorded on the PO, so the payable total is wrong, payments and outstanding balances drift from the supplier invoice, and staff keep side notes outside the system.

Separately, managers need a clear policy for attaching supplier bill evidence and for correcting mistakes after a PO is placed or received—especially when some stock has already been sold.

---

## Goals & Non-Goals

### Goals

1. Let managers enter a flat **Discount** and flat **Additional Charges** while creating or editing a PO (before it is fully received).
2. Persist those amounts and show a clear Order Summary: Subtotal → Discount → Additional Charges → Order Total.
3. Use the resulting Order Total as the payable amount for payments and outstanding balance.
4. Document recommended workflows for bill number/images and for correcting incorrect POs (including after receive and after sales).

### Non-Goals (v1)

- Percentage-based PO discounts.
- Allocating discount or additional charges into inventory unit cost / landed cost on receive.
- Hard-deleting purchase orders after they are ordered or received.
- Building full purchase-return or reverse-receive UI in v1 (documented as later work).
- Requiring bill images or bill number before placing an order.
- Changing POS, sales discounts, or supplier catalog pricing.

---

## Target Users & Use Cases

| Role | Context |
|------|---------|
| Manager / Admin | Creates and edits POs, receives goods, records supplier payments |
| Cashier | Does not manage POs (no change) |

### Use cases

1. **As a** manager, **I want** to enter a supplier discount amount on a PO, **so that** the payable total matches the supplier invoice.
2. **As a** manager, **I want** to enter additional charges (e.g. freight) on a PO, **so that** I can pay the full landed invoice without adjusting line costs.
3. **As a** manager, **I want** to see Subtotal, Discount, Additional Charges, and Order Total while creating the PO, **so that** I can verify the bill before placing the order.
4. **As a** manager, **I want** the same breakdown on the PO detail screen, **so that** anyone reviewing the order sees how the payable total was derived.
5. **As a** manager, **I want** payments and outstanding balance to use the adjusted Order Total, **so that** partial payments remain accurate.
6. **As a** manager, **I want** optional bill number and bill photos on a PO (v1.1), **so that** I can match the system order to the paper/PDF invoice.
7. **As a** manager, **I want** clear rules for edit vs cancel vs return when a PO is wrong, **so that** I do not break stock or sales history.

---

## Core Features

### Must-Have (scheduled build)

| ID | Feature | Phase |
|----|---------|-------|
| F1–F8 | Discount, Additional charges, Order Summary, payable total, legacy | 1 |
| F12 | Manager financial amend on **received** POs (allowed when partial/paid; overpay/credit display) | 2 |
| F9–F10 | Optional bill number + bill images (no max count) | 3 |
| F18 | Slim **Create product** dialog from PO form | 4 |
| F19 | Purchase price history tab on **Inventory** detail; last **Unit Cost** API | 5 |
| F20 | Unit Cost change icon vs last purchase Unit Cost | 6 |
| F21 | Batches: Received Qty, Remaining Qty (rename), Unit Cost | 7 |

### Nice-to-Have later

| ID | Feature |
|----|---------|
| F11 | Search/filter POs by bill number |
| F13 | Purchase return / reverse-receive |
| F14 | Percentage discount mode |
| F15 | Allocate discount/charges into batch unit cost |
| F16 | Soft-delete empty drafts only |
| F17 | “Void after full return” status |

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Managers can save a PO with non-zero discount and/or additional charges | 100% of create/edit paths for editable statuses |
| Order Total on screen matches formula within 0.01 currency units | Always |
| Payment remaining balance = Order Total − amount paid after discount/charges | Always |
| Existing unpaid/paid POs without new fields still list and pay correctly | Zero regressions on payment status |
| Time to enter discount + charges on create form | ≤ 10 seconds (two number fields) |

---

## Assumptions & Risks

### Assumptions

- Store currency only; amounts rounded to 2 decimal places.
- Discount and additional charges are order-level, not per line.
- Discount/charges affect **payable total only**; receive still uses line `unitCost` for product cost and batches.
- Editable statuses remain: `draft`, `ordered` (no receive), `partial` (qty ≥ already received). `received` and `cancelled` stay non-editable for lines.
- Cancel remains the undo verb for non-received POs; hard delete is out of scope.
- Bill images/number are optional evidence, not a separate invoice document module in v1.1.

### Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Client sends inconsistent total vs lines | Wrong payments | Prefer server recompute of subtotal and total on create/update |
| Editing total below amount already paid | Broken payment status | Reject update when new total &lt; amount_paid |
| Staff expect freight to change product cost | COGS mismatch vs expectation | Document Non-Goal; show note in UI that charges are payable-only |
| Received PO mistakes without return flow | Stuck with wrong stock | Document return path as Nice-to-Have; stock count as interim |

---

## Open Questions

1. Should v1.1 financial correction on received POs be allowed only when payment_status is unpaid, or also when partial/paid (with overpayment/credit handling)?
2. Max number of bill images per PO (suggest 5)?
3. Is there a preferred label for additional charges in Nepali UI copy (“Additional charges” vs “Freight / other”)?

---

## Recommended workflows (product policy)

### Bill number & images (F9–F10)

Attach optionally on create/edit; **encourage** at receive or first payment. Never block Place Order if missing.

### Incorrect PO — edit vs cancel vs return

| Situation | Action |
|-----------|--------|
| Draft, never placed | Edit freely, or Cancel |
| Ordered, nothing received, unpaid | Edit or Cancel |
| Partial | Edit only with qty ≥ received; Cancel only with explicit stock rules |
| Fully received | **Do not edit lines, delete, or casually cancel.** Use return / new PO / money correction |
| Received + sales already made | Keep PO and sales. Return remaining unsold stock only. Create corrected PO if still needed |

**Why not cancel a received PO?** Cancel without reversing batches leaves ghost stock; reversing after sales desyncs inventory and COGS. Receive locks history; corrections are compensating actions.
