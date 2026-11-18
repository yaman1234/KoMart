/** Values needed to choose the code and price printed on a shelf label. */
export interface LabelProduct {
  name: string;
  sku: string;
  barcode?: string | null;
  sellingPrice: number;
  offeredPrice?: number | null;
}

/**
 * Barcode when it is non-empty after trimming, otherwise the SKU.
 * Both stay strings so a leading-zero SKU is never coerced to a number.
 */
export function productLabelCode(product: Pick<LabelProduct, 'barcode' | 'sku'>): string {
  const barcode = (product.barcode ?? '').trim();
  if (barcode) return barcode;
  return (product.sku ?? '').trim();
}

/** Offered price when it is an active discount below the selling price. */
export function productLabelPrice(product: Pick<LabelProduct, 'sellingPrice' | 'offeredPrice'>): number {
  const selling = Number(product.sellingPrice);
  const offered = Number(product.offeredPrice);
  if (Number.isFinite(offered) && offered > 0 && Number.isFinite(selling) && offered < selling) {
    return offered;
  }
  return Number.isFinite(selling) ? selling : 0;
}

/** Keep a product name to about two lines on a 38mm label. */
export function truncateLabelName(name: string, maxChars = 54): string {
  const trimmed = (name ?? '').trim().replace(/\s+/g, ' ');
  if (trimmed.length <= maxChars) return trimmed;
  return `${trimmed.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}
