import { useQuery, useInfiniteQuery, keepPreviousData } from '@tanstack/react-query';
import { QUERY_KEYS, STALE_TIME } from '@/constants';
import { catalogService } from '@/services';
import type { ListQueryParams } from '@/types';

export function useCatalogProducts(params?: ListQueryParams) {
  return useQuery({
    queryKey: [...QUERY_KEYS.catalog, params],
    queryFn: () => catalogService.getAll(params),
    placeholderData: keepPreviousData,
    staleTime: STALE_TIME.standard,
  });
}

export function useInfiniteCatalogProducts(params?: Omit<ListQueryParams, 'page'>) {
  return useInfiniteQuery({
    queryKey: [...QUERY_KEYS.catalog, 'infinite', params],
    queryFn: ({ pageParam }) =>
      catalogService.getAll({ ...params, page: pageParam as number, pageSize: 24 }),
    initialPageParam: 1,
    getNextPageParam: (last) =>
      last.page < last.totalPages ? last.page + 1 : undefined,
  });
}

export function useCatalogProduct(id: string) {
  return useQuery({
    queryKey: QUERY_KEYS.catalogProduct(id),
    queryFn: () => catalogService.getById(id),
    enabled: !!id,
  });
}

export function useStoreInfo() {
  return useQuery({
    queryKey: QUERY_KEYS.storeInfo,
    queryFn: () => catalogService.getStoreInfo(),
    staleTime: STALE_TIME.static,
  });
}

export function useCatalogOffers() {
  return useQuery({
    queryKey: QUERY_KEYS.catalogOffers,
    queryFn: () => catalogService.getOffers(),
    staleTime: STALE_TIME.standard,
  });
}

export function useCatalogTags() {
  return useQuery({
    queryKey: QUERY_KEYS.catalogTags,
    queryFn: () => catalogService.getTags(),
    staleTime: STALE_TIME.static,
  });
}
