import { useQuery } from '@tanstack/react-query';
import { QUERY_KEYS, STALE_TIME } from '@/constants';
import { dashboardService } from '@/services';
export { useNotifications } from './useNotifications';
import { useDashboardStore } from '@/store';

export function useDashboardStats() {
  const dateRange = useDashboardStore((s) => s.dateRange);

  return useQuery({
    queryKey: QUERY_KEYS.dashboardStats(JSON.stringify(dateRange)),
    queryFn: () => dashboardService.getStats(dateRange),
    staleTime: STALE_TIME.realtime,
  });
}

export function useDashboardKpi() {
  return useQuery({
    queryKey: [...QUERY_KEYS.dashboard, 'kpi'],
    queryFn: () => dashboardService.getKpiSummary(),
    staleTime: STALE_TIME.realtime,
  });
}

export function useDashboardCashFlow(days = 30) {
  return useQuery({
    queryKey: [...QUERY_KEYS.dashboard, 'cashFlow', days],
    queryFn: () => dashboardService.getCashFlow(days),
    staleTime: STALE_TIME.reports,
  });
}

export function usePaymentMethodFlow(method: 'cash' | 'bank' | 'esewa' | null) {
  return useQuery({
    queryKey: [...QUERY_KEYS.dashboard, 'paymentMethodFlow', method],
    queryFn: () => dashboardService.getPaymentMethodFlow(method!),
    enabled: method != null,
    staleTime: STALE_TIME.reports,
  });
}

export type KpiFlowMetric =
  | 'sales'
  | 'purchase'
  | 'receivables'
  | 'payables'
  | 'cash'
  | 'bank'
  | 'esewa';

export function useKpiFlow(metric: KpiFlowMetric | null) {
  return useQuery({
    queryKey: [...QUERY_KEYS.dashboard, 'kpiFlow', metric],
    queryFn: () => dashboardService.getKpiFlow(metric!),
    enabled: metric != null,
    staleTime: STALE_TIME.reports,
  });
}

export function useOperationalExpenses(days = 30) {
  return useQuery({
    queryKey: [...QUERY_KEYS.dashboard, 'opex', days],
    queryFn: () => dashboardService.getOperationalExpenses(days),
    staleTime: STALE_TIME.reports,
  });
}

export function useTopProfitProducts(days = 30, limit = 6) {
  return useQuery({
    queryKey: [...QUERY_KEYS.dashboard, 'topProfit', days, limit],
    queryFn: () => dashboardService.getTopProfitProducts(days, limit),
    staleTime: STALE_TIME.reports,
  });
}

export function useTopSoldProducts(days = 30, limit = 6) {
  return useQuery({
    queryKey: [...QUERY_KEYS.dashboard, 'topSold', days, limit],
    queryFn: () => dashboardService.getTopSoldProducts(days, limit),
    staleTime: STALE_TIME.reports,
  });
}

export function useSalesCollection(days = 30) {
  return useQuery({
    queryKey: [...QUERY_KEYS.dashboard, 'salesCollection', days],
    queryFn: () => dashboardService.getSalesCollection(days),
    staleTime: STALE_TIME.reports,
  });
}

export function useRevenueData() {
  const dateRange = useDashboardStore((s) => s.dateRange);

  return useQuery({
    queryKey: [...QUERY_KEYS.dashboard, 'revenue', dateRange],
    queryFn: () => dashboardService.getRevenueData(dateRange),
    staleTime: STALE_TIME.reports,
  });
}

export function useTopProducts() {
  const dateRange = useDashboardStore((s) => s.dateRange);
  return useQuery({
    queryKey: [...QUERY_KEYS.dashboard, 'topProducts', dateRange],
    queryFn: () => dashboardService.getTopProducts(dateRange),
    staleTime: STALE_TIME.reports,
  });
}

export function useRecentTransactions() {
  return useQuery({
    queryKey: [...QUERY_KEYS.dashboard, 'transactions'],
    queryFn: () => dashboardService.getRecentTransactions(),
    staleTime: STALE_TIME.realtime,
  });
}
