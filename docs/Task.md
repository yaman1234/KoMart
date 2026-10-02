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

## Phase 8 — Purchase returns (dual mode)

| ID | Title | Depends | Status |
|----|-------|---------|--------|
| T080 | Docs: promote F13 dual-mode | — | Done |
| T081 | Stock reverse + wallet/adjustment purchase_return | T080 | Done |
| T082 | PurchaseReturn API (po_linked + supplier) | T081 | Done |
| T083 | Backend P0 tests + regression | T082 | Done |
| T084 | FE types/hooks + Accounts/Movement labels | T082 | Done |
| T085 | PO detail Return dialog + list | T084 | Done |
| T085b | Supplier Return goods dialog + history | T084 | Done |
| T086 | Phase 8 Memory sign-off | T083,T085,T085b | Done |
| T087 | Return dialog UX (empty/name/Line Total/search) | T086 | Done |
| T088 | Dashboard purchase_return cash inflow + list page `/purchase-returns` | T087 | Done |
| T089 | List create-return + requested/closed (refund closes on payment received) | T088 | Done |
| T090 | Cash tracking: split inflow, payment history, write-off, receivables drill-down | T089 | Done |
| T091 | User guide: `docs/guides/Purchase_Returns.md` | T090 | Done |
| T092 | Docs: F13b stock-only write-off tracking (prd→Memory) | T091 | Done |
| T093 | Backend: aggregate stock-only loss (day/month) on dashboard KPI / returns summary | T092 | Not Started |
| T094 | FE: return detail “Stock-only loss” + dashboard write-off tile | T093 | Not Started |
| T095 | Tests + guide update for stock-only loss visibility | T094 | Not Started |

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
- **Returns:** PO-linked (`refund` / `reduce_payable`) from PO detail; supplier mode (`refund` / `stock_only`, no PO money) from Supplier detail; leftover PO-tagged batches only — guide: [guides/Purchase_Returns.md](./guides/Purchase_Returns.md)
- **Return refunds** = cash recovery inflow on dashboard (not Sales) only after payment is recorded; global list at `/purchase-returns` with Create return
- Refund status: `requested` until payment received is confirmed, then `closed`. Reduce payable and stock only close on create
- **Stock-only (F13b):** track as **inventory write-off loss at cost** via report/KPI aggregation of closed `stock_only` returns (`return_date`); not sales COGS; not wallet cash; expense document optional later (F13c)
