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
