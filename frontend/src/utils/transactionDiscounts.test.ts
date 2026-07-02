import { describe, it, expect } from 'vitest';
import {
  getTransactionDiscountBreakdown,
  getTransactionDiscountLines,
} from './transactionDiscounts';
import type { Transaction } from '@/types';

const txnWithPromos: Transaction = {
  id: '1',
  transactionNumber: 'TXN-001',
  items: [
    {
      productId: 'p1',
      name: 'Snack',
      sku: 'SN-1',
      price: 100,
      quantity: 2,
      discount: 10,
    },
  ],
  subtotal: 200,
  discount: 30,
  promotionDiscount: 35,
  manualDiscount: 10,
  appliedPromotions: [
    { ruleId: 'r1', name: 'Snacks 10% off', amount: 20 },
    { ruleId: 'r2', name: 'Cart Rs.15 off', amount: 15 },
  ],
  loyaltyPointsRedeemed: 5,
  tax: 0,
  total: 150,
  paymentMethod: 'cash',
  createdBy: 'Cashier',
  createdAt: '2026-06-29T10:00:00.000Z',
};

describe('transactionDiscounts', () => {
  it('computes line and total discount breakdown', () => {
    const breakdown = getTransactionDiscountBreakdown(txnWithPromos);
    expect(breakdown.linePromotionDiscount).toBe(20);
    expect(breakdown.cartPromotionDiscount).toBe(15);
    expect(breakdown.manualDiscount).toBe(10);
    expect(breakdown.loyaltyRedemption).toBe(5);
    expect(breakdown.totalDiscount).toBe(50);
    expect(breakdown.hasDiscounts).toBe(true);
  });

  it('returns display lines for promotions, manual, and loyalty', () => {
    const lines = getTransactionDiscountLines(txnWithPromos);
    expect(lines.map((l) => l.label)).toEqual([
      'Snacks 10% off',
      'Cart Rs.15 off',
      'Manual discount',
      'Loyalty redemption',
    ]);
    expect(lines.reduce((s, l) => s + l.amount, 0)).toBe(50);
  });
});
