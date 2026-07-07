import { PRODUCT_SHEET_HEADERS } from '@/pages/products/productPasteExport';

export const PRODUCT_SHEET_COLUMNS = {
  checkbox: 40,
  sku: 110,
  qty: 48,
  buyUom: 72,
  unitCost: 88,
  unitsPerPack: 80,
  name: 200,
  category: 100,
  brand: 90,
  supplier: 120,
  stock: 64,
  baseUom: 72,
  costBase: 80,
  sellPrice: 80,
  status: 80,
} as const;

export function productSheetColWidths(): number[] {
  return [
    PRODUCT_SHEET_COLUMNS.checkbox,
    PRODUCT_SHEET_COLUMNS.sku,
    PRODUCT_SHEET_COLUMNS.qty,
    PRODUCT_SHEET_COLUMNS.buyUom,
    PRODUCT_SHEET_COLUMNS.unitCost,
    PRODUCT_SHEET_COLUMNS.unitsPerPack,
    PRODUCT_SHEET_COLUMNS.name,
    PRODUCT_SHEET_COLUMNS.category,
    PRODUCT_SHEET_COLUMNS.brand,
    PRODUCT_SHEET_COLUMNS.supplier,
    PRODUCT_SHEET_COLUMNS.stock,
    PRODUCT_SHEET_COLUMNS.baseUom,
    PRODUCT_SHEET_COLUMNS.costBase,
    PRODUCT_SHEET_COLUMNS.sellPrice,
    PRODUCT_SHEET_COLUMNS.status,
  ];
}

export function productSheetTableMinWidth(): number {
  return productSheetColWidths().reduce((sum, w) => sum + w, 0);
}

/** Index in PRODUCT_SHEET_HEADERS after which extra (non-PO) columns begin */
export const PO_COLUMN_END_INDEX = 4;

/** Column indices that should be right-aligned in the sheet table */
export const RIGHT_ALIGNED_COL_INDICES = new Set([1, 3, 4, 9, 11, 12]);

export function isPoPasteHeader(index: number): boolean {
  return index <= PO_COLUMN_END_INDEX;
}

export function isSheetColumnRightAligned(index: number): boolean {
  return RIGHT_ALIGNED_COL_INDICES.has(index);
}

export { PRODUCT_SHEET_HEADERS };
