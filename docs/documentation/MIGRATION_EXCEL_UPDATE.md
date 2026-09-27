# Phase 3 — Bulk Excel update (existing products)

## Script

`backend/scripts/update_products_from_excel.py`

## Usage

```bash
cd backend
python scripts/update_products_from_excel.py "../product list.xlsx" --dry-run
python scripts/update_products_from_excel.py "../product list.xlsx" --confirm
python scripts/update_products_from_excel.py "../product list.xlsx" --confirm --skip-stock
```

## Flags

| Flag | Purpose |
|------|---------|
| `--dry-run` | Preview changes; writes CSV report only |
| `--confirm` | Required for live database writes |
| `--skip-stock` | Update prices only |
| `--match-by sku\|name` | Match existing products (SKU preferred) |
| `--report path.csv` | Change report output path |

## Stock reconciliation

- `delta = excel_qty - product.stock`
- `delta > 0` → `receive_stock()` with batch `XL-RECON-{sku}-{date}`
- `delta < 0` → `adjust_stock()` with type `correction`
- **Never** sets `product.stock` directly

## Output

CSV report columns: `row`, `sku`, `name`, `status`, `detail`

Statuses: `updated`, `would_update`, `unchanged`, `skipped`, `error`
