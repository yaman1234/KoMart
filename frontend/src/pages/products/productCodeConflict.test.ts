import { describe, expect, it } from 'vitest';
import { productCodeConflictField } from './productCodeConflict';

describe('productCodeConflictField', () => {
  it('maps duplicate barcode and barcode/SKU collisions onto the barcode field', () => {
    expect(productCodeConflictField('Barcode already exists')).toBe('barcode');
    expect(productCodeConflictField("Barcode matches another product's SKU")).toBe('barcode');
  });

  it('maps an SKU that collides with a barcode onto the SKU field', () => {
    expect(productCodeConflictField("SKU matches another product's barcode")).toBe('sku');
  });

  it('leaves unrelated errors unmapped', () => {
    expect(productCodeConflictField('Product name already exists')).toBeNull();
  });
});
