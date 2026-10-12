/** Column widths for the PO create-form and detail-page tables.
 * Order matches the header cells in PoLineItemsGrid and PurchaseOrderDetailPage. */

export const PO_FORM_COLUMNS = {
  sn: 36,
  sku: 110,
  product: 200,
  qty: 88,
  buyUom: 88,
  sellUom: 110,
  sellMode: 120,
  unitsPerPack: 96,
  totalUnits: 88,
  existingCost: 110,
  sellingPrice: 110,
  newSellingPrice: 120,
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
    PO_FORM_COLUMNS.sellUom,
    PO_FORM_COLUMNS.sellMode,
    PO_FORM_COLUMNS.unitsPerPack,
    PO_FORM_COLUMNS.totalUnits,
    PO_FORM_COLUMNS.existingCost,
    PO_FORM_COLUMNS.sellingPrice,
    PO_FORM_COLUMNS.newSellingPrice,
    ...(vatBill ? [PO_FORM_COLUMNS.beforeVat] : []),
    PO_FORM_COLUMNS.unitCost,
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
  beforeVat: 96,
  lastBuy: 96,
  lineTotal: 100,
} as const;

export function poDetailFlatColWidths(canReceive: boolean, vatBill = false): number[] {
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
    ...(vatBill ? [PO_DETAIL_FLAT_COLUMNS.beforeVat] : []),
    PO_DETAIL_FLAT_COLUMNS.lastBuy,
    PO_DETAIL_FLAT_COLUMNS.lineTotal,
  );
  return widths;
}

export function poDetailTableMinWidth(canReceive: boolean, vatBill = false): number {
  return poDetailFlatColWidths(canReceive, vatBill).reduce((sum, w) => sum + w, 0);
}