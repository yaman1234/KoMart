import type { Product } from '@/types';

export interface PoLineItem {
  id: number;
  skuInput: string;
  product: Product | null;
  productNameFallback: string;
  quantityInput: string;
  buyUom: string;
  unitsPerBuyUom: number;
  unitCost: number;
  /** Last received purchase Unit Cost (buy/pack UOM); null = none / first buy */
  lastPurchaseUnitCost?: number | null;
  receivedQuantity: number;
  resolveError?: string;
}

export function emptyPoLineItem(id: number, primaryUom = ''): PoLineItem {
  return {
    id,
    skuInput: '',
    product: null,
    productNameFallback: '',
    quantityInput: '1',
    buyUom: primaryUom,
    unitsPerBuyUom: 1,
    unitCost: 0,
    receivedQuantity: 0,
  };
}
