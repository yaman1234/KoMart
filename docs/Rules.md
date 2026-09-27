# Rules — Purchase Order Totals

**Reads:** [prd.md](prd.md), [architecture.md](architecture.md)  
**Scope:** Enforceable rules for implementing Must-Have v1 (F1–F8). Should-Have items follow the same rules when started.

---

## Coding Standards

1. Match existing KoMart patterns: snake_case in Python/API, camelCase in TypeScript via the existing apiClient transform.
2. Round all money fields to **2 decimal places** at the boundary (compute helper and before persist).
3. Prefer a single shared totals function on the backend (`compute_po_totals(items, discount, additional_charges) → subtotal, discount, additional_charges, total_amount`). Mirror the same formula on the frontend for live UI; **server wins** on save.
4. Do not introduce new UI libraries for this feature; use MUI components already used on PO pages (`TextField`, `Typography`, `Box`, `Paper`).
5. Keep changes scoped to PO model/schemas/router, form, detail, types, and tests — no drive-by refactors of POS discounts or receive costing.
6. TypeScript: extend `PurchaseOrder` / write payload types; avoid `any`.
7. Python: use Pydantic `Field(ge=0)` for discount and additional_charges; clamp discount to subtotal in the compute helper, not only in the UI.

---

## Architectural Boundaries

**Never do:**

1. **Never** allocate discount or additional charges into `unit_cost`, batch `unit_cost`, or product `cost_price` in v1.
2. **Never** hard-delete a PO that is `ordered`, `partial`, or `received`.
3. **Never** allow line edit or status cancel from `received` without a dedicated return/void flow (out of v1).
4. **Never** trust client `total_amount` without verifying it matches the server formula (tolerance ≤ 0.01) or replacing it with the computed value.
5. **Never** allow `total_amount < amount_paid` on create/update.
6. **Never** allow `discount < 0` or `additional_charges < 0`.
7. **Never** block Place Order because bill number/images are missing (those are v1.1 optional).
8. **Never** void or rewrite sales transactions to “undo” a bad received PO.
9. **Never** change payment remaining-balance formula away from `total_amount - amount_paid`.

**Always do:**

1. Normalize legacy documents on read (missing fields → 0 / derived subtotal).
2. Keep receive path using line `unit_cost` only.
3. Keep manager+ authorization on create/update.

---

## Testing Requirements

Every Must-Have task that touches logic must include automated coverage as applicable:

| Area | Required tests |
|------|----------------|
| Totals helper | subtotal sum; discount clamp; charges add; rounding to 2 dp |
| Create API | discount + charges persist; response fields present; total matches formula |
| Update API | reject when new total &lt; amount_paid; reject negative inputs |
| Legacy read | document without new fields returns discount=0, charges=0 |
| Payment | remaining balance uses adjusted total_amount |
| Receive | cost_price / batch unit_cost unchanged when discount/charges set (regression) |

Frontend: at least one unit test or clearly manual QA checklist for Order Summary math if no test harness exists for the page.

Manual QA required before Done: create PO with discount only, charges only, both, zero both; edit; pay partial; open legacy PO.

---

## Git / Commit Conventions

1. Commit only when asked by the user (repo rule).
2. Message style: imperative, why-focused (e.g. `Add PO discount and additional charges to payable total`).
3. Do not mix unrelated refactors with totals work in the same commit.
4. Do not commit `.env` or Cloudinary secrets.

---

## Error Handling & Logging

1. Validation failures return HTTP 400 with a clear `detail` string (e.g. “Discount cannot exceed subtotal”, “Total cannot be less than amount already paid”).
2. Do not swallow compute errors; fail the request.
3. Use existing audit snapshot hooks; when updating `po_snapshot`, include `subtotal`, `discount`, `additional_charges`, `total_amount`.
4. Frontend: show API `detail` in the existing form `Alert`; do not silently reset discount/charges on error.

---

## Security Baseline

1. Create/update remain `require_manager_or_above`.
2. Do not expose write of financial fields to cashiers.
3. Bill image upload (v1.1) must use unsigned upload preset / existing Cloudinary pattern — no API secret in the frontend.
4. Do not log full payment or bill payloads with sensitive notes beyond existing audit practice.

---

## When to Ask vs When to Decide

**Decide without asking:**

- Label copy: “Discount”, “Additional charges”, “Subtotal”, “Order total”.
- Clamp discount to subtotal instead of hard-erroring when UI races with line edits (still validate on server).
- Server overwrites `total_amount` with computed value.

**Ask before changing:**

- Allocating charges into inventory cost.
- Allowing edit of discount/charges on `received` POs.
- Percentage discount.
- Hard delete of any non-draft PO.
- Max bill image count or making bill number required.

---

## Definition of Done

A task is **Done** only when all applicable items pass:

- [ ] Implements the acceptance criteria listed on the task
- [ ] Follows Architectural Boundaries (no landed-cost allocation, no hard delete, server totals)
- [ ] Money values rounded to 2 dp; formula matches PRD F3
- [ ] Types/schemas updated; legacy read path safe
- [ ] Tests or manual QA checklist completed for the touched layer
- [ ] Lint/typecheck clean for edited files
- [ ] No unrelated files changed
- [ ] [Memory.md](Memory.md) entry added when the task is completed during implementation (not during planning)
