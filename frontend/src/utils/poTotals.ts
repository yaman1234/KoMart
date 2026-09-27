/** Mirror of backend compute_po_totals — server remains source of truth on save. */

export function computePoTotals(
  lineExtensions: number[],
  discount: number,
  additionalCharges: number,
): {
  subtotal: number;
  discount: number;
  additionalCharges: number;
  totalAmount: number;
} {
  const subtotal = round2(lineExtensions.reduce((s, n) => s + (Number.isFinite(n) ? n : 0), 0));
  const discountN = round2(Math.max(0, Math.min(Number(discount) || 0, subtotal)));
  const chargesN = round2(Math.max(0, Number(additionalCharges) || 0));
  const totalAmount = round2(Math.max(0, subtotal - discountN) + chargesN);
  return {
    subtotal,
    discount: discountN,
    additionalCharges: chargesN,
    totalAmount,
  };
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
