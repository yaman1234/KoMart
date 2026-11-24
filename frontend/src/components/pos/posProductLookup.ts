import { productService } from '@/services';
import type { Product } from '@/types';
import { showWarning } from '@/utils/toast';

/** Exact barcode match first, then SKU (case-insensitive). Warns on duplicates. */
export function findExactBarcodeOrSku(list: Product[], code: string): Product | undefined {
  const key = code.trim().toLowerCase();
  if (!key) return undefined;

  const byBarcode = list.filter((p) => (p.barcode ?? '').trim().toLowerCase() === key);
  if (byBarcode.length > 0) {
    if (byBarcode.length > 1) {
      showWarning(`Multiple products share barcode ${code}; added first match.`);
    }
    return byBarcode[0];
  }

  const bySku = list.filter((p) => (p.sku ?? '').trim().toLowerCase() === key);
  if (bySku.length > 0) {
    if (bySku.length > 1) {
      showWarning(`Multiple products share SKU ${code}; added first match.`);
    }
    return bySku[0];
  }

  return undefined;
}

/** Match barcode, SKU, or product name from candidates list */
export function findProductByCodeOrName(list: Product[], query: string): Product | undefined {
  const key = query.trim().toLowerCase();
  if (!key) return undefined;

  // 1. Exact barcode or SKU
  const exactCode = findExactBarcodeOrSku(list, key);
  if (exactCode) return exactCode;

  // 2. Exact product name
  const byExactName = list.find((p) => (p.name ?? '').trim().toLowerCase() === key);
  if (byExactName) return byExactName;

  // 3. Name starts with query
  const byPrefix = list.find((p) => (p.name ?? '').trim().toLowerCase().startsWith(key));
  if (byPrefix) return byPrefix;

  // 4. Name contains query
  const bySubstring = list.find((p) => (p.name ?? '').trim().toLowerCase().includes(key));
  if (bySubstring) return bySubstring;

  return undefined;
}

/**
 * Resolve a scanned/typed barcode, SKU, or product name:
 * 1. Checks in-memory candidates (barcode -> SKU -> exact name -> substring name).
 * 2. If not found in memory, queries server for exact barcode/SKU.
 * 3. If still not found, queries server by product name / keyword.
 */
export async function resolvePosProductByScan(
  code: string,
  candidates: Product[] = [],
): Promise<Product | undefined> {
  const trimmed = code.trim();
  if (!trimmed) return undefined;

  // 1. In-memory check first (fastest)
  const candidateMatch = findProductByCodeOrName(candidates, trimmed);
  if (candidateMatch) return candidateMatch;

  // 2. Exact barcode/SKU server lookup
  try {
    const exactRes = await productService.getAll({
      exactCode: trimmed,
      sellableOnly: true,
      pageSize: 10,
      includeImages: false,
    });
    const exactMatch = findExactBarcodeOrSku(exactRes.data, trimmed);
    if (exactMatch) return exactMatch;
  } catch {
    // continue to name/general search
  }

  // 3. General search by product name / keyword
  try {
    const searchRes = await productService.getAll({
      search: trimmed,
      sellableOnly: true,
      pageSize: 10,
      includeImages: false,
    });
    return findProductByCodeOrName(searchRes.data, trimmed) || searchRes.data[0];
  } catch {
    return undefined;
  }
}

