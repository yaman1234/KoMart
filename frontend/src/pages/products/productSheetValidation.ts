import type { Product } from '@/types';

export type ProductFieldKey = keyof Product;

export type ProductFieldErrors = Partial<Record<ProductFieldKey, string>>;

export type ProductValidationMap = Record<string, ProductFieldErrors>;

function mergedProduct(product: Product, draft?: Partial<Product>): Product {
  return draft ? { ...product, ...draft } : product;
}

/** Validate a single product (merged with draft) and return field-level errors. */
export function validateProductRow(
  product: Product,
  draft?: Partial<Product>,
): ProductFieldErrors {
  const p = mergedProduct(product, draft);
  const errors: ProductFieldErrors = {};

  if (!(p.name ?? '').trim()) {
    errors.name = 'Name is required';
  }

  const numericMinZero: { field: ProductFieldKey; label: string }[] = [
    { field: 'costPrice', label: 'Unit cost' },
    { field: 'sellingPrice', label: 'Unit price' },
    { field: 'packSellingPrice', label: 'Pack price' },
    { field: 'offeredPrice', label: 'Offered price' },
    { field: 'packOfferedPrice', label: 'Pack offered price' },
  ];

  for (const { field } of numericMinZero) {
    const val = p[field];
    if (typeof val === 'number' && val < 0) {
      errors[field] = 'Must be ≥ 0';
    }
  }

  const discountFields: ProductFieldKey[] = ['discountPercent', 'packDiscountPercent'];
  for (const field of discountFields) {
    const val = p[field];
    if (typeof val === 'number' && (val < 0 || val > 100)) {
      errors[field] = 'Must be 0–100';
    }
  }

  if (typeof p.unitsPerBuyUom === 'number' && p.unitsPerBuyUom < 1) {
    errors.unitsPerBuyUom = 'Must be at least 1';
  }

  if (typeof p.lowStockThreshold === 'number' && p.lowStockThreshold < 0) {
    errors.lowStockThreshold = 'Must be ≥ 0';
  }

  const packSellEnabled =
    (p.sellMode === 'unit' || p.sellMode === 'both') && (p.unitsPerBuyUom ?? 1) > 1;
  if (packSellEnabled && (p.packSellingPrice ?? 0) <= 0) {
    errors.packSellingPrice = 'Pack price is required when selling whole packs/boxes';
  }

  return errors;
}

/** Validate all dirty rows; returns a map of productId → field errors. */
export function validateDrafts(
  products: Product[],
  drafts: Record<string, Partial<Product>>,
): ProductValidationMap {
  const result: ProductValidationMap = {};
  for (const product of products) {
    const draft = drafts[product.id];
    if (!draft) continue;
    const errors = validateProductRow(product, draft);
    if (Object.keys(errors).length > 0) {
      result[product.id] = errors;
    }
  }
  return result;
}

export function countValidationErrors(map: ProductValidationMap): number {
  return Object.values(map).reduce((sum, errs) => sum + Object.keys(errs).length, 0);
}
