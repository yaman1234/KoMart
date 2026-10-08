import type { Product } from '@/types';
import { uomLabel } from '@/utils';
import { hasUomConversion } from '@/utils/uomNormalize';

export interface SellUnitOption {
  price: number;
  sellUom: string;
  unitFactor: number;
  label: string;
}

export function pieceSellOption(product: Product): SellUnitOption {
  const sellUom = (product.uom || product.buyUom || '').trim();
  return {
    price: product.sellingPrice,
    sellUom,
    unitFactor: 1,
    label: sellUom,
  };
}

export function packSellOption(product: Product): SellUnitOption | null {
  const units = product.unitsPerBuyUom ?? 1;
  if (!hasUomConversion(units)) return null;
  const packUom = (product.buyUom || '').trim();
  if (!packUom) return null;
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
  return hasUomConversion(product.unitsPerBuyUom) && Boolean((product.buyUom || '').trim());
}

export function canSellAsPiece(product: Product): boolean {
  const mode = product.sellMode ?? 'unit';
  return mode === 'piece' || mode === 'both';
}

/** Effective sell unit label, resolved from the product's sell mode. */
export function sellUnitLabel(
  product: Product,
  uomOptions?: ReadonlyArray<{ value: string; label: string }>,
): string {
  const mode = product.sellMode ?? 'unit';
  const buy = (product.buyUom || '').trim();
  const piece = (product.uom || buy).trim();
  if (mode === 'piece') return piece ? uomLabel(piece, uomOptions) : '—';
  if (mode === 'unit') return buy ? uomLabel(buy, uomOptions) : piece ? uomLabel(piece, uomOptions) : '—';
  if (buy && piece && buy.toLowerCase() !== piece.toLowerCase()) {
    return `${uomLabel(buy, uomOptions)} / ${uomLabel(piece, uomOptions)}`;
  }
  return piece ? uomLabel(piece, uomOptions) : '—';
}

export interface SellUomOption {
  value: string;
  label: string;
}

/** Default sell UOM code for a product, based on its sell mode. */
export function defaultSellUomFor(product: Product): string {
  const mode = product.sellMode ?? 'unit';
  const buy = (product.buyUom || '').trim();
  const piece = (product.uom || buy).trim();
  if (mode === 'piece') return piece;
  if (mode === 'unit') return buy || piece;
  return piece || buy;
}

/** Sell unit options allowed by the sell mode — whole buy unit and/or base (piece) unit. */
export function sellUomOptionsFor(
  product: Product,
  mode: NonNullable<Product['sellMode']>,
  uomOptions?: ReadonlyArray<{ value: string; label: string }>,
): SellUomOption[] {
  const buy = (product.buyUom || '').trim();
  const piece = (product.uom || buy).trim();
  const options: SellUomOption[] = [];
  if (mode !== 'piece' && buy) {
    options.push({ value: buy, label: uomLabel(buy, uomOptions) });
  }
  if (mode !== 'unit' && piece && piece.toLowerCase() !== buy.toLowerCase()) {
    options.push({ value: piece, label: uomLabel(piece, uomOptions) });
  }
  if (options.length === 0) {
    const fallback = buy || piece;
    if (fallback) options.push({ value: fallback, label: uomLabel(fallback, uomOptions) });
  }
  return options;
}

/** Products eligible for POS grid / Add-product (in stock + billable sell price). */
export function isPosSellableProduct(product: Product): boolean {
  if (product.stock === 0) return false;
  const mode = product.sellMode ?? 'unit';
  const units = product.unitsPerBuyUom ?? 1;
  const packPrice = packSellOption(product)?.price ?? 0;
  const piecePrice = product.sellingPrice;
  if (mode === 'piece') return piecePrice > 0;
  if (mode === 'unit') return !hasUomConversion(units) ? piecePrice > 0 : packPrice > 0;
  return piecePrice > 0 || packPrice > 0;
}

export { hasUomConversion, normalizeProductUoms, defaultPrimaryUom } from '@/utils/uomNormalize';
