import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { QUERY_KEYS } from '@/constants';
import { purchaseOrderService } from '@/services';
import type {
  ListQueryParams,
  PurchaseOrderListResponse,
  PurchaseOrderStatus,
  PurchaseOrderReceiveItem,
  PurchaseOrderWritePayload,
  PurchaseOrderPaymentPayload,
} from '@/types';
import { invalidateCommerceQueries } from '@/hooks/invalidateCommerce';

export function usePurchaseOrders(
  params?: ListQueryParams,
  options?: { enabled?: boolean },
) {
  return useQuery<PurchaseOrderListResponse>({
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
    onSuccess: (_, { id, status }) => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.purchaseOrders });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.purchaseOrder(id) });
      if (status === 'cancelled') {
        void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.expenses });
        void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.expenseStats });
        void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.wallets });
        void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.walletBalances });
        invalidateCommerceQueries(queryClient, { scopes: ['stock', 'price'] });
      }
    },
  });
}

function invalidatePo(queryClient: ReturnType<typeof useQueryClient>, id: string) {
  void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.purchaseOrders });
  void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.purchaseOrder(id) });
}

export function usePoWorkflowAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      action,
      reason,
    }: {
      id: string;
      action: 'submit' | 'approve' | 'reject' | 'send' | 'close';
      reason?: string;
    }) => {
      switch (action) {
        case 'submit':
          return purchaseOrderService.submit(id);
        case 'approve':
          return purchaseOrderService.approve(id);
        case 'reject':
          return purchaseOrderService.reject(id, reason);
        case 'send':
          return purchaseOrderService.send(id);
        case 'close':
          return purchaseOrderService.close(id);
        default:
          throw new Error('Unknown workflow action');
      }
    },
    onSuccess: (_, { id }) => invalidatePo(queryClient, id),
  });
}

export function useReceivePurchaseOrderItems() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      items,
      billNo,
      billImages,
    }: {
      id: string;
      items: PurchaseOrderReceiveItem[];
      billNo?: string;
      billImages?: string[];
    }) => purchaseOrderService.receiveItemsInChunks(id, items, billNo, billImages),
    onSuccess: (_, { id }) => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.purchaseOrders });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.purchaseOrder(id) });
      void queryClient.invalidateQueries({ queryKey: ['products'] });
      void queryClient.invalidateQueries({ queryKey: ['goodsReceipts', id] });
      void queryClient.invalidateQueries({ queryKey: ['purchaseInvoices', id] });
      invalidateCommerceQueries(queryClient, { scopes: ['stock', 'price'] });
    },
  });
}

export function useUpdatePurchaseOrderBillImages() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, billImages }: { id: string; billImages: string[] }) =>
      purchaseOrderService.updateBillImages(id, billImages),
    onSuccess: (_, { id }) => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.purchaseOrders });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.purchaseOrder(id) });
    },
  });
}

export function useRecordPurchaseOrderPayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: PurchaseOrderPaymentPayload }) =>
      purchaseOrderService.recordPayment(id, data),
    onSuccess: (_, { id }) => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.purchaseOrders });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.purchaseOrder(id) });
      void queryClient.invalidateQueries({ queryKey: ['purchaseInvoices', id] });
      void queryClient.invalidateQueries({ queryKey: ['goodsReceipts', id] });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.expenses });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.expenseStats });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.wallets });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.walletBalances });
    },
  });
}
