import { uomLabel } from '@/utils';
import { hasUomConversion } from '@/utils/uomNormalize';

function resolveUomCode(value: string | undefined | null): string {
  return (value ?? '').trim();
}

export function formatConversion(
  buyUom: string,
  baseUom: string,
  factor: number,
  uomOptions?: ReadonlyArray<{ value: string; label: string }>,
): string {
  const buy = resolveUomCode(buyUom);
  const base = resolveUomCode(baseUom) || buy;
  const units = Math.max(1, Math.floor(factor) || 1);
  if (!buy || !hasUomConversion(units) || buy.toLowerCase() === base.toLowerCase()) {
    return '';
  }
  const buyLabel = uomLabel(buy, uomOptions);
  const baseLabel = uomLabel(base, uomOptions);
  return `1 ${buyLabel} = ${units} ${baseLabel}`;
}

export function formatStockQty(
  qty: number,
  baseUom: string,
  uomOptions?: ReadonlyArray<{ value: string; label: string }>,
): string {
  const base = resolveUomCode(baseUom);
  if (!base) return String(qty);
  const label = uomLabel(base, uomOptions);
  return `${qty} ${label}`;
}

export function formatSellLineSubtitle(
  sellUom: string | undefined,
  unitFactor: number | undefined,
  baseUom: string,
  uomOptions?: ReadonlyArray<{ value: string; label: string }>,
): string {
  const base = resolveUomCode(baseUom);
  const sell = resolveUomCode(sellUom) || base;
  if (!sell) return '';
  const factor = Math.max(1, unitFactor ?? 1);
  const sellLabel = uomLabel(sell, uomOptions);
  if (!hasUomConversion(factor) || !base || sell.toLowerCase() === base.toLowerCase()) {
    return `Sell: ${sellLabel}`;
  }
  const baseLabel = uomLabel(base, uomOptions);
  return `Sell: ${sellLabel} · ${factor} ${baseLabel} each`;
}

export function formatReceiptConversionSubtitle(
  sellUom: string | undefined,
  unitFactor: number | undefined,
  baseUom: string,
  uomOptions?: ReadonlyArray<{ value: string; label: string }>,
): string {
  const base = resolveUomCode(baseUom);
  const sell = resolveUomCode(sellUom) || base;
  const factor = Math.max(1, unitFactor ?? 1);
  if (!hasUomConversion(factor) || !base || sell.toLowerCase() === base.toLowerCase()) {
    return '';
  }
  const baseLabel = uomLabel(base, uomOptions);
  return `${factor} ${baseLabel} each`;
}

export interface ApproxPackStock {
  packs: number;
  label: string;
  tooltip: string;
}

/**
 * Checks if a product sells as both pack and piece (or has pack conversion with sellMode 'both').
 */
export function isPackAndPieceProduct(product: {
  sellMode?: string | null;
  unitsPerBuyUom?: number | null;
  buyUom?: string | null;
}): boolean {
  const units = Math.max(1, Math.floor(product.unitsPerBuyUom ?? 1));
  if (!hasUomConversion(units) || !resolveUomCode(product.buyUom)) {
    return false;
  }
  const mode = product.sellMode ?? 'both';
  return mode === 'both';
}

/**
 * Formats the approximate Box / Pack quantity derived from available stock / pack qty.
 * Returns null if no pack conversion is present.
 */
export function formatApproxPackQty(
  stock: number,
  unitsPerPack: number | undefined | null,
  buyUom: string | undefined | null,
  baseUom?: string | undefined | null,
  uomOptions?: ReadonlyArray<{ value: string; label: string }>,
): ApproxPackStock | null {
  const units = Math.max(1, Math.floor(unitsPerPack ?? 1));
  const buy = resolveUomCode(buyUom);
  if (!buy || !hasUomConversion(units)) {
    return null;
  }
  const buyLabel = uomLabel(buy, uomOptions);
  const base = resolveUomCode(baseUom);
  const baseLabel = base ? uomLabel(base, uomOptions) : 'pcs';

  if (stock <= 0) {
    return {
      packs: 0,
      label: `0 ${buyLabel}`,
      tooltip: `0 ${buyLabel} (0 ${baseLabel} in stock)`,
    };
  }

  const rawPacks = stock / units;
  const isExact = stock % units === 0;
  const packsFormatted = isExact
    ? String(rawPacks)
    : Number(rawPacks.toFixed(1)).toString();
  const wholePacks = Math.floor(stock / units);
  const remainder = stock % units;

  const tooltipParts: string[] = [];
  if (wholePacks > 0) {
    tooltipParts.push(`${wholePacks} ${buyLabel}`);
  }
  if (remainder > 0) {
    tooltipParts.push(`${remainder} ${baseLabel}`);
  }
  const breakdown = tooltipParts.join(' + ') || `0 ${buyLabel}`;

  return {
    packs: rawPacks,
    label: `≈ ${packsFormatted} ${buyLabel}`,
    tooltip: `${breakdown} (${stock} ${baseLabel} total)`,
  };
}

export function getProductApproxPackStock(
  product: {
    stock: number;
    unitsPerBuyUom?: number | null;
    buyUom?: string | null;
    uom?: string | null;
    sellMode?: string | null;
  },
  uomOptions?: ReadonlyArray<{ value: string; label: string }>,
): ApproxPackStock | null {
  if (!isPackAndPieceProduct(product)) return null;
  return formatApproxPackQty(
    product.stock,
    product.unitsPerBuyUom,
    product.buyUom,
    product.uom,
    uomOptions,
  );
}


