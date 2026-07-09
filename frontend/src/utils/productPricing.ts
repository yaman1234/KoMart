import type { Product } from '@/types';

export type DiscountSource = 'percent' | 'offered' | 'auto';

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function marginPercent(costPrice: number, sellingPrice: number): number {
  if (sellingPrice <= 0) return 0;
  return round2(((sellingPrice - costPrice) / sellingPrice) * 100);
}

export function packSavings(
  sellingPrice: number,
  unitsPerBuyUom: number,
  packSellingPrice: number,
): number {
  if (unitsPerBuyUom <= 1 || packSellingPrice <= 0) return 0;
  const linear = sellingPrice * unitsPerBuyUom;
  return round2(Math.max(0, linear - packSellingPrice));
}

export function packCost(costPrice: number, unitsPerBuyUom: number): number {
  return round2(costPrice * (unitsPerBuyUom || 1));
}

export function buyUnitCost(product: Pick<Product, 'costPrice' | 'unitsPerBuyUom'>): number {
  return packCost(product.costPrice ?? 0, product.unitsPerBuyUom ?? 1);
}

function syncDiscountPair(
  basePrice: number,
  discountPercent: number,
  offeredPrice: number,
  source: DiscountSource,
): { discountPercent: number; offeredPrice: number } {
  if (basePrice <= 0) return { discountPercent: 0, offeredPrice: 0 };

  if (source === 'offered') {
    const offered = Math.max(0, Math.min(offeredPrice, basePrice));
    const pct = offered < basePrice ? round2((1 - offered / basePrice) * 100) : 0;
    return { discountPercent: pct, offeredPrice: round2(offered) };
  }

  if (source === 'percent' || (source === 'auto' && discountPercent > 0)) {
    const pct = Math.max(0, Math.min(discountPercent, 100));
    return { discountPercent: pct, offeredPrice: round2(basePrice * (1 - pct / 100)) };
  }

  if (source === 'auto' && offeredPrice > 0 && offeredPrice < basePrice) {
    const offered = Math.max(0, offeredPrice);
    return {
      discountPercent: round2((1 - offered / basePrice) * 100),
      offeredPrice: round2(offered),
    };
  }

  return { discountPercent: 0, offeredPrice: round2(basePrice) };
}

export interface PricingInput {
  costPrice: number;
  sellingPrice: number;
  packSellingPrice: number;
  unitsPerBuyUom: number;
  discountPercent?: number;
  offeredPrice?: number;
  packDiscountPercent?: number;
  packOfferedPrice?: number;
}

export interface ComputedPricing {
  marginPercent: number;
  discountedAmount: number;
  discountPercent: number;
  offeredPrice: number;
  packDiscountPercent: number;
  packOfferedPrice: number;
}

export function computeProductPricing(
  input: PricingInput,
  options: {
    unitDiscountSource?: DiscountSource;
    packDiscountSource?: DiscountSource;
  } = {},
): ComputedPricing {
  const {
    unitDiscountSource = 'auto',
    packDiscountSource = 'auto',
  } = options;

  const selling = input.sellingPrice ?? 0;
  const packSell = input.packSellingPrice ?? 0;
  const units = input.unitsPerBuyUom ?? 1;

  const unit = syncDiscountPair(
    selling,
    input.discountPercent ?? 0,
    input.offeredPrice ?? 0,
    unitDiscountSource,
  );

  const packBase = packSell > 0 ? packSell : units > 1 ? selling * units : 0;
  const pack = syncDiscountPair(
    packBase,
    input.packDiscountPercent ?? 0,
    input.packOfferedPrice ?? 0,
    packDiscountSource,
  );

  return {
    marginPercent: marginPercent(input.costPrice ?? 0, selling),
    discountedAmount: packSavings(selling, units, packSell),
    discountPercent: unit.discountPercent,
    offeredPrice: unit.offeredPrice,
    packDiscountPercent: pack.discountPercent,
    packOfferedPrice: pack.offeredPrice,
  };
}

export function mergeProductPricing(product: Product, draft?: Partial<Product>): Product {
  const merged = { ...product, ...draft };
  const pricing = computeProductPricing({
    costPrice: merged.costPrice ?? 0,
    sellingPrice: merged.sellingPrice ?? 0,
    packSellingPrice: merged.packSellingPrice ?? 0,
    unitsPerBuyUom: merged.unitsPerBuyUom ?? 1,
    discountPercent: merged.discountPercent ?? 0,
    offeredPrice: merged.offeredPrice ?? 0,
    packDiscountPercent: merged.packDiscountPercent ?? 0,
    packOfferedPrice: merged.packOfferedPrice ?? 0,
  });
  return { ...merged, ...pricing };
}
