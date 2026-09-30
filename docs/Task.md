# Task — PO Flow + Inventory UX

**Reads:** [prd.md](prd.md), [architecture.md](architecture.md), [Rules.md](Rules.md), [Design.md](Design.md)  
**Status legend:** Not Started | In Progress | Blocked | Done  

Implementation follows the phased plan. **No phase is Done** until feature tests + regression gate pass and Memory.md is updated.

---

## Testing / regression (all phases)

After each phase 1–7: run phase feature tests, then regression pack (PO create/edit/receive/pay/cancel, products, inventory, POS sale, prior-phase spot-check). After Phase 7: final E2E pack. See plan Testing strategy.

---

## Phase 0 — Docs refresh

| ID | Title | Status |
|----|-------|--------|
| T000 | Align prd/architecture/Rules/Design/Task with expanded plan | Done |

---

## Phase 1 — PO Discount & Additional Charges

| ID | Title | Depends | Status |
|----|-------|---------|--------|
| T001 | `compute_po_totals` helper + model fields | — | Not Started |
| T002 | Schemas + create/update router recompute | T001 | Not Started |
| T003 | Frontend types + `poTotals.ts` + Form/Detail Order Summary | T002 | Not Started |
| T004 | Phase 1 tests + regression + Memory | T003 | Not Started |

## Phase 2 — Received financial amend

| ID | Title | Depends | Status |
|----|-------|---------|--------|
| T010 | `PATCH .../financials` + overpay rules | T004 | Not Started |
| T011 | Detail UI amend + overpay chip | T010 | Not Started |
| T012 | Phase 2 tests + regression + Memory | T011 | Not Started |

## Phase 3 — Bill number & images

| ID | Title | Depends | Status |
|----|-------|---------|--------|
| T020 | PO `bill_number` / `bill_images` fields + API | T004 | Done |
| T021 | Form/Detail upload + gallery; payment billNo default | T020 | Done |
| T022 | `PATCH /{id}/bill` status-independent (any status) | T020 | Done |
| T023 | Detail Edit bill UI + service/hook (manager+, any status) | T022 | Done |
| T024 | Phase 3 bill-independent tests + regression + Memory | T023 | Done |
| T025 | PO list **Bill no.** column | T021 | Done |

### T022–T025 acceptance (summary)

- Manager can set/change bill on received/cancelled via Detail without Edit Order.
- General Edit Order still blocked for received/cancelled.
- `test_po_bill.py` covers received/cancelled/partial, clear empty number, cashier 403, general PATCH still 400 on received.
- List shows Bill no. or “—”; list payload already includes `bill_number`.

## Phase 4 — Slim ProductCreateDialog

| ID | Title | Depends | Status |
|----|-------|---------|--------|
| T030 | ProductCreateDialog (essentials) + PO wire-up | T004 | Not Started |
| T031 | Phase 4 tests + regression + Memory | T030 | Not Started |

## Phase 5 — Purchase price history

| ID | Title | Depends | Status |
|----|-------|---------|--------|
| T040 | Model + write on receive + list/last Unit Cost API | T004 | Not Started |
| T041 | Inventory Purchase price history tab | T040 | Not Started |
| T042 | Phase 5 tests + regression + Memory | T041 | Not Started |

## Phase 6 — Unit Cost delta icon

| ID | Title | Depends | Status |
|----|-------|---------|--------|
| T050 | Icon/tooltip vs last purchase Unit Cost | T042 | Not Started |
| T051 | Phase 6 tests + regression + Memory | T050 | Not Started |

## Phase 7 — Batch columns

| ID | Title | Depends | Status |
|----|-------|---------|--------|
| T060 | `received_quantity` on batches + API | T004 | Not Started |
| T061 | Inventory columns Received / Remaining / Unit Cost | T060 | Not Started |
| T062 | Phase 7 tests + regression + Memory | T061 | Not Started |
| T070 | Final E2E regression + Memory sign-off | T012,T024,T031,T042,T051,T062 | Not Started |

---

## Locked decisions (summary)

- Flat discount + additional charges; payable-only
- Received money amend allowed when partial/paid (overpay display) — product later removed Save financials UI; keep decision documented
- Bill images: no max; bill number/images **status-independent** via `PATCH /bill`
- PO list shows **Bill no.** column
- Cloudinary PO bill preset from env (`VITE_CLOUDINARY_UPLOAD_PRESET_PURCHASEORDER`)
- Slim add-product dialog from PO
- Purchase history on Inventory only
- Cost compare: **Unit Cost** vs last purchase **Unit Cost**
