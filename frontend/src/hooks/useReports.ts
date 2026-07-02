import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { QUERY_KEYS, STALE_TIME } from '@/constants';
import type { ProductStatus } from '@/types';
import { reportsService } from '@/services';
import { useDashboardStore } from '@/store';

function useReportDateRange() {
  return useDashboardStore((s) => s.dateRange);
}

function reportQueryOptions<T>(
  queryKey: readonly unknown[],
  queryFn: () => Promise<T>,
  enabled = true,
) {
  return {
    queryKey,
    queryFn,
    enabled,
    staleTime: STALE_TIME.reports,
    placeholderData: keepPreviousData,
  } as const;
}

export function useSalesSummary(enabled = true) {
  const dateRange = useReportDateRange();
  return useQuery(
    reportQueryOptions(
      [...QUERY_KEYS.reports('salesSummary'), dateRange],
      () => reportsService.getSalesSummary(dateRange),
      enabled,
    ),
  );
}

export function useSalesByPaymentMethod(enabled = true) {
  const dateRange = useReportDateRange();
  return useQuery(
    reportQueryOptions(
      [...QUERY_KEYS.reports('paymentMethod'), dateRange],
      () => reportsService.getSalesByPaymentMethod(dateRange),
      enabled,
    ),
  );
}

export function useReportsRevenue(enabled = true) {
  const dateRange = useReportDateRange();
  return useQuery(
    reportQueryOptions(
      [...QUERY_KEYS.reports('revenue'), dateRange],
      () => reportsService.getRevenue(dateRange),
      enabled,
    ),
  );
}

export function useReportsTopProducts(enabled = true) {
  const dateRange = useReportDateRange();
  return useQuery(
    reportQueryOptions(
      [...QUERY_KEYS.reports('topProducts'), dateRange],
      () => reportsService.getTopProducts(dateRange),
      enabled,
    ),
  );
}

export function useReportsSalesByCategory(enabled = true) {
  const dateRange = useReportDateRange();
  return useQuery(
    reportQueryOptions(
      [...QUERY_KEYS.reports('salesByCategory'), dateRange],
      () => reportsService.getSalesByCategory(dateRange),
      enabled,
    ),
  );
}

export function useInventoryReportSummary(enabled = true) {
  return useQuery(
    reportQueryOptions(
      QUERY_KEYS.reports('inventorySummary'),
      () => reportsService.getInventorySummary(),
      enabled,
    ),
  );
}

export function useExpiringProducts(enabled = true, withinDays = 30) {
  return useQuery(
    reportQueryOptions(
      [...QUERY_KEYS.reports('expiring'), withinDays],
      () => reportsService.getExpiringProducts(1, 25, withinDays),
      enabled,
    ),
  );
}

export function useLowStockReport(enabled = true, productStatus: ProductStatus | '' = '') {
  return useQuery(
    reportQueryOptions(
      [...QUERY_KEYS.reports('lowStock'), productStatus],
      () => reportsService.getLowStock(1, 100, 'both', productStatus || undefined),
      enabled,
    ),
  );
}

export function useProfitSummary(enabled = true) {
  const dateRange = useReportDateRange();
  return useQuery(
    reportQueryOptions(
      [...QUERY_KEYS.reports('profit'), dateRange],
      () => reportsService.getProfitSummary(dateRange),
      enabled,
    ),
  );
}

export function useMarginByCategory(enabled = true) {
  const dateRange = useReportDateRange();
  return useQuery(
    reportQueryOptions(
      [...QUERY_KEYS.reports('marginByCategory'), dateRange],
      () => reportsService.getMarginByCategory(dateRange),
      enabled,
    ),
  );
}

export function usePurchasingBySupplier(enabled = true) {
  const dateRange = useReportDateRange();
  return useQuery(
    reportQueryOptions(
      [...QUERY_KEYS.reports('purchasing'), dateRange],
      () => reportsService.getPurchasingBySupplier(dateRange),
      enabled,
    ),
  );
}

export function usePurchaseOrdersSummary(enabled = true) {
  const dateRange = useReportDateRange();
  return useQuery(
    reportQueryOptions(
      [...QUERY_KEYS.reports('poSummary'), dateRange],
      () => reportsService.getPurchaseOrdersSummary(dateRange),
      enabled,
    ),
  );
}

export function useTopCustomers(enabled = true) {
  const dateRange = useReportDateRange();
  return useQuery(
    reportQueryOptions(
      [...QUERY_KEYS.reports('topCustomers'), dateRange],
      () => reportsService.getTopCustomers(dateRange),
      enabled,
    ),
  );
}

export function useLoyaltySummary(enabled = true) {
  const dateRange = useReportDateRange();
  return useQuery(
    reportQueryOptions(
      [...QUERY_KEYS.reports('loyalty'), dateRange],
      () => reportsService.getLoyaltySummary(dateRange),
      enabled,
    ),
  );
}

export function useSalesByHour(enabled = true) {
  const dateRange = useReportDateRange();
  return useQuery(
    reportQueryOptions(
      [...QUERY_KEYS.reports('salesByHour'), dateRange],
      () => reportsService.getSalesByHour(dateRange),
      enabled,
    ),
  );
}

export function useSalesByDayOfWeek(enabled = true) {
  const dateRange = useReportDateRange();
  return useQuery(
    reportQueryOptions(
      [...QUERY_KEYS.reports('salesByDay'), dateRange],
      () => reportsService.getSalesByDayOfWeek(dateRange),
      enabled,
    ),
  );
}

export function useSalesByCashier(enabled = true) {
  const dateRange = useReportDateRange();
  return useQuery(
    reportQueryOptions(
      [...QUERY_KEYS.reports('salesByCashier'), dateRange],
      () => reportsService.getSalesByCashier(dateRange),
      enabled,
    ),
  );
}

export function useDeadStock(enabled = true) {
  return useQuery(
    reportQueryOptions(
      QUERY_KEYS.reports('deadStock'),
      () => reportsService.getDeadStock(30),
      enabled,
    ),
  );
}

export function useExpenseSummary(enabled = true) {
  const dateRange = useReportDateRange();
  return useQuery(
    reportQueryOptions(
      [...QUERY_KEYS.reports('expenseSummary'), dateRange],
      () => reportsService.getExpenseSummary(dateRange),
      enabled,
    ),
  );
}
