import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { QUERY_KEYS } from '@/constants';
import { inventoryService, type ReceiveBatchPayload, type InventoryQueryParams } from '@/services';
import type { StockAdjustment } from '@/types';

function inventoryQueryKey(params?: InventoryQueryParams) {
  return [
    ...QUERY_KEYS.inventory,
    params?.search ?? '',
    params?.filter ?? 'all',
    params?.supplierId ?? '',
    params?.category ?? '',
    params?.page ?? 1,
    params?.pageSize ?? 25,
  ] as const;
}

export function useInventory(params?: InventoryQueryParams) {
  return useQuery({
    queryKey: inventoryQueryKey(params),
    queryFn: () => inventoryService.getAll(params),
  });
}

export function useInventoryStats() {
  return useQuery({
    queryKey: [...QUERY_KEYS.inventory, 'stats'],
    queryFn: () => inventoryService.getStats(),
  });
}

export function useReceiveBatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: ReceiveBatchPayload) => inventoryService.receiveBatch(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.inventory });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.products });
    },
  });
}

export function useAdjustStock() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Omit<StockAdjustment, 'id' | 'createdAt'>) =>
      inventoryService.adjustStock(data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.inventory });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.products });
    },
  });
}
