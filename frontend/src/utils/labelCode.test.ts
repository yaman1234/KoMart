import { describe, expect, it } from 'vitest';
import { productLabelCode, productLabelPrice, truncateLabelName } from './labelCode';

describe('productLabelCode', () => {
  it('uses a non-empty barcode', () => {
    expect(productLabelCode({ barcode: ' 8901234567890 ', sku: '040029' })).toBe('8901234567890');
  });

  it('falls back to the SKU string, including leading zeros', () => {
    expect(productLabelCode({ barcode: '', sku: '040029' })).toBe('040029');
    expect(productLabelCode({ barcode: '   ', sku: '040029' })).toBe('040029');
    expect(productLabelCode({ barcode: null, sku: '040029' })).toBe('040029');
  });
});

describe('productLabelPrice', () => {
  it('uses an offered price that is below the selling price', () => {
    expect(productLabelPrice({ sellingPrice: 250, offeredPrice: 199 })).toBe(199);
  });

  it('uses the selling price when the offer is missing, equal, or higher', () => {
    expect(productLabelPrice({ sellingPrice: 250, offeredPrice: 0 })).toBe(250);
    expect(productLabelPrice({ sellingPrice: 250, offeredPrice: 250 })).toBe(250);
    expect(productLabelPrice({ sellingPrice: 250, offeredPrice: 300 })).toBe(250);
    expect(productLabelPrice({ sellingPrice: 250 })).toBe(250);
  });
});

describe('truncateLabelName', () => {
  it('leaves a short name unchanged and ellipsizes a long one', () => {
    expect(truncateLabelName('Shin Ramyun')).toBe('Shin Ramyun');
    const long = 'Premium Korean instant noodles with rich beef bone broth and extra spice';
    const truncated = truncateLabelName(long, 20);
    expect(truncated.endsWith('…')).toBe(true);
    expect(truncated.length).toBeLessThanOrEqual(20);
  });
});
