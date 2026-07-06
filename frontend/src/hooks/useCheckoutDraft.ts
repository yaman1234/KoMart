import { useCallback, useMemo, useState } from 'react';
import { useEvaluateDiscounts } from '@/hooks/useDiscounts';
import type { AppliedPromotion, CartItem, Product } from '@/types';

export type CheckoutDiscountType = 'flat' | 'pct' | null;

export interface CheckoutDraftInit {
  discountType: CheckoutDiscountType;
  discountInput: number;
  loyaltyPointsRedeemed?: number;
  notes?: string;
}

export interface CheckoutDiscountBreakdown {
  promotionLineDiscount: number;
  promotionCartDiscount: number;
  manualDiscount: number;
  loyaltyPointsRedeemed: number;
  appliedPromotions: AppliedPromotion[];
  totalDiscount: number;
}

export interface CartMutators {
  updateQuantity: (productId: string, quantity: number) => void;
  removeItem: (productId: string) => void;
  addItem: (item: CartItem) => void;
}

export function useCheckoutDraft(
  items: CartItem[],
  productCategoryMap: Record<string, string>,
  cartMutators: CartMutators,
) {
  const [discountType, setDiscountType] = useState<CheckoutDiscountType>(null);
  const [discountInput, setDiscountInput] = useState(0);
  const [loyaltyPointsRedeemed, setLoyaltyPointsRedeemed] = useState(0);
  const [notes, setNotes] = useState('');

  const initDraft = useCallback((init: CheckoutDraftInit) => {
    setDiscountType(init.discountType);
    setDiscountInput(init.discountInput);
    setLoyaltyPointsRedeemed(init.loyaltyPointsRedeemed ?? 0);
    setNotes(init.notes ?? '');
  }, []);

  const itemsForDiscount = useMemo(
    () => items.map((i) => ({
      ...i,
      category: i.category ?? productCategoryMap[i.productId] ?? '',
    })),
    [items, productCategoryMap],
  );

  const { data: discountEval } = useEvaluateDiscounts(itemsForDiscount, '');

  const lineDiscountMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const line of discountEval?.lineItems ?? []) {
      map.set(line.productId, line.perUnitDiscount);
    }
    return map;
  }, [discountEval]);

  const subtotal = useMemo(
    () => items.reduce((s, i) => s + i.price * i.quantity, 0),
    [items],
  );

  const promotionLineDiscount = discountEval?.lineDiscountTotal ?? 0;
  const promotionCartDiscount = discountEval?.cartDiscount ?? 0;
  const netAfterPromo = Math.max(0, subtotal - promotionLineDiscount - promotionCartDiscount);

  const manualDiscount = discountType === null
    ? 0
    : discountType === 'pct'
      ? Math.round(netAfterPromo * discountInput / 100 * 100) / 100
      : Math.min(discountInput, netAfterPromo);

  const netAfterManual = Math.max(0, netAfterPromo - manualDiscount);
  const maxLoyalty = Math.floor(netAfterManual);
  const effectiveLoyalty = Math.min(loyaltyPointsRedeemed, maxLoyalty);

  const totalDiscount =
    promotionLineDiscount + promotionCartDiscount + manualDiscount + effectiveLoyalty;
  const total = Math.max(0, subtotal - totalDiscount);

  const discountBreakdown: CheckoutDiscountBreakdown = useMemo(
    () => ({
      promotionLineDiscount,
      promotionCartDiscount,
      manualDiscount,
      loyaltyPointsRedeemed: effectiveLoyalty,
      appliedPromotions: discountEval?.appliedPromotions ?? [],
      totalDiscount,
    }),
    [
      promotionLineDiscount,
      promotionCartDiscount,
      manualDiscount,
      effectiveLoyalty,
      discountEval?.appliedPromotions,
      totalDiscount,
    ],
  );

  const paymentItems = useMemo(
    () => items.map((item) => ({
      ...item,
      discount: lineDiscountMap.get(item.productId) ?? 0,
    })),
    [items, lineDiscountMap],
  );

  const updateQty = useCallback((productId: string, quantity: number) => {
    if (quantity < 1) return;
    cartMutators.updateQuantity(productId, quantity);
  }, [cartMutators]);

  const removeLine = useCallback((productId: string) => {
    cartMutators.removeItem(productId);
  }, [cartMutators]);

  const addProduct = useCallback((product: Product) => {
    if (product.sellingPrice <= 0) return;
    cartMutators.addItem({
      productId: product.id,
      name: product.name,
      sku: product.sku,
      price: product.sellingPrice,
      quantity: 1,
      discount: 0,
      category: product.category,
    });
  }, [cartMutators]);

  const setDiscount = useCallback((type: CheckoutDiscountType, input: number) => {
    setDiscountType(type);
    setDiscountInput(input);
  }, []);

  const setLoyalty = useCallback((points: number) => {
    setLoyaltyPointsRedeemed(Math.max(0, Math.floor(points)));
  }, []);

  const setNotesText = useCallback((text: string) => {
    setNotes(text.slice(0, 500));
  }, []);

  return {
    initDraft,
    items,
    discountType,
    discountInput,
    loyaltyPointsRedeemed: effectiveLoyalty,
    loyaltyInput: loyaltyPointsRedeemed,
    notes,
    subtotal,
    total,
    manualDiscount,
    promotionDiscount: discountEval?.promotionDiscountTotal ?? 0,
    appliedPromotions: discountEval?.appliedPromotions ?? [],
    discountBreakdown,
    paymentItems,
    netAfterPromo,
    maxLoyalty,
    updateQty,
    removeLine,
    addProduct,
    setDiscount,
    setLoyalty,
    setNotes: setNotesText,
  };
}
