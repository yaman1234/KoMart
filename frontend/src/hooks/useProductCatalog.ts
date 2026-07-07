import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { QUERY_KEYS, STALE_TIME } from '@/constants';
import { productService } from '@/services';
import { buildProductCatalogIndex } from '@/pages/purchase-orders/poProductResolver';

const CATALOG_PAGE_SIZE = 500;

export function useProductCatalog() {
  const query = useQuery({
    queryKey: [...QUERY_KEYS.products, 'catalog', CATALOG_PAGE_SIZE],
    queryFn: () => productService.getAll({ pageSize: CATALOG_PAGE_SIZE }),
    staleTime: STALE_TIME.standard,
  });

  const index = useMemo(
    () => buildProductCatalogIndex(query.data?.data ?? []),
    [query.data?.data],
  );

  return {
    ...query,
    products: query.data?.data ?? [],
    index,
  };
}
