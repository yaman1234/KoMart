/** VAT helpers for PO line cost entry. */

export function vatAmount(beforeVat: number, taxRatePercent: number): number {
  const before = Number.isFinite(beforeVat) ? Math.max(0, beforeVat) : 0;
  const rate = Number.isFinite(taxRatePercent) ? Math.max(0, taxRatePercent) : 0;
  return Math.round(before * (rate / 100) * 100) / 100;
}

/** Unit cost = before VAT + VAT, using the store tax percent. */
export function applyVatToUnitCost(beforeVat: number, taxRatePercent: number): number {
  const before = Number.isFinite(beforeVat) ? Math.max(0, beforeVat) : 0;
  return Math.round((before + vatAmount(before, taxRatePercent)) * 100) / 100;
}

/** Reverse: inclusive unit cost → before VAT. */
export function stripVatFromUnitCost(inclusive: number, taxRatePercent: number): number {
  const incl = Number.isFinite(inclusive) ? Math.max(0, inclusive) : 0;
  const rate = Number.isFinite(taxRatePercent) ? Math.max(0, taxRatePercent) : 0;
  if (rate <= 0) return incl;
  return Math.round((incl / (1 + rate / 100)) * 100) / 100;
}

export function isLineFullyReceived(item: { quantity: number; receivedQuantity: number }): boolean {
  return item.quantity > 0 && item.receivedQuantity >= item.quantity;
}
