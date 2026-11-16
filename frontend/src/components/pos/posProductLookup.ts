import { productService } from '@/services';
import type { Product } from '@/types';

export type PosScanResolution =
  | { type: 'none' }
  | { type: 'single'; product: Product }
  | { type: 'choose'; products: Product[] };

function norm(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

/** Exact barcode matches, de-duplicated by product id. Empty codes match nothing. */
export function productsSharingBarcode(list: Product[], code: string): Product[] {
  const key = norm(code);
  if (!key) return [];
  const seen = new Set<string>();
  const matches: Product[] = [];
  for (const product of list) {
    if (norm(product.barcode) !== key || seen.has(product.id)) continue;
    seen.add(product.id);
    matches.push(product);
  }
  return matches;
}

function mergeProducts(primary: Product[], extra: Product[]): Product[] {
  const seen = new Set(primary.map((product) => product.id));
  const merged = [...primary];
  for (const product of extra) {
    if (seen.has(product.id)) continue;
    seen.add(product.id);
    merged.push(product);
  }
  return merged;
}

function singleSkuMatch(list: Product[], code: string): Product | undefined {
  const key = norm(code);
  if (!key) return undefined;
  return list.find((product) => norm(product.sku) === key);
}

function nameMatch(list: Product[], query: string): Product | undefined {
  const key = norm(query);
  if (!key) return undefined;
  return (
    list.find((product) => norm(product.name) === key)
    || list.find((product) => norm(product.name).startsWith(key))
    || list.find((product) => norm(product.name).includes(key))
  );
}

/**
 * Resolve a scanned/typed barcode, SKU, or product name.
 * A barcode shared by more than one product is returned as `choose` so the
 * cashier can pick a SKU. A unique barcode is returned as `single`.
 */
export async function resolvePosProductByScan(
  code: string,
  candidates: Product[] = [],
): Promise<PosScanResolution> {
  const trimmed = code.trim();
  if (!trimmed) return { type: 'none' };

  let serverProducts: Product[] | null = null;
  try {
    const exactRes = await productService.getAll({
      exactCode: trimmed,
      sellableOnly: true,
      pageSize: 20,
      includeImages: false,
    });
    serverProducts = exactRes.data;
  } catch {
    serverProducts = null;
  }

  const pool = serverProducts ? mergeProducts(candidates, serverProducts) : candidates;
  const barcodes = productsSharingBarcode(pool, trimmed);
  if (barcodes.length > 1) return { type: 'choose', products: barcodes };
  if (barcodes.length === 1) return { type: 'single', product: barcodes[0] };

  const sku = singleSkuMatch(pool, trimmed);
  if (sku) return { type: 'single', product: sku };

  const localNamed = nameMatch(candidates, trimmed);
  if (localNamed) return { type: 'single', product: localNamed };

  try {
    const searchRes = await productService.getAll({
      search: trimmed,
      sellableOnly: true,
      pageSize: 10,
      includeImages: false,
    });
    const searchBarcodes = productsSharingBarcode(searchRes.data, trimmed);
    if (searchBarcodes.length > 1) return { type: 'choose', products: searchBarcodes };
    if (searchBarcodes.length === 1) return { type: 'single', product: searchBarcodes[0] };
    const named = nameMatch(searchRes.data, trimmed) ?? searchRes.data[0];
    if (named) return { type: 'single', product: named };
  } catch {
    return { type: 'none' };
  }

  return { type: 'none' };
}
