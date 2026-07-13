import { useQuery, useInfiniteQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { GRID_PAGE_SIZE, QUERY_KEYS, STALE_TIME } from '@/constants';
import { productService } from '@/services';
import type { ListQueryParams, Product, ProductBulkUpdateItem, ProductBulkCreateItem } from '@/types';
import { invalidateCommerceQueries } from '@/hooks/invalidateCommerce';

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
      invalidateCommerceQueries(queryClient, { scopes: ['stock', 'price'] });
    },
  });
}

export function useUpdateProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Product> }) =>
      productService.update(id, data),
    onSuccess: (_, { id }) => {
      // Product cost/sell price drives POS and inventory valuation.
      invalidateCommerceQueries(queryClient, { productId: id, scopes: ['stock', 'price'] });
    },
  });
}

export function useBulkUpdateProducts() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (updates: ProductBulkUpdateItem[]) => productService.bulkUpdate(updates),
    onSuccess: () => {
      invalidateCommerceQueries(queryClient, { scopes: ['stock', 'price'] });
    },
  });
}

export function useBulkCreateProducts() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (products: ProductBulkCreateItem[]) => productService.bulkCreate(products),
    onSuccess: () => {
      invalidateCommerceQueries(queryClient, { scopes: ['stock', 'price'] });
    },
  });
}

export function useDeleteProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => productService.delete(id),
    onSuccess: () => {
      invalidateCommerceQueries(queryClient, { scopes: ['stock', 'price'] });
    },
  });
}

export function useInfiniteProducts(
  params?: Omit<ListQueryParams, 'page'> & { pageSize?: number },
) {
  const { pageSize = GRID_PAGE_SIZE, ...rest } = params ?? {};
  return useInfiniteQuery({
    queryKey: [...QUERY_KEYS.products, 'infinite', { ...rest, pageSize }],
    queryFn: ({ pageParam }) =>
      productService.getAll({ ...rest, page: pageParam as number, pageSize }),
    initialPageParam: 1,
    getNextPageParam: (last) =>
      (last.page < last.totalPages ? last.page + 1 : undefined),
  });
}
