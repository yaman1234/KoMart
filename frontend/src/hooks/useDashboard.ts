import { useQuery } from '@tanstack/react-query';
import { QUERY_KEYS } from '@/constants';
import { dashboardService, notificationService } from '@/services';
import { useDashboardStore } from '@/store';

export function useDashboardStats() {
  const dateRange = useDashboardStore((s) => s.dateRange);

  return useQuery({
    queryKey: QUERY_KEYS.dashboardStats(JSON.stringify(dateRange)),
    queryFn: () => dashboardService.getStats(dateRange),
  });
}

export function useRevenueData() {
  const dateRange = useDashboardStore((s) => s.dateRange);

  return useQuery({
    queryKey: [...QUERY_KEYS.dashboard, 'revenue', dateRange],
    queryFn: () => dashboardService.getRevenueData(dateRange),
  });
}

export function useTopProducts() {
  const dateRange = useDashboardStore((s) => s.dateRange);
  return useQuery({
    queryKey: [...QUERY_KEYS.dashboard, 'topProducts', dateRange],
    queryFn: () => dashboardService.getTopProducts(dateRange),
  });
}

export function useRecentTransactions() {
  return useQuery({
    queryKey: [...QUERY_KEYS.dashboard, 'transactions'],
    queryFn: () => dashboardService.getRecentTransactions(),
  });
}

export function useNotifications() {
  return useQuery({
    queryKey: QUERY_KEYS.notifications,
    queryFn: () => notificationService.getAll(),
  });
}
