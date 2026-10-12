/** Pack qty × units per pack, and VAT-inclusive unit cost. */

export function packTotalUnits(packs: number, unitsPerPack: number): number {
  const packQty = Number.isFinite(packs) ? Math.max(0, packs) : 0;
  const perPack = Number.isFinite(unitsPerPack) ? Math.max(1, unitsPerPack) : 1;
  return packQty * perPack;
}

export function formatPackMath(name: string, packs: number, unitsPerPack: number): string {
  const total = packTotalUnits(packs, unitsPerPack);
  return `${name}: ${packs} × ${unitsPerPack} = ${total} units`;
}

export function vatAmount(beforeVat: number, taxRatePercent: number): number {
  const before = Number.isFinite(beforeVat) ? Math.max(0, beforeVat) : 0;
  const rate = Number.isFinite(taxRatePercent) ? Math.max(0, taxRatePercent) : 0;
  return Math.round(before * (rate / 100) * 100) / 100;
}

/** Unit cost = before VAT + VAT, using the store tax percent (4 dp, matches the API). */
export function applyVatToUnitCost(beforeVat: number, taxRatePercent: number): number {
  const before = Number.isFinite(beforeVat) ? Math.max(0, beforeVat) : 0;
  const rate = Number.isFinite(taxRatePercent) ? Math.max(0, taxRatePercent) : 0;
  return Math.round(before * (1 + rate / 100) * 10000) / 10000;
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
