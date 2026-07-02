import { useQuery, useInfiniteQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { QUERY_KEYS, STALE_TIME } from '@/constants';
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
    placeholderData: keepPreviousData,
    staleTime: STALE_TIME.standard,
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

export function useInfiniteProducts(params?: Omit<ListQueryParams, 'page'>) {
  return useInfiniteQuery({
    queryKey: [...QUERY_KEYS.products, 'infinite', params],
    queryFn: ({ pageParam }) =>
      productService.getAll({ ...params, page: pageParam as number, pageSize: 24 }),
    initialPageParam: 1,
    getNextPageParam: (last) =>
      (last.page < last.totalPages ? last.page + 1 : undefined),
  });
}
