/** Column width constants for the PO create-form and detail-page flat tables.
 *
 * The create-form table no longer renders sell-UOM / sell-mode / existing-cost /
 * selling-price columns — those values stay on the line for the payload and are
 * only shown on the detail (receive) table. */

export const PO_FORM_COLUMNS = {
  sn: 36,
  sku: 110,
  product: 200,
  qty: 88,
  buyUom: 88,
  unitsPerPack: 96,
  unitCost: 96,
  beforeVat: 96,
  lineTotal: 88,
  actions: 40,
} as const;

export function poFormColWidths(vatBill = false): number[] {
  return [
    PO_FORM_COLUMNS.sn,
    PO_FORM_COLUMNS.sku,
    PO_FORM_COLUMNS.product,
    PO_FORM_COLUMNS.qty,
    PO_FORM_COLUMNS.buyUom,
    PO_FORM_COLUMNS.unitsPerPack,
    PO_FORM_COLUMNS.unitCost,
    ...(vatBill ? [PO_FORM_COLUMNS.beforeVat] : []),
    PO_FORM_COLUMNS.lineTotal,
    PO_FORM_COLUMNS.actions,
  ];
}

export function poFormTableMinWidth(vatBill = false): number {
  return poFormColWidths(vatBill).reduce((sum, w) => sum + w, 0);
}

export const PO_DETAIL_FLAT_COLUMNS = {
  checkbox: 48,
  sn: 40,
  product: 220,
  ordered: 72,
  received: 80,
  packQty: 88,
  unitsPerPack: 96,
  totalUnits: 88,
  expiry: 90,
  status: 110,
  buyPrice: 96,
  sellPrice: 96,
  sellPcs: 96,
  lastBuy: 96,
  lineTotal: 100,
} as const;

export function poDetailFlatColWidths(canReceive: boolean, vatBill = false): number[] {
  void vatBill;
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
    PO_DETAIL_FLAT_COLUMNS.buyPrice,
    PO_DETAIL_FLAT_COLUMNS.sellPrice,
    PO_DETAIL_FLAT_COLUMNS.sellPcs,
    PO_DETAIL_FLAT_COLUMNS.lastBuy,
    PO_DETAIL_FLAT_COLUMNS.lineTotal,
  );
  return widths;
}

export function poDetailTableMinWidth(canReceive: boolean, vatBill = false): number {
  void vatBill;
  return poDetailFlatColWidths(canReceive).reduce((sum, w) => sum + w, 0);
}