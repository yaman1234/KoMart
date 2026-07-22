export const PO_LABELS = {
  sku: 'SKU',
  product: 'Product',
  packQty: 'Pack qty',
  buyUom: 'Primary Unit',
  unitsPerPack: 'Conversion Rate',
  totalUnits: 'Total units',
  ordered: 'Ordered',
  received: 'Received',
  unitCost: 'Unit cost',
  lineTotal: 'Line total',
  expiryOptional: 'Expiry (optional)',
} as const;

export const PO_PASTE_HINT = `${PO_LABELS.sku} · ${PO_LABELS.packQty} · ${PO_LABELS.buyUom} · ${PO_LABELS.unitCost} · ${PO_LABELS.unitsPerPack}`;

export const PO_RECEIVE_HINT = 'Pack qty is in Primary Unit. Total units = pack qty × conversion rate.';
