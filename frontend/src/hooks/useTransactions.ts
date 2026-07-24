import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { QUERY_KEYS } from '@/constants';
import { transactionService } from '@/services';
import type { ListQueryParams, PaymentMethod } from '@/types';
import { invalidateCommerceQueries } from '@/hooks/invalidateCommerce';

export function useTransactions(params?: ListQueryParams) {
  return useQuery({
    queryKey: [...QUERY_KEYS.transactions, params],
    queryFn: () => transactionService.getAll(params),
    placeholderData: keepPreviousData,
  });
}

export function useTransaction(id: string) {
  return useQuery({
    queryKey: QUERY_KEYS.transaction(id),
    queryFn: () => transactionService.getById(id),
    enabled: !!id,
  });
}

export function useUpdateTransaction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...payload
    }: {
      id: string;
      customerId?: string | null;
      customerName?: string;
      paymentMethod?: PaymentMethod;
      discount?: number;
      loyaltyPointsRedeemed?: number;
    }) => transactionService.update(id, payload),
    onSuccess: (_, { id }) => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.transaction(id) });
      invalidateCommerceQueries(queryClient, { scopes: ['sale'] });
    },
  });
}

export function useVoidTransaction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      transactionService.void(id, reason),
    onSuccess: () => {
      // Void restocks inventory — refresh product/inventory lists as well as sale caches.
      invalidateCommerceQueries(queryClient, { scopes: ['sale', 'stock'] });
    },
  });
}
