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
