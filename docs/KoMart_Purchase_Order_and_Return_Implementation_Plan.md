# KoMart Retail Management System
# Purchase Order & Purchase Order Return — Functional Specification and Implementation Plan

**Document:** Purchase Order (PO), Goods Receiving, Purchase Invoice, Supplier Payment, and Purchase Return  
**Project:** KoMart Retail Management System  
**Document Type:** Functional Specification + Implementation Task Breakdown  
**Version:** 1.0  
**Status:** Implementation Planning  
**Primary Goal:** Provide a complete procurement workflow from supplier ordering through receiving, inventory updates, returns, and financial settlement.

---

## 1. Purpose

This document defines the expected functionality and implementation plan for the **Purchase Order and Purchase Order Return module** of KoMart.

The module should support the complete purchasing lifecycle:

```text
Supplier
   ↓
Purchase Order
   ↓
Approval
   ↓
Order Sent to Supplier
   ↓
Goods Received
   ↓
Inventory Increased
   ↓
Purchase Invoice
   ↓
Supplier Payment
```

For returned goods:

```text
Goods Received
   ↓
Purchase Return
   ↓
Return Approval
   ↓
Goods Returned to Supplier
   ↓
Inventory Decreased
   ↓
Supplier Refund / Credit / Replacement
```

The design should keep operational and financial events separate so that the system can accurately answer:

- What did KoMart order?
- What was actually received?
- What was invoiced?
- What was returned?
- What is currently in stock?
- How much does KoMart owe each supplier?
- How much has been refunded or credited?
- Who performed each action and when?

---

# 2. Core Business Principle

The system must treat the following as separate business transactions:

| Entity | Meaning | Inventory Impact | Financial Impact |
|---|---|---:|---:|
| Purchase Order | Goods KoMart intends to purchase | No | No |
| Goods Receipt | Goods actually received | Increase | Usually No direct payment |
| Purchase Invoice | Supplier's bill | No | Accounts payable |
| Supplier Payment | Amount paid to supplier | No | Decrease payable |
| Purchase Return | Goods sent back to supplier | Decrease | Credit/refund |
| Supplier Credit | Amount supplier owes KoMart | No | Decrease payable |
| Supplier Refund | Money returned by supplier | No | Increase cash/bank |

**Important:** Creating or approving a Purchase Order must never increase stock.

Stock should increase only when a **Goods Receipt is confirmed**.

Stock should decrease only when a **Purchase Return is confirmed**.

---

# 3. Scope

## 3.1 In Scope

### Procurement
- Supplier selection
- Purchase Order creation
- PO item management
- Discounts
- Taxes
- Additional charges
- Approval workflow
- PO status management
- PO printing/PDF
- Supplier reference

### Receiving
- Goods receiving against PO
- Full receiving
- Partial receiving
- Multiple receipts against one PO
- Received quantity validation
- Damaged quantity
- Batch/lot information
- Expiry date
- Warehouse/location

### Purchasing Finance
- Purchase invoice
- Supplier payable
- Supplier payment
- Partial payment
- Payment history

### Purchase Returns
- Return against received goods
- Return quantity validation
- Return reasons
- Approval
- Inventory reduction
- Supplier refund
- Supplier credit
- Replacement

### Inventory
- Inventory transaction generation
- Stock increase/decrease
- Stock history
- Cost tracking
- Batch/expiry tracking

### Reporting
- Purchase reports
- PO status reports
- Receiving reports
- Return reports
- Supplier outstanding reports
- Supplier purchase history
- Product purchase history

### Audit
- User action history
- Status changes
- Quantity changes
- Approval history
- Inventory transaction references

---

# 4. Out of Scope for Initial Release

The following can be considered future enhancements:

- Automatic supplier quotation comparison
- Multi-supplier RFQ workflow
- AI-based purchase recommendations
- OCR extraction of supplier invoices
- Automatic email integration
- Advanced supplier performance scoring
- Automated demand forecasting
- Multi-currency accounting
- Complex landed-cost allocation

These should not block the initial PO implementation.

---

# 5. End-to-End Workflow

## 5.1 Standard Purchase Workflow

```text
Create Supplier
     ↓
Create Purchase Order
     ↓
Draft
     ↓
Submit for Approval
     ↓
Approved
     ↓
Send to Supplier
     ↓
Supplier Delivers Goods
     ↓
Create Goods Receipt
     ↓
Validate Received Quantities
     ↓
Confirm Receipt
     ↓
Inventory + Received Quantity
     ↓
Create/Record Purchase Invoice
     ↓
Supplier Payable
     ↓
Supplier Payment
     ↓
Paid / Partially Paid
     ↓
PO Closed
```

---

# 6. Purchase Order Functionality

## 6.1 Create Purchase Order

The user should be able to create a PO from the Purchase Orders module.

### Header Fields

| Field | Required | Description |
|---|---|---|
| PO Number | Yes | System-generated unique number |
| Supplier | Yes | Supplier supplying the products |
| Branch | Yes | Branch/store receiving the goods |
| PO Date | Yes | Date of order |
| Expected Delivery Date | No | Expected arrival date |
| Supplier Reference | No | Supplier quotation/reference |
| Payment Terms | No | Credit/cash/etc. |
| Currency | Yes | Default system currency |
| Notes | No | Additional information |
| Created By | Auto | Logged-in user |
| Created At | Auto | System timestamp |

### Product Lines

Each PO should support multiple products.

| Field | Required |
|---|---|
| Product | Yes |
| SKU/Barcode | Display |
| Ordered Quantity | Yes |
| Unit Purchase Cost | Yes |
| Discount | No |
| Tax | No |
| Line Total | Auto |
| Notes | No |

---

# 7. PO Calculation

The system should calculate totals automatically.

```text
Line Subtotal
    ↓
- Item Discount
    ↓
+ Item Tax
    ↓
= Item Total

All Item Totals
    ↓
- Overall Discount
    ↓
+ Shipping/Freight
    ↓
+ Other Charges
    ↓
= Grand Total
```

All monetary calculations should use decimal-safe arithmetic and consistent rounding rules.

---

# 8. Purchase Order Statuses

Recommended statuses:

```text
DRAFT
   ↓
PENDING_APPROVAL
   ↓
APPROVED
   ↓
SENT
   ↓
PARTIALLY_RECEIVED
   ↓
FULLY_RECEIVED
   ↓
CLOSED
```

Alternative paths:

```text
DRAFT → CANCELLED

PENDING_APPROVAL → REJECTED

APPROVED → CANCELLED
```

## Status Definitions

### DRAFT
PO is being prepared.

- Editable
- No inventory impact
- No supplier payable

### PENDING_APPROVAL
PO has been submitted for approval.

- Editing restricted according to permissions
- No inventory impact

### APPROVED
Authorized user approved the PO.

- Ready to send to supplier
- No inventory impact

### SENT
PO has been issued to supplier.

- Awaiting delivery

### PARTIALLY_RECEIVED
Some but not all ordered quantities have been received.

### FULLY_RECEIVED
All required quantities have been received.

### CLOSED
PO lifecycle is complete.

### REJECTED
PO was not approved.

### CANCELLED
PO will no longer be fulfilled.

---

# 9. PO Editing Rules

The system should control editing based on status.

| Status | Edit | Delete | Cancel |
|---|---:|---:|---:|
| Draft | Yes | Yes | Yes |
| Pending Approval | Limited | No | Yes |
| Approved | Limited/No | No | Yes |
| Sent | No | No | Yes |
| Partially Received | No | No | Conditional |
| Fully Received | No | No | No |
| Closed | No | No | No |

If an approved PO needs modification, the system should either:

1. allow controlled editing and create an audit record, or
2. require cancellation/revision.

---

# 10. Approval Workflow

Approval should be permission-based.

Example:

```text
Employee/Supervisor
        ↓
Create PO
        ↓
Submit
        ↓
Owner/Supervisor
        ↓
Approve / Reject
```

The approval mechanism should support future configurable thresholds.

Example:

```text
PO < configured threshold
    → Supervisor

PO >= configured threshold
    → Owner
```

The threshold should not be hard-coded if configurable settings are planned.

---

# 11. Purchase Order Receiving

## 11.1 Important Rule

Users should not manually increase stock from the PO screen.

The PO should provide a **Receive Goods** action.

```text
PO
 ↓
Receive Goods
 ↓
Goods Receipt
 ↓
Confirm
 ↓
Inventory Update
```

---

# 12. Goods Receipt

A Goods Receipt records what physically arrived at KoMart.

### Header

- Receipt Number
- PO Number
- Supplier
- Branch
- Warehouse/location
- Receipt Date
- Supplier Delivery Note
- Received By
- Notes

### Product Lines

- Product
- Ordered Quantity
- Previously Received
- Remaining Quantity
- Current Receipt Quantity
- Damaged Quantity
- Batch/Lot Number
- Manufacturing Date
- Expiry Date
- Unit Cost

---

# 13. Partial Receiving

The system must support partial receiving.

Example:

```text
PO:

Shin Ramyun = 100
Pepero       = 50
Kimchi       = 30
```

First shipment:

```text
Shin Ramyun = 100
Pepero       = 30
Kimchi       = 0
```

System calculates:

```text
Received:
Shin Ramyun = 100
Pepero       = 30
Kimchi       = 0

Remaining:
Shin Ramyun = 0
Pepero       = 20
Kimchi       = 30
```

PO status:

```text
PARTIALLY_RECEIVED
```

A second receipt may then receive the remaining quantities.

---

# 14. Multiple Goods Receipts

One PO can have multiple receipts.

```text
PO-1001
   │
   ├── GR-1001
   ├── GR-1002
   └── GR-1003
```

The system should calculate:

```text
Total Ordered
Total Received
Total Remaining
```

at both PO and line level.

---

# 15. Over-Receiving Rules

The system should prevent receiving quantities greater than the remaining PO quantity unless an explicit over-receiving configuration exists.

Example:

```text
Ordered = 100
Received = 80
Remaining = 20

User enters = 30

System:
❌ Cannot receive 30
Maximum remaining quantity = 20
```

If over-receiving is supported in the future, it should be permission/configuration controlled and fully audited.

---

# 16. Damaged Goods During Receiving

The receiving process should distinguish:

```text
Ordered Quantity
Received Quantity
Accepted Quantity
Damaged Quantity
```

Example:

```text
Ordered: 100
Physically received: 100
Damaged: 5
Accepted into sellable stock: 95
```

The exact treatment of damaged goods should be configurable based on KoMart's inventory policy.

Possible inventory outcomes:

### Option A
Only accepted quantity enters sellable stock.

### Option B
All received goods enter stock, with damaged quantity moved to a separate damaged/quarantine location.

For a retail system, Option B provides better traceability if KoMart expects frequent damaged/expired returns.

---

# 17. Inventory Transaction

Every confirmed Goods Receipt must generate an inventory transaction.

Example:

```text
Transaction Type: PURCHASE_RECEIPT
Reference: GR-1001
Product: Shin Ramyun
Quantity: +50
Branch: Lalitpur
Warehouse: Main Store
Unit Cost: NPR 120
User: System User
Date/Time: System Timestamp
```

The transaction should preserve:

- Previous quantity
- Transaction quantity
- New quantity
- Unit cost
- Reference type
- Reference ID
- User
- Timestamp

---

# 18. Purchase Invoice

Purchase Invoice represents the supplier's financial bill.

Recommended workflow:

```text
PO
 ↓
Goods Receipt
 ↓
Purchase Invoice
 ↓
Supplier Payable
 ↓
Payment
```

The invoice may reference one or more receipts depending on the accounting design.

### Invoice Fields

- Invoice Number
- Supplier
- Invoice Date
- Due Date
- PO Reference
- Receipt Reference(s)
- Subtotal
- Discount
- Tax
- Shipping
- Other Charges
- Grand Total
- Paid Amount
- Outstanding Amount
- Status

---

# 19. Supplier Payable

The system should maintain supplier balances.

Example:

```text
Invoice = NPR 100,000
Paid    = NPR 60,000
--------------------
Outstanding = NPR 40,000
```

Statuses:

```text
UNPAID
PARTIALLY_PAID
PAID
OVERDUE
```

---

# 20. Supplier Payment

Payment should be a separate transaction.

Fields:

- Payment Number
- Supplier
- Invoice
- Payment Date
- Amount
- Payment Method
- Reference Number
- Bank/Cash Account
- Notes
- Created By

Payment methods may include:

```text
Cash
Bank Transfer
Cheque
Online Payment
Other
```

---

# 21. Purchase Return

Purchase Return allows KoMart to return previously received goods to the supplier.

The return should normally be based on **Goods Receipt / received inventory**, not simply the original PO.

```text
PO
 ↓
Goods Receipt
 ↓
Available Received Quantity
 ↓
Purchase Return
```

---

# 22. Return Eligibility

The system must prevent invalid returns.

Example:

```text
Received = 50
Previously Returned = 10
Available for Return = 40
```

If user enters:

```text
Return = 45
```

System should reject it.

```text
❌ Return quantity exceeds returnable quantity.
Maximum returnable quantity = 40.
```

---

# 23. Purchase Return Fields

### Header

- Return Number
- Supplier
- Branch
- Original PO
- Original Goods Receipt
- Original Invoice
- Return Date
- Return Reason
- Settlement Type
- Notes
- Created By

### Product Lines

- Product
- Received Quantity
- Previously Returned
- Returnable Quantity
- Return Quantity
- Unit Cost
- Return Value
- Batch
- Expiry
- Reason

---

# 24. Return Reasons

Configurable return reasons should include:

```text
DAMAGED
EXPIRED
NEAR_EXPIRY
WRONG_PRODUCT
WRONG_QUANTITY
QUALITY_ISSUE
PACKAGING_DAMAGED
SUPPLIER_ERROR
OTHER
```

The reason list should be configurable from Settings if required.

---

# 25. Purchase Return Approval

Recommended workflow:

```text
Draft
 ↓
Pending Approval
 ↓
Approved
 ↓
Returned
 ↓
Settled
```

Alternative:

```text
Pending Approval
 ↓
Rejected
```

Approval permissions should follow the same role/permission model as Purchase Orders.

---

# 26. Return Inventory Update

When a Purchase Return is confirmed:

```text
Current Stock = 100
Purchase Return = 5
New Stock = 95
```

Inventory transaction:

```text
Transaction Type: PURCHASE_RETURN
Reference: PR-1001
Quantity: -5
```

The system must never directly overwrite stock without creating an inventory transaction.

---

# 27. Return Settlement Types

The return should support:

## 27.1 Refund

Supplier returns money to KoMart.

```text
Return Value
    ↓
Supplier Refund
    ↓
Cash/Bank Increase
```

## 27.2 Supplier Credit

Supplier keeps the amount as credit against future purchases.

```text
Return Value
    ↓
Supplier Credit
    ↓
Future Invoice Adjustment
```

## 27.3 Replacement

Supplier replaces the returned goods.

```text
Return Goods
    ↓
Supplier Sends Replacement
    ↓
New Goods Receipt
```

## 27.4 Pending

Return has been completed physically but financial settlement is still pending.

---

# 28. Purchase Return Example

```text
PO-1001
Shin Ramyun = 100 @ NPR 120

Goods Receipt:
Received = 100

Later:
5 units damaged

Purchase Return:
Return = 5

Return Value:
5 × 120 = NPR 600

Inventory:
100 → 95

Settlement:
Supplier Credit = NPR 600
```

The original PO should retain its original ordered/received information.

The return should be recorded as a separate transaction.

---

# 29. Supplier Replacement

If replacement is selected:

```text
Return:
5 damaged Shin Ramyun
       ↓
Supplier Replacement
       ↓
Replacement Receipt
       ↓
Stock +5
```

The replacement receipt should reference the return transaction.

This prevents the replacement from appearing as an unrelated purchase.

---

# 30. Supplier Management Requirements

Purchase functionality depends on a robust Supplier module.

Required supplier information:

```text
Supplier Code
Company Name
Contact Person
Phone
Email
Address
PAN/VAT
Payment Terms
Credit Limit
Opening Balance
Bank Details
Status
Notes
```

Supplier should have a transaction history:

```text
Purchase Orders
Goods Receipts
Purchase Invoices
Payments
Returns
Credits
Outstanding Balance
```

---

# 31. Product Management Requirements

The Product module should expose:

```text
Product ID
SKU
Barcode
Product Name
Category
Brand
Unit
Purchase Price
Selling Price
Tax
Minimum Stock
Reorder Level
Expiry Tracking
Batch Tracking
Active/Inactive
```

For KoMart food products, expiry and batch tracking should be considered important.

---

# 32. Inventory Requirements

The procurement module depends on:

- Branch inventory
- Warehouse/location
- Stock quantity
- Available quantity
- Reserved quantity if applicable
- Batch/lot
- Expiry date
- Inventory transaction history
- Stock adjustment
- Cost tracking

The inventory ledger should be the source of truth for stock movement.

---

# 33. Purchase Dashboard

Recommended dashboard cards:

```text
Today's Purchases
Pending Purchase Orders
Pending Approvals
Pending Receipts
Partially Received POs
Purchase Returns
Supplier Payable
Overdue Supplier Payments
```

Recommended charts:

- Purchase by date
- Purchase by supplier
- Purchase by product
- Purchase by category
- Purchase return value
- Supplier payable trend

---

# 34. Reports

## Purchase Order Report

Filters:

- Date
- Supplier
- Branch
- Status
- Created By

Columns:

```text
PO Number
Date
Supplier
Total
Received
Remaining
Status
```

## Purchase Report

Shows actual received/invoiced purchases.

## Goods Receipt Report

Shows:

```text
Receipt Number
PO
Supplier
Date
Products
Quantities
Warehouse
```

## Purchase Return Report

Shows:

```text
Return Number
Supplier
Original Receipt
Product
Quantity
Return Value
Reason
Settlement
Status
```

## Supplier Outstanding Report

Shows:

```text
Supplier
Total Invoice
Total Paid
Credit
Outstanding
Overdue
```

---

# 35. Search and Filtering

Every major procurement list should support:

- Search by number
- Search by supplier
- Search by product
- Date range
- Status
- Branch
- User
- Payment status

Search should be server-side for large datasets.

---

# 36. Permissions

Recommended permissions:

```text
purchase_order.view
purchase_order.create
purchase_order.edit
purchase_order.delete
purchase_order.approve
purchase_order.cancel
purchase_order.send

goods_receipt.view
goods_receipt.create
goods_receipt.edit
goods_receipt.confirm
goods_receipt.cancel

purchase_invoice.view
purchase_invoice.create
purchase_invoice.edit
purchase_invoice.cancel

supplier_payment.view
supplier_payment.create
supplier_payment.edit
supplier_payment.cancel

purchase_return.view
purchase_return.create
purchase_return.edit
purchase_return.approve
purchase_return.confirm
purchase_return.cancel
```

Permission checks must be enforced on the backend, not only hidden in the UI.

---

# 37. Audit Trail

Audit logging should capture:

```text
User
Action
Entity
Entity ID
Old Value
New Value
Timestamp
IP/session information where appropriate
```

Examples:

```text
Yaman created PO-1001

User approved PO-1001

User changed expected delivery date

User confirmed GR-1001

System increased Shin Ramyun stock by 50

User created PR-1001

User confirmed purchase return
```

---

# 38. Notifications

Optional notification events:

- PO awaiting approval
- PO approved
- PO rejected
- Expected delivery date approaching
- PO overdue for receipt
- Purchase return awaiting approval
- Supplier payment due
- Supplier payment overdue
- Low stock requiring purchase

Notifications should be configurable.

---

# 39. Reorder Suggestions

A future enhancement should connect inventory levels with procurement.

Example:

```text
Product: Shin Ramyun
Current Stock: 8
Reorder Level: 15
Preferred Supplier: ABC
Suggested Order: 50
```

User can select:

```text
Create PO
```

The system generates a draft PO using the suggested supplier and quantity.

This should remain optional for the initial implementation.

---

# 40. Database Design — Recommended Entities

A relational or MongoDB implementation should preserve equivalent logical entities.

Recommended collections/tables:

```text
suppliers
products
purchase_orders
purchase_order_items
goods_receipts
goods_receipt_items
purchase_invoices
purchase_invoice_items
supplier_payments
purchase_returns
purchase_return_items
supplier_credits
supplier_refunds
inventory_transactions
audit_logs
```

Optional:

```text
purchase_attachments
purchase_approvals
supplier_ledger
notification_events
```

---

# 41. Purchase Order Data Structure

Conceptual structure:

```text
PurchaseOrder
├── id
├── poNumber
├── supplierId
├── branchId
├── warehouseId
├── orderDate
├── expectedDeliveryDate
├── supplierReference
├── paymentTerms
├── subtotal
├── discount
├── tax
├── shipping
├── otherCharges
├── grandTotal
├── status
├── notes
├── createdBy
├── approvedBy
├── approvedAt
├── createdAt
└── updatedAt

PurchaseOrderItem
├── productId
├── orderedQuantity
├── receivedQuantity
├── remainingQuantity
├── unitCost
├── discount
├── tax
└── lineTotal
```

---

# 42. Goods Receipt Data Structure

```text
GoodsReceipt
├── id
├── receiptNumber
├── purchaseOrderId
├── supplierId
├── branchId
├── warehouseId
├── receiptDate
├── supplierDeliveryNote
├── status
├── notes
├── receivedBy
├── confirmedBy
└── timestamps

GoodsReceiptItem
├── productId
├── orderedQuantity
├── previouslyReceivedQuantity
├── receivedQuantity
├── acceptedQuantity
├── damagedQuantity
├── unitCost
├── batchNumber
├── manufacturingDate
├── expiryDate
└── location
```

---

# 43. Purchase Return Data Structure

```text
PurchaseReturn
├── id
├── returnNumber
├── supplierId
├── branchId
├── purchaseOrderId
├── goodsReceiptId
├── purchaseInvoiceId
├── returnDate
├── status
├── reason
├── settlementType
├── subtotal
├── taxAdjustment
├── total
├── notes
├── createdBy
├── approvedBy
└── timestamps

PurchaseReturnItem
├── productId
├── goodsReceiptItemId
├── receivedQuantity
├── previouslyReturnedQuantity
├── returnableQuantity
├── returnQuantity
├── unitCost
├── batchNumber
├── expiryDate
└── returnValue
```

---

# 44. API Design

The exact URL structure can follow the existing KoMart API conventions.

Conceptual endpoints:

## Purchase Orders

```text
GET    /purchase-orders
POST   /purchase-orders
GET    /purchase-orders/:id
PUT    /purchase-orders/:id
DELETE /purchase-orders/:id

POST   /purchase-orders/:id/submit
POST   /purchase-orders/:id/approve
POST   /purchase-orders/:id/reject
POST   /purchase-orders/:id/cancel
POST   /purchase-orders/:id/send
```

## Goods Receipts

```text
GET    /goods-receipts
POST   /goods-receipts
GET    /goods-receipts/:id
PUT    /goods-receipts/:id

POST   /goods-receipts/:id/confirm
POST   /goods-receipts/:id/cancel
```

## Purchase Invoices

```text
GET    /purchase-invoices
POST   /purchase-invoices
GET    /purchase-invoices/:id
PUT    /purchase-invoices/:id

POST   /purchase-invoices/:id/cancel
```

## Supplier Payments

```text
GET    /supplier-payments
POST   /supplier-payments
GET    /supplier-payments/:id
```

## Purchase Returns

```text
GET    /purchase-returns
POST   /purchase-returns
GET    /purchase-returns/:id
PUT    /purchase-returns/:id

POST   /purchase-returns/:id/submit
POST   /purchase-returns/:id/approve
POST   /purchase-returns/:id/reject
POST   /purchase-returns/:id/confirm
POST   /purchase-returns/:id/cancel
```

---

# 45. Transaction Safety

Inventory and financial updates must be atomic.

For example, confirming a Goods Receipt should perform:

```text
1. Validate receipt
2. Validate PO quantities
3. Validate product/warehouse
4. Create receipt transaction
5. Update inventory
6. Update PO received quantities
7. Update PO status
8. Create inventory ledger entry
9. Create audit entry
```

If any critical operation fails, the system should not leave the database in a partially updated state.

The same principle applies to Purchase Returns.

---

# 46. Validation Rules

Minimum validation rules:

### PO
- Supplier required
- At least one product required
- Quantity > 0
- Cost >= 0
- Valid branch
- Valid product
- Expected delivery date cannot violate configured rules

### Goods Receipt
- PO must exist
- PO must permit receiving
- Quantity > 0
- Quantity cannot exceed remaining quantity unless allowed
- Warehouse must exist
- Batch/expiry required when configured

### Purchase Return
- Original receipt must exist
- Product must have been received
- Return quantity > 0
- Return quantity <= returnable quantity
- Supplier must match source transaction
- Settlement type required

### Payment
- Invoice must exist where invoice-linked payment is required
- Payment amount > 0
- Payment amount cannot exceed outstanding amount unless overpayment is explicitly supported

---

# 47. Error Handling

Use clear user-facing messages.

Examples:

```text
"Please select a supplier."

"At least one product is required."

"Received quantity cannot exceed the remaining PO quantity."

"This product has already been fully returned."

"Return quantity exceeds the returnable quantity."

"Cannot cancel a Purchase Order after confirmed receiving."

"Inventory update failed. No stock change was applied."

"Payment amount exceeds the outstanding invoice balance."
```

Backend should return consistent error codes and messages.

---

# 48. UI Screens

Recommended screens:

```text
Procurement
│
├── Dashboard
├── Suppliers
├── Purchase Orders
│   ├── List
│   ├── Create
│   ├── View
│   └── Edit
│
├── Goods Receipts
│   ├── List
│   ├── Create from PO
│   └── View
│
├── Purchase Invoices
│   ├── List
│   ├── Create
│   └── View
│
├── Supplier Payments
│   ├── List
│   └── Create
│
├── Purchase Returns
│   ├── List
│   ├── Create
│   └── View
│
└── Reports
```

---

# 49. Purchase Order UI

The PO page should contain:

### Header

```text
PO Number
Supplier
Branch
Order Date
Expected Delivery
Status
```

### Items

```text
Product | Ordered | Received | Remaining | Cost | Discount | Total
```

### Summary

```text
Subtotal
Discount
Tax
Shipping
Other Charges
Grand Total
```

### Actions

Actions should change based on status:

```text
Save Draft
Submit
Approve
Reject
Send
Receive Goods
Cancel
Print
Download PDF
```

---

# 50. PO Detail Page

The PO detail page should display related transactions.

Example:

```text
PO-1001

Status: PARTIALLY_RECEIVED

Ordered: NPR 100,000
Received: NPR 75,000
Remaining: NPR 25,000

Related Transactions:
├── GR-1001
├── GR-1002
└── Invoice INV-1001
```

If returned goods exist:

```text
Returns:
└── PR-1001
```

This gives users a complete transaction trail.

---

# 51. Purchase Return UI

Return screen should show:

```text
Supplier
Original PO
Original Receipt
Original Invoice

Product
Received
Previously Returned
Returnable
Return Qty
Unit Cost
Reason
```

The system should make returnable quantities obvious.

Example:

```text
Shin Ramyun

Received:             100
Previously Returned:    5
--------------------------
Returnable:            95

Return Qty:             [  ]
```

---

# 52. Implementation Strategy

Implementation should be divided into controlled phases.

The recommended order is:

```text
Phase 0 — Requirements & Architecture
Phase 1 — Master Data & Foundation
Phase 2 — Purchase Order
Phase 3 — Goods Receiving
Phase 4 — Inventory Integration
Phase 5 — Purchase Invoice & Payables
Phase 6 — Purchase Return
Phase 7 — Supplier Settlement
Phase 8 — Reports & Dashboard
Phase 9 — Permissions, Audit & Notifications
Phase 10 — QA, UAT & Production Release
Phase 11 — Future Enhancements
```

---

# 53. Phase 0 — Requirements & Architecture

## Objective

Finalize business rules before development.

### Tasks

- [ ] Review existing KoMart product model
- [ ] Review existing supplier model
- [ ] Review existing inventory model
- [ ] Review existing branch/warehouse model
- [ ] Review existing user/role/permission model
- [ ] Review existing sales transaction architecture
- [ ] Define PO status transitions
- [ ] Define Goods Receipt status transitions
- [ ] Define Purchase Return status transitions
- [ ] Define inventory transaction rules
- [ ] Define supplier balance rules
- [ ] Define discount/tax calculation rules
- [ ] Define rounding rules
- [ ] Define approval requirements
- [ ] Define cancellation rules
- [ ] Define return eligibility rules
- [ ] Confirm whether batch/expiry is mandatory
- [ ] Confirm damaged stock handling
- [ ] Confirm payment workflow

### Deliverables

- Functional requirements
- Status transition diagram
- Entity relationship design
- API design
- Permission matrix
- Validation rules

---

# 54. Phase 1 — Master Data & Foundation

## Objective

Prepare supporting modules.

### Tasks

- [ ] Supplier CRUD
- [ ] Supplier status
- [ ] Supplier payment terms
- [ ] Supplier opening balance
- [ ] Supplier transaction history
- [ ] Product purchase fields
- [ ] Product unit handling
- [ ] Product cost handling
- [ ] Branch selection
- [ ] Warehouse/location selection
- [ ] Batch/expiry configuration
- [ ] Inventory transaction foundation
- [ ] Number generation for PO/GR/Invoice/Return
- [ ] Common audit utility
- [ ] Common permission middleware
- [ ] Common status transition service

### QA

- [ ] Supplier CRUD testing
- [ ] Product validation testing
- [ ] Permission testing
- [ ] Number generation testing

---

# 55. Phase 2 — Purchase Order

## Objective

Build complete PO creation and approval.

### Backend

- [ ] Create PO model/schema
- [ ] Create PO item model/schema
- [ ] Implement PO number generation
- [ ] Create PO API
- [ ] Update PO API
- [ ] Get PO API
- [ ] List/filter PO API
- [ ] Submit API
- [ ] Approve API
- [ ] Reject API
- [ ] Cancel API
- [ ] Send API
- [ ] Status validation
- [ ] Calculation service
- [ ] Audit logging

### Frontend

- [ ] PO list
- [ ] Search/filter
- [ ] Create PO
- [ ] Product selection
- [ ] Quantity/cost entry
- [ ] Discount
- [ ] Tax
- [ ] Additional charges
- [ ] PO summary
- [ ] Draft save
- [ ] Submit
- [ ] Approval UI
- [ ] PO detail page
- [ ] Print/PDF

### QA

- [ ] PO creation
- [ ] Editing
- [ ] Calculations
- [ ] Status transitions
- [ ] Permission tests
- [ ] Negative validation tests
- [ ] Regression tests

---

# 56. Phase 3 — Goods Receiving

## Objective

Allow KoMart to receive goods against approved/sent POs.

### Backend

- [ ] Goods Receipt schema
- [ ] Goods Receipt item schema
- [ ] Receipt number generation
- [ ] Receipt creation API
- [ ] Receipt validation
- [ ] Partial receiving logic
- [ ] Multiple receiving logic
- [ ] Remaining quantity calculation
- [ ] Confirm receipt API
- [ ] Cancel receipt API
- [ ] PO status update logic
- [ ] Audit logging

### Frontend

- [ ] Pending receipts list
- [ ] Receive Goods action
- [ ] Receipt form
- [ ] Ordered/received/remaining display
- [ ] Batch input
- [ ] Expiry input
- [ ] Damaged quantity
- [ ] Warehouse selection
- [ ] Confirm receipt
- [ ] Receipt history

### QA

- [ ] Full receipt
- [ ] Partial receipt
- [ ] Multiple receipts
- [ ] Over-receiving
- [ ] Invalid PO
- [ ] Cancel receipt
- [ ] Batch/expiry validation

---

# 57. Phase 4 — Inventory Integration

## Objective

Connect confirmed receiving and returns to inventory.

### Tasks

- [ ] Create purchase receipt inventory transaction
- [ ] Update stock atomically
- [ ] Record previous stock
- [ ] Record new stock
- [ ] Record unit cost
- [ ] Link inventory transaction to GR
- [ ] Update branch stock
- [ ] Update warehouse stock
- [ ] Support batch stock where applicable
- [ ] Support expiry stock where applicable
- [ ] Create purchase return inventory transaction
- [ ] Prevent direct stock manipulation through PO
- [ ] Add transaction audit trail

### QA

- [ ] Stock increase accuracy
- [ ] Duplicate receipt prevention
- [ ] Transaction rollback
- [ ] Branch inventory
- [ ] Warehouse inventory
- [ ] Batch inventory
- [ ] Expiry inventory
- [ ] Return stock reduction

---

# 58. Phase 5 — Purchase Invoice & Payables

## Objective

Track supplier bills and outstanding balances.

### Tasks

- [ ] Purchase Invoice schema
- [ ] Invoice item schema
- [ ] Invoice creation
- [ ] Invoice validation
- [ ] Link invoice to PO
- [ ] Link invoice to receipt
- [ ] Supplier payable calculation
- [ ] Outstanding balance
- [ ] Partial payment status
- [ ] Overdue calculation
- [ ] Invoice list
- [ ] Invoice detail
- [ ] Payment entry

### QA

- [ ] Invoice creation
- [ ] Invoice calculation
- [ ] Partial payment
- [ ] Full payment
- [ ] Outstanding balance
- [ ] Overdue status
- [ ] Supplier ledger consistency

---

# 59. Phase 6 — Purchase Return

## Objective

Build complete purchase return processing.

### Backend

- [ ] Purchase Return schema
- [ ] Return item schema
- [ ] Return number generation
- [ ] Return creation API
- [ ] Returnable quantity calculation
- [ ] Return reason support
- [ ] Submit API
- [ ] Approve API
- [ ] Reject API
- [ ] Confirm API
- [ ] Cancel API
- [ ] Inventory reduction
- [ ] Supplier credit calculation
- [ ] Refund tracking
- [ ] Replacement tracking
- [ ] Audit logging

### Frontend

- [ ] Return list
- [ ] Create return
- [ ] Select original receipt
- [ ] Product selection
- [ ] Returnable quantity display
- [ ] Return quantity
- [ ] Return reason
- [ ] Settlement type
- [ ] Approval
- [ ] Confirmation
- [ ] Return detail
- [ ] Return history

### QA

- [ ] Valid return
- [ ] Excess return
- [ ] Duplicate return
- [ ] Partial return
- [ ] Full return
- [ ] Damaged return
- [ ] Expired return
- [ ] Refund
- [ ] Supplier credit
- [ ] Replacement
- [ ] Cancellation

---

# 60. Phase 7 — Supplier Settlement

## Objective

Complete the financial side of returns and purchases.

### Tasks

- [ ] Supplier payment workflow
- [ ] Supplier credit ledger
- [ ] Supplier refund tracking
- [ ] Apply credit to future invoice
- [ ] Payment history
- [ ] Supplier balance
- [ ] Supplier statement
- [ ] Return settlement status

### QA

- [ ] Payment
- [ ] Partial payment
- [ ] Credit
- [ ] Refund
- [ ] Replacement
- [ ] Balance calculation
- [ ] Ledger consistency

---

# 61. Phase 8 — Reports & Dashboard

## Tasks

- [ ] Procurement dashboard
- [ ] Purchase Order report
- [ ] Purchase report
- [ ] Goods Receipt report
- [ ] Purchase Return report
- [ ] Supplier purchase report
- [ ] Supplier outstanding report
- [ ] Product purchase report
- [ ] Product return report
- [ ] Export CSV/Excel where applicable
- [ ] Date filters
- [ ] Supplier filters
- [ ] Branch filters
- [ ] Status filters

### QA

- [ ] Report totals
- [ ] Date filtering
- [ ] Supplier filtering
- [ ] Branch filtering
- [ ] Export accuracy
- [ ] Large data performance

---

# 62. Phase 9 — Permissions, Audit & Notifications

## Tasks

- [ ] Role permissions
- [ ] Create permission
- [ ] Edit permission
- [ ] Approve permission
- [ ] Cancel permission
- [ ] Receive permission
- [ ] Return permission
- [ ] Payment permission
- [ ] Audit log UI
- [ ] Approval history
- [ ] Notification framework
- [ ] PO approval notification
- [ ] Receipt reminder
- [ ] Return approval notification
- [ ] Payment due notification

### QA

- [ ] Role-based access
- [ ] Unauthorized API requests
- [ ] Audit accuracy
- [ ] Notification triggers

---

# 63. Phase 10 — QA, UAT & Production

## Test Strategy

Testing should cover:

```text
Unit Tests
    ↓
API Tests
    ↓
Integration Tests
    ↓
UI Tests
    ↓
End-to-End Tests
    ↓
Regression Tests
    ↓
UAT
    ↓
Production Verification
```

### Core End-to-End Scenarios

#### Scenario 1 — Full Purchase

```text
Create Supplier
 ↓
Create PO
 ↓
Approve
 ↓
Send
 ↓
Receive
 ↓
Inventory +
 ↓
Create Invoice
 ↓
Pay
```

#### Scenario 2 — Partial Purchase

```text
PO = 100
 ↓
Receive = 60
 ↓
PO = Partially Received
 ↓
Receive = 40
 ↓
PO = Fully Received
```

#### Scenario 3 — Purchase Return

```text
Receive 100
 ↓
Return 10
 ↓
Stock -10
 ↓
Supplier Credit
```

#### Scenario 4 — Multiple Returns

```text
Receive 100
 ↓
Return 10
 ↓
Return 15
 ↓
Returnable = 75
```

#### Scenario 5 — Replacement

```text
Receive 100
 ↓
Return 5 damaged
 ↓
Supplier replacement
 ↓
Replacement receipt
 ↓
Stock +5
```

---

# 64. QA Test Categories

### Functional

- PO CRUD
- Approval
- Receiving
- Invoice
- Payment
- Return
- Settlement

### Validation

- Required fields
- Invalid quantities
- Invalid supplier
- Invalid product
- Invalid status transition
- Invalid dates
- Invalid payment

### Integration

- PO → GR
- GR → Inventory
- GR → Invoice
- Invoice → Payment
- GR → Return
- Return → Inventory
- Return → Credit/Refund

### Security

- Role permissions
- Unauthorized API
- ID manipulation
- Cross-branch access
- Audit tampering

### Performance

- Large PO
- Large product list
- Large supplier list
- Large transaction history
- Report performance

### Regression

Existing modules must be tested after procurement changes:

- POS
- Sales
- Inventory
- Product Management
- Supplier
- Financial Reports
- Dashboard
- User Management

---

# 65. Definition of Done

A feature should not be considered complete merely because the UI is implemented.

A procurement feature is complete when:

- [ ] UI is implemented
- [ ] Backend API is implemented
- [ ] Database schema is implemented
- [ ] Validation is implemented
- [ ] Permissions are implemented
- [ ] Audit logging is implemented
- [ ] Error handling is implemented
- [ ] Inventory impact is verified
- [ ] Financial impact is verified
- [ ] API tests pass
- [ ] UI tests pass
- [ ] Regression tests pass
- [ ] UAT is completed
- [ ] Documentation is updated

---

# 66. Recommended Implementation Order

For KoMart, the practical implementation sequence is:

```text
1. Supplier + Product foundation
        ↓
2. Purchase Order
        ↓
3. Goods Receiving
        ↓
4. Inventory Integration
        ↓
5. Purchase Invoice
        ↓
6. Supplier Payment
        ↓
7. Purchase Return
        ↓
8. Supplier Credit/Refund
        ↓
9. Reports
        ↓
10. Permissions + Audit
        ↓
11. Notifications
        ↓
12. QA + UAT
```

This order reduces dependency problems.

---

# 67. MVP vs Future Enhancement

## MVP

The first release should contain:

```text
Supplier
Purchase Order
PO Approval
Goods Receipt
Partial Receiving
Inventory Update
Purchase Invoice
Supplier Payment
Purchase Return
Inventory Reduction
Supplier Credit
Basic Reports
Permissions
Audit Log
```

## Phase 2 / Future

```text
Automatic Reorder
Purchase Suggestions
RFQ
Supplier Quotations
Supplier Comparison
AI/OCR Invoice Processing
Demand Forecasting
Advanced Supplier Analytics
Email Automation
Advanced Notifications
```

---

# 68. Important Business Rules Summary

The implementation team should treat these as non-negotiable unless KoMart explicitly changes the requirements:

1. **PO creation does not change stock.**
2. **PO approval does not change stock.**
3. **Only confirmed Goods Receipt increases stock.**
4. **Partial receiving must be supported.**
5. **Multiple receipts can belong to one PO.**
6. **Receiving cannot exceed the remaining PO quantity unless explicitly configured.**
7. **Purchase Return must be limited to returnable received quantity.**
8. **Confirmed Purchase Return decreases inventory.**
9. **Every stock movement must have an inventory transaction.**
10. **Every important procurement action must be auditable.**
11. **Purchase Invoice and Supplier Payment must be separate transactions.**
12. **Supplier Credit and Supplier Refund must be separately traceable.**
13. **A replacement should be linked to the original return.**
14. **Completed transactions should not be freely editable.**
15. **Critical inventory/financial operations must be atomic.**
16. **Backend permission checks are mandatory.**
17. **PO, receipt, invoice, payment, and return numbers must be unique.**
18. **The system must preserve the original PO even after receiving or returning goods.**

---

# 69. Final Target Architecture

The final procurement workflow should look like:

```text
                         ┌──────────────┐
                         │   SUPPLIER   │
                         └──────┬───────┘
                                │
                                ▼
                      ┌──────────────────┐
                      │ PURCHASE ORDER   │
                      └────────┬─────────┘
                               │
                     Approval / Send
                               │
                               ▼
                      ┌──────────────────┐
                      │ GOODS RECEIPT    │
                      └────────┬─────────┘
                               │
                    ┌──────────┴──────────┐
                    │                     │
                    ▼                     ▼
             ┌──────────────┐      ┌──────────────┐
             │   INVENTORY  │      │ PURCHASE     │
             │   + STOCK    │      │   INVOICE    │
             └──────────────┘      └──────┬───────┘
                                          │
                                          ▼
                                   ┌──────────────┐
                                   │   SUPPLIER   │
                                   │   PAYMENT    │
                                   └──────────────┘


          GOODS RECEIPT
                │
                ▼
       ┌─────────────────┐
       │ PURCHASE RETURN │
       └────────┬────────┘
                │
         Approval/Confirm
                │
        ┌───────┴────────┐
        │                │
        ▼                ▼
   INVENTORY -       SETTLEMENT
        │                │
        │        ┌───────┼────────┐
        │        │       │        │
        │        ▼       ▼        ▼
        │     REFUND   CREDIT  REPLACEMENT
        │
        ▼
  INVENTORY LEDGER
```

---

# 70. Suggested Development Tracking Structure

Create implementation tickets using the following hierarchy:

```text
EPIC: Procurement Management

├── Story: Supplier Foundation
│   ├── Supplier CRUD
│   ├── Supplier Terms
│   └── Supplier Ledger
│
├── Story: Purchase Order
│   ├── PO Database
│   ├── PO API
│   ├── PO UI
│   ├── Approval
│   └── PDF
│
├── Story: Goods Receiving
│   ├── Receipt Database
│   ├── Receipt API
│   ├── Receipt UI
│   ├── Partial Receiving
│   └── Batch/Expiry
│
├── Story: Inventory Integration
│   ├── Stock Increase
│   ├── Inventory Ledger
│   └── Transaction Audit
│
├── Story: Purchase Invoice
│   ├── Invoice
│   ├── Payable
│   └── Payment
│
├── Story: Purchase Return
│   ├── Return Database
│   ├── Return API
│   ├── Return UI
│   ├── Stock Reduction
│   └── Settlement
│
├── Story: Reporting
│   ├── Purchase Reports
│   ├── Return Reports
│   └── Supplier Reports
│
└── Story: QA & Release
    ├── API Testing
    ├── UI Testing
    ├── Integration Testing
    ├── Regression
    └── UAT
```

This structure can be directly converted into **Zoho Sprints epics → stories → tasks → QA subtasks**.

---

# 71. Conclusion

The KoMart Purchase Order module should be implemented as a complete procurement lifecycle rather than as a simple "purchase entry" screen.

The core relationship is:

```text
PURCHASE ORDER
"What did we order?"
        ↓
GOODS RECEIPT
"What did we receive?"
        ↓
INVENTORY
"What entered stock?"
        ↓
PURCHASE INVOICE
"What did the supplier bill?"
        ↓
PAYMENT
"What did we pay?"
```

And:

```text
PURCHASE RETURN
"What did we send back?"
        ↓
INVENTORY
"What left stock?"
        ↓
SUPPLIER SETTLEMENT
"Did we receive a refund, credit, or replacement?"
```

Keeping these transactions separate gives KoMart reliable inventory quantities, supplier balances, purchase history, return tracking, auditability, and future scalability.

**Recommended next implementation step:** finalize Phase 0 business rules against the existing KoMart Product, Inventory, Supplier, User/Role, and Financial modules before beginning database/API development.
