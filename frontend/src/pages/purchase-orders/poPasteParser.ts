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
const HEADER_UOM = new Set([
  'buy uom',
  'uom',
  'buyuom',
  'primary unit',
  'primary uom',
  'order uom',
]);
const HEADER_COST = new Set(['unit cost', 'unitcost', 'cost', 'price', 'purchase price']);
const HEADER_CONV = new Set([
  'conversion',
  'conversion rate',
  'units per pack',
  'units/pack',
  'units per buy',
  'units_per_buy_uom',
]);

type PasteLayout = 'legacy' | 'sheet';

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase();
}

function isHeaderRow(cells: string[]): boolean {
  if (cells.length === 0) return false;
  const first = normalizeHeader(cells[0] ?? '');
  if (HEADER_SKU.has(first) || HEADER_QTY.has(first) || first === 'product') return true;
  const second = normalizeHeader(cells[1] ?? '');
  if (HEADER_NAME.has(second)) return true;
  const third = normalizeHeader(cells[2] ?? '');
  return HEADER_QTY.has(second) && (HEADER_UOM.has(third) || HEADER_COST.has(normalizeHeader(cells[3] ?? '')));
}

function isNumericQty(value: string): boolean {
  const t = value.trim();
  if (!t) return false;
  const n = parseInt(t, 10);
  return !Number.isNaN(n) && String(n) === t;
}

function detectLayout(cells: string[], fromHeader: boolean): PasteLayout {
  if (fromHeader) {
    const labels = cells.map(normalizeHeader);
    // Sheet: SKU | Product | Pack qty | Primary Unit | Conversion | Unit cost
    if (labels.some((h) => HEADER_NAME.has(h)) && labels.some((h) => HEADER_QTY.has(h))) {
      return 'sheet';
    }
    if (HEADER_QTY.has(labels[1] ?? '')) return 'legacy';
    if (HEADER_NAME.has(labels[1] ?? '')) return 'sheet';
    return 'legacy';
  }
  return isNumericQty(cells[1] ?? '') ? 'legacy' : 'sheet';
}

function parseIntSafe(value: string, fallback: number): number {
  const n = parseInt(value.trim().replace(/,/g, ''), 10);
  return Number.isNaN(n) || n < 1 ? fallback : n;
}

function parseFloatSafe(value: string, fallback: number): number {
  const n = parseFloat(value.trim().replace(/,/g, ''));
  return Number.isNaN(n) || n < 0 ? fallback : n;
}

function indexOfHeader(cells: string[], candidates: Set<string>): number {
  return cells.findIndex((c) => candidates.has(normalizeHeader(c)));
}

function parseRowWithHeaderMap(cells: string[], header: string[]): ParsedPasteRow | null {
  const skuIdx = indexOfHeader(header, HEADER_SKU);
  const qtyIdx = indexOfHeader(header, HEADER_QTY);
  const uomIdx = indexOfHeader(header, HEADER_UOM);
  const costIdx = indexOfHeader(header, HEADER_COST);
  const convIdx = indexOfHeader(header, HEADER_CONV);
  if (skuIdx < 0 || qtyIdx < 0) return null;
  const sku = (cells[skuIdx] ?? '').trim();
  if (!sku) return null;
  return {
    sku,
    quantity: parseIntSafe(cells[qtyIdx] ?? '1', 1),
    buyUom: uomIdx >= 0 ? (cells[uomIdx] ?? '').trim() : '',
    unitsPerBuyUom: convIdx >= 0 ? parseIntSafe(cells[convIdx] ?? '1', 1) : 1,
    unitCost: costIdx >= 0 ? parseFloatSafe(cells[costIdx] ?? '0', 0) : 0,
  };
}

function parseRowCells(cells: string[], layout: PasteLayout): ParsedPasteRow {
  if (layout === 'sheet') {
    // SKU | Product | Pack qty | Primary Unit | Conversion | Unit cost
    return {
      sku: cells[0] ?? '',
      quantity: parseIntSafe(cells[2] ?? '1', 1),
      buyUom: (cells[3] ?? '').trim(),
      unitsPerBuyUom: parseIntSafe(cells[4] ?? '1', 1),
      unitCost: parseFloatSafe(cells[5] ?? '0', 0),
    };
  }
  // SKU | Qty | UOM | Cost | Conversion
  return {
    sku: cells[0] ?? '',
    quantity: parseIntSafe(cells[1] ?? '1', 1),
    buyUom: (cells[2] ?? '').trim(),
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

  if (hasHeader) {
    const mapped = dataRows
      .filter((cells) => cells.some((c) => c.length > 0))
      .map((cells) => parseRowWithHeaderMap(cells, rawRows[0]))
      .filter((row): row is ParsedPasteRow => row !== null && row.sku.length > 0);
    if (mapped.length > 0) return mapped;
  }

  const layout = detectLayout(hasHeader ? rawRows[0] : dataRows[0], hasHeader);
  return dataRows
    .filter((cells) => cells.some((c) => c.length > 0))
    .map((cells) => parseRowCells(cells, layout))
    .filter((row) => row.sku.length > 0);
}
