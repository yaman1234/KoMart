import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { QUERY_KEYS, STALE_TIME } from '@/constants';
import { reconciliationService, cashReconciliationService } from '@/services';

// ── Bank & FonePay ────────────────────────────────────────────────────────────

export function useReconciliationDayData(date: string, enabled = true) {
  return useQuery({
    queryKey: QUERY_KEYS.reconciliationDayData(date),
    queryFn: () => reconciliationService.getDayData(date),
    enabled: enabled && !!date,
    staleTime: STALE_TIME.realtime,
  });
}

export function useReconciliationByDate(date: string, enabled = true) {
  return useQuery({
    queryKey: QUERY_KEYS.reconciliation(date),
    queryFn: () => reconciliationService.getByDate(date),
    enabled: enabled && !!date,
    staleTime: STALE_TIME.standard,
  });
}

export function useReconciliationList(params?: {
  page?: number;
  pageSize?: number;
  startDate?: string;
  endDate?: string;
}) {
  return useQuery({
    queryKey: [...QUERY_KEYS.reconciliations, params],
    queryFn: () => reconciliationService.getAll(params),
    staleTime: STALE_TIME.standard,
  });
}

export function useSaveReconciliation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: import('@/types').BankReconciliationCreatePayload) => {
      const existing = await reconciliationService.getByDate(payload.date);
      if (existing) return reconciliationService.update(payload.date, payload);
      return reconciliationService.create(payload);
    },
    onSuccess: (_, { date }) => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.reconciliation(date) });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.reconciliations });
    },
  });
}

// ── Cash ─────────────────────────────────────────────────────────────────────

export function useCashReconciliationDayData(date: string, enabled = true) {
  return useQuery({
    queryKey: QUERY_KEYS.cashReconciliationDayData(date),
    queryFn: () => cashReconciliationService.getDayData(date),
    enabled: enabled && !!date,
    staleTime: STALE_TIME.realtime,
  });
}

export function useCashReconciliationByDate(date: string, enabled = true) {
  return useQuery({
    queryKey: QUERY_KEYS.cashReconciliation(date),
    queryFn: () => cashReconciliationService.getByDate(date),
    enabled: enabled && !!date,
    staleTime: STALE_TIME.standard,
  });
}

export function useCashReconciliationList(params?: {
  page?: number;
  pageSize?: number;
  startDate?: string;
  endDate?: string;
}) {
  return useQuery({
    queryKey: [...QUERY_KEYS.cashReconciliations, params],
    queryFn: () => cashReconciliationService.getAll(params),
    staleTime: STALE_TIME.standard,
  });
}

export function useSaveCashReconciliation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: import('@/types').CashReconciliationCreatePayload) => {
      const existing = await cashReconciliationService.getByDate(payload.date);
      if (existing) return cashReconciliationService.update(payload.date, payload);
      return cashReconciliationService.create(payload);
    },
    onSuccess: (_, { date }) => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.cashReconciliation(date) });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.cashReconciliations });
    },
  });
}
