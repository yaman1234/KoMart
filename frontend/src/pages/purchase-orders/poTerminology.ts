export const PO_LABELS = {
  sn: 'SN',
  sku: 'SKU',
  product: 'Product',
  packQty: 'Buy qty',
  packQtyHint: 'How many packs to buy',
  buyUom: 'Buy unit',
  unitsPerPack: 'Units per pack',
  unitsPerPackHint: 'Pieces inside one pack',
  totalUnits: 'Total units',
  ordered: 'Ordered',
  received: 'Received',
  buyPrice: 'Buy price',
  buyPriceHint: 'Product cost / buy unit',
  sellPrice: 'Sell price',
  sellPriceHint: 'Current price / sell unit',
  sellPcs: 'Sell price (pcs)',
  sellPcsHint: 'Per sell unit',
  lastBuy: 'Last buy',
  lastBuyHint: 'Last purchase unit cost / buy unit',
  unitCostBeforeVat: 'Before VAT',
  unitCost: 'Line price',
  unitCostHint: 'Per buy unit',
  lineTotal: 'Line total',
  expiryOptional: 'Expiry (optional)',
  alreadyReceived: 'Already received',
} as const;

export const PO_PACKING_NOTE =
  'Buy qty × units per pack = total units added to stock. Example: 12 packs × 5 = 60 units.';

export const PO_PASTE_HINT = `${PO_LABELS.sku} · ${PO_LABELS.product} · ${PO_LABELS.packQty} · ${PO_LABELS.buyUom} · ${PO_LABELS.unitsPerPack} · ${PO_LABELS.unitCost}`;

export const PO_RECEIVE_HINT =
  'Select all (or choose lines), confirm Buy qty, then Process Receipt. Buy qty × Units per pack = Total units (e.g. 12 × 5 = 60).';

export const PO_ENTRY_FLOW_STEPS = [
  'Create PO — supplier, lines (buy qty / units per pack / cost), discount / additional charges if needed, optional bill, then draft or Place Order.',
  'Goods received — Select all rows (or choose lines), confirm Buy qty received (and Units per pack / expiry if needed), then click Process Receipt. Stock increases by total units.',
  'Record payment — when money has been paid; creates an expense and reduces the remaining balance (partial OK).',
  'Return mistakes on this PO (unsold leftover only) via Return to supplier — Refund or Reduce payable.',
  'Expired / slow stock later — open the Supplier page → Return goods (no PO money change). Do not cancel after receive.',
] as const;

export const PO_RECORD_PAYMENT_HINT =
  'Use this when money has been paid. Creates an expense and reduces the remaining balance.';