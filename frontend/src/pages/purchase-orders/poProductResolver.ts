import type { Product } from '@/types';
import type { PoLineItem } from '@/pages/purchase-orders/poFormTypes';
import { emptyPoLineItem } from '@/pages/purchase-orders/poFormTypes';

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

export function searchProducts(
  query: string,
  index: ProductCatalogIndex,
  limit = 25,
): Product[] {
  const q = query.trim().toLowerCase();
  if (!q) return index.products.slice(0, limit);
  const matches: Product[] = [];
  for (const p of index.products) {
    const sku = (p.sku ?? '').toLowerCase();
    const name = p.name.toLowerCase();
    const barcode = (p.barcode ?? '').toLowerCase();
    if (name.includes(q) || sku.includes(q) || barcode.includes(q)) {
      matches.push(p);
      if (matches.length >= limit) break;
    }
  }
  return matches;
}

export function applyProductToLine(line: PoLineItem, product: Product): PoLineItem {
  const buyUom = product.buyUom || product.buy_uom || product.uom || '';
  const unitsPerBuyUom =
    Number(product.unitsPerBuyUom || product.units_per_buy_uom || 1) || 1;
  const costPrice = Number(product.costPrice || product.cost_price || 0) || 0;
  const unitCost =
    line.product?.id === product.id && line.unitCost > 0
      ? line.unitCost
      : costPrice * unitsPerBuyUom;

  return {
    ...line,
    skuInput: product.sku || product.name,
    product,
    productNameFallback: product.name,
    buyUom,
    unitsPerBuyUom,
    unitCost,
    resolveError: undefined,
  };
}

export function productsToPoLines(products: Product[], startId = 0): PoLineItem[] {
  let id = startId;
  return products.map((product) => {
    id += 1;
    return applyProductToLine(emptyPoLineItem(id), product);
  });
}
