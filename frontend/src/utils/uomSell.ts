import type { Product } from '@/types';

export interface SellUnitOption {
  price: number;
  sellUom: string;
  unitFactor: number;
  label: string;
}

export function pieceSellOption(product: Product): SellUnitOption {
  return {
    price: product.sellingPrice,
    sellUom: product.uom || 'pcs',
    unitFactor: 1,
    label: product.uom || 'pcs',
  };
}

export function packSellOption(product: Product): SellUnitOption | null {
  const units = product.unitsPerBuyUom ?? 1;
  if (units <= 1) return null;
  const packUom = product.buyUom || 'pack';
  const packPrice =
    (product.packSellingPrice ?? 0) > 0
      ? (product.packSellingPrice as number)
      // Legacy fallback for catalog rows saved before pack price was required.
      : product.sellingPrice * units;
  return {
    price: packPrice,
    sellUom: packUom,
    unitFactor: units,
    label: packUom,
  };
}

export function resolveSellOption(product: Product, asPack: boolean): SellUnitOption {
  const mode = product.sellMode ?? 'unit';
  const pack = packSellOption(product);

  if (mode === 'piece') {
    return pieceSellOption(product);
  }
  if (mode === 'unit' && pack) {
    return pack;
  }
  if (mode === 'both') {
    if (asPack && pack) return pack;
    return pieceSellOption(product);
  }
  return pieceSellOption(product);
}

export function canSellAsPack(product: Product): boolean {
  const mode = product.sellMode ?? 'unit';
  if (mode === 'piece') return false;
  return (product.unitsPerBuyUom ?? 1) > 1;
}

export function canSellAsPiece(product: Product): boolean {
  const mode = product.sellMode ?? 'unit';
  return mode === 'piece' || mode === 'both';
}
