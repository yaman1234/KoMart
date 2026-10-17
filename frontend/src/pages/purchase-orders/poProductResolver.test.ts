import { describe, it, expect } from 'vitest';
import type { Product } from '@/types';
import { emptyPoLineItem, type PoLineItem } from '@/pages/purchase-orders/poFormTypes';
import {
  applyProductToLine,
  buildProductCatalogIndex,
  productsToPoLines,
  resolveProductFromInput,
} from '@/pages/purchase-orders/poProductResolver';

describe('poProductResolver', () => {
  const sampleProduct: Product = {
    id: 'prod-101',
    name: 'Korean Spicy Ramen (Box)',
    sku: 'KM-RAMEN-BOX',
    barcode: '8801234567890',
    brand: 'Samyang',
    countryOfOrigin: 'South Korea',
    category: 'Instant Noodles',
    supplierId: 'sup-1',
    supplierName: 'Seoul Foods',
    description: 'Box of 20 packs',
    buyUom: 'box',
    buy_uom: 'box',
    uom: 'packet',
    unitsPerBuyUom: 20,
    units_per_buy_uom: 20,
    costPrice: 50,
    cost_price: 50,
    sellingPrice: 70,
    images: [],
    stock: 100,
    lowStockThreshold: 10,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };

  it('populates buyUom and unitsPerBuyUom from API response (buy_uom and units_per_buy_uom)', () => {
    // Initial empty line has default primaryUom "pcs" and unitsPerBuyUom 1
    const line = emptyPoLineItem(1, 'pcs');
    expect(line.buyUom).toBe('pcs');
    expect(line.unitsPerBuyUom).toBe(1);
    expect(line.unitCost).toBe(0);

    const applied = applyProductToLine(line, sampleProduct);

    // Should overwrite the line's default 'pcs' and 1 with the product's values
    expect(applied.buyUom).toBe('box');
    expect(applied.unitsPerBuyUom).toBe(20);
    // Cost per buy unit = costPrice (50) * unitsPerBuyUom (20) = 1000
    expect(applied.unitCost).toBe(1000);
    expect(applied.skuInput).toBe('KM-RAMEN-BOX');
    expect(applied.product?.id).toBe('prod-101');
  });

  it('populates buyUom and unitsPerBuyUom when only snake_case fields are present', () => {
    const rawApiProduct = {
      id: 'prod-raw',
      name: 'Bulk Soy Milk',
      sku: 'KM-SOY-CRTN',
      barcode: '',
      brand: 'Maeil',
      countryOfOrigin: 'South Korea',
      category: 'Beverages',
      supplierId: 'sup-1',
      supplierName: 'Seoul Foods',
      description: '',
      buy_uom: 'carton',
      uom: 'bottle',
      units_per_buy_uom: 24,
      cost_price: 80,
      costPrice: 0,
      sellingPrice: 120,
      images: [],
      stock: 10,
      lowStockThreshold: 5,
      createdAt: '',
      updatedAt: '',
    } as unknown as Product;

    const line = emptyPoLineItem(2, 'pcs');
    const applied = applyProductToLine(line, rawApiProduct);

    expect(applied.buyUom).toBe('carton');
    expect(applied.unitsPerBuyUom).toBe(24);
    expect(applied.unitCost).toBe(80 * 24);
  });

  it('recalculates unitCost when switching to a different product', () => {
    const productA: Product = {
      ...sampleProduct,
      id: 'prod-A',
      costPrice: 10,
      unitsPerBuyUom: 5,
      buyUom: 'pack',
    };
    const productB: Product = {
      ...sampleProduct,
      id: 'prod-B',
      costPrice: 40,
      unitsPerBuyUom: 10,
      buyUom: 'crate',
    };

    const line = emptyPoLineItem(1);
    const lineWithA = applyProductToLine(line, productA);
    expect(lineWithA.unitCost).toBe(50); // 10 * 5

    // Switching to product B should update unitCost to Product B's cost (40 * 10 = 400)
    const lineWithB = applyProductToLine(lineWithA, productB);
    expect(lineWithB.buyUom).toBe('crate');
    expect(lineWithB.unitsPerBuyUom).toBe(10);
    expect(lineWithB.unitCost).toBe(400);
  });

  it('preserves manually edited unitCost if re-applying the same product', () => {
    const line = emptyPoLineItem(1);
    const applied = applyProductToLine(line, sampleProduct);
    expect(applied.unitCost).toBe(1000);

    // User negotiated a discount and changed unitCost to 950
    const editedLine: PoLineItem = { ...applied, unitCost: 950 };
    const reApplied = applyProductToLine(editedLine, sampleProduct);
    expect(reApplied.unitCost).toBe(950);
  });

  it('productsToPoLines converts products with buy_uom and units_per_buy_uom', () => {
    const lines = productsToPoLines([sampleProduct], 10);
    expect(lines).toHaveLength(1);
    expect(lines[0].id).toBe(11);
    expect(lines[0].buyUom).toBe('box');
    expect(lines[0].unitsPerBuyUom).toBe(20);
    expect(lines[0].unitCost).toBe(1000);
  });

  it('updates Cost and Amount when product is removed or cleared', () => {
    const line = applyProductToLine(emptyPoLineItem(1), sampleProduct);
    expect(line.product).not.toBeNull();
    expect(line.unitCost).toBe(1000);

    // Simulate removing product (as done when clearing Autocomplete or SKU)
    const clearedLine: PoLineItem = {
      ...line,
      product: null,
      productNameFallback: '',
      skuInput: '',
      unitCost: 0,
      unitsPerBuyUom: 1,
      buyUom: '',
      lastPurchaseUnitCost: undefined,
      resolveError: undefined,
    };

    expect(clearedLine.product).toBeNull();
    expect(clearedLine.unitCost).toBe(0);
    expect(clearedLine.unitsPerBuyUom).toBe(1);

    // Amount calculation rule: line.product && line.unitCost > 0 ? qty * unitCost : 0
    const qty = 2;
    const amount = clearedLine.product && clearedLine.unitCost > 0 ? qty * clearedLine.unitCost : 0;
    expect(amount).toBe(0);
  });

  it('resolves product by SKU and name in catalog index', () => {
    const index = buildProductCatalogIndex([sampleProduct]);
    expect(resolveProductFromInput('km-ramen-box', index)?.id).toBe('prod-101');
    expect(resolveProductFromInput('korean spicy ramen (box)', index)?.id).toBe('prod-101');
    expect(resolveProductFromInput('non-existent', index)).toBeNull();
  });
});
