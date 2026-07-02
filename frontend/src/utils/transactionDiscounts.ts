import type { AppliedPromotion, Transaction } from '@/types';

export interface TransactionDiscountBreakdown {
  linePromotionDiscount: number;
  cartPromotionDiscount: number;
  manualDiscount: number;
  loyaltyRedemption: number;
  appliedPromotions: AppliedPromotion[];
  totalDiscount: number;
  hasDiscounts: boolean;
  hasLineDiscounts: boolean;
}

export interface DiscountDisplayLine {
  label: string;
  amount: number;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function getTransactionDiscountBreakdown(txn: Transaction): TransactionDiscountBreakdown {
  const items = txn.items ?? [];
  const linePromotionDiscount = round2(
    items.reduce((sum, item) => sum + (item.discount ?? 0) * (item.quantity ?? 0), 0),
  );

  const promotionDiscount = txn.promotionDiscount ?? 0;
  const cartPromotionDiscount = round2(Math.max(0, promotionDiscount - linePromotionDiscount));
  const manualDiscount = round2(txn.manualDiscount ?? 0);
  const loyaltyRedemption = txn.loyaltyPointsRedeemed ?? 0;
  const appliedPromotions = txn.appliedPromotions ?? [];
  const cartLevelDiscount = round2(txn.discount ?? 0);
  const totalDiscount = round2(linePromotionDiscount + cartLevelDiscount);

  return {
    linePromotionDiscount,
    cartPromotionDiscount,
    manualDiscount,
    loyaltyRedemption,
    appliedPromotions,
    totalDiscount,
    hasDiscounts: totalDiscount > 0,
    hasLineDiscounts: items.some((item) => (item.discount ?? 0) > 0),
  };
}

/** Human-readable discount lines for receipts and transaction views. */
export function getTransactionDiscountLines(txn: Transaction): DiscountDisplayLine[] {
  const breakdown = getTransactionDiscountBreakdown(txn);
  const lines: DiscountDisplayLine[] = [];

  if (breakdown.appliedPromotions.length > 0) {
    for (const promo of breakdown.appliedPromotions) {
      if (promo.amount > 0) {
        lines.push({ label: promo.name, amount: promo.amount });
      }
    }
  } else {
    if (breakdown.linePromotionDiscount > 0) {
      lines.push({ label: 'Item promotions', amount: breakdown.linePromotionDiscount });
    }
    if (breakdown.cartPromotionDiscount > 0) {
      lines.push({ label: 'Cart promotion', amount: breakdown.cartPromotionDiscount });
    }
  }

  if (breakdown.manualDiscount > 0) {
    lines.push({ label: 'Manual discount', amount: breakdown.manualDiscount });
  }
  if (breakdown.loyaltyRedemption > 0) {
    lines.push({ label: 'Loyalty redemption', amount: breakdown.loyaltyRedemption });
  }

  return lines;
}
