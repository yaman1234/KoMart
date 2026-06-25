import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { QUERY_KEYS } from '@/constants';
import { productService } from '@/services';
import type { ListQueryParams, Product } from '@/types';

export function useProducts(
  params?: ListQueryParams,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: [...QUERY_KEYS.products, params],
    queryFn: () => productService.getAll(params),
    enabled: options?.enabled ?? true,
  });
}

export function useProduct(id: string) {
  return useQuery({
    queryKey: QUERY_KEYS.product(id),
    queryFn: () => productService.getById(id),
    enabled: !!id,
  });
}

export function useCreateProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>) =>
      productService.create(data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.products });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.inventory });
    },
  });
}

export function useUpdateProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Product> }) =>
      productService.update(id, data),
    onSuccess: (_, { id }) => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.products });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.product(id) });
    },
  });
}

export function useDeleteProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => productService.delete(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.products });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.inventory });
    },
  });
}
