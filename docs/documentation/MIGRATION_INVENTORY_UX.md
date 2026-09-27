# Phase 4 — Inventory and product UX

## Changes

### Target stock adjust
- Inventory adjust dialog supports **Set target stock** (default) or **Adjust by +/- delta**.
- Live preview shows computed delta before submit.
- Advanced batch options collapsed by default.

### Product stock visibility
- **Product detail** shows read-only stock count and **Manage in Inventory** button.
- **Product edit** shows current stock + link when editing.

### Operations guide
- Collapsible info alert on Inventory page.
- Info alert on Product form explaining quantity vs price workflows.

## Files

- `frontend/src/pages/inventory/InventoryPage.tsx`
- `frontend/src/pages/inventory/InventoryDetailPage.tsx`
- `frontend/src/pages/products/ProductDetailPage.tsx`
- `frontend/src/pages/products/ProductFormPage.tsx`

## Verification

1. Inventory → Adjust → enter target 45 when current is 52 → confirms −7 adjustment.
2. Product detail → Manage in Inventory navigates to inventory detail.
