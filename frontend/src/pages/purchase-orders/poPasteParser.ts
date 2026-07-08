export interface ParsedPasteRow {
  sku: string;
  quantity: number;
  buyUom: string;
  unitCost: number;
  unitsPerBuyUom: number;
}

const HEADER_SKU = new Set(['sku', 'product sku', 'code']);
const HEADER_QTY = new Set(['qty', 'quantity', 'order qty', 'order quantity', 'pack qty']);
const HEADER_NAME = new Set(['name', 'product name', 'product']);
const HEADER_UOM = new Set(['buy uom', 'uom', 'buyuom']);
const HEADER_COST = new Set(['unit cost', 'unitcost', 'cost', 'price']);

type PasteLayout = 'legacy' | 'sheet';

function isHeaderRow(cells: string[]): boolean {
  if (cells.length === 0) return false;
  const first = cells[0].trim().toLowerCase();
  if (HEADER_SKU.has(first) || HEADER_QTY.has(first) || first === 'product') return true;
  const second = (cells[1] ?? '').trim().toLowerCase();
  if (HEADER_NAME.has(second)) return true;
  const third = (cells[2] ?? '').trim().toLowerCase();
  return HEADER_QTY.has(second) && (HEADER_UOM.has(third) || HEADER_COST.has((cells[3] ?? '').trim().toLowerCase()));
}

function isNumericQty(value: string): boolean {
  const t = value.trim();
  if (!t) return false;
  const n = parseInt(t, 10);
  return !Number.isNaN(n) && String(n) === t;
}

function detectLayout(cells: string[], fromHeader: boolean): PasteLayout {
  const second = (cells[1] ?? '').trim().toLowerCase();
  if (fromHeader) {
    if (HEADER_NAME.has(second)) return 'sheet';
    if (HEADER_QTY.has(second)) return 'legacy';
    return 'legacy';
  }
  return isNumericQty(cells[1] ?? '') ? 'legacy' : 'sheet';
}

function parseIntSafe(value: string, fallback: number): number {
  const n = parseInt(value.trim(), 10);
  return Number.isNaN(n) || n < 1 ? fallback : n;
}

function parseFloatSafe(value: string, fallback: number): number {
  const n = parseFloat(value.trim().replace(/,/g, ''));
  return Number.isNaN(n) || n < 0 ? fallback : n;
}

function parseRowCells(cells: string[], layout: PasteLayout): ParsedPasteRow {
  if (layout === 'sheet') {
    return {
      sku: cells[0] ?? '',
      quantity: parseIntSafe(cells[2] ?? '1', 1),
      buyUom: (cells[3] ?? 'pcs').trim() || 'pcs',
      unitsPerBuyUom: parseIntSafe(cells[4] ?? '1', 1),
      unitCost: parseFloatSafe(cells[5] ?? '0', 0),
    };
  }
  return {
    sku: cells[0] ?? '',
    quantity: parseIntSafe(cells[1] ?? '1', 1),
    buyUom: (cells[2] ?? 'pcs').trim() || 'pcs',
    unitCost: parseFloatSafe(cells[3] ?? '0', 0),
    unitsPerBuyUom: parseIntSafe(cells[4] ?? '1', 1),
  };
}

export function parseExcelPaste(text: string): ParsedPasteRow[] {
  const lines = text.split(/\r?\n/).map((line) => line.trimEnd()).filter((line) => line.length > 0);
  if (lines.length === 0) return [];

  const rawRows = lines.map((line) => line.split('\t').map((c) => c.trim()));
  const hasHeader = isHeaderRow(rawRows[0]);
  const dataRows = hasHeader ? rawRows.slice(1) : rawRows;
  if (dataRows.length === 0) return [];

  const layout = detectLayout(hasHeader ? rawRows[0] : dataRows[0], hasHeader);

  return dataRows
    .filter((cells) => cells.some((c) => c.length > 0))
    .map((cells) => parseRowCells(cells, layout))
    .filter((row) => row.sku.length > 0);
}
