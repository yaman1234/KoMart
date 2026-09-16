import { useCallback, useMemo, useState } from 'react';
import { promotionKey, useEvaluateDiscounts } from '@/hooks/useDiscounts';
import { cartLineKey } from '@/utils/cartLine';
import { resolveSellOption } from '@/utils/uomSell';
import type { AppliedPromotion, CartItem, ExcludedPromotion, Product } from '@/types';

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
  availablePromotions: AppliedPromotion[];
  totalDiscount: number;
}

export interface CartMutators {
  updateQuantity: (productId: string, quantity: number, sellUom?: string) => void;
  removeItem: (productId: string, sellUom?: string) => void;
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
  const [excludedPromotions, setExcludedPromotions] = useState<ExcludedPromotion[]>([]);

  const initDraft = useCallback((init: CheckoutDraftInit) => {
    setDiscountType(init.discountType);
    setDiscountInput(init.discountInput);
    setLoyaltyPointsRedeemed(init.loyaltyPointsRedeemed ?? 0);
    setNotes(init.notes ?? '');
    setExcludedPromotions([]);
  }, []);

  const itemsForDiscount = useMemo(
    () => items.map((i) => ({
      ...i,
      category: i.category ?? productCategoryMap[i.productId] ?? '',
    })),
    [items, productCategoryMap],
  );

  const { data: fullEval } = useEvaluateDiscounts(itemsForDiscount, '', []);
  const { data: discountEval } = useEvaluateDiscounts(itemsForDiscount, '', excludedPromotions);

  const lineDiscountMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const line of discountEval?.lineItems ?? []) {
      map.set(cartLineKey(line.productId, line.sellUom), line.perUnitDiscount);
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

  const availablePromotions = fullEval?.appliedPromotions ?? [];
  const appliedPromotions = discountEval?.appliedPromotions ?? [];

  const discountBreakdown: CheckoutDiscountBreakdown = useMemo(
    () => ({
      promotionLineDiscount,
      promotionCartDiscount,
      manualDiscount,
      loyaltyPointsRedeemed: effectiveLoyalty,
      appliedPromotions,
      availablePromotions,
      totalDiscount,
    }),
    [
      promotionLineDiscount,
      promotionCartDiscount,
      manualDiscount,
      effectiveLoyalty,
      appliedPromotions,
      availablePromotions,
      totalDiscount,
    ],
  );

  const paymentItems = useMemo(
    () => items.map((item) => ({
      ...item,
      discount: lineDiscountMap.get(cartLineKey(item.productId, item.sellUom)) ?? 0,
    })),
    [items, lineDiscountMap],
  );

  const updateQty = useCallback((productId: string, quantity: number, sellUom?: string) => {
    if (quantity < 1) return;
    cartMutators.updateQuantity(productId, quantity, sellUom);
  }, [cartMutators]);

  const removeLine = useCallback((productId: string, sellUom?: string) => {
    cartMutators.removeItem(productId, sellUom);
  }, [cartMutators]);

  const addProduct = useCallback((product: Product, asPack = false) => {
    if (product.stock === 0) return;
    const opt = resolveSellOption(product, asPack);
    if (opt.price <= 0) return;
    cartMutators.addItem({
      productId: product.id,
      name: product.name,
      sku: product.sku,
      price: opt.price,
      quantity: 1,
      discount: 0,
      sellUom: opt.sellUom,
      unitFactor: opt.unitFactor,
      uom: product.uom || product.buyUom || '',
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

  const setPromotionEnabled = useCallback((promo: AppliedPromotion, enabled: boolean) => {
    const key = promotionKey(promo);
    setExcludedPromotions((prev) => {
      const without = prev.filter((p) => promotionKey(p) !== key);
      if (enabled) return without;
      return [
        ...without,
        {
          ruleId: promo.ruleId,
          productId: promo.productId ?? '',
          sellUom: promo.sellUom ?? '',
        },
      ];
    });
  }, []);

  const isPromotionEnabled = useCallback((promo: AppliedPromotion) => {
    const key = promotionKey(promo);
    return !excludedPromotions.some((p) => promotionKey(p) === key);
  }, [excludedPromotions]);

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
    appliedPromotions,
    availablePromotions,
    excludedPromotions,
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
    setPromotionEnabled,
    isPromotionEnabled,
  };
}
