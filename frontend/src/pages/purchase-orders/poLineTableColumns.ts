export const PO_FORM_COLUMNS = {
  sn: 36,
  sku: 110,
  product: 200,
  qty: 64,
  buyUom: 88,
  perPack: 72,
  totalUnits: 80,
  costBeforeVat: 110,
  unitCost: 96,
  amount: 96,
  actions: 40,
} as const;

export function poFormColWidths(vatBill = false): number[] {
  return [
    PO_FORM_COLUMNS.sn,
    PO_FORM_COLUMNS.sku,
    PO_FORM_COLUMNS.product,
    PO_FORM_COLUMNS.qty,
    PO_FORM_COLUMNS.buyUom,
    PO_FORM_COLUMNS.perPack,
    PO_FORM_COLUMNS.totalUnits,
    ...(vatBill ? [PO_FORM_COLUMNS.costBeforeVat] : []),
    PO_FORM_COLUMNS.unitCost,
    PO_FORM_COLUMNS.amount,
    PO_FORM_COLUMNS.actions,
  ];
}

export function poFormTableMinWidth(vatBill = false): number {
  return poFormColWidths(vatBill).reduce((sum, w) => sum + w, 0);
}

export const PO_DETAIL_FLAT_COLUMNS = {
  checkbox: 48,
  sn: 36,
  product: 180,
  ordered: 72,
  received: 72,
  receive: 88,
  buyUom: 72,
  pcsInPack: 80,
  stockIn: 88,
  status: 88,
  costPack: 88,
  costPc: 80,
  sellAs: 120,
  packPrice: 96,
  piecePrice: 96,
  lastBuy: 80,
  expiry: 110,
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
    widths.push(PO_DETAIL_FLAT_COLUMNS.receive);
  }
  widths.push(
    PO_DETAIL_FLAT_COLUMNS.buyUom,
    PO_DETAIL_FLAT_COLUMNS.pcsInPack,
    PO_DETAIL_FLAT_COLUMNS.stockIn,
    PO_DETAIL_FLAT_COLUMNS.status,
    PO_DETAIL_FLAT_COLUMNS.costPack,
    PO_DETAIL_FLAT_COLUMNS.costPc,
    PO_DETAIL_FLAT_COLUMNS.sellAs,
    PO_DETAIL_FLAT_COLUMNS.packPrice,
    PO_DETAIL_FLAT_COLUMNS.piecePrice,
    PO_DETAIL_FLAT_COLUMNS.lastBuy,
  );
  if (canReceive) {
    widths.push(PO_DETAIL_FLAT_COLUMNS.expiry);
  }
  return widths;
}

export function poDetailTableMinWidth(canReceive: boolean): number {
  return canReceive ? 1680 : 1400;
}
