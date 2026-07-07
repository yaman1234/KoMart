import type { PurchaseOrder } from '@/types';

export function canEditPurchaseOrder(po: PurchaseOrder): boolean {
  return po.status === 'draft' || po.status === 'ordered' || po.status === 'partial';
}
