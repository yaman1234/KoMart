import type { QueryClient } from '@tanstack/react-query';
import { QUERY_KEYS } from '@/constants';

/** Which commerce caches to refresh after a mutation. */
export type CommerceInvalidationScope = 'stock' | 'price' | 'sale';

export interface InvalidateCommerceOptions {
  productId?: string;
  /** Defaults to stock when omitted. */
  scopes?: CommerceInvalidationScope[];
}

/**
 * Invalidate React Query caches after commerce mutations (stock, prices, sales).
 * Keeps Dashboard, Reports, Catalog, and Inventory in sync without full page reload.
 *
 * Scopes:
 * - stock: receive, adjust, void restock
 * - price: product edit, receive with new prices, discount rules
 * - sale: POS checkout, void, transaction edit
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
    // Sale updates stock + wallets; refresh those without blanket reports/notifications sync.
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.products });
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.inventory });
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.dashboard });
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.transactions });
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.customers });
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.wallets });
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.reports('dailySummary') });
  }

  if (options.productId) {
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.product(options.productId) });
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.inventoryItem(options.productId) });
  }
}
