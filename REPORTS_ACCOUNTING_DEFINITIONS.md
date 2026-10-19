# KoMart Retail Accounting — Definitions, Formulas & Data Specifications

**Document Version:** 1.0.0  
**Effective Date:** October 2026  
**Audience:** Store Owners, Store Managers, Retail Accountants, Software Engineers

---

## 1. Accounting Framework Overview

KoMart is a retail supermarket operating in Nepal under Nepal Standard Time (`Asia/Kathmandu`, UTC+5:45). All retail accounting definitions herein reconcile retail point-of-sale operations, inventory batch movements, supplier obligations, operating expenses, and multi-wallet cash flow into a GAAP/IFRS-aligned retail accounting standard for small-to-medium retail enterprises.

### Core Principles
1. **Accrual vs. Cash Accounting Separation:**
   - **Operational P&L (Trading and Profit & Loss):** Recognizes revenue when sales occur (`Transaction.created_at`), matches inventory cost as Cost of Goods Sold (COGS), and recognizes operating expenses incurred within the period.
   - **Cash Flow & Wallet Reconciliation:** Tracks actual cash, bank, and mobile wallet inflows and outflows when funds change hands (`WalletLedgerEntry.date`).
2. **Inventory Asset vs. Expense Distinction:**
   - Inventory purchases are Balance Sheet asset acquisitions (or Accounts Payable increases), **never** Operating Expenses.
   - Inventory cost becomes an expense **only** when sold (as COGS) or written off (as inventory loss).
   - Paying a supplier settles Accounts Payable; it does not reduce Net Operating Profit.
3. **Nepalese Fiscal & Timezone Integrity:**
   - All calendar dates (`YYYY-MM-DD`) represent wall time in Nepal (`Asia/Kathmandu`).
   - Reporting query boundaries must strictly span `00:00:00.000` to `23:59:59.999999` NPT (converted to UTC for MongoDB queries via `npt_day_start_utc` and `npt_day_end_utc`).

---

## 2. Master Metric Definitions & Mathematical Formulas

### 2.1 Sales & Revenue Metrics

#### A. Gross Sales
- **Definition:** The total face value of all billable goods sold to customers at list/shelf price before any item discounts, cart/bill discounts, coupons, taxes, or round-offs.
- **Formula:**
  $$\text{Gross Sales} = \sum_{t \in \text{CompletedTxns}} \sum_{i \in t.\text{items}} (i.\text{price} \times i.\text{quantity})$$
- **Data Source:** `Transaction.items[].price`, `Transaction.items[].quantity`
- **Included Statuses:** `TransactionStatus.completed`
- **Excluded Statuses:** `TransactionStatus.voided`
- **Date Basis:** `Transaction.created_at` within period `[start_npt_utc, end_npt_utc]`.
- **Reliability Rating:** **Fully Reliable**

#### B. Total Discounts Given
- **Definition:** Total price concessions granted to customers, comprising line-item discounts, cart promotions, coupon discounts, manual cashier discounts, and loyalty point redemptions.
- **Formula:**
  $$\text{Line Discounts} = \sum_{t} \sum_{i} (i.\text{discount} \times i.\text{quantity})$$
  $$\text{Bill Discounts} = \sum_{t} (t.\text{promotion\_discount} + t.\text{manual\_discount} + t.\text{loyalty\_points\_redeemed})$$
  $$\text{Total Discounts} = \text{Line Discounts} + \text{Bill Discounts}$$
- **Data Source:** `Transaction.items[].discount`, `Transaction.discount`, `Transaction.promotion_discount`, `Transaction.manual_discount`, `Transaction.loyalty_points_redeemed`
- **Reliability Rating:** **Fully Reliable**

#### C. Net Sales (Revenue)
- **Definition:** True operational sales revenue generated from retail operations before tax and round-off adjustments.
- **Formula:**
  $$\text{Net Sales} = \text{Gross Sales} - \text{Total Discounts}$$
  *(Note: Net Bill Total charged to customer = $\text{Net Sales} + \text{Tax} + \text{Round-Off} = t.\text{total}$)*
- **Reliability Rating:** **Fully Reliable**

#### D. Tax (VAT) & Round-Off
- **Tax:** Total 13% VAT collected on taxable retail items ($\sum t.\text{tax}$). (Balance Sheet liability payable to the Inland Revenue Department).
- **Round-Off:** Small cash currency rounding adjustment ($\sum t.\text{round\_off}$) required for physical paisa denomination elimination.
- **Reliability Rating:** **Fully Reliable**

#### E. Average Basket Value & Transaction Count
- **Transaction Count ($N$):** Count of completed transactions ($\text{Count}(t)$).
- **Average Basket Value:** $\frac{\sum t.\text{total}}{N}$ (or $\frac{\text{Net Sales}}{N}$).
- **Total Units Sold:** $\sum_{t} \sum_{i} i.\text{quantity}$ (expressed in sell units or base pieces).
- **Reliability Rating:** **Fully Reliable**

---

### 2.2 Cost of Goods Sold (COGS) & Profitability

#### A. Cost of Goods Sold (COGS)
- **Definition:** The actual historical acquisition cost of the inventory items sold during the reporting period, determined via KoMart's First-Expiry-First-Out (FEFO) batch allocation engine.
- **Formula:**
  For each transaction $t$:
  $$\text{COGS}_t = \begin{cases} t.\text{total\_cost} & \text{if } t.\text{total\_cost} > 0 \\ \sum_{i \in t.\text{items}} \text{line\_cogs}(i) & \text{otherwise} \end{cases}$$
  Where line-level COGS with UOM factor correction is:
  $$\text{line\_cogs}(i) = i.\text{unit\_cost} \times i.\text{quantity} \times \max(1, i.\text{unit\_factor})$$
  *(Fallback to catalog $p.\text{cost\_price} \times i.\text{quantity} \times \max(1, i.\text{unit\_factor})$ only if batch unit cost is missing).*
- **Data Source:** `Transaction.total_cost`, `TransactionItem.unit_cost`, `TransactionItem.unit_factor`, `InventoryBatch.unit_cost`
- **Treatment of Multi-Pack/Case Sales:** Must account for `unit_factor`. If 1 carton of 24 pieces is sold at Rs. 20 piece cost, COGS is $20 \times 1 \times 24 = \text{Rs. } 480$.
- **Reliability Rating:** **Fully Reliable**

#### B. Gross Profit
- **Definition:** Profit earned from the sale of inventory before operating overheads, staff salaries, rent, and utility expenses.
- **Formula:**
  $$\text{Gross Profit} = \text{Net Sales} - \text{COGS}$$
- **Reliability Rating:** **Fully Reliable**

#### C. Gross Profit Margin %
- **Formula:**
  $$\text{Gross Margin \%} = \begin{cases} \left(\frac{\text{Gross Profit}}{\text{Net Sales}}\right) \times 100 & \text{if } \text{Net Sales} > 0 \\ 0.0 & \text{otherwise} \end{cases}$$
- **Reliability Rating:** **Fully Reliable**

#### D. Operating Expenses (OpEx)
- **Definition:** The day-to-day administrative, selling, and operational costs required to run the retail store, **strictly excluding** capital investments and supplier payments for inventory.
- **Formula:**
  $$\text{OpEx} = \sum_{e \in \text{Expenses}} e.\text{amount} \quad \text{where } \begin{cases} e.\text{is\_setup\_cost} = \text{False} \\ e.\text{category} \neq \text{"setup\_investment"} \\ e.\text{category} \neq \text{"purchase\_order"} \\ e.\text{purchase\_order\_id} = \text{None or } "" \end{cases}$$
- **Included Categories:** `rent`, `utilities`, `salaries`, `marketing`, `supplies`, `maintenance`, `equipment_repair`, `other_operating`.
- **Excluded Categories:**
  - `purchase_order` (supplier PO payments): Settles accounts payable; already accounted for in COGS upon sale.
  - `setup_investment` / `is_setup_cost=True`: Capital expenditure (CapEx) / initial setup.
- **Treatment of Internal Product Consumption:** When store supplies (e.g., cleaning detergent) are consumed from inventory, it is recorded with `payment_method="inventory"`. It is classified as an Operating Expense and stock adjustment, but does not impact cash.
- **Reliability Rating:** **Fully Reliable**

#### E. Net Operating Profit (EBIT / Net Operating Result)
- **Definition:** The earnings from core retail operations after paying for goods sold and operating expenses.
- **Formula:**
  $$\text{Net Operating Profit} = \text{Gross Profit} - \text{Operating Expenses}$$
- **Reliability Rating:** **Fully Reliable**

---

### 2.3 Purchasing, Payables & Supplier Returns

#### A. Gross Purchases
- **Definition:** Total agreed value of goods ordered or received across Purchase Orders created/received within the period.
- **Formula:**
  $$\text{Gross Purchases} = \sum_{\text{PO} \in \text{EligiblePOs}} \text{PO}.\text{subtotal}$$
- **Eligible Statuses:** `ordered`, `partial`, `received` (Excludes `draft` and `cancelled`).
- **Reliability Rating:** **Fully Reliable**

#### B. Purchase Adjustments (Discounts & Additional Charges)
- **Purchase Discounts:** Total negotiated discounts received from suppliers ($\sum \text{PO}.\text{discount}$).
- **Additional Charges:** Freight, transportation, insurance, customs, or handling fees added to the PO ($\sum \text{PO}.\text{additional\_charges}$).
- **Reliability Rating:** **Fully Reliable**

#### C. Net Purchases
- **Formula:**
  $$\text{Net PO Value} = \text{Gross Purchases} - \text{Purchase Discounts} + \text{Additional Charges} = \sum \text{PO}.\text{total\_amount}$$
  $$\text{Net Purchases} = \text{Net PO Value} - \text{Purchase Returns Value}$$
- **Reliability Rating:** **Fully Reliable**

#### D. Supplier Payments
- **Definition:** Actual payments disbursed to suppliers against purchase orders during the reporting period.
- **Formula:**
  $$\text{Supplier Payments} = \sum_{p \in \text{PO.payments}} p.\text{amount} \quad \text{where } p.\text{date} \in [\text{start}, \text{end}]$$
  *(Also verifiable via `WalletLedgerEntry` where `entry_type="po_payment"`).*
- **Reliability Rating:** **Fully Reliable**

#### E. Outstanding Accounts Payable & Aging Buckets
- **Definition:** Total outstanding legal liability owed to suppliers for received and active purchase orders, categorized by age from invoice/received date.
- **Formula:**
  $$\text{Accounts Payable} = \sum_{\text{PO} \in \text{ActivePOs}} \max(0, \text{PO}.\text{total\_amount} - \text{PO}.\text{amount\_paid})$$
  *(Filtered where $\text{PO}.\text{status} \in \{\text{ordered}, \text{partial}, \text{received}\}$).*
- **AP Aging Buckets:**
  - **Current (0–30 Days):** $\text{age} \le 30 \text{ days}$ (within standard commercial credit terms).
  - **31–60 Days:** $31 \le \text{age} \le 60 \text{ days}$ (due for payment).
  - **61–90 Days:** $61 \le \text{age} \le 90 \text{ days}$ (overdue).
  - **Over 90 Days:** $\text{age} > 90 \text{ days}$ (critical overdue liability).
- **Reliability Rating:** **Fully Reliable**

#### F. Purchase Returns & Open Supplier Receivables
- **Purchase Returns Value:** Total value of goods returned to suppliers:
  $$\text{Returns Value} = \sum_{r \in \text{PurchaseReturns}} r.\text{total\_amount}$$
- **Refunds Received:** Actual cash/bank received back from suppliers:
  $$\text{Refunds Received} = \sum r.\text{amount\_received}$$
- **Open Supplier Receivables (Pending Refund):**
  $$\text{Open Receivables} = \sum_{r \in \text{PR}_{\text{requested}}} \max(0, r.\text{total\_amount} - (r.\text{amount\_received} + r.\text{write\_off\_amount}))$$
- **Reliability Rating:** **Fully Reliable**

---

### 2.4 Inventory Valuation & Movement

#### A. On-Hand Inventory Valuation
- **Costing Standard:** Batch-Level FEFO Acquisition Cost.
- **Formula:**
  $$\text{Total Inventory Value} = \sum_{b \in \text{InventoryBatch}, b.\text{quantity} > 0} (b.\text{quantity} \times b.\text{unit\_cost})$$
  *(If a batch has $b.\text{unit\_cost} = 0$, fallback to $p.\text{cost\_price}$).*
- **Category Stock Value:**
  $$\text{Category Value}(c) = \sum_{b \in c, b.\text{quantity} > 0} (b.\text{quantity} \times b.\text{unit\_cost})$$
  *Constraint:* $\sum_{c} \text{Category Value}(c) \equiv \text{Total Inventory Value}$.
- **Reliability Rating:** **Fully Reliable**

#### B. Stock Movement & Discrepancies
- **Audit Ledger:** `StockAdjustment` (linked to `sales`, `purchase_order`, `purchase_return`, `manual`, `stock_count`, `damage`, `internal_use`).
- **Equation of Stock Balance:**
  $$\text{Closing Stock} = \text{Opening Stock} + \text{Received} - \text{Sold} - \text{Returned} \pm \text{Adjustments}$$
- **Reliability Rating:** **Fully Reliable**

---

### 2.5 Cash Flow & Payment Method Reconciliation

#### A. Total Cash Inflows
- **Formula:**
  $$\text{Cash Inflows} = \text{Sales Collections} + \text{Supplier Refunds Received} + \text{Transfers In} + \text{Inward Adjustments}$$
- **Data Source:** `WalletLedgerEntry` where `direction="in"`.
- **Reliability Rating:** **Fully Reliable**

#### B. Total Cash Outflows
- **Formula:**
  $$\text{Cash Outflows} = \text{Operating Expenses Paid} + \text{Supplier PO Payments} + \text{Transfers Out} + \text{Outward Adjustments}$$
  *(Excludes non-cash inventory consumption).*
- **Data Source:** `WalletLedgerEntry` where `direction="out"`.
- **Reliability Rating:** **Fully Reliable**

#### C. Net Cash Movement (Cash Flow)
- **Formula:**
  $$\text{Net Cash Flow} = \text{Total Cash Inflows} - \text{Total Cash Outflows}$$
- **Reliability Rating:** **Fully Reliable**

#### D. Cash-to-Profit Bridge Formula
Explains the mathematical reconciliation between Accrual Operating Profit and Net Cash Movement:
$$\begin{array}{llr}
& \textbf{Net Operating Profit (Accrual)} & \\
(+) & \text{Non-Cash Operating Expenses (Internal Product Consumption)} & \\
(+) & \text{Inventory Reduction (COGS incurred on previously paid inventory)} & \\
(-) & \text{Supplier PO Payments Exceeding Period COGS} & \\
(+) & \text{Supplier Refunds Received in Cash/Bank} & \\
(+) & \text{Timing Differences on Cash Collections} & \\
\hline
= & \textbf{Net Cash Flow (Actual Cash Movement)} & \\
\end{array}$$
- **Reliability Rating:** **Fully Reliable**

---

## 3. Product-Level Bill Discount Allocation Algorithm

To eliminate fake synthetic rows in the Items Sold report and Excel export, bill-level discounts (cart promotions, loyalty points, coupons, manual cashier discounts) must be allocated proportionally to sold items based on their line net contribution:

```python
def allocate_product_sales_metrics(txn: Transaction) -> list[dict]:
    items = txn.items or []
    if not items:
        return []
    
    # 1. Line net share
    line_nets = [max(0.0, float(i.price * i.quantity - i.discount * i.quantity)) for i in items]
    total_line_net = sum(line_nets)
    bill_disc = max(0.0, float(txn.discount or 0))
    round_off = float(getattr(txn, "round_off", 0.0) or 0.0)
    tax = float(getattr(txn, "tax", 0.0) or 0.0)
    
    allocated = []
    accum_disc = 0.0
    
    for idx, (item, net) in enumerate(zip(items, line_nets)):
        # Proportional share
        if total_line_net > 0:
            share = net / total_line_net
        else:
            share = 1.0 / len(items)
            
        if idx == len(items) - 1:
            item_bill_disc = round(bill_disc - accum_disc, 2)
        else:
            item_bill_disc = round(share * bill_disc, 2)
            accum_disc += item_bill_disc
            
        item_line_disc = round(item.discount * item.quantity, 2)
        item_gross = round(item.price * item.quantity, 2)
        item_net_rev = round(item_gross - item_line_disc - item_bill_disc, 2)
        
        allocated.append({
            "product_id": item.product_id,
            "name": item.name,
            "quantity": item.quantity,
            "gross_sales": item_gross,
            "line_discount": item_line_disc,
            "bill_discount": item_bill_disc,
            "total_discount": round(item_line_disc + item_bill_disc, 2),
            "net_revenue": item_net_rev,
        })
    return allocated
```

---

## 4. Summary Table of Accounting Metrics

| Metric | Business Definition | Source Entity & Fields | Status Exclusions | Limitations / Assumptions |
|---|---|---|---|---|
| **Gross Sales** | Total catalog value of sold goods | `Transaction.items[].price * quantity` | `status == "voided"` | Base price before discounts |
| **Net Sales** | Gross sales less all discounts | `Gross Sales - Total Discounts` | `status == "voided"` | Excludes tax and round-off |
| **COGS** | Historical batch cost of items sold | `Transaction.total_cost` or FEFO batch moves | `status == "voided"` | Requires batch units per sell UOM |
| **Gross Profit** | Margin above inventory cost | `Net Sales - COGS` | `status == "voided"` | Pure gross trading margin |
| **Operating Expenses** | Store running costs | `Expense.amount` | `purchase_order`, `setup_investment` | Excludes inventory and capital spend |
| **Net Operating Profit** | Operational trading profit | `Gross Profit - OpEx` | `voided`, `cancelled` | Excludes taxes and financing costs |
| **Net Purchases** | Incurred purchase value less returns | `PO.total_amount - PurchaseReturn.total_amount` | `draft`, `cancelled` | Based on received/ordered status |
| **Accounts Payable** | Money owed to suppliers | `PO.total_amount - PO.amount_paid` | `cancelled` | Across active POs |
| **Accounts Receivable** | Pending supplier return refunds | `PR.total_amount - (received + write_off)` | `closed` | Retail customer credit not offered |
| **Cash Inflows** | Cash collected into all wallets | `WalletLedgerEntry[inflow]` | None | Verifiable against bank/till |
| **Cash Outflows** | Cash paid out from all wallets | `WalletLedgerEntry[outflow]` | None | Excludes non-cash adjustments |
