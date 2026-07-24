import type { InfiniteData, QueryClient } from '@tanstack/react-query';
import { QUERY_KEYS } from '@/constants';
import type { PaginatedResponse, Product } from '@/types';

/** Which commerce caches to refresh after a mutation. */
export type CommerceInvalidationScope = 'stock' | 'price' | 'sale';

export interface InvalidateCommerceOptions {
  productId?: string;
  /** Sold / touched product IDs (sale scope — targeted detail invalidation). */
  productIds?: string[];
  /** Defaults to stock when omitted. */
  scopes?: CommerceInvalidationScope[];
}

type ProductListCache =
  | PaginatedResponse<Product>
  | InfiniteData<PaginatedResponse<Product>>;

/** Optimistically decrement stock on cached product list / infinite pages. */
export function patchProductStockInCache(
  queryClient: QueryClient,
  productId: string,
  qtyDelta: number,
): void {
  if (!productId || qtyDelta === 0) return;
  queryClient.setQueriesData<ProductListCache>(
    { queryKey: QUERY_KEYS.products },
    (old) => {
      if (!old || typeof old !== 'object') return old;

      if ('pages' in old && Array.isArray(old.pages)) {
        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            data: page.data.map((p) =>
              p.id === productId
                ? { ...p, stock: Math.max(0, p.stock - qtyDelta) }
                : p,
            ),
          })),
        };
      }

      if ('data' in old && Array.isArray(old.data)) {
        return {
          ...old,
          data: old.data.map((p) =>
            p.id === productId
              ? { ...p, stock: Math.max(0, p.stock - qtyDelta) }
              : p,
          ),
        };
      }

      return old;
    },
  );

  queryClient.setQueryData<Product>(QUERY_KEYS.product(productId), (old) => {
    if (!old) return old;
    return { ...old, stock: Math.max(0, old.stock - qtyDelta) };
  });
}

/**
 * Invalidate React Query caches after commerce mutations (stock, prices, sales).
 * Keeps Dashboard, Reports, Catalog, and Inventory in sync without full page reload.
 *
 * Scopes:
 * - stock: receive, adjust, void restock
 * - price: product edit, receive with new prices, discount rules
 * - sale: POS checkout, void, transaction edit — narrow (no full products/inventory refetch)
 */
export function invalidateCommerceQueries(
  queryClient: QueryClient,
  options: InvalidateCommerceOptions = {},
): void {
  const scopes = options.scopes?.length ? options.scopes : (['stock'] as CommerceInvalidationScope[]);
  const needsStock = scopes.includes('stock') || scopes.includes('price');
  const needsPrice = scopes.includes('price');
  const needsSale = scopes.includes('sale');

  if (needsStock) {
    // Product create/edit/receive: refresh lists including PO catalog index.
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.products });
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.inventory });
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.dashboard });
    void queryClient.invalidateQueries({ queryKey: ['reports'] });
    void queryClient.invalidateQueries({ queryKey: [...QUERY_KEYS.inventory, 'history'] });
    void queryClient.invalidateQueries({ queryKey: ['inventory', 'movements'] });
    void queryClient.invalidateQueries({ queryKey: ['inventory', 'movementSummary'] });
  }

  if (needsPrice) {
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.catalog });
  }

  if (needsSale) {
    // Stock already patched on POS lists; avoid full products/inventory refetch storm.
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.dashboard });
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.transactions });
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.wallets });
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.reports('dailySummary') });

    const ids = new Set<string>([
      ...(options.productId ? [options.productId] : []),
      ...(options.productIds ?? []),
    ]);
    for (const id of ids) {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.product(id) });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.inventoryItem(id) });
    }
  }

  if (options.productId && !needsSale) {
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.product(options.productId) });
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.inventoryItem(options.productId) });
  }
}
