import type { Product } from '@/types';

export interface PoLineItem {
  id: number;
  skuInput: string;
  product: Product | null;
  productNameFallback: string;
  quantityInput: string;
  buyUom: string;
  unitsPerBuyUom: number;
  /** User edited units per pack; do not overwrite from the product. */
  unitsPerPackTouched?: boolean;
  unitCost: number;
  unitCostBeforeVat: number;
  snapshotUnitCost: number;
  sellingPrice: number;
  newSellingPrice: number;
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
    unitCostBeforeVat: 0,
    snapshotUnitCost: 0,
    sellingPrice: 0,
    newSellingPrice: 0,
    receivedQuantity: 0,
  };
}
