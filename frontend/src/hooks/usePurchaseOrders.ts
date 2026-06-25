import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { QUERY_KEYS } from '@/constants';
import { purchaseOrderService } from '@/services';
import type { ListQueryParams, PurchaseOrder, PurchaseOrderStatus, PurchaseOrderReceiveItem, PurchaseOrderWritePayload } from '@/types';

export function usePurchaseOrders(
  params?: ListQueryParams,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: [...QUERY_KEYS.purchaseOrders, params],
    queryFn: () => purchaseOrderService.getAll(params),
    enabled: options?.enabled ?? true,
  });
}

export function usePurchaseOrder(id: string) {
  return useQuery({
    queryKey: QUERY_KEYS.purchaseOrder(id),
    queryFn: () => purchaseOrderService.getById(id),
    enabled: !!id,
  });
}

export function useCreatePurchaseOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: PurchaseOrderWritePayload) =>
      purchaseOrderService.create(data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.purchaseOrders });
    },
  });
}

export function useUpdatePurchaseOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: PurchaseOrderWritePayload;
    }) => purchaseOrderService.update(id, data),
    onSuccess: (_, { id }) => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.purchaseOrders });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.purchaseOrder(id) });
    },
  });
}

export function useUpdatePurchaseOrderStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: PurchaseOrderStatus }) =>
      purchaseOrderService.updateStatus(id, status),
    onSuccess: (_, { id }) => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.purchaseOrders });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.purchaseOrder(id) });
    },
  });
}

export function useReceivePurchaseOrderItems() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, items }: { id: string; items: PurchaseOrderReceiveItem[] }) =>
      purchaseOrderService.receiveItems(id, items),
    onSuccess: (_, { id }) => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.purchaseOrders });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.purchaseOrder(id) });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.inventory });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.products });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.dashboard });
    },
  });
}
