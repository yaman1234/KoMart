import { cartLineKey } from '@/utils/cartLine';

/** Base units consumed by a sell line (sell qty × pack factor). */
export function lineBaseQuantity(quantity: number, unitFactor?: number): number {
  const factor = Math.max(1, Math.floor(unitFactor ?? 1) || 1);
  return quantity * factor;
}

export interface PosStockLine {
  productId: string;
  name: string;
  quantity: number;
  sellUom?: string;
  unitFactor?: number;
}

export interface OversellLine {
  productId: string;
  name: string;
  onHand: number;
  requested: number;
}

/**
 * Highest sell-quantity this line may hold without exceeding on-hand base units.
 * Other cart lines for the same product consume stock first.
 */
export function maxSellQuantity(
  items: readonly PosStockLine[],
  line: PosStockLine,
  onHand: number,
): number {
  const factor = Math.max(1, Math.floor(line.unitFactor ?? 1) || 1);
  const key = cartLineKey(line.productId, line.sellUom);
  let otherBase = 0;
  for (const item of items) {
    if (item.productId !== line.productId) continue;
    if (cartLineKey(item.productId, item.sellUom) === key) continue;
    otherBase += lineBaseQuantity(item.quantity, item.unitFactor);
  }
  const remaining = Math.max(0, onHand - otherBase);
  return Math.floor(remaining / factor);
}

/** Lines whose combined base quantity is above known on-hand stock. */
export function findOversellLines(
  items: readonly PosStockLine[],
  stockByProductId: Readonly<Record<string, number>>,
): OversellLine[] {
  const grouped = new Map<string, { name: string; requested: number }>();
  for (const item of items) {
    const prev = grouped.get(item.productId);
    grouped.set(item.productId, {
      name: prev?.name || item.name,
      requested: (prev?.requested ?? 0) + lineBaseQuantity(item.quantity, item.unitFactor),
    });
  }

  const over: OversellLine[] = [];
  for (const [productId, agg] of grouped) {
    const onHand = stockByProductId[productId];
    if (onHand == null || Number.isNaN(onHand)) continue;
    if (agg.requested > onHand) {
      over.push({ productId, name: agg.name, onHand, requested: agg.requested });
    }
  }
  return over;
}

export function stockCapMessage(
  name: string,
  onHand: number,
  maxSellQty: number,
  sellUom?: string,
): string {
  if (onHand <= 0) {
    return `“${name}” is out of stock.`;
  }
  const uom = (sellUom ?? '').trim();
  if (uom && maxSellQty !== onHand) {
    if (maxSellQty <= 0) {
      return `Cannot add more “${name}”. Remaining stock does not cover another ${uom} (${onHand} in stock).`;
    }
    return `Cannot sell more “${name}”. Only ${maxSellQty} ${uom} available (${onHand} in stock).`;
  }
  return `Cannot sell more “${name}”. Only ${onHand} in stock.`;
}

export function oversellPayMessage(lines: readonly OversellLine[]): string {
  if (lines.length === 0) return '';
  const parts = lines.map((line) => {
    const unit = line.onHand === 1 ? 'unit' : 'units';
    return `“${line.name}” has ${line.onHand} ${unit} in stock but the cart requests ${line.requested}.`;
  });
  return `Reduce quantity before payment. ${parts.join(' ')}`;
}
