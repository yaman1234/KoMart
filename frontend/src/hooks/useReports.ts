import { useQuery } from '@tanstack/react-query';
import { QUERY_KEYS } from '@/constants';
import { reportsService } from '@/services';
import { useDashboardStore } from '@/store';

function useReportDateRange() {
  return useDashboardStore((s) => s.dateRange);
}

export function useSalesSummary(enabled = true) {
  const dateRange = useReportDateRange();
  return useQuery({
    queryKey: [...QUERY_KEYS.reports('salesSummary'), dateRange],
    queryFn: () => reportsService.getSalesSummary(dateRange),
    enabled,
  });
}

export function useSalesByPaymentMethod(enabled = true) {
  const dateRange = useReportDateRange();
  return useQuery({
    queryKey: [...QUERY_KEYS.reports('paymentMethod'), dateRange],
    queryFn: () => reportsService.getSalesByPaymentMethod(dateRange),
    enabled,
  });
}

export function useReportsRevenue(enabled = true) {
  const dateRange = useReportDateRange();
  return useQuery({
    queryKey: [...QUERY_KEYS.reports('revenue'), dateRange],
    queryFn: () => reportsService.getRevenue(dateRange),
    enabled,
  });
}

export function useReportsTopProducts(enabled = true) {
  const dateRange = useReportDateRange();
  return useQuery({
    queryKey: [...QUERY_KEYS.reports('topProducts'), dateRange],
    queryFn: () => reportsService.getTopProducts(dateRange),
    enabled,
  });
}

export function useReportsSalesByCategory(enabled = true) {
  const dateRange = useReportDateRange();
  return useQuery({
    queryKey: [...QUERY_KEYS.reports('salesByCategory'), dateRange],
    queryFn: () => reportsService.getSalesByCategory(dateRange),
    enabled,
  });
}

export function useInventoryReportSummary(enabled = true) {
  return useQuery({
    queryKey: QUERY_KEYS.reports('inventorySummary'),
    queryFn: () => reportsService.getInventorySummary(),
    enabled,
  });
}

export function useExpiringProducts(enabled = true) {
  return useQuery({
    queryKey: QUERY_KEYS.reports('expiring'),
    queryFn: () => reportsService.getExpiringProducts(),
    enabled,
  });
}

export function useLowStockReport(enabled = true) {
  return useQuery({
    queryKey: QUERY_KEYS.reports('lowStock'),
    queryFn: () => reportsService.getLowStock(1, 100, 'both'),
    enabled,
  });
}

export function useProfitSummary(enabled = true) {
  const dateRange = useReportDateRange();
  return useQuery({
    queryKey: [...QUERY_KEYS.reports('profit'), dateRange],
    queryFn: () => reportsService.getProfitSummary(dateRange),
    enabled,
  });
}

export function useMarginByCategory(enabled = true) {
  const dateRange = useReportDateRange();
  return useQuery({
    queryKey: [...QUERY_KEYS.reports('marginByCategory'), dateRange],
    queryFn: () => reportsService.getMarginByCategory(dateRange),
    enabled,
  });
}

export function usePurchasingBySupplier(enabled = true) {
  const dateRange = useReportDateRange();
  return useQuery({
    queryKey: [...QUERY_KEYS.reports('purchasing'), dateRange],
    queryFn: () => reportsService.getPurchasingBySupplier(dateRange),
    enabled,
  });
}

export function usePurchaseOrdersSummary(enabled = true) {
  const dateRange = useReportDateRange();
  return useQuery({
    queryKey: [...QUERY_KEYS.reports('poSummary'), dateRange],
    queryFn: () => reportsService.getPurchaseOrdersSummary(dateRange),
    enabled,
  });
}

export function useTopCustomers(enabled = true) {
  const dateRange = useReportDateRange();
  return useQuery({
    queryKey: [...QUERY_KEYS.reports('topCustomers'), dateRange],
    queryFn: () => reportsService.getTopCustomers(dateRange),
    enabled,
  });
}

export function useLoyaltySummary(enabled = true) {
  const dateRange = useReportDateRange();
  return useQuery({
    queryKey: [...QUERY_KEYS.reports('loyalty'), dateRange],
    queryFn: () => reportsService.getLoyaltySummary(dateRange),
    enabled,
  });
}

export function useSalesByHour(enabled = true) {
  const dateRange = useReportDateRange();
  return useQuery({
    queryKey: [...QUERY_KEYS.reports('salesByHour'), dateRange],
    queryFn: () => reportsService.getSalesByHour(dateRange),
    enabled,
  });
}

export function useSalesByDayOfWeek(enabled = true) {
  const dateRange = useReportDateRange();
  return useQuery({
    queryKey: [...QUERY_KEYS.reports('salesByDay'), dateRange],
    queryFn: () => reportsService.getSalesByDayOfWeek(dateRange),
    enabled,
  });
}

export function useSalesByCashier(enabled = true) {
  const dateRange = useReportDateRange();
  return useQuery({
    queryKey: [...QUERY_KEYS.reports('salesByCashier'), dateRange],
    queryFn: () => reportsService.getSalesByCashier(dateRange),
    enabled,
  });
}

export function useDeadStock(enabled = true) {
  return useQuery({
    queryKey: QUERY_KEYS.reports('deadStock'),
    queryFn: () => reportsService.getDeadStock(30),
    enabled,
  });
}

export function useExpenseSummary(enabled = true) {
  const dateRange = useReportDateRange();
  return useQuery({
    queryKey: [...QUERY_KEYS.reports('expenseSummary'), dateRange],
    queryFn: () => reportsService.getExpenseSummary(dateRange),
    enabled,
  });
}
