You are working on the existing **Komart POS / Inventory Management System**.

I want you to develop a complete **Stock Count / Physical Inventory module** that allows store/mart staff to physically count products and compare the physical quantity with the quantity recorded in the system.

IMPORTANT:
- First inspect the existing Komart codebase, database schema, inventory/stock modules, product module, store/branch structure, user/role system, stock ledger, purchase, sales, returns, and adjustment functionality.
- Reuse the existing architecture, components, UI patterns, authentication, permissions, database conventions, APIs, and styling.
- Do NOT create duplicate product, inventory, or stock tables if equivalent structures already exist.
- Integrate this feature into the existing Komart system.
- Preserve all existing functionality.
- Before making changes, understand how current stock is calculated and updated.

## 1. Main Feature

Add:

**Inventory → Stock Count**

The purpose is:

System Stock → Physical Count → Variance → Review → Approval → Stock Adjustment → Audit Trail

The system must NOT simply overwrite stock quantities.

Every stock difference must be recorded through a proper stock adjustment/transaction so that the inventory history remains auditable.

---

# 2. Stock Count List Page

Create a Stock Count management page.

Display:

- Stock Count ID
- Store/Branch
- Count Type
- Count Date
- Number of Products
- Counted Products
- Matched Items
- Short Items
- Excess Items
- Variance Value
- Status
- Created By
- Approved By
- Created Date

Statuses:

- Draft
- Counting
- Submitted
- Under Review
- Recount Required
- Approved
- Completed
- Cancelled

Provide filters:

- Store/Branch
- Date range
- Status
- Count Type
- Created By

Provide search by Stock Count ID.

Buttons:

- New Stock Count
- View
- Continue Count
- Submit
- Review
- Approve
- Request Recount
- Cancel
- View Adjustment

---

# 3. Create Stock Count

Add a "New Stock Count" workflow.

Fields:

- Store/Branch
- Count Type:
  - Full Stock Count
  - Category
  - Section
  - Selected Products
- Category
- Section/Rack if available in the existing system
- Start Date/Time
- Notes
- Counting Mode:
  - Blind Count
  - Assisted Count

Allow the user to select all products, a category, section, or manually selected products.

When the count is started, create a **stock snapshot**.

IMPORTANT:

The system quantity must be frozen/snapshotted at the time the stock count starts.

Example:

At 10:00 AM:

System Quantity = 48

During counting, a sale occurs and current inventory becomes 45.

The stock count must still compare:

System Snapshot = 48
Physical Count = 46
Variance = -2

Do NOT dynamically use the current stock quantity during the count.

---

# 4. Blind Count Mode

This should be the recommended mode for actual physical inventory counting.

The counter should NOT see the system quantity.

Display:

Product
Barcode
SKU
Product Image if available
Unit
Physical Quantity

Example:

Product: Coca Cola 500ml
Barcode: 123456789
Physical Qty: [ 46 ]

The counter should not see:

System Qty
Variance
Expected Qty

until the count is submitted/reviewed.

This prevents staff from simply entering the expected quantity.

---

# 5. Assisted Count Mode

For users who are allowed to see system quantities, provide:

| Product | System Qty | Actual Qty | Variance |
| Product A | 48 | 46 | -2 |
| Product B | 100 | 103 | +3 |
| Product C | 25 | 25 | 0 |

Formula:

Variance Quantity = Actual Quantity - System Quantity

---

# 6. Barcode Scanning

Integrate barcode scanning using the existing barcode functionality if available.

Counting workflow:

Scan barcode
→ Find product
→ Display product
→ Enter physical quantity
→ Save

Also support:

- Product search
- SKU search
- Barcode search
- Product name search

If practical, support quick counting:

Scan product → +1

Repeated scans should accumulate quantity.

Example:

Product scanned 5 times:

Physical Quantity = 5

Also allow manual quantity entry for bulk counting.

Make the counting UI mobile/tablet friendly because store staff may perform counting using a phone.

---

# 7. Stock Count Items

Each stock count item should store at minimum:

- Stock Count ID
- Product ID
- Product name/reference through product relation
- SKU
- Barcode
- System Snapshot Quantity
- Physical Count Quantity
- Variance Quantity
- Unit Cost
- Variance Value
- Reason
- Counter
- Count timestamp
- Recount quantity if applicable
- Final approved quantity

Do not duplicate product master information unnecessarily if the existing database already provides these relationships.

---

# 8. Variance Calculation

Use:

Variance Quantity = Physical Quantity - System Snapshot Quantity

Examples:

System = 48
Physical = 46
Variance = -2

System = 100
Physical = 103
Variance = +3

System = 25
Physical = 25
Variance = 0

Classify:

- Variance = 0 → Matched
- Variance < 0 → Short
- Variance > 0 → Excess

Calculate financial variance:

Variance Value = Variance Quantity × Unit Cost

Use the existing inventory costing logic from Komart where applicable.

Do not invent a separate costing method if the system already has one.

---

# 9. Stock Count Summary

After physical counting, show a summary dashboard.

Cards:

- Total Products
- Counted Products
- Matched
- Short
- Excess
- Shortage Value
- Excess Value
- Net Variance Value
- Stock Accuracy %

Example:

Total Products: 2,450
Counted: 2,450
Matched: 2,180
Short: 185
Excess: 85
Shortage Value: Rs. 18,500
Excess Value: Rs. 7,200
Net Variance: Rs. -11,300

Make the cards clickable where practical.

Clicking "Short" should filter the stock count items to shortage items.

Clicking "Excess" should filter to excess items.

---

# 10. Variance Review

After submission, the supervisor/manager should see:

| Product | System | Physical | Variance | Value | Status |
| Product A | 48 | 46 | -2 | -Rs.140 | Short |
| Product B | 100 | 103 | +3 | +Rs.60 | Excess |

Provide filters:

- All
- Matched
- Short
- Excess
- High Variance
- High Value Variance

Allow sorting by:

- Quantity variance
- Variance value
- Variance percentage
- Product name

---

# 11. Variance Reason

For variance items, allow the supervisor to record a reason.

Shortage reasons:

- Counting Error
- Damaged
- Expired
- Theft/Loss
- Unrecorded Sale
- Internal Consumption
- Other

Excess reasons:

- Counting Error
- Purchase Not Recorded
- Transfer Not Recorded
- Return Not Recorded
- Previous Adjustment Error
- Other

Use the existing reason/lookup architecture if available.

Make "Other" require a note.

---

# 12. Recount

Add a Recount functionality.

If the supervisor finds a significant variance, they can click:

**Request Recount**

The counter can perform another count.

Example:

First Count:
System = 48
Count = 46
Variance = -2

Recount:
Count = 47
Final Variance = -1

Store both the original count and recount history.

Do NOT overwrite the original count.

The audit trail must show:

First Count
→ Recount Requested
→ Recount Result
→ Final Approved Count

Allow the manager to choose the final count according to the existing approval workflow.

---

# 13. Approval Workflow

Do not automatically update stock when the counter submits the count.

Workflow:

Draft
→ Counting
→ Submitted
→ Under Review
→ Approved
→ Stock Adjustment
→ Completed

For significant variances, allow:

Request Recount

After approval:

Generate stock adjustment transactions.

---

# 14. Stock Adjustment Integration

This is extremely important.

DO NOT do:

Current Stock = Physical Count

Instead:

System Stock = 48
Physical Stock = 46
Variance = -2

Create:

Stock Adjustment
Product = Coca Cola
Quantity = -2
Reason = Stock Count
Reference Type = STOCK_COUNT
Reference ID = SC-XXXX
Approved By = Manager

The adjustment must use the existing Komart stock ledger/stock movement mechanism if one exists.

This ensures:

- Inventory history remains correct
- Stock movement is traceable
- Reports remain accurate
- Audit trail is preserved

---

# 15. Audit Trail

Every important action must be logged.

Examples:

Stock Count Created
Stock Count Started
Product Counted
Count Submitted
Variance Reviewed
Recount Requested
Recount Completed
Count Approved
Stock Adjustment Created
Stock Count Completed
Stock Count Cancelled

Record:

- User
- Date/time
- Action
- Old value where applicable
- New value where applicable
- Reference ID

Use the existing audit-log implementation if available.

---

# 16. Permissions

Integrate with the existing role/permission system.

Suggested permissions:

- View Stock Count
- Create Stock Count
- Perform Stock Count
- View System Quantity
- Submit Stock Count
- Review Stock Count
- Request Recount
- Approve Stock Count
- Create Stock Adjustment
- Cancel Stock Count
- View Stock Count Reports

A normal counter should not automatically have permission to approve or adjust stock.

---

# 17. Section-wise Stock Counting

If the existing system supports store sections/categories/racks, allow counting by:

- Store
- Department
- Category
- Section
- Rack
- Selected Products

Example:

Main Store
→ Beverages
→ Dairy
→ Grocery
→ Cosmetics
→ Household
→ Snacks

Allow different employees to count different sections if the current user/store architecture supports assignment.

---

# 18. Reports

Create Stock Count Reports.

### Stock Count Summary

Show:

- Count ID
- Store
- Date
- Total Products
- Matched
- Short
- Excess
- Shortage Value
- Excess Value
- Net Variance
- Accuracy

### Shortage Report

Only products where:

Physical < System

### Excess Report

Only products where:

Physical > System

### High Variance Report

Show products with significant quantity or value differences.

### Product-wise Stock Count History

For a selected product, show previous counts:

Date
System Qty
Physical Qty
Variance
Reason
Approved By

This will help identify recurring stock discrepancies.

---

# 19. Dashboard Integration

Add Stock Count widgets to the existing Komart dashboard.

Suggested widgets:

### Stock Accuracy

97.8%

### Stock Variance

Rs. -11,300

### Items Short

185

### Items Excess

85

### Pending Stock Counts

5

### Counts Requiring Approval

3

Use the existing dashboard widget design and gradient styling already used in Komart.

Do not introduce a completely different visual style.

---

# 20. Stock Accuracy

Implement a clearly documented stock accuracy calculation.

For example, use the existing business rules if Komart already has an inventory accuracy definition.

If no existing rule exists, implement a sensible formula and document it clearly.

Do not display a misleading accuracy percentage.

---

# 21. Mobile-Friendly Counting Screen

The actual counting screen is likely to be used on phones/tablets.

Optimize it for:

- Large search field
- Barcode scanning
- Large quantity input
- Easy Save button
- Next Product button
- Previous Product button
- Progress indicator

Example:

Stock Count SC-2026-0015

Progress:
1,245 / 2,450 products

Search / Scan Barcode

Product:
Coca Cola 500ml

Physical Quantity:
[ 46 ]

[Save & Next]

---

# 22. Concurrency / Sales During Count

Handle sales, purchases, transfers, returns, and other stock movements occurring after the stock snapshot.

The comparison must always use:

Physical Count vs Stock Snapshot

not:

Physical Count vs Current Stock

However, before final approval, show if there were stock movements after the snapshot.

Example:

Snapshot Stock: 48
Sale after snapshot: -3
Current Stock: 45
Physical Count: 46

Show:

Snapshot: 48
Movement After Count Started: -3
Current System Stock: 45
Physical Count: 46
Snapshot Variance: -2

Do not silently modify the original count.

If necessary, provide a configurable policy for how post-snapshot transactions are handled during final adjustment. Follow existing Komart inventory/business rules wherever possible.

---

# 23. Database and API

First inspect existing database tables and APIs.

Reuse existing:

- Product tables
- Inventory tables
- Stock movement tables
- Store/branch tables
- User tables
- Role/permission tables
- Audit tables

Only create new tables/entities where required.

Likely entities if they don't already exist:

stock_counts
stock_count_items
stock_count_recounts
stock_count_approvals

But adapt naming to the existing Komart conventions.

Create proper:

- Database migrations
- Models/entities
- API endpoints
- Validation
- Authorization
- Error handling
- Transaction handling

Use database transactions when approving a count and generating stock adjustments so that partial updates cannot occur.

---

# 24. Important Business Rules

Implement these rules:

1. A completed stock count cannot be edited.
2. An approved stock count cannot be modified.
3. A stock adjustment must reference the stock count that caused it.
4. Blind counters cannot see system quantity unless permission is granted.
5. Original counts must never be overwritten by recounts.
6. System stock quantity must be snapshotted when the count starts.
7. Stock should only change after approval.
8. Every adjustment must have an audit trail.
9. Cancelled counts must not modify stock.
10. Duplicate stock adjustments must be prevented.
11. Use proper database transactions during approval/adjustment.
12. Respect existing store/branch access restrictions.
13. Respect existing user permissions.
14. Preserve existing inventory calculation logic.
15. Do not break existing sales, purchase, transfer, return, or inventory functionality.

---

# 25. UI/UX

Use the existing Komart design system.

Maintain consistency with:

- Existing cards
- Existing tables
- Existing buttons
- Existing modals
- Existing colors
- Existing dashboard gradients
- Existing responsive design
- Existing navigation

Do not create a separate design language.

Add navigation:

Inventory
→ Stock Count

And appropriate links from:

Dashboard
→ Pending Stock Counts

Stock Count
→ Stock Adjustment

Product
→ Stock Count History

---

# 26. Testing

Before considering the feature complete, test:

### Scenario 1 — Exact Match

System = 100
Physical = 100

Expected:
Variance = 0
No stock adjustment required.

### Scenario 2 — Shortage

System = 100
Physical = 95

Expected:
Variance = -5
Approval creates -5 stock adjustment.

### Scenario 3 — Excess

System = 100
Physical = 103

Expected:
Variance = +3
Approval creates +3 stock adjustment.

### Scenario 4 — Recount

System = 100
First Count = 95
Recount = 97

Expected:
Original count retained
Final count = 97
Final adjustment = -3 if approved.

### Scenario 5 — Sale During Count

Snapshot = 100
Sale after snapshot = 5
Current stock = 95
Physical = 98

Expected:
Variance against snapshot = -2
Post-snapshot sale clearly shown.

### Scenario 6 — Blind Count

Counter cannot see system quantity.

### Scenario 7 — Permission

Counter cannot approve a stock count.

### Scenario 8 — Duplicate Approval

Approving the same stock count twice must NOT create two stock adjustments.

### Scenario 9 — Cancel

Cancelled stock count must not change inventory.

### Scenario 10 — Audit

Every important action must appear in the audit trail.

---

# 27. Development Approach

Do NOT immediately start writing code.

First:

1. Inspect the existing Komart architecture.
2. Identify existing inventory/stock mechanisms.
3. Identify existing stock adjustment functionality.
4. Identify existing product/store/user/permission structures.
5. Identify existing dashboard components.
6. Identify existing audit logging.
7. Identify existing barcode functionality.
8. Identify reusable UI components.
9. Prepare a short implementation plan.
10. Then implement the feature incrementally.

Before modifying existing inventory logic, explain which existing components you will reuse and why.

After implementation:

- Run/build the application.
- Run existing tests.
- Add tests for the new functionality.
- Fix TypeScript/Python/backend/frontend errors as applicable.
- Check database migrations.
- Check responsive/mobile UI.
- Verify that existing POS sales and inventory functions still work.
- Provide a concise summary of files changed, database changes, APIs added, permissions added, and testing performed.

The final implementation should feel like a native part of **Komart**, not a separate stock-count application.