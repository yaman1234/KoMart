export const PO_LABELS = {
  sku: 'SKU',
  product: 'Product',
  packQty: 'Pack qty',
  buyUom: 'Primary Unit',
  unitsPerPack: 'Units per pack',
  totalUnits: 'Total units',
  ordered: 'Ordered',
  received: 'Received',
  unitCost: 'Unit cost',
  lineTotal: 'Line total',
  expiryOptional: 'Expiry (optional)',
} as const;

export const PO_PASTE_HINT = `${PO_LABELS.sku} · ${PO_LABELS.product} · ${PO_LABELS.packQty} · ${PO_LABELS.buyUom} · ${PO_LABELS.unitsPerPack} · ${PO_LABELS.unitCost}`;

export const PO_RECEIVE_HINT =
  'Select all (or choose lines), confirm Pack qty, then Process Receipt. Pack qty × Units per pack = Total units (e.g. 12 × 5 = 60).';

export const PO_ENTRY_FLOW_STEPS = [
  'Create PO — supplier, lines (pack qty / units per pack / cost), discount / additional charges if needed, optional bill, then draft or Place Order.',
  'Goods received — Select all rows (or choose lines), confirm Pack qty received (and Units per pack / expiry if needed), then click Process Receipt. Stock increases by total units.',
  'Record payment — when money is paid; creates an expense and reduces remaining balance (partial OK).',
  'Do not cancel after receive — use purchase return for mistakes on unsold stock.',
] as const;

export const PO_RECORD_PAYMENT_HINT =
  'Use this when money has been paid. Creates an expense and reduces the remaining balance.';
