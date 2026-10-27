# KoMart Reports Module — Quality Assurance & Test Strategy

**Document Version:** 1.0.0  
**Role:** Lead QA Engineer & Retail Accounting Analyst  
**Scope:** Functional Verification, Accounting Reconciliation, Boundary Testing, Regression Matrix

---

## 1. Testing Philosophy & Verification Principles

In retail management systems, a report cannot be deemed "working" simply because an API returns HTTP 200 or a React component renders without crashing. Every financial total displayed on screen or exported to Excel must be mathematically verifiable against the underlying source transactions (sales ledger, purchase ledger, inventory batch moves, wallet ledger).

### Four Pillars of Reports Quality Assurance
1. **Source of Truth Reconciliation:**
   - Sales totals must reconcile against $\sum \text{Transaction.total}$ for completed sales in the period.
   - COGS must reconcile against the historical batch deduction costs recorded in `Transaction.total_cost` and `InventoryBatch`.
   - Cash movements must reconcile against double-entry `WalletLedgerEntry` records.
2. **Strict Timezone Boundary Testing:**
   - Transactions recorded across midnight boundaries in Nepal Standard Time (`Asia/Kathmandu`, UTC+5:45) must land on their exact local calendar day.
3. **No Double Counting:**
   - Inventory purchases must never appear in Operating Expenses.
   - Settling supplier payables must never decrease Operating Profit.
4. **Excel-to-UI Parity:**
   - Every summary number and total row in the exported Excel spreadsheet must match the UI down to the exact paisa (0.01 NPR).

---

## 2. Test Scenarios & Detailed Test Cases

### Scenario Group 1: P&L and Profitability Accuracy

#### Test Case TC-PL-01: Multi-Pack UOM COGS Calculation
- **Preconditions:**
  - Product: "Instant Noodles 12-Pack Box"
  - Catalog: `units_per_buy_uom = 12`, `sell_mode = "both"`, `cost_price = 20.0` (piece cost Rs. 20; box cost Rs. 240).
  - Batch: 10 boxes (120 pieces) received at `unit_cost = 20.0`.
  - Selling Price: Rs. 300 per box.
- **Action:** Record 1 POS sale of 1 box (`quantity = 1`, `unit_factor = 12`, `price = 300.0`).
- **Expected Results:**
  - `Transaction.total = 300.0`.
  - `Transaction.total_cost = 240.0` (20.0 × 12).
  - `profit-summary` reports:
    - Revenue: Rs. 300.00
    - COGS: Rs. 240.00 (NOT Rs. 20.00!)
    - Gross Profit: Rs. 60.00 (NOT Rs. 280.00!)
    - Gross Margin %: 20.0% (NOT 93.3%!)

#### Test Case TC-PL-02: Operating Expenses vs Supplier Payments (Double Counting Prevention)
- **Preconditions:**
  - Store has Rs. 100,000 in Gross Profit from sales during October.
  - Recorded expenses in October:
    1. Rent: Rs. 30,000 (`category="rent"`)
    2. Electricity: Rs. 10,000 (`category="utilities"`)
    3. Supplier PO Payment: Rs. 80,000 (`category="purchase_order"`, `purchase_order_id="PO-001"`)
    4. Store Renovation: Rs. 50,000 (`category="setup_investment"`, `is_setup_cost=True`)
- **Action:** Query `/reports/expense-summary` and compute Net Operating Profit.
- **Expected Results:**
  - Total Expenses: Rs. 170,000.
  - Setup Investment: Rs. 50,000.
  - Supplier Payments: Rs. 80,000.
  - Operating Expenses (OpEx): Rs. 40,000 (Rent Rs. 30k + Electricity Rs. 10k).
  - Net Operating Profit: $\text{Gross Profit (Rs. 100,000)} - \text{OpEx (Rs. 40,000)} = \text{Rs. 60,000}$.
  - The Rs. 80,000 PO payment must **NOT** be deducted from Operating Profit!

#### Test Case TC-PL-03: Proportional Bill Discount Distribution
- **Preconditions:**
  - Transaction with 2 items:
    - Item A: 2 pcs @ Rs. 100 (Line Gross Rs. 200, Line Disc Rs. 20, Line Net Rs. 180).
    - Item B: 2 pcs @ Rs. 50 (Line Gross Rs. 100, Line Disc Rs. 0, Line Net Rs. 100).
  - Bill Discount: Rs. 40.00 cart promotion.
  - Bill Total: Rs. 240.00.
- **Action:** Fetch `/reports/top-products`.
- **Expected Results:**
  - Item A Bill Discount = Rs. 25.71; Net Revenue = Rs. 154.29.
  - Item B Bill Discount = Rs. 14.29; Net Revenue = Rs. 85.71.
  - $\text{Total Product Revenue} = 154.29 + 85.71 = \text{Rs. } 240.00$.
  - Exact match with `total_revenue`; no synthetic adjustment row needed!

---

### Scenario Group 2: Timezone & Date Boundary Scenarios

#### Test Case TC-TZ-01: Early Morning Nepal Sales (00:00 to 05:45 NPT)
- **Preconditions:** Sale created on `2026-10-18 02:30:00` Nepal Time.
- **MongoDB Storage:** Stored as `2026-10-17 20:45:00 UTC`.
- **Action:** Query reports for `start_date="2026-10-18"`, `end_date="2026-10-18"`.
- **Expected Results:**
  - Transaction is **included** in the October 18 report.
  - Transaction is **excluded** from the October 17 report.
  - Sales summary total matches the Sales Transactions page for October 18.

#### Test Case TC-TZ-02: Next-Day Early Morning Sale Exclusion
- **Preconditions:** Sale created on `2026-10-19 03:00:00` Nepal Time.
- **MongoDB Storage:** Stored as `2026-10-18 21:15:00 UTC`.
- **Action:** Query reports for `start_date="2026-10-18"`, `end_date="2026-10-18"`.
- **Expected Results:**
  - Transaction is **excluded** from the October 18 report.
  - Transaction is **included** in the October 19 report.

#### Test Case TC-TZ-03: Daily Revenue Chart Grouping
- **Action:** Query `/reports/revenue` for a 7-day period.
- **Expected Results:**
  - Daily revenue buckets align with Nepal calendar dates (`Asia/Kathmandu`).
  - Late evening sales (e.g. 08:30 PM NPT) land on the day they occurred, not the next UTC day.

---

### Scenario Group 3: Inventory Valuation & Reorder Reporting

#### Test Case TC-INV-01: Inventory Valuation Consistency
- **Preconditions:**
  - Product 1 (Category: Snacks): Batch 100 pcs @ Rs. 15 = Rs. 1,500.
  - Product 2 (Category: Beverages): Batch 50 pcs @ Rs. 40 = Rs. 2,000.
  - Catalog master `cost_price` has older values (Rs. 10 and Rs. 35).
- **Action:** Query `/reports/inventory-summary`.
- **Expected Results:**
  - Card `inventory_value`: Rs. 3,500.00.
  - Category Snacks `stock_value`: Rs. 1,500.00.
  - Category Beverages `stock_value`: Rs. 2,000.00.
  - $\sum \text{by\_category[].stock\_value} \equiv \text{inventory\_value} \equiv \text{Rs. } 3,500.00$.

#### Test Case TC-INV-02: Low Stock Pagination Correctness
- **Preconditions:**
  - Catalog has 150 active products.
  - Products 1 to 50: Stock = 100 (Threshold = 5) $\rightarrow$ Normal stock.
  - Products 51 to 55: Stock = 2 (Threshold = 5) $\rightarrow$ Low stock (5 items).
  - Products 56 to 150: Stock = 50 (Threshold = 5) $\rightarrow$ Normal stock.
- **Action:** Query `/reports/low-stock?page=1&page_size=25&stock_filter=both`.
- **Expected Results:**
  - `total`: 5 (NOT 150!).
  - `total_pages`: 1.
  - `data`: Exactly the 5 low stock products are returned on Page 1.
  - Page 1 is NOT empty!

#### Test Case TC-INV-03: Dead Stock Exclusion of Voided Transactions
- **Preconditions:**
  - Product has 10 units in stock.
  - Only sale in the last 60 days occurred 5 days ago, but that sale was **voided** due to cashier error.
- **Action:** Query `/reports/dead-stock?days=30`.
- **Expected Results:**
  - Product is correctly identified as **Dead Stock** (days without sale $\ge$ 30).
  - The voided sale does NOT reset the dead stock timer.

---

### Scenario Group 4: Purchasing, Payables & Returns

#### Test Case TC-PO-01: Net Purchases & Returns Reconciliation
- **Preconditions:**
  - PO-1: Total Rs. 50,000 (`status="received"`, `amount_paid=30,000`).
  - PO-2: Total Rs. 30,000 (`status="received"`, `amount_paid=30,000`).
  - Purchase Return PR-1: Total Rs. 10,000 against PO-1 (`status="closed"`, `amount_received=10,000`).
- **Action:** Fetch Purchasing & Payables Report.
- **Expected Results:**
  - Gross Purchases: Rs. 80,000.00.
  - Purchase Returns: Rs. 10,000.00.
  - Net Purchases: Rs. 70,000.00.
  - Total Paid: Rs. 60,000.00.
  - Supplier Refunds Received: Rs. 10,000.00.
  - Outstanding Supplier Payables: Rs. 20,000.00 (PO-1 balance).

#### Test Case TC-PO-02: Supplier Bill Numbers & Freight Tracking
- **Preconditions:**
  - PO created with Subtotal Rs. 45,000, Discount Rs. 2,000, Freight/Transport Rs. 1,500, Bill No "INV-9921".
- **Action:** Inspect Purchasing report.
- **Expected Results:**
  - Gross PO: Rs. 45,000.
  - Discounts: Rs. 2,000.
  - Additional Charges: Rs. 1,500.
  - Net PO Total: Rs. 44,500.
  - Supplier Bill Number "INV-9921" is displayed and exported.

---

### Scenario Group 5: Cash Flow & Multi-Wallet Reconciliation

#### Test Case TC-CF-01: Cash Flow vs Profit Reconciliation
- **Preconditions:**
  - Day 1: Sales Rs. 100,000 (Rs. 60k Cash, Rs. 40k eSewa). COGS Rs. 70k. Gross Profit Rs. 30k.
  - OpEx Paid: Rs. 5,000 cash for store supplies.
  - PO Payment: Rs. 40,000 bank transfer to supplier.
  - Supplier Refund: Rs. 5,000 cash received for returned goods.
- **Action:** Query P&L and Cash Flow for Day 1.
- **Expected Results:**
  - **Accrual P&L:**
    - Net Sales: Rs. 100,000
    - COGS: Rs. 70,000
    - Gross Profit: Rs. 30,000
    - Operating Expenses: Rs. 5,000
    - Net Operating Profit: Rs. 25,000
  - **Cash Flow:**
    - Collections Inflow: Rs. 100,000 (Cash Rs. 60k, eSewa Rs. 40k)
    - Supplier Refund Inflow: Rs. 5,000
    - Total Inflows: Rs. 105,000
    - OpEx Paid Outflow: Rs. 5,000 (Cash)
    - Supplier Payment Outflow: Rs. 40,000 (Bank)
    - Total Outflows: Rs. 45,000
    - Net Cash Flow: +Rs. 60,000 (Cash +Rs. 60k, Bank −Rs. 40k, eSewa +Rs. 40k).
  - Accrual Profit (Rs. 25k) and Net Cash Flow (Rs. 60k) are clearly distinguished and independently audited!

---

### Scenario Group 6: Excel Export Verification

#### Test Case TC-XL-01: Multi-Sheet Structure & Formula Parity
- **Action:** Export report to Excel.
- **Expected Results:**
  - Workbook contains 5 distinct, well-labeled sheets:
    1. `Executive Summary`
    2. `Sales`
    3. `Inventory`
    4. `Purchasing & Payables`
    5. `Cash Flow & Wallets`
  - Total rows use Excel formulas (e.g. `=SUM(F5:F42)`), not static text.
  - Currency cells are formatted as currency (`#,##0.00`).
  - No synthetic placeholder rows (`Bill discounts & round-off...`).
  - Totals in Excel match UI down to 0.01 NPR.

#### Test Case TC-XL-02: Complete Export Without Truncation
- **Preconditions:** Store has 250 low stock items and 300 customers with transactions.
- **Action:** Perform Excel Export.
- **Expected Results:**
  - Low Stock sheet contains all 250 items (not capped at 1000 active catalog skip or 25 page items).
  - Customer sheet exports all active customers in the period (not truncated to 50).

---

## 3. QA Acceptance Sign-Off Matrix

| Checkpoint | Validation Criterion | Pass / Fail |
|---|---|---|
| **1. Net Profit Accuracy** | Net Operating Profit = Gross Profit − OpEx (PO payments strictly excluded). | [ ] |
| **2. Multi-Unit COGS** | Carton/Pack sales multiply COGS by `unit_factor`. | [ ] |
| **3. Nepal Midnight Match** | Sales page total $\equiv$ Reports page total for identical YYYY-MM-DD. | [ ] |
| **4. Low Stock Pages** | Every page returns valid low stock products; total count is exact. | [ ] |
| **5. Bill Discount Distribution** | Product revenue sums to Net Sales without synthetic rows. | [ ] |
| **6. Inventory Value Match** | Sum of category stock value $\equiv$ Total inventory value card. | [ ] |
| **7. Dead Stock Integrity** | Voided sales do not reset days without sale. | [ ] |
| **8. Purchase Returns** | Returns reduce Net Purchases and track open supplier receivables. | [ ] |
| **9. Cash vs Profit** | Accrual P&L is separate from Cash Flow statement. | [ ] |
| **10. Excel Export Quality** | Multi-sheet, dynamic `=SUM()`, currency formatting, zero truncation. | [ ] |
| **11. Role Security** | Managers access Reports; Cashiers denied (403); Admin sees cashiers. | [ ] |
| **12. Zero Workflow Regression** | POS checkout, PO creation, PO receiving, stock counting unaffected. | [ ] |
