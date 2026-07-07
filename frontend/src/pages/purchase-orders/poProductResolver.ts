import type { Product } from '@/types';

export interface ProductCatalogIndex {
  bySku: Map<string, Product>;
  byName: Map<string, Product>;
  products: Product[];
}

export function buildProductCatalogIndex(products: Product[]): ProductCatalogIndex {
  const bySku = new Map<string, Product>();
  const byName = new Map<string, Product>();
  for (const p of products) {
    if (p.sku) bySku.set(p.sku.trim().toLowerCase(), p);
    byName.set(p.name.trim().toLowerCase(), p);
  }
  return { bySku, byName, products };
}

export function resolveProductFromInput(
  input: string,
  index: ProductCatalogIndex,
): Product | null {
  const key = input.trim().toLowerCase();
  if (!key) return null;
  return index.bySku.get(key) ?? index.byName.get(key) ?? null;
}
