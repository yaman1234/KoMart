import { uomLabel } from '@/utils';

export function formatConversion(
  buyUom: string,
  baseUom: string,
  factor: number,
  uomOptions?: ReadonlyArray<{ value: string; label: string }>,
): string {
  const buy = (buyUom || 'pcs').trim();
  const base = (baseUom || 'pcs').trim();
  const units = Math.max(1, Math.floor(factor) || 1);
  if (units <= 1 && buy.toLowerCase() === base.toLowerCase()) return '';
  const buyLabel = uomLabel(buy, uomOptions);
  const baseLabel = uomLabel(base, uomOptions);
  return `1 ${buyLabel} = ${units} ${baseLabel}`;
}

export function formatStockQty(
  qty: number,
  baseUom: string,
  uomOptions?: ReadonlyArray<{ value: string; label: string }>,
): string {
  const base = (baseUom || 'pcs').trim();
  const label = uomLabel(base, uomOptions);
  return `${qty} ${label}`;
}

export function formatSellLineSubtitle(
  sellUom: string | undefined,
  unitFactor: number | undefined,
  baseUom: string,
  uomOptions?: ReadonlyArray<{ value: string; label: string }>,
): string {
  const sell = (sellUom || baseUom || 'pcs').trim();
  const base = (baseUom || 'pcs').trim();
  const factor = Math.max(1, unitFactor ?? 1);
  const sellLabel = uomLabel(sell, uomOptions);
  if (factor <= 1 || sell.toLowerCase() === base.toLowerCase()) {
    return `Sell: ${sellLabel}`;
  }
  const baseLabel = uomLabel(base, uomOptions);
  return `Sell: ${sellLabel} · ${factor} ${baseLabel} each`;
}
