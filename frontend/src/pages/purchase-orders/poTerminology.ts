export const PO_LABELS = {
  sku: 'SKU',
  product: 'Product',
  qty: 'Qty',
  buyUom: 'Buy unit',
  perPack: 'Per pack',
  pcsInPack: 'Pcs in pack',
  totalUnits: 'Total units',
  costBeforeVat: 'Cost before VAT',
  cost: 'Cost',
  costPack: 'Cost / pack',
  costPc: 'Cost / pc',
  amount: 'Amount',
  ordered: 'Ordered',
  received: 'Already in',
  receive: 'Receiving now',
  stockIn: 'Stock added',
  expiry: 'Expiry',
  status: 'Status',
  sell: 'Sell',
  sellAs: 'Sell as',
  packPrice: 'Pack price',
  piecePrice: 'Piece price',
  lastBuy: 'Last buy',
} as const;

export const PO_SELL_AS_OPTIONS = [
  { value: 'unit' as const, label: 'Pack only' },
  { value: 'piece' as const, label: 'Piece only' },
  { value: 'both' as const, label: 'Pack & piece' },
];

export function sellAsLabel(mode: string | undefined): string {
  const found = PO_SELL_AS_OPTIONS.find((o) => o.value === mode);
  return found?.label ?? 'Pack only';
}

export const PO_PASTE_HINT = `${PO_LABELS.sku} · ${PO_LABELS.product} · ${PO_LABELS.qty} · ${PO_LABELS.buyUom} · ${PO_LABELS.perPack} · ${PO_LABELS.cost}`;

export const PO_RECEIVE_HINT =
  'Select open lines, set Receiving now and prices, then Process Receipt. Stock added = Receiving now × Pcs in pack.';

export const PO_ENTRY_FLOW_STEPS = [
  'Create PO — supplier, lines (qty / per pack / cost), discount / additional charges if needed, optional bill, then draft or Place Order.',
  'Goods received — Select open rows, confirm Receiving now (Pcs in pack / Sell as / prices / expiry), then Process Receipt. Stock and product prices update.',
  'Record payment — when money is paid; creates an expense and reduces remaining balance (partial OK).',
  'Return mistakes on this PO (unsold leftover only) via Return to supplier — Refund or Reduce payable.',
  'Expired / slow stock later — open the Supplier page → Return goods (no PO money change). Do not cancel after receive.',
] as const;

export const PO_RECORD_PAYMENT_HINT =
  'Use this when money has been paid. Creates an expense and reduces the remaining balance.';
