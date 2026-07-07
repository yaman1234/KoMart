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
  receivedQuantity: number;
  resolveError?: string;
}

export function emptyPoLineItem(id: number): PoLineItem {
  return {
    id,
    skuInput: '',
    product: null,
    productNameFallback: '',
    quantityInput: '1',
    buyUom: 'pcs',
    unitsPerBuyUom: 1,
    unitCost: 0,
    receivedQuantity: 0,
  };
}
