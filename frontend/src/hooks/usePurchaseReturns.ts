import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { QUERY_KEYS } from '@/constants';
import { purchaseReturnService } from '@/services';
import type { PurchaseReturnCreatePayload } from '@/types';
import { invalidateCommerceQueries } from '@/hooks/invalidateCommerce';

export function useReturnableLines(purchaseOrderId: string, enabled = true) {
  return useQuery({
    queryKey: QUERY_KEYS.purchaseReturnable(purchaseOrderId),
    queryFn: () => purchaseReturnService.getAvailable(purchaseOrderId),
    enabled: Boolean(purchaseOrderId) && enabled,
  });
}

export function usePurchaseReturns(purchaseOrderId: string, enabled = true) {
  return useQuery({
    queryKey: QUERY_KEYS.purchaseReturns(purchaseOrderId),
    queryFn: () => purchaseReturnService.getAll({ purchaseOrderId }),
    enabled: Boolean(purchaseOrderId) && enabled,
  });
}

export function useSupplierReturnableLines(supplierId: string, enabled = true) {
  return useQuery({
    queryKey: QUERY_KEYS.purchaseReturnableBySupplier(supplierId),
    queryFn: () => purchaseReturnService.getAvailableBySupplier(supplierId),
    enabled: Boolean(supplierId) && enabled,
  });
}

export function useSupplierPurchaseReturns(supplierId: string, enabled = true) {
  return useQuery({
    queryKey: QUERY_KEYS.purchaseReturnsBySupplier(supplierId),
    queryFn: () => purchaseReturnService.getAll({ supplierId }),
    enabled: Boolean(supplierId) && enabled,
  });
}

export function useCreatePurchaseReturn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: PurchaseReturnCreatePayload) => purchaseReturnService.create(payload),
    onSuccess: (result) => {
      const poId = result.purchaseOrderId;
      const supplierId = result.supplierId;
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.purchaseOrders });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.purchaseReturnsAll });
      if (poId) {
        void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.purchaseOrder(poId) });
        void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.purchaseReturns(poId) });
        void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.purchaseReturnable(poId) });
      }
      if (supplierId) {
        void queryClient.invalidateQueries({
          queryKey: QUERY_KEYS.purchaseReturnsBySupplier(supplierId),
        });
        void queryClient.invalidateQueries({
          queryKey: QUERY_KEYS.purchaseReturnableBySupplier(supplierId),
        });
      }
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.wallets });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.walletBalances });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.dashboard });
      invalidateCommerceQueries(queryClient, { scopes: ['stock', 'price'] });
    },
  });
}

export function useClosePurchaseReturn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      paymentMethod,
      amountReceived,
      remarks,
      receivedDate,
    }: {
      id: string;
      paymentMethod?: string;
      amountReceived?: number;
      remarks?: string;
      receivedDate?: string;
    }) =>
      purchaseReturnService.close(id, {
        paymentMethod,
        amountReceived,
        remarks,
        receivedDate,
      }),
    onSuccess: (result) => {
      const poId = result.purchaseOrderId;
      const supplierId = result.supplierId;
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.purchaseOrders });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.purchaseReturnsAll });
      if (poId) {
        void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.purchaseOrder(poId) });
        void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.purchaseReturns(poId) });
      }
      if (supplierId) {
        void queryClient.invalidateQueries({
          queryKey: QUERY_KEYS.purchaseReturnsBySupplier(supplierId),
        });
      }
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.wallets });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.walletBalances });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.dashboard });
    },
  });
}

export function useWriteOffPurchaseReturn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      purchaseReturnService.writeOff(id, { reason }),
    onSuccess: (result) => {
      const poId = result.purchaseOrderId;
      const supplierId = result.supplierId;
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.purchaseOrders });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.purchaseReturnsAll });
      if (poId) {
        void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.purchaseOrder(poId) });
        void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.purchaseReturns(poId) });
      }
      if (supplierId) {
        void queryClient.invalidateQueries({
          queryKey: QUERY_KEYS.purchaseReturnsBySupplier(supplierId),
        });
      }
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.dashboard });
    },
  });
}

export function useAllPurchaseReturns(params?: {
  search?: string;
  returnMode?: string;
  settlementType?: string;
  status?: string;
  supplierId?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
}) {
  return useQuery({
    queryKey: [...QUERY_KEYS.purchaseReturnsAll, params],
    queryFn: () =>
      purchaseReturnService.getAll({
        supplierId: params?.supplierId,
        page: params?.page,
        pageSize: params?.pageSize,
        returnMode: params?.returnMode,
        settlementType: params?.settlementType,
        status: params?.status,
        search: params?.search,
        dateFrom: params?.dateFrom,
        dateTo: params?.dateTo,
      }),
  });
}
