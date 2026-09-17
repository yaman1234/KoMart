import type { PurchaseOrder, UserRole } from '@/types';
import { isAdminOrManager } from '@/utils';

/** Draft only: admin or manager. Placed/received/cancelled: never (cancel + recreate, or Purchase Return). */
export function canEditPurchaseOrder(po: PurchaseOrder, role?: UserRole): boolean {
  if (po.status !== 'draft') return false;
  return isAdminOrManager(role);
}
