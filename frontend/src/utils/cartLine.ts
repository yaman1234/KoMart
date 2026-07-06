/** Unique cart line key — same product may appear as piece and pack lines. */
export function cartLineKey(productId: string, sellUom?: string): string {
  return `${productId}::${sellUom || 'pcs'}`;
}
