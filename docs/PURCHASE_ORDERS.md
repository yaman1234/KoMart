# KoMart — Purchase Orders

**Version:** 1.4  
**Last Updated:** September 2026  
**Audience:** Operators (managers/admins) and engineers  
**Related:** [TECHNICAL_DOCUMENTATION.md](./TECHNICAL_DOCUMENTATION.md), [KoMart_Purchase_Order_and_Return_Implementation_Plan.md](./KoMart_Purchase_Order_and_Return_Implementation_Plan.md)

---

## 1. Purpose

Purchase Orders (POs) drive procurement from supplier order through goods receipt, invoicing, payment, and purchase returns.

**Small-store default (2–few staff):** keep accounting documents separate in the backend, but operate in three steps:

```text
Place Order → Receive stock → Pay supplier
```

Formal approval (Submit → Approve → Send) remains available under **Advanced** / when a PO is already in those statuses. UI flag: `PO_REQUIRE_APPROVAL` in `frontend/.../poTerminology.ts` (default `false`).

**Evolve-in-place model:**

| Spec concept | KoMart status / entity |
|--------------|------------------------|
| Draft | `draft` |
| Pending approval | `pending_approval` (optional path) |
| Approved | `approved` (optional path) |
| Ordered | `ordered` (label: Ordered) |
| Partially / fully received | `partial` / `received` |
| Closed | `closed` (auto after fully paid when status was `received`, or via overflow) |
| Cancelled / Rejected | `cancelled` / `rejected` |
| Goods Receipt | `goods_receipts` collection |
| Purchase Invoice | `purchase_invoices` (auto on GR confirm) |
| Supplier Payment | `supplier_payments` (+ PO payment proxy) |
| Purchase Return | `purchase_returns` with settlements |

**Editing:** Draft only. After place: **Admin Cancel + recreate** for mistakes; **Purchase Return** for leftover goods.

**Status write rules**

| Path | Allowed |
|------|---------|
| `POST /purchase-orders` | Create as `draft` or `ordered` only |
| `PATCH /purchase-orders/{id}` | Draft only |
| `PATCH /purchase-orders/{id}/status` | `cancelled` (**admin only**), or draft → `ordered` (Place Order) |
| `PATCH /purchase-orders/{id}/bill-images` | Replace PO `bill_images` (manager+) |
| Workflow endpoints | `submit` / `approve` / `reject` / `send` / `close` |
| Receive | `POST .../receive` (or GR confirm) → `partial` / `received` |

Arbitrary status jumps via PATCH are rejected.

---

## 2. Roles

| Action | Cashier | Manager | Admin |
|--------|---------|---------|-------|
| View | Yes | Yes | Yes |
| Create / edit draft | No | Yes | Yes |
| Place order / receive / pay / return | No | Yes | Yes |
| **Cancel PO** | No | No | **Yes** |
| Submit / approve / reject / send / close | No | Yes | Yes |

---

## 3. Lifecycle

**Default (short path):**

```text
draft ──Place Order──→ ordered → receive → partial / received → pay → closed (auto if fully paid)
```

**Optional formal path:**

```text
draft → pending_approval → approved → ordered
pending_approval → rejected
```

Receive via **Process Goods Receipt** (select lines, or use the header select-all checkbox). After GR, the pay dialog opens automatically (`PO_AUTO_OPEN_PAY_AFTER_RECEIVE`) so stock-in and pay can finish in one visit. Money is still a separate invoice payment (not mixed into the GR).

---

## 4. Goods Receipt vs Purchase Invoice

These are **separate** documents on purpose. Mixing them causes stock and money to drift.

| | **Goods Receipt (GR)** | **Purchase Invoice** |
|---|---|---|
| **Question it answers** | What physically arrived? | What does the supplier bill us? |
| **Domain** | Operations / inventory | Finance / accounts payable |
| **Stock impact** | **Yes** — increases sellable stock (undamaged qty) | **No** |
| **Money / payable impact** | **No** (does not pay supplier) | **Yes** — creates amount owed; payments reduce it |
| **Created by** | Manager: **Process Goods Receipt** | Automatically when a GR is confirmed (MVP) |
| **Typical fields** | Receipt #, qty, bill no, **bill images**, batch/expiry | Invoice #, totals, paid, outstanding, due date |
| **Many per PO?** | Yes (partial shipments) | Yes (one per GR by default) |

### Workflow (order of operations)

```text
Place Order (ordered)
        ↓
Goods arrive
        ↓
Process Goods Receipt (+ optional bill photos)  →  stock ↑  →  PO partial/received
        ↓
Purchase Invoice auto-created  →  pay dialog (optional auto-open)
        ↓
Pay invoice  →  wallet/expense out  →  if fully received + paid → closed
```

**Rules of thumb**

1. Use **Process Goods Receipt** when boxes are on the shelf (select lines / select-all).
2. Use **Pay invoice** only to settle money — never to “receive” stock.
3. A GR without paying is normal (goods in, bill later) — just close the pay dialog if not paying yet.
4. **Pay requires a GR-linked invoice.** Paying before receive is rejected (no synthetic invoice). Direct invoice pay also requires `goods_receipt_ids`.
5. **Cancel (admin only)** reverses leftover stock and expenses; voids GRs and invoices; deletes supplier payments; cancels returns and reverses refund wallets / supplier credits. Blocked if PO-batch stock was already sold.
6. **Cancel after purchase return:** confirmed/posted returns are treated as already removed stock (not sold).
7. **Replacement GR** (`replacement_for_return_id`) restores stock without creating a new billable invoice.
8. **Refund** returns require prior invoice payment covering the return amount; otherwise use credit / replacement / pending.

**Bill images**

- Optional multi-image upload (Cloudinary) on receive; URLs stored on the GR and appended to the PO `bill_images`.
- Managers can also `PATCH .../bill-images` anytime (except cancelled) to replace the PO gallery.
- Cancel does **not** delete Cloudinary assets.

**Known MVP limits**

- Damaged qty is modeled in GR services but not exposed on the receive API/UI yet.
- PO discount/tax/shipping apply once for the PO lifetime (any prior invoice, including cancelled).
- Supplier credits are netted in outstanding reports; not auto-applied on pay yet.

---

## 5. Goods Receipt (detail)

- Confirmed GR increases stock (undamaged qty only; damaged qty recorded, not stocked).
- Multiple GRs per PO supported.
- Auto-creates a **Purchase Invoice** from GR line value (PO discount/tax/shipping applied once per PO — see §4).
- Receive body may include `bill_no` and `bill_images[]`.

API: `GET /goods-receipts`, `GET /purchase-orders/{id}/goods-receipts`  
Receive wrapper: `POST /purchase-orders/{id}/receive`  
List filter: `GET /purchase-orders?status=ordered,partial` (comma-separated statuses supported).

---

## 6. Invoices & payments

- Invoice statuses: unpaid / partial / paid / overdue / cancelled.
- `POST /purchase-orders/{id}/payments` pays the oldest open **GR-linked** invoice.
- Returns **400** if no open invoice exists (receive goods first).
- Also: `POST /purchase-invoices/{id}/payments`, `GET /suppliers/{id}/outstanding`.
- Payment history on the PO is a rollup of invoice payments for compatibility.
- Cancel voids invoices and deletes supplier payment rows after reversing expenses.

---

## 7. Purchase returns

Return qty = sell/base UOM, capped by leftover PO batches.

**Settlements:**

| Type | Effect |
|------|--------|
| `refund` | Wallet inflow (`purchase_return`); may cancel/shrink paid invoices |
| `credit` | `SupplierCredit` balance (no wallet) |
| `replacement` | Stock − only; later GR may set `replacement_for_return_id` |
| `pending` | Stock −; settle later |

Manager create confirms immediately by default (`confirm_immediately: true`).  
Statuses: draft → pending_approval → approved → confirmed (legacy `posted` treated as confirmed).

After a confirmed return, **Admin Cancel** is still allowed if remaining PO-batch stock was not sold; the return is then marked cancelled and credits/refunds reversed.

---

## 8. Workflow API (`/api/v1`)

| Method | Path | Notes |
|--------|------|-------|
| POST | `/purchase-orders` | status `draft` or `ordered` only |
| GET | `/purchase-orders` | `status` may be comma-separated (e.g. `ordered,partial`) |
| POST | `/purchase-orders/{id}/submit` | draft → pending_approval (Advanced) |
| POST | `/purchase-orders/{id}/approve` | → approved |
| POST | `/purchase-orders/{id}/reject` | → rejected |
| POST | `/purchase-orders/{id}/send` | approved → ordered |
| POST | `/purchase-orders/{id}/close` | received → closed |
| PATCH | `/purchase-orders/{id}` | **draft only** |
| PATCH | `/purchase-orders/{id}/status` | cancel (**admin**), or draft→ordered |
| PATCH | `/purchase-orders/{id}/bill-images` | set PO bill image URLs |
| POST | `/purchase-orders/{id}/receive` | create+confirm GR + invoice (+ bill images) |
| POST | `/purchase-orders/{id}/payments` | pay via open GR-linked invoice |
| GET/POST | `/purchase-returns` | returns + settlements |
| GET | `/reports/goods-receipts-summary` | GR report |
| GET | `/reports/purchase-returns-summary` | Return report |
| GET | `/reports/supplier-outstanding-summary` | Payables net of credits |

---

## 9. UI routes

`/purchase-orders`, `/new`, `/:id`, `/:id/edit` (draft).

List defaults to **Open (needs receive)** = `ordered,partial`.

Detail layout (top → bottom):

1. Header — **Place Order** (draft) / **Process Goods Receipt** / **Pay invoice**; Cancel in overflow (**admin only**); formal Submit/Close in overflow
2. Summary strip + **Bill photos** gallery
3. **Documents** — Receipts | Invoices | Payments | Returns
4. **Order Items** — receive checkboxes, bill number, bill photo upload, unit/conversion columns

---

## 10. Maintainer map

| Area | Path |
|------|------|
| Workflow | `backend/app/services/po_workflow.py` |
| Cancel | `backend/app/services/po_cancel.py` |
| GR | `models/goods_receipt.py`, `services/goods_receipt_service.py`, `routers/goods_receipts.py` |
| Invoice/pay | `models/purchase_invoice.py`, `services/purchase_invoice_service.py`, `routers/purchase_invoices.py` |
| Return | `services/purchase_return.py`, `models/purchase_return.py` |
| Receive core | `services/po_receive.py` |
| Short-path UI flags | `frontend/src/pages/purchase-orders/poTerminology.ts` |
| Bill upload helper | `frontend/src/utils/cloudinaryUpload.ts` |
| UI | `frontend/src/pages/purchase-orders/*` |

---

*End of Purchase Orders documentation.*
