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
  product: 160,
  buyUom: 88,
  conversion: 88,
  sellUnit: 72,
  orderedQty: 68,
  receivedQty: 68,
  remaining: 68,
  receiveQty: 80,
  totalUnits: 76,
  unitCost: 84,
  expiry: 120,
  status: 84,
  lineTotal: 92,
} as const;

export function poDetailColWidths(canReceive: boolean): number[] {
  return [
    ...(canReceive ? [PO_DETAIL_COLUMNS.checkbox] : []),
    PO_DETAIL_COLUMNS.sn,
    PO_DETAIL_COLUMNS.product,
    PO_DETAIL_COLUMNS.buyUom,
    PO_DETAIL_COLUMNS.conversion,
    PO_DETAIL_COLUMNS.sellUnit,
    PO_DETAIL_COLUMNS.orderedQty,
    PO_DETAIL_COLUMNS.receivedQty,
    PO_DETAIL_COLUMNS.remaining,
    ...(canReceive ? [PO_DETAIL_COLUMNS.receiveQty] : []),
    PO_DETAIL_COLUMNS.totalUnits,
    PO_DETAIL_COLUMNS.unitCost,
    ...(canReceive ? [PO_DETAIL_COLUMNS.expiry] : []),
    PO_DETAIL_COLUMNS.status,
    PO_DETAIL_COLUMNS.lineTotal,
  ];
}

export function poDetailTableMinWidth(canReceive: boolean): number {
  return poDetailColWidths(canReceive).reduce((sum, w) => sum + w, 0);
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
