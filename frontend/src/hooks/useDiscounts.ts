import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { QUERY_KEYS, STALE_TIME } from '@/constants';
import { discountService } from '@/services';
import type { CartItem, DiscountRule, DiscountRuleType } from '@/types';
import { invalidateCommerceQueries } from '@/hooks/invalidateCommerce';

export function useDiscountRules(activeOnly = true) {
  return useQuery({
    queryKey: [...QUERY_KEYS.discounts, { activeOnly }],
    queryFn: () => discountService.getAll(activeOnly),
    staleTime: STALE_TIME.standard,
  });
}

export function useCreateDiscountRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      name: string;
      code?: string;
      ruleType: DiscountRuleType;
      value: number;
      productIds?: string[];
      category?: string;
      minCartTotal?: number;
      minLineQty?: number;
      sellUom?: string;
      maxDiscount?: number;
      priority?: number;
    }) => discountService.create({
      name: data.name,
      code: data.code ?? '',
      ruleType: data.ruleType,
      value: data.value,
      productIds: data.productIds ?? [],
      category: data.category ?? '',
      minCartTotal: data.minCartTotal ?? 0,
      minLineQty: data.minLineQty ?? 0,
      sellUom: data.sellUom ?? '',
      maxDiscount: data.maxDiscount ?? 0,
      priority: data.priority ?? 0,
      isActive: true,
    }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.discounts });
      invalidateCommerceQueries(queryClient, { scopes: ['price'] });
    },
  });
}

export function useUpdateDiscountRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: Partial<DiscountRule> & { id: string }) =>
      discountService.update(id, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.discounts });
      invalidateCommerceQueries(queryClient, { scopes: ['price'] });
    },
  });
}

export function useDeleteDiscountRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => discountService.delete(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.discounts });
      invalidateCommerceQueries(queryClient, { scopes: ['price'] });
    },
  });
}

export function useEvaluateDiscounts(items: CartItem[], couponCode: string) {
  const payloadKey = useMemo(
    () => JSON.stringify({
      items: items.map((i) => ({
        productId: i.productId,
        price: i.price,
        quantity: i.quantity,
        category: i.category ?? '',
        sellUom: i.sellUom ?? '',
      })),
      couponCode,
    }),
    [items, couponCode],
  );

  return useQuery({
    queryKey: QUERY_KEYS.discountEvaluate(payloadKey),
    queryFn: () => discountService.evaluate({
      items: items.map((i) => ({
        productId: i.productId,
        price: i.price,
        quantity: i.quantity,
        category: i.category ?? '',
        sellUom: i.sellUom ?? '',
      })),
      couponCode,
    }),
    enabled: items.length > 0,
    staleTime: STALE_TIME.realtime,
  });
}
