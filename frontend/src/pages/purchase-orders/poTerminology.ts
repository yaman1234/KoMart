export const PO_LABELS = {
  sku: 'SKU',
  product: 'Product',
  packQty: 'Pack qty',
  buyUom: 'Primary Unit',
  unitsPerPack: 'Conversion unit',
  conversionUnit: 'Conversion unit',
  totalUnits: 'Total units',
  sellUnit: 'Sell Unit',
  ordered: 'Ordered',
  orderedQty: 'Ordered Qty',
  orderUom: 'Order UOM',
  received: 'Received',
  receivedQty: 'Received Qty',
  receiveQty: 'Receive qty',
  sellUom: 'Sell UOM',
  totalUnitsSell: 'Total Units',
  unitCost: 'Unit cost',
  lineTotal: 'Line total',
  expiryOptional: 'Expiry (optional)',
  billNo: 'Bill number',
} as const;

export const PO_PASTE_HINT = `${PO_LABELS.sku} · ${PO_LABELS.product} · ${PO_LABELS.packQty} · ${PO_LABELS.buyUom} · ${PO_LABELS.unitsPerPack} · ${PO_LABELS.unitCost}`;

export const PO_RECEIVE_HINT =
  'Receive qty is in Order UOM. Total units (Sell UOM) = receive qty × Conversion unit.';

export const PO_DRAFT_EDIT_HINT =
  'Edit is only available while this order is a draft. After Place Order, cancel and recreate to fix mistakes, or use Return to supplier for leftover received stock.';

export const PO_CANCEL_HINT =
  'Cancel voids the purchase order: recorded payments and leftover received stock are reversed. If any received stock was already sold, cancel is blocked — use Return to supplier for remaining stock instead.';

export const PO_RETURN_HINT =
  'Return leftover received stock to the supplier. The original purchase order stays on record; a wallet credit is posted for the return value. Return qty is in Sell UOM and cannot exceed leftover stock from this PO.';
