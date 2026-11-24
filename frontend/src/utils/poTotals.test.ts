import { describe, expect, it } from 'vitest';
import { computePoTotals } from '@/utils/poTotals';

describe('computePoTotals', () => {
  it('keeps the non-VAT formula and reports no VAT', () => {
    const totals = computePoTotals([200, 50], 25, 10);
    expect(totals).toEqual({
      subtotal: 250,
      vatAmount: 0,
      discount: 25,
      additionalCharges: 10,
      totalAmount: 235,
    });
  });

  it('does not add VAT when the flag is off even if a tax rate is passed', () => {
    const off = computePoTotals([200, 750], 0, 0, { vatBill: false, taxRate: 13 });
    expect(off.vatAmount).toBe(0);
    expect(off.subtotal).toBe(950);
    expect(off.totalAmount).toBe(950);
  });

  it('adds 13% VAT on the pre-VAT subtotal only', () => {
    // 2×100 + 3×250 = 950. VAT = 123.50. Total = 1,073.50.
    const totals = computePoTotals([200, 750], 0, 0, { vatBill: true, taxRate: 13 });
    expect(totals.subtotal).toBe(950);
    expect(totals.vatAmount).toBe(123.5);
    expect(totals.totalAmount).toBe(1073.5);
  });

  it('ignores discount and additional charges when calculating VAT', () => {
    const totals = computePoTotals([200, 750], 40, 15, { vatBill: true, taxRate: 13 });
    expect(totals.subtotal).toBe(950);
    expect(totals.vatAmount).toBe(123.5);
    expect(totals.discount).toBe(40);
    expect(totals.additionalCharges).toBe(15);
    expect(totals.totalAmount).toBe(1048.5);
  });

  it('rounds VAT once on the subtotal to 2 decimals', () => {
    // 10.01 × 13% = 1.3013 → 1.30, not a per-line accumulation.
    const totals = computePoTotals([10.01], 0, 0, { vatBill: true, taxRate: 13 });
    expect(totals.subtotal).toBe(10.01);
    expect(totals.vatAmount).toBe(1.3);
    expect(totals.totalAmount).toBe(11.31);
  });

  it('rounds a half-up VAT fraction to 2 decimals', () => {
    // 10.05 × 13% = 1.3065 → 1.31
    const totals = computePoTotals([10.05], 2, 1, { vatBill: true, taxRate: 13 });
    expect(totals.vatAmount).toBe(1.31);
    // 10.05 − 2 + 1.31 + 1 = 10.36. VAT stays 1.31, not 13% of the discounted base.
    expect(totals.totalAmount).toBe(10.36);
  });
});
