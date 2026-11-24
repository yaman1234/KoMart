/** Mirror of backend compute_po_totals — server remains source of truth on save. */

export type PoTotals = {
  subtotal: number;
  vatAmount: number;
  discount: number;
  additionalCharges: number;
  totalAmount: number;
};

export type PoTotalsOptions = {
  /** When true, lineExtensions must be qty × cost before VAT. */
  vatBill?: boolean;
  /** Store tax percent. Ignored unless vatBill is set. */
  taxRate?: number;
};

export function computePoTotals(
  lineExtensions: number[],
  discount: number,
  additionalCharges: number,
  options?: PoTotalsOptions,
): PoTotals {
  const vatBill = Boolean(options?.vatBill);
  const taxRate = vatBill ? nonNegative(options?.taxRate) : 0;
  const subtotal = round2(lineExtensions.reduce((s, n) => s + (Number.isFinite(n) ? n : 0), 0));
  const discountN = round2(Math.max(0, Math.min(Number(discount) || 0, subtotal)));
  const chargesN = round2(Math.max(0, Number(additionalCharges) || 0));
  // VAT is a single percentage of the pre-VAT subtotal. Discount and charges do not change it.
  const vatAmount = vatBill ? round2(subtotal * (taxRate / 100)) : 0;
  const totalAmount = round2(Math.max(0, subtotal - discountN) + vatAmount + chargesN);
  return {
    subtotal,
    vatAmount,
    discount: discountN,
    additionalCharges: chargesN,
    totalAmount,
  };
}

function nonNegative(value: number | undefined): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
