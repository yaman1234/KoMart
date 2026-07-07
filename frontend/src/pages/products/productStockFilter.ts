import type { Product } from '@/types';

export type StockFilter = '' | 'in' | 'low' | 'out';

export function filterByStock(products: Product[], stockFilter: StockFilter): Product[] {
  if (!stockFilter) return products;
  return products.filter((p) => {
    if (stockFilter === 'out') return p.stock === 0;
    if (stockFilter === 'low') return p.stock > 0 && p.stock <= p.lowStockThreshold;
    if (stockFilter === 'in') return p.stock > p.lowStockThreshold;
    return true;
  });
}
