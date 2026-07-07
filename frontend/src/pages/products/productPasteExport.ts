import { productStatusLabel } from '@/utils';
import type { Product } from '@/types';
import { PO_LABELS } from '@/pages/purchase-orders/poTerminology';

export const PRODUCT_SHEET_HEADERS = [
  'SKU',
  PO_LABELS.packQty,
  PO_LABELS.buyUom,
  PO_LABELS.unitCost,
  PO_LABELS.unitsPerPack,
  'Name',
  'Category',
  'Brand',
  'Supplier',
  'Stock',
  'Base UOM',
  'Cost (base)',
  'Sell price',
  'Status',
] as const;

export const PO_PASTE_COLUMN_COUNT = 5;

export function buyUnitCost(product: Product): number {
  return product.costPrice * (product.unitsPerBuyUom ?? 1);
}

function formatCost(value: number): string {
  return Number.isFinite(value) ? value.toFixed(2) : '0.00';
}

export function productToSheetCells(product: Product): string[] {
  return [
    product.sku ?? '',
    '1',
    product.buyUom ?? product.uom ?? 'pcs',
    formatCost(buyUnitCost(product)),
    String(product.unitsPerBuyUom ?? 1),
    product.name,
    product.category ?? '',
    product.brand ?? '',
    product.supplierName ?? '',
    String(product.stock ?? 0),
    product.uom ?? 'pcs',
    formatCost(product.costPrice ?? 0),
    formatCost(product.sellingPrice ?? 0),
    productStatusLabel(product.status),
  ];
}

function escapeTsvCell(value: string): string {
  if (/[\t\n\r"]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function productsToTsv(
  products: Product[],
  options: { includeHeader?: boolean } = {},
): string {
  const { includeHeader = true } = options;
  const lines: string[] = [];
  if (includeHeader) {
    lines.push(PRODUCT_SHEET_HEADERS.join('\t'));
  }
  for (const product of products) {
    lines.push(productToSheetCells(product).map(escapeTsvCell).join('\t'));
  }
  return lines.join('\n');
}

export function partitionCopyableProducts(products: Product[]): {
  copyable: Product[];
  skipped: number;
} {
  const copyable = products.filter((p) => (p.sku ?? '').trim().length > 0);
  return { copyable, skipped: products.length - copyable.length };
}

export async function copyProductsToClipboard(
  products: Product[],
): Promise<{ copied: number; skipped: number }> {
  const { copyable, skipped } = partitionCopyableProducts(products);
  if (copyable.length === 0) {
    throw new Error('No products with a SKU to copy');
  }
  const tsv = productsToTsv(copyable, { includeHeader: true });
  if (!navigator.clipboard?.writeText) {
    throw new Error('Clipboard is not available in this browser');
  }
  await navigator.clipboard.writeText(tsv);
  return { copied: copyable.length, skipped };
}
