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

export const PO_PASTE_HINT = `${PO_LABELS.sku} · ${PO_LABELS.product} · ${PO_LABELS.packQty} · ${PO_LABELS.buyUom} · ${PO_LABELS.unitsPerPack} · ${PO_LABELS.unitCost}`;

export const PO_RECEIVE_HINT = 'Pack qty is in Primary Unit. Total units = pack qty × conversion rate.';

export const PO_AMEND_HINT =
  'Edit corrects this order: reducing pack qty or removing a received line takes remaining stock back; increasing qty leaves the extra unreceived (use Process Receipt). A higher total reopens payment; a lower total is blocked until you reverse the extra PO expense. To void the whole order (including payments), use Cancel order on the detail page.';

export const PO_CANCEL_HINT =
  'Cancel voids the purchase order: recorded payments and leftover received stock are reversed. If any received stock was already sold, cancel is blocked.';
