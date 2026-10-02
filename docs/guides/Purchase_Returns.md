# Purchase Returns — Change Document & User Guide

**Feature:** Dual-mode purchase returns (F13)  
**Module:** Purchasing / Inventory / Cash  
**Status:** Implemented (2026-09-30 → 2026-10-02)  
**Audience:** Store managers, admins, ops trainers  
**Related:** [prd.md](../prd.md) (F13), [Design.md](../Design.md), [Rules.md](../Rules.md), [TECHNICAL_DOCUMENTATION.md](../TECHNICAL_DOCUMENTATION.md) §6.4

---

## 1. Why this exists

Before this feature, stock mistakes after receive were hard to correct: cancel was blocked on `partial` / `received` POs, and there was no clean path to:

- Send unsold leftover back to the supplier
- Track money the supplier owes you (refund)
- Reduce what you still owe on a PO
- See returns in inventory ledger, wallets, and dashboard cash

**Purchase returns** reverse leftover PO-tagged stock and settle money (or stock-only) without deleting the PO.

---

## 2. What changed (summary)

| Area | Change |
|------|--------|
| **New screen** | `/purchase-returns` — list, create, detail, record payment / write-off |
| **PO detail** | **Return to supplier** when leftover stock exists (`partial` / `received`) |
| **Supplier detail** | **Return goods** for leftover across that supplier’s POs |
| **Stock** | Out movement type `purchase_return`; Movement Ledger reference = return # (e.g. `PR-0025`) |
| **Wallet** | Inflow type `purchase_return` only when refund cash is **recorded** (not on create) |
| **Statuses** | `requested` (awaiting refund) · `closed` (done) |
| **Dashboard** | Receivables = open requested refund balances; cash-flow splits **Sales** vs **Supplier refunds** |
| **Accounts** | Filter / deep-link `?entryType=purchase_return&referenceId=` |

---

## 3. Concepts

### Two modes

| Mode | When to use | Stock source | Settlements |
|------|-------------|--------------|-------------|
| **PO-linked** | Return lines that came from a specific bill/PO | Leftover batches for **that PO only** | `Refund` or `Reduce payable` |
| **Supplier** | Aged / mixed leftover not tied to one bill | Leftover from **any PO of that supplier** | `Refund` or `Stock only` |

### Settlements

| Settlement | Meaning | Status after create |
|------------|---------|---------------------|
| **Refund** | Supplier will pay you cash/bank/eSewa | **Requested** until payment (or write-off) |
| **Reduce payable** | Lower what you still owe on the PO (PO-linked only) | **Closed** immediately |
| **Stock only** | Remove stock; no cash / no payable change (supplier mode) | **Closed** immediately — cost is an **inventory write-off loss** (tracked in reports/KPI; F13b) |

### Important rules

1. You can only return **unsold leftover** still on PO-tagged batches — sold stock cannot be returned.
2. A useful PO return needs stock that was **received**. Prefer POs in **`partial`** or **`received`**. Pure **Ordered** POs usually have nothing to return (create picker may still list them; PO detail only offers Return on partial/received).
3. Do **not** cancel a `partial`/`received` PO to fix stock — use a purchase return instead.
4. Creating a **refund** does **not** credit the wallet. Wallet credit happens when you click **Record payment**.
5. **Stock only** does not move cash, but the return total (at cost) is a **write-off / disposal loss**. It must appear on the dashboard/report as stock-only write-offs — it is **not** sales profit/COGS.

---

## 4. How to use — step by step

### A. Create a return from the list (recommended)

1. Open **Purchase Returns** in the nav (`/purchase-returns`).
2. Click **Create return**.
3. Choose:
   - **Against a purchase order**, or  
   - **Supplier leftover (no PO)**
4. Pick the PO or supplier → **Choose products**.
5. Select lines, set qty (capped at available leftover), reason, and settlement.
6. Submit.

**Refund:** row appears as **Requested**; stock is already out.  
**Reduce payable / Stock only:** row appears as **Closed**.

### B. Create from a Purchase Order

1. Open a PO that is **partial** or **received**.
2. If leftover exists, use **Return to supplier**.
3. Choose **Refund** or **Reduce payable**, pick lines, submit.

### C. Create from a Supplier

1. Open the supplier → **Return goods**.
2. Search/filter returnable products.
3. Choose **Refund** or **Stock only**, submit.

### D. Record a supplier refund (Requested → money in)

1. On `/purchase-returns`, open a **Requested** refund (or use **Record payment**).
2. Choose:
   - **Full** remaining amount, or  
   - **Partial** amount, or  
   - **Write off** remaining (requires a reason note)
3. Pick **payment type**: Cash / Bank / eSewa.
4. Set **received date** (when money actually came in).
5. Confirm.

- Full payment or full write-off → status **Closed**.  
- Partial payment → stays **Requested**; Receivable updates.  
- Each payment posts a wallet **inflow** and appears under **Payments received** on the return detail.

### E. Review & links

| Need | Where |
|------|--------|
| All returns | `/purchase-returns` (filters: mode, settlement, status, search) |
| Money trail | Return detail → **Accounts**, or Accounts filtered by purchase return |
| Stock trail | Inventory → **Movement Ledger** → type Purchase Return → reference `PR-…` |
| Open refunds owed to you | **Purchase Returns** KPI strip (open receivable) or Dashboard **Receivables** tile |
| Refunds cash received (today / month) | **Purchase Returns** KPI strip only (not Dashboard Day Wise) |
| Day cash trend | Dashboard cash-flow: **Sales** vs **Supplier refunds** |
| Stock-only loss (F13b) | Dashboard **Stock-only write-offs** (day/month) + return detail label (after T093–T095) |

---

## 5. Screen map

```
Purchase Returns list
  ├─ KPI strip (open receivable, today/month refunds received, open requests)
  ├─ Create return → PO picker or Supplier picker → line dialog
  ├─ Row click → Detail modal (totals, items, payments, links)
  └─ Record payment / Write-off (requested refunds)

PO detail → Return to supplier → PoReturnDialog
Supplier detail → Return goods → SupplierReturnDialog
Dashboard → Receivables drill-down → open requested refunds
Accounts → entryType=purchase_return
Inventory Movement Ledger → purchase_return + PR number link
```

---

## 6. Status & money cheat sheet

| Status | Stock | Wallet | Receivable | P&L note |
|--------|-------|--------|------------|----------|
| Requested (refund) | Already reversed on create | Not yet / partial so far | Outstanding balance | — |
| Closed (refund, fully paid) | Reversed | Full inflow posted | 0 | Cash recovery (not sales) |
| Closed (write-off) | Reversed | Partial inflows only; rest written off | 0 | Uncollected receivable written off |
| Closed (reduce_payable) | Reversed | No refund inflow; PO payable reduced | — | Lower future cash out |
| Closed (stock_only) | Reversed | None | — | **Inventory write-off at cost** (F13b KPI) |

---

## 7. Common mistakes

| Mistake | Do this instead |
|---------|-----------------|
| Expect wallet balance to rise when creating a refund | Use **Record payment** after money arrives |
| Try to return more than leftover | Cap qty to available; sell-through reduces returnable |
| Cancel a received PO to fix bad stock | Create a purchase return |
| Use **Reduce payable** when supplier will pay cash | Use **Refund** |
| Use **Stock only** when you expect money | Use **Refund** (then record payment) |
| Treat stock-only as “no financial impact” | It is a **cost write-off** — watch Stock-only write-offs on dashboard/reports |

---

## 8. API / technical notes (for implementers)

| Endpoint | Role |
|----------|------|
| `GET /purchase-returns` | List + filters |
| `GET /purchase-returns/{id}` | Detail + `payments[]` |
| `GET /purchase-returns/available?purchaseOrderId=` | PO returnable lines |
| `GET /purchase-returns/available-by-supplier?supplierId=` | Supplier returnable lines |
| `POST /purchase-returns` | Create (reverses stock) |
| `POST /purchase-returns/{id}/close` | Record payment (`payment_method`, `amount_received`, `received_date`, `remarks`) |
| `POST /purchase-returns/{id}/write-off` | Write off remaining receivable |

Stock adjustments: `reference_type=purchase_return`, `reference_id=<return id>` → ledger label = return number.

Tests: `backend/tests/test_purchase_return.py`, `test_purchase_return_cash_flow.py`, movement reference coverage in `test_inventory_movements.py`.

---

## 9. Rollout checklist for the store

- [ ] Train managers on **Refund vs Reduce payable vs Stock only**
- [ ] Confirm wallets (cash/bank/eSewa) are used for **Record payment**
- [ ] Practice one PO-linked refund end-to-end (create → requested → record payment → closed)
- [ ] Show Movement Ledger filter **Purchase Return**
- [ ] Show Dashboard Receivables for open refunds
- [ ] Remind: never cancel partial/received POs to fix stock
- [ ] Show **Stock-only write-offs** as inventory loss at cost (not “free” stock removal)
