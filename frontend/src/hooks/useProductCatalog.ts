import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { QUERY_KEYS, STALE_TIME } from '@/constants';
import { productService } from '@/services';
import { buildProductCatalogIndex } from '@/pages/purchase-orders/poProductResolver';
import type { Product } from '@/types';

/** Matches API list page_size cap; paginate until all products are loaded. */
const CATALOG_PAGE_SIZE = 100;

async function fetchAllProductsForCatalog(): Promise<Product[]> {
  const all: Product[] = [];
  let page = 1;
  let totalPages = 1;
  do {
    const res = await productService.getAll({
      page,
      pageSize: CATALOG_PAGE_SIZE,
      includeImages: false,
    });
    all.push(...res.data);
    totalPages = res.totalPages ?? 1;
    page += 1;
  } while (page <= totalPages);
  return all;
}

export function useProductCatalog() {
  const query = useQuery({
    queryKey: [...QUERY_KEYS.products, 'catalog', CATALOG_PAGE_SIZE, 'no-images'],
    queryFn: fetchAllProductsForCatalog,
    staleTime: STALE_TIME.static,
  });

  const index = useMemo(
    () => buildProductCatalogIndex(query.data ?? []),
    [query.data],
  );

  return {
    ...query,
    products: query.data ?? [],
    index,
  };
}
