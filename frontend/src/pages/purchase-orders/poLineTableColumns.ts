export const PO_FORM_COLUMNS = {
  sn: 40,
  sku: 88,
  product: 200,
  qty: 76,
  buyUom: 100,
  unitsPerPack: 100,
  sellUnit: 88,
  totalUnits: 84,
  unitCost: 128,
  lineTotal: 104,
  actions: 44,
} as const;

export function poFormColWidths(): number[] {
  return [
    PO_FORM_COLUMNS.sn,
    PO_FORM_COLUMNS.sku,
    PO_FORM_COLUMNS.product,
    PO_FORM_COLUMNS.qty,
    PO_FORM_COLUMNS.buyUom,
    PO_FORM_COLUMNS.unitsPerPack,
    PO_FORM_COLUMNS.sellUnit,
    PO_FORM_COLUMNS.totalUnits,
    PO_FORM_COLUMNS.unitCost,
    PO_FORM_COLUMNS.lineTotal,
    PO_FORM_COLUMNS.actions,
  ];
}

export function poFormTableMinWidth(): number {
  return poFormColWidths().reduce((sum, w) => sum + w, 0);
}

/** Detail / Process Receipt column widths */
export const PO_DETAIL_COLUMNS = {
  checkbox: 40,
  sn: 36,
  product: 180,
  orderedQty: 72,
  orderUom: 72,
  conversion: 96,
  receivedQty: 72,
  receiveQty: 80,
  sellUom: 72,
  totalUnits: 80,
  expiry: 120,
  status: 80,
  unitCost: 84,
  lineTotal: 92,
} as const;

export function poDetailColWidths(canReceive: boolean): number[] {
  const widths: number[] = [
    ...(canReceive ? [PO_DETAIL_COLUMNS.checkbox] : []),
    PO_DETAIL_COLUMNS.sn,
    PO_DETAIL_COLUMNS.product,
    // Ordered group
    PO_DETAIL_COLUMNS.orderedQty,
    PO_DETAIL_COLUMNS.orderUom,
    PO_DETAIL_COLUMNS.conversion,
    // Received group
    PO_DETAIL_COLUMNS.receivedQty,
    ...(canReceive ? [PO_DETAIL_COLUMNS.receiveQty] : []),
    PO_DETAIL_COLUMNS.sellUom,
    PO_DETAIL_COLUMNS.totalUnits,
    ...(canReceive ? [PO_DETAIL_COLUMNS.expiry] : []),
    PO_DETAIL_COLUMNS.status,
    PO_DETAIL_COLUMNS.unitCost,
    PO_DETAIL_COLUMNS.lineTotal,
  ];
  return widths;
}

export function poDetailTableMinWidth(canReceive: boolean): number {
  return canReceive ? 1204 : 1004;
}

/** @deprecated Use PO_DETAIL_COLUMNS / poDetailColWidths */
export const PO_DETAIL_FLAT_COLUMNS = {
  checkbox: PO_DETAIL_COLUMNS.checkbox,
  sn: PO_DETAIL_COLUMNS.sn,
  product: PO_DETAIL_COLUMNS.product,
  ordered: PO_DETAIL_COLUMNS.orderedQty,
  received: PO_DETAIL_COLUMNS.receivedQty,
  packQty: PO_DETAIL_COLUMNS.receiveQty,
  unitsPerPack: PO_DETAIL_COLUMNS.conversion,
  totalUnits: PO_DETAIL_COLUMNS.totalUnits,
  expiry: PO_DETAIL_COLUMNS.expiry,
  status: PO_DETAIL_COLUMNS.status,
  unitCost: PO_DETAIL_COLUMNS.unitCost,
  lineTotal: PO_DETAIL_COLUMNS.lineTotal,
} as const;

/** @deprecated Use poDetailColWidths */
export function poDetailFlatColWidths(canReceive: boolean): number[] {
  return poDetailColWidths(canReceive);
}
