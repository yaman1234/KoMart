# Phase 2 — Operational Maturity Migration Notes

**Date:** June 2026  
**Scope:** P2 features #1–#5 (inventory ledger, product status, discounts, expanded settings, notifications UI)  
**Breaking changes:** None for existing clients (additive fields and endpoints)

See also: [TECHNICAL_DOCUMENTATION.md](./TECHNICAL_DOCUMENTATION.md) for full system reference.

---

## Summary

| # | Feature | Backend | Frontend | Tests |
|---|---------|---------|----------|-------|
| 1 | Inventory movement ledger | `GET /inventory/movements`, `/movements/summary` | Inventory → Movement Ledger tab; product detail scoped ledger | `test_inventory_movements.py` |
| 2 | Product status | `status` enum, `sellable_only` filter, sales guard | Form, list filter, POS `sellableOnly`, reports column | `test_product_status.py` |
| 3 | Product discounts | `discount_rules` collection, CRUD + evaluate | Settings → Discounts; POS promotions + coupon | `test_discounts.py` |
| 4 | Expanded settings | Extended `store_settings` fields | Settings → Store (grouped sections) | `test_settings.py` |
| 5 | Notifications UI | Sync service, mark read, filters | `/notifications` page + top-bar panel | `test_notifications.py` |

---

## 1. Inventory Movement Ledger

### Problem
Per-product change history existed (`GET /inventory/history`) but there was no **store-wide** movement ledger with cross-reference links to sales and POs.

### Backend

| File | Change |
|------|--------|
| `app/models/inventory.py` (`StockAdjustment`) | Added `product_sku`, `reference_type`, `reference_id` |
| `app/services/inventory_movements.py` | **New** — unified movement query + summary |
| `app/routers/inventory.py` | `GET /inventory/movements`, `GET /inventory/movements/summary` |
| `app/services/stock.py` | Populates reference fields on record |

### Frontend

| File | Change |
|------|--------|
| `pages/inventory/MovementLedgerTab.tsx` | **New** — filters, summary cards, CSV export |
| `pages/inventory/InventoryPage.tsx` | Tab: Stock Levels \| Movement Ledger \| Change History |
| `pages/inventory/InventoryDetailPage.tsx` | Product-scoped movement ledger |

### Migration
- **No data migration required.** New fields default to empty string on existing `stock_adjustments` documents.
- Legacy `GET /inventory/history` unchanged.

### Verification
```bash
cd backend && python -m pytest tests/test_inventory_movements.py -q
```

---

## 2. Product Status

### Problem
Catalog had only `is_active` (soft delete). No lifecycle status for seasonal or discontinued SKUs.

### Backend

| File | Change |
|------|--------|
| `app/models/product.py` | `ProductStatus`: `active`, `discontinued`, `seasonal` |
| `app/routers/products.py` | Query params `status`, `sellable_only` |
| `app/services/sales.py` | Blocks checkout for `discontinued` |
| `app/routers/reports.py` | `product_status` on low-stock / dead-stock rows + filter |

### Frontend

| File | Change |
|------|--------|
| `types/index.ts` | `ProductStatus` type |
| `pages/products/*` | Status chip, filter, form field |
| `pages/pos/POSPage.tsx` | `sellableOnly: true` on product fetch |
| `pages/reports/ReportsPage.tsx` | Status column + filter on inventory reports |

### Migration
- Existing products without `status` field use Beanie default `active` on read.
- No script required.

### Verification
```bash
cd backend && python -m pytest tests/test_product_status.py -q
```

---

## 3. Product Discounts

### Problem
POS supported manual cart discount only. No reusable promotion rules or server-side re-validation.

### Backend

| File | Change |
|------|--------|
| `app/models/discount_rule.py` | **New** collection |
| `app/services/discounts.py` | **New** — `evaluate_discounts()` |
| `app/routers/discounts.py` | **New** — CRUD + `POST /discounts/evaluate` |
| `app/models/transaction.py` | `promotion_discount`, `manual_discount`, `applied_promotions`, `coupon_code` |
| `app/services/sales.py` | Re-evaluates promotions on checkout |
| `app/main.py` | Mount `/discounts` router |
| `app/seed.py` | Sample discount rules (full seed) |

### Rule types
`product_percent`, `product_flat`, `category_percent`, `category_flat`, `cart_percent`, `cart_flat`

### Frontend

| File | Change |
|------|--------|
| `pages/settings/tabs/DiscountsTab.tsx` | **New** — manager+ CRUD |
| `hooks/useDiscounts.ts` | **New** |
| `pages/pos/POSPage.tsx` | Auto-apply, coupon field, manual discount stacks |

### Migration
- `discount_rules` collection created on first insert.
- Existing transactions without promotion fields read as `0` / `[]`.

### Verification
```bash
cd backend && python -m pytest tests/test_discounts.py -q
```

---

## 4. Expanded Settings

### Problem
`store_settings` had only basic store/tax/loyalty fields. Receipts, POS defaults, and numbering prefixes were hardcoded.

### Backend

| File | Change |
|------|--------|
| `app/models/settings.py` | 20+ new fields (POS, inventory defaults, business, appearance) |
| `app/services/store_settings.py` | **New** — `get_store_settings()`, `settings_to_api()` |
| `app/routers/settings.py` | Extended PATCH aliases |
| `app/services/sales.py` | `transaction_prefix` in txn numbering |
| `app/routers/purchase_orders.py` | `purchase_order_prefix` in PO numbering |
| `app/services/audit.py` | Expanded `settings_snapshot()` |

### New settings fields (high level)

| Group | Fields |
|-------|--------|
| Store / legal | `logo_url`, `pan`, `vat_number` |
| POS / receipts | `receipt_header`, `receipt_footer`, `auto_print`, `default_payment_method` |
| Inventory | `default_low_stock_threshold`, `expiry_warning_days`, `auto_sku`, `barcode_format` |
| Business | `loyalty_redeem_rate`, `transaction_prefix`, `purchase_order_prefix` |
| Appearance | `date_format`, `time_format` |

### Frontend

| File | Change |
|------|--------|
| `hooks/useSettings.ts` | **New** |
| `pages/settings/tabs/StoreInfoTab.tsx` | Grouped sections for all fields |
| `utils/receiptPrint.ts` | `ReceiptBranding` from store settings |
| `components/pos/PaymentModal.tsx` | Default payment + auto-print |
| `pages/products/ProductFormPage.tsx` | Default low-stock + auto-SKU |
| `pages/reports/ReportsPage.tsx` | `expiryWarningDays` for expiring report |

### Migration
- Existing `store_settings` documents pick up defaults for missing fields (Beanie model defaults).
- Transaction/PO number format changes apply to **new** documents only; existing numbers unchanged.

### Verification
```bash
cd backend && python -m pytest tests/test_settings.py -q
```

---

## 5. Notifications UI

### Problem
Notifications API and top-bar drawer existed, but `/notifications` was a placeholder and alerts were not auto-generated from inventory state.

### Backend

| File | Change |
|------|--------|
| `app/models/notification.py` | `source_key` for auto-alert deduplication |
| `app/services/notifications.py` | **New** — `sync_notifications()` |
| `app/routers/notifications.py` | Filters, `POST /sync`, `PATCH /read-all` |

### Auto-sync rules

| Type | Trigger | Link |
|------|---------|------|
| `low_stock` | `0 < stock ≤ low_stock_threshold` | `/inventory/{productId}` |
| `expiry` | Products with batches expiring within `expiry_warning_days` | `/reports?tab=inventory` |
| `purchase_reminder` | PO status `ordered` or `partial` | `/purchase-orders/{id}` |

Stale auto alerts (`source_key` prefix `auto:`) are deleted when the underlying condition clears.

### Frontend

| File | Change |
|------|--------|
| `pages/notifications/NotificationsPage.tsx` | **New** — full notification center |
| `components/common/NotificationList.tsx` | **New** — shared list |
| `components/common/NotificationPanel.tsx` | Mark read, mark all, view all |
| `hooks/useNotifications.ts` | **New** — queries + mutations |
| `layouts/TopBar.tsx` | Wired mark-read mutations |

### Migration
- `source_key` optional on existing notifications; manual/seed alerts unaffected.
- `GET /notifications?sync=true` (default) runs sync on each fetch.

### Verification
```bash
cd backend && python -m pytest tests/test_notifications.py -q
```

---

## Full Test Suite

After deploying all Phase 2 changes:

```bash
cd backend && python -m pytest tests/ -q
# Expected: 26 passed (as of June 2026)

cd frontend && npm run build && npm test
```

---

## Deployment Checklist

- [ ] Deploy backend (new routers: `discounts`; new indexes on `discount_rules`, `notifications.source_key`)
- [ ] Deploy frontend (new `/notifications` route; Settings tabs)
- [ ] No MongoDB migration scripts required — collections/indexes created by Beanie on startup
- [ ] Re-seed or create discount rules in production if promotions are desired
- [ ] Review store settings → configure receipt branding, prefixes, expiry warning days
- [ ] Open `/notifications` or top-bar bell to trigger first auto-sync

---

## Out of Scope (Phase 2)

| Item | Notes |
|------|-------|
| Database backup UI | No infra in v1 |
| Email/SMS alerts | In-app only; email remains Phase 2+ |
| POS tax calculation | Still submits `tax: 0` |
| Refunds / returns | Not implemented |
| CI pipeline for tests | Tests exist locally; CI wiring separate |

---

## Related Migration Docs

| Doc | Topic |
|-----|-------|
| [MIGRATION_REFRESH_TOKENS.md](./MIGRATION_REFRESH_TOKENS.md) | JWT refresh rotation |
| [MIGRATION_PRINTING_FIX.md](./MIGRATION_PRINTING_FIX.md) | Receipt print engine |
| [MIGRATION_AUDIT_LOGS.md](./MIGRATION_AUDIT_LOGS.md) | Global audit logging |
| [MIGRATION_API_PERFORMANCE.md](./MIGRATION_API_PERFORMANCE.md) | Aggregations + React Query tuning |
