/** Which field should show a barcode/SKU collision from product create or update. */
export function productCodeConflictField(message: string): 'barcode' | 'sku' | null {
  if (/sku matches another product/i.test(message)) return 'sku';
  if (/barcode already exists/i.test(message) || /barcode matches another product/i.test(message)) {
    return 'barcode';
  }
  return null;
}
