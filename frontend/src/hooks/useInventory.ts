import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { QUERY_KEYS, STALE_TIME } from '@/constants';
import { inventoryService, type ReceiveBatchPayload, type InventoryQueryParams, type InventoryHistoryParams } from '@/services';
import type { StockAdjustment, InventoryMovementQueryParams } from '@/types';
import { invalidateCommerceQueries } from '@/hooks/invalidateCommerce';

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
    placeholderData: keepPreviousData,
  });
}

export function useInventoryStats() {
  return useQuery({
    queryKey: [...QUERY_KEYS.inventory, 'stats'],
    queryFn: () => inventoryService.getStats(),
    staleTime: STALE_TIME.realtime,
  });
}

export function useReceiveBatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: ReceiveBatchPayload) => inventoryService.receiveBatch(payload),
    onSuccess: (_, payload) => {
      // Low-stock and expiring counts derive from stock; prices may change on receive.
      invalidateCommerceQueries(queryClient, {
        productId: payload.productId,
        scopes: ['stock', 'price'],
      });
    },
  });
}

export function useAdjustStock() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Omit<StockAdjustment, 'id' | 'createdAt'>) =>
      inventoryService.adjustStock(data),
    onSuccess: (_, data) => {
      invalidateCommerceQueries(queryClient, { productId: data.productId, scopes: ['stock'] });
    },
  });
}

function inventoryHistoryKey(params?: InventoryHistoryParams) {
  return [
    ...QUERY_KEYS.inventory,
    'history',
    params?.page ?? 1,
    params?.pageSize ?? 25,
    params?.productId ?? '',
    params?.source ?? '',
  ] as const;
}

export function useInventoryHistory(params?: InventoryHistoryParams) {
  return useQuery({
    queryKey: inventoryHistoryKey(params),
    queryFn: () => inventoryService.getHistory(params),
    placeholderData: keepPreviousData,
  });
}

export function useInventoryItem(productId: string) {
  return useQuery({
    queryKey: QUERY_KEYS.inventoryItem(productId),
    queryFn: () => inventoryService.getItem(productId),
    enabled: !!productId,
  });
}

function movementFilterKey(params?: InventoryMovementQueryParams): string {
  return JSON.stringify(params ?? {});
}

export function useInventoryMovements(params?: InventoryMovementQueryParams) {
  return useQuery({
    queryKey: QUERY_KEYS.inventoryMovements(movementFilterKey(params)),
    queryFn: () => inventoryService.getMovements(params),
    placeholderData: keepPreviousData,
  });
}

export function useMovementSummary(
  params?: Omit<InventoryMovementQueryParams, 'page' | 'pageSize'>,
) {
  return useQuery({
    queryKey: QUERY_KEYS.movementSummary(movementFilterKey(params)),
    queryFn: () => inventoryService.getMovementSummary(params),
  });
}
