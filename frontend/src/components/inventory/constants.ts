import type { StockAdjustmentType } from '@/types';

export const INVENTORY_ADJUSTMENT_TYPES: { value: StockAdjustmentType; label: string }[] = [
  { value: 'adjustment', label: 'Stock Adjustment' },
  { value: 'damaged', label: 'Damaged / Expired' },
  { value: 'correction', label: 'Manual Correction' },
];
