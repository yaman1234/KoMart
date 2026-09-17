import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { QUERY_KEYS } from '@/constants';
import { purchaseReturnService } from '@/services';
import type { PurchaseReturnCreatePayload } from '@/types';
import { invalidateCommerceQueries } from '@/hooks/invalidateCommerce';

export function useReturnableLines(purchaseOrderId: string, enabled = true) {
  return useQuery({
    queryKey: QUERY_KEYS.purchaseReturnable(purchaseOrderId),
    queryFn: () => purchaseReturnService.getAvailable(purchaseOrderId),
    enabled: Boolean(purchaseOrderId) && enabled,
  });
}

export function usePurchaseReturns(purchaseOrderId: string, enabled = true) {
  return useQuery({
    queryKey: QUERY_KEYS.purchaseReturns(purchaseOrderId),
    queryFn: () => purchaseReturnService.getAll(purchaseOrderId),
    enabled: Boolean(purchaseOrderId) && enabled,
  });
}

export function useCreatePurchaseReturn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: PurchaseReturnCreatePayload) => purchaseReturnService.create(payload),
    onSuccess: (result) => {
      const poId = result.purchaseOrderId;
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.purchaseOrders });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.purchaseOrder(poId) });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.purchaseReturns(poId) });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.purchaseReturnable(poId) });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.wallets });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.walletBalances });
      invalidateCommerceQueries(queryClient, { scopes: ['stock', 'price'] });
    },
  });
}
