import { useQuery, useMutation, useQueryClient, type UseQueryOptions } from '@tanstack/react-query';
import { QUERY_KEYS } from '@/constants';
import { customerService } from '@/services';
import type { ListQueryParams, Customer, PaginatedResponse } from '@/types';

type CustomersQueryOptions = Omit<
  UseQueryOptions<PaginatedResponse<Customer>>,
  'queryKey' | 'queryFn'
>;

export function useCustomers(params?: ListQueryParams, options?: CustomersQueryOptions) {
  return useQuery({
    queryKey: [...QUERY_KEYS.customers, params],
    queryFn: () => customerService.getAll(params),
    ...options,
  });
}

export function useCustomer(id: string) {
  return useQuery({
    queryKey: QUERY_KEYS.customer(id),
    queryFn: () => customerService.getById(id),
    enabled: !!id,
  });
}

export function useCustomerTransactions(id: string) {
  return useQuery({
    queryKey: [...QUERY_KEYS.customer(id), 'transactions'],
    queryFn: () => customerService.getTransactions(id),
    enabled: !!id,
  });
}

export function useCreateCustomer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      data: Omit<Customer, 'id' | 'createdAt' | 'loyaltyPoints' | 'membershipTier' | 'totalSpent'>,
    ) => customerService.create(data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.customers });
    },
  });
}

export function useUpdateCustomer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Customer> }) =>
      customerService.update(id, data),
    onSuccess: (_, { id }) => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.customers });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.customer(id) });
    },
  });
}
