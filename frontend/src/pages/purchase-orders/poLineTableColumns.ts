export const PO_FORM_COLUMNS = {
  sn: 36,
  sku: 120,
  product: 200,
  qty: 72,
  buyUom: 88,
  unitsPerPack: 80,
  unitCost: 96,
  lineTotal: 96,
  actions: 40,
} as const;

export function poFormColWidths(): number[] {
  return [
    PO_FORM_COLUMNS.sn,
    PO_FORM_COLUMNS.sku,
    PO_FORM_COLUMNS.product,
    PO_FORM_COLUMNS.qty,
    PO_FORM_COLUMNS.buyUom,
    PO_FORM_COLUMNS.unitsPerPack,
    PO_FORM_COLUMNS.unitCost,
    PO_FORM_COLUMNS.lineTotal,
    PO_FORM_COLUMNS.actions,
  ];
}

export function poFormTableMinWidth(): number {
  return poFormColWidths().reduce((sum, w) => sum + w, 0);
}

export const PO_DETAIL_FLAT_COLUMNS = {
  checkbox: 48,
  sn: 40,
  product: 220,
  ordered: 80,
  received: 80,
  packQty: 88,
  unitsPerPack: 88,
  totalUnits: 96,
  expiry: 130,
  status: 90,
  unitCost: 90,
  lineTotal: 100,
} as const;

export function poDetailFlatColWidths(canReceive: boolean): number[] {
  const widths: number[] = [
    ...(canReceive ? [PO_DETAIL_FLAT_COLUMNS.checkbox] : []),
    PO_DETAIL_FLAT_COLUMNS.sn,
    PO_DETAIL_FLAT_COLUMNS.product,
    PO_DETAIL_FLAT_COLUMNS.ordered,
    PO_DETAIL_FLAT_COLUMNS.received,
  ];
  if (canReceive) {
    widths.push(
      PO_DETAIL_FLAT_COLUMNS.packQty,
      PO_DETAIL_FLAT_COLUMNS.unitsPerPack,
      PO_DETAIL_FLAT_COLUMNS.totalUnits,
      PO_DETAIL_FLAT_COLUMNS.expiry,
    );
  } else {
    widths.push(PO_DETAIL_FLAT_COLUMNS.unitsPerPack, PO_DETAIL_FLAT_COLUMNS.totalUnits);
  }
  widths.push(
    PO_DETAIL_FLAT_COLUMNS.status,
    PO_DETAIL_FLAT_COLUMNS.unitCost,
    PO_DETAIL_FLAT_COLUMNS.lineTotal,
  );
  return widths;
}

export function poDetailTableMinWidth(canReceive: boolean): number {
  return canReceive ? 1100 : 900;
}
