import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { QUERY_KEYS } from '@/constants';
import { supplierService } from '@/services';
import type { ListQueryParams, Supplier } from '@/types';

export function useSuppliers(params?: ListQueryParams) {
  return useQuery({
    queryKey: [...QUERY_KEYS.suppliers, params],
    queryFn: () => supplierService.getAll(params),
  });
}

export function useSupplier(id: string) {
  return useQuery({
    queryKey: QUERY_KEYS.supplier(id),
    queryFn: () => supplierService.getById(id),
    enabled: !!id,
  });
}

export function useCreateSupplier() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Omit<Supplier, 'id' | 'createdAt'>) => supplierService.create(data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.suppliers });
    },
  });
}

export function useUpdateSupplier() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Supplier> }) =>
      supplierService.update(id, data),
    onSuccess: (_, { id }) => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.suppliers });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.supplier(id) });
    },
  });
}
