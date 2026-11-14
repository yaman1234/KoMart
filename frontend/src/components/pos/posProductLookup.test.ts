import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Product } from '@/types';

vi.mock('@/services', () => ({
  productService: {
    getAll: vi.fn(),
  },
}));

import { productService } from '@/services';
import { productsSharingBarcode, resolvePosProductByScan } from './posProductLookup';

function product(overrides: Partial<Product> = {}): Product {
  return {
    id: 'p1',
    name: 'Snack A',
    sku: 'SKU-1',
    barcode: '2900000000011',
    brand: 'B',
    countryOfOrigin: 'Nepal',
    category: 'Snacks',
    supplierId: '',
    supplierName: '',
    description: '',
    costPrice: 10,
    sellingPrice: 20,
    images: [],
    stock: 4,
    lowStockThreshold: 1,
    createdAt: '',
    updatedAt: '',
    buyUom: 'pcs',
    uom: 'pcs',
    unitsPerBuyUom: 1,
    sellMode: 'unit',
    ...overrides,
  };
}

describe('productsSharingBarcode', () => {
  it('ignores empty barcodes and matches case-insensitively', () => {
    const rows = [
      product({ id: 'a', barcode: '' }),
      product({ id: 'b', barcode: '  ' }),
      product({ id: 'c', barcode: 'AbC' }),
    ];
    expect(productsSharingBarcode(rows, '')).toEqual([]);
    expect(productsSharingBarcode(rows, 'abc').map((row) => row.id)).toEqual(['c']);
  });
});

describe('resolvePosProductByScan', () => {
  const getAll = vi.mocked(productService.getAll);

  beforeEach(() => {
    getAll.mockReset();
  });

  it('returns a single product for a unique barcode', async () => {
    const match = product();
    getAll.mockResolvedValue({
      data: [match],
      total: 1,
      page: 1,
      pageSize: 20,
      totalPages: 1,
    });

    const resolution = await resolvePosProductByScan('2900000000011');
    expect(resolution).toEqual({ type: 'single', product: match });
  });

  it('asks the cashier to choose when a barcode is shared', async () => {
    const first = product({ id: 'a', name: 'Snack A', sku: '111' });
    const second = product({ id: 'b', name: 'Snack B', sku: '990099' });
    getAll.mockResolvedValue({
      data: [first, second],
      total: 2,
      page: 1,
      pageSize: 20,
      totalPages: 1,
    });

    const resolution = await resolvePosProductByScan('2900000000011', [first]);
    expect(resolution.type).toBe('choose');
    if (resolution.type !== 'choose') return;
    expect(resolution.products.map((row) => row.sku)).toEqual(['111', '990099']);
  });

  it('still resolves a unique SKU when the barcode does not match', async () => {
    const match = product({ id: 'sku', barcode: '', sku: '140042', name: 'Other' });
    getAll.mockImplementation(async (params) => {
      if (params?.exactCode) {
        return { data: [match], total: 1, page: 1, pageSize: 20, totalPages: 1 };
      }
      return { data: [], total: 0, page: 1, pageSize: 10, totalPages: 1 };
    });

    const resolution = await resolvePosProductByScan('140042');
    expect(resolution).toEqual({ type: 'single', product: match });
  });
});
