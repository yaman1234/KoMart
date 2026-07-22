import { describe, it, expect } from 'vitest';
import type { Product } from '@/types';
import {
  canSellAsPack,
  packSellOption,
  pieceSellOption,
  resolveSellOption,
} from './uomSell';

function baseProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 'p1',
    name: 'Test Pack Product',
    sku: 'SKU-1',
    barcode: '',
    brand: 'B',
    countryOfOrigin: 'Nepal',
    category: 'Snacks',
    supplierId: '',
    supplierName: '',
    description: '',
    costPrice: 100,
    sellingPrice: 25,
    images: [],
    stock: 120,
    lowStockThreshold: 10,
    createdAt: '',
    updatedAt: '',
    buyUom: 'pack',
    uom: 'pcs',
    unitsPerBuyUom: 12,
    sellMode: 'both',
    packSellingPrice: 280,
    ...overrides,
  };
}

describe('uomSell', () => {
  it('packSellOption uses explicit pack selling price', () => {
    const opt = packSellOption(baseProduct({ packSellingPrice: 3600 }));
    expect(opt?.price).toBe(3600);
    expect(opt?.sellUom).toBe('pack');
    expect(opt?.unitFactor).toBe(12);
  });

  it('packSellOption falls back to piece price × units when pack price unset', () => {
    const opt = packSellOption(baseProduct({ packSellingPrice: 0 }));
    expect(opt?.price).toBe(300);
  });

  it('resolveSellOption returns pack for unit-only sell mode', () => {
    const opt = resolveSellOption(baseProduct({ sellMode: 'unit', packSellingPrice: 3600 }), false);
    expect(opt.price).toBe(3600);
    expect(opt.sellUom).toBe('pack');
  });

  it('resolveSellOption returns piece when both mode and not as pack', () => {
    const opt = resolveSellOption(baseProduct({ sellMode: 'both' }), false);
    expect(opt).toEqual(pieceSellOption(baseProduct()));
  });

  it('resolveSellOption returns pack when both mode and as pack', () => {
    const product = baseProduct({ sellMode: 'both', packSellingPrice: 3600 });
    const opt = resolveSellOption(product, true);
    expect(opt.price).toBe(3600);
  });

  it('canSellAsPack is false for piece-only products', () => {
    expect(canSellAsPack(baseProduct({ sellMode: 'piece' }))).toBe(false);
  });

  it('packSellOption returns null when no conversion', () => {
    expect(packSellOption(baseProduct({ unitsPerBuyUom: 1 }))).toBeNull();
  });

  it('pieceSellOption uses Secondary without inventing pcs', () => {
    const opt = pieceSellOption(baseProduct({ uom: 'bottle', buyUom: 'box' }));
    expect(opt.sellUom).toBe('bottle');
  });

  it('packSellOption uses Primary without inventing pack', () => {
    const opt = packSellOption(baseProduct({ buyUom: 'box', packSellingPrice: 100 }));
    expect(opt?.sellUom).toBe('box');
  });
});
