import { useState, useCallback } from 'react';
import * as XLSX from 'xlsx';
import {
  Box,
  Grid,
  Paper,
  Typography,
  Tabs,
  Tab,
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Divider,
  Chip,
  Alert,
  CircularProgress,
  TextField,
  MenuItem,
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import TodayIcon from '@mui/icons-material/Today';
import { useNavigate } from 'react-router-dom';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { PageHeader } from '@/components/common/PageHeader';
import { DateRangePicker } from '@/components/common/DateRangePicker';
import { ChartCard } from '@/components/charts/ChartCard';
import { StatCard } from '@/components/common/StatCard';
import { useDashboardStore, useAuthStore } from '@/store';
import {
  formatCurrency,
  formatDate,
  canViewAdminReports,
  productStatusColor,
  productStatusLabel,
} from '@/utils';
import { getErrorMessage } from '@/services/apiClient';
import { showApiError, showSuccess } from '@/utils/toast';
import { reportsService } from '@/services';
import { PAYMENT_METHODS, PO_STATUS_LABELS, PRODUCT_STATUS_OPTIONS } from '@/constants';
import type { ProductStatus } from '@/types';
import {
  useSalesSummary,
  useSalesByPaymentMethod,
  useReportsRevenue,
  useReportsTopProducts,
  useReportsSalesByCategory,
  useInventoryReportSummary,
  useExpiringProducts,
  useLowStockReport,
  useProfitSummary,
  useMarginByCategory,
  usePurchasingBySupplier,
  usePurchaseOrdersSummary,
  useTopCustomers,
  useLoyaltySummary,
  useSalesByHour,
  useSalesByDayOfWeek,
  useSalesByCashier,
  useDeadStock,
  useExpenseSummary,
} from '@/hooks/useReports';
import { useStoreSettings } from '@/hooks/useSettings';

type ReportTab = 'sales' | 'inventory' | 'financial' | 'purchasing' | 'customers';

const PIE_COLORS = ['#E63946', '#457B9D', '#2A9D8F', '#E9C46A', '#F4A261', '#264653'];

function paymentLabel(method: string): string {
  const normalized =
    method === 'card' ? 'bank' : method === 'khalti' ? 'esewa' : method;
  return PAYMENT_METHODS.find((p) => p.value === normalized)?.label ?? method;
}

export function ReportsPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<ReportTab>('sales');
  const [inventoryStatusFilter, setInventoryStatusFilter] = useState<'' | ProductStatus>('');
  const [exporting, setExporting] = useState(false);
  const { dateRange, setDateRange } = useDashboardStore();
  const user = useAuthStore((s) => s.user);
  const canViewCashier = canViewAdminReports(user?.role);
  const { data: storeSettings } = useStoreSettings();
  const expiryWarningDays = storeSettings?.expiryWarningDays ?? 30;

  const salesTab = tab === 'sales';
  const inventoryTab = tab === 'inventory';
  const financialTab = tab === 'financial';
  const purchasingTab = tab === 'purchasing';
  const customersTab = tab === 'customers';

  const salesSummaryQuery = useSalesSummary(salesTab);
  const paymentMethodsQuery = useSalesByPaymentMethod(salesTab);
  const revenueQuery = useReportsRevenue(salesTab);
  const topProductsQuery = useReportsTopProducts(salesTab);
  const salesByCategoryQuery = useReportsSalesByCategory(salesTab);
  const inventorySummaryQuery = useInventoryReportSummary(inventoryTab);
  const expiringQuery = useExpiringProducts(inventoryTab, expiryWarningDays);
  const lowStockQuery = useLowStockReport(inventoryTab, inventoryStatusFilter);
  const profitQuery = useProfitSummary(financialTab);
  const marginQuery = useMarginByCategory(financialTab);
  const expenseSummaryQuery = useExpenseSummary(financialTab);
  const purchasingQuery = usePurchasingBySupplier(purchasingTab);
  const poSummaryQuery = usePurchaseOrdersSummary(purchasingTab);
  const topCustomersQuery = useTopCustomers(customersTab);
  const loyaltyQuery = useLoyaltySummary(customersTab);
  const salesByHourQuery = useSalesByHour(salesTab);
  const salesByDayQuery = useSalesByDayOfWeek(salesTab);
  const salesByCashierQuery = useSalesByCashier(salesTab && canViewCashier);
  const deadStockQuery = useDeadStock(salesTab);

  const salesSummary = salesSummaryQuery.data;
  const paymentMethods = paymentMethodsQuery.data ?? [];
  const revenue = revenueQuery.data ?? [];
  const revenueLoading = revenueQuery.isLoading;
  const topProducts = topProductsQuery.data ?? [];
  const salesByCategory = salesByCategoryQuery.data ?? [];
  const inventorySummary = inventorySummaryQuery.data;
  const expiringData = expiringQuery.data;
  const lowStockData = lowStockQuery.data;
  const profitSummary = profitQuery.data;
  const profitLoading = profitQuery.isLoading;
  const marginByCategory = marginQuery.data ?? [];
  const expenseSummary = expenseSummaryQuery.data;
  const purchasingBySupplier = purchasingQuery.data ?? [];
  const poSummary = poSummaryQuery.data;
  const topCustomers = topCustomersQuery.data ?? [];
  const loyaltySummary = loyaltyQuery.data;
  const salesByHour = salesByHourQuery.data ?? [];
  const salesByDay = salesByDayQuery.data ?? [];
  const salesByCashier = salesByCashierQuery.data ?? [];
  const deadStock = deadStockQuery.data ?? [];

  const activeQueries = [
    salesSummaryQuery,
    paymentMethodsQuery,
    revenueQuery,
    topProductsQuery,
    salesByCategoryQuery,
    inventorySummaryQuery,
    expiringQuery,
    lowStockQuery,
    profitQuery,
    marginQuery,
    expenseSummaryQuery,
    purchasingQuery,
    poSummaryQuery,
    topCustomersQuery,
    loyaltyQuery,
    salesByHourQuery,
    salesByDayQuery,
    // salesByCashierQuery is optional/role-gated — excluded from tab error aggregation
    deadStockQuery,
  ].filter((q) => q.fetchStatus !== 'idle');

  const tabError = activeQueries.find((q) => q.isError)?.error;

  const totalRevenue = salesSummary?.totalRevenue ?? revenue.reduce((s, d) => s + d.revenue, 0);
  const avgDaily = revenue.length > 0 ? totalRevenue / revenue.length : 0;
  const maxDay = revenue.reduce(
    (max, d) => (d.revenue > max.revenue ? d : max),
    revenue[0] ?? { revenue: 0, date: '' },
  );

  const paymentChartData = paymentMethods.map((p) => ({
    ...p,
    label: paymentLabel(p.paymentMethod),
  }));

  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      const range = dateRange;

      /* ── fetch all report data in parallel ── */
      const [
        salesSum,
        topProds,
        pmethods,
        categories,
        cashiers,
        deadStockItems,
        invSummary,
        lowStockResult,
        expiringResult,
        profitSum,
        marginCats,
        expenseSum,
        purchSuppliers,
        poSum,
        topCusts,
        loyaltySum,
      ] = await Promise.all([
        reportsService.getSalesSummary(range).catch(() => null),
        reportsService.getTopProducts(range, 50).catch(() => [] as typeof topProducts),
        reportsService.getSalesByPaymentMethod(range).catch(() => [] as typeof paymentMethods),
        reportsService.getSalesByCategory(range).catch(() => [] as typeof salesByCategory),
        canViewCashier ? reportsService.getSalesByCashier(range).catch(() => [] as typeof salesByCashier) : Promise.resolve([] as typeof salesByCashier),
        reportsService.getDeadStock(30).catch(() => [] as typeof deadStock),
        reportsService.getInventorySummary().catch(() => null),
        reportsService.getLowStock(1, 1000, 'both').catch(() => null),
        reportsService.getExpiringProducts(1, 1000, 30).catch(() => null),
        reportsService.getProfitSummary(range).catch(() => null),
        reportsService.getMarginByCategory(range).catch(() => [] as typeof marginByCategory),
        reportsService.getExpenseSummary(range).catch(() => null),
        reportsService.getPurchasingBySupplier(range).catch(() => [] as typeof purchasingBySupplier),
        reportsService.getPurchaseOrdersSummary(range).catch(() => null),
        reportsService.getTopCustomers(range, 50).catch(() => [] as typeof topCustomers),
        reportsService.getLoyaltySummary(range).catch(() => null),
      ]);

      /* ── sheet builder helpers ── */
      type CellVal = string | number | null;
      type SheetRow = CellVal[];

      const metaRow = (...cols: CellVal[]): SheetRow => cols;
      const blankRow = (): SheetRow => [];

      /** Appends a labelled section to an AoA sheet */
      function appendSection(
        aoa: SheetRow[],
        title: string,
        headers: string[],
        rows: SheetRow[],
        totals?: SheetRow,
      ) {
        aoa.push([title]);
        aoa.push(headers);
        rows.forEach((r) => aoa.push(r));
        if (totals) aoa.push(totals);
        aoa.push(blankRow());
      }

      /** Builds a worksheet and sets column widths */
      function makeSheet(aoa: SheetRow[], colWidths: number[]): XLSX.WorkSheet {
        const ws = XLSX.utils.aoa_to_sheet(aoa);
        ws['!cols'] = colWidths.map((w) => ({ wch: w }));
        return ws;
      }

      /* ── pre-calculate totals ── */
      const operatingExpenses = expenseSum?.operatingExpenses
        ?? Math.max(0, (expenseSum?.totalExpenses ?? 0) - (expenseSum?.setupInvestment ?? 0));
      const netProfit = (profitSum?.grossProfit ?? 0) - operatingExpenses;

      const sumRev    = (arr: { revenue: number }[]) => arr.reduce((s, x) => s + x.revenue, 0);
      const sumAmt    = (arr: { totalAmount: number }[]) => arr.reduce((s, x) => s + x.totalAmount, 0);

      /* ═══════════════════════════════════════════
         SHEET 1 — SALES
      ═══════════════════════════════════════════ */
      const salesAoA: SheetRow[] = [
        metaRow('KoMart — Sales Report'),
        metaRow(`Period: ${range.startDate}  →  ${range.endDate}`),
        metaRow(`Generated: ${new Date().toLocaleDateString()}`),
        blankRow(),
      ];

      appendSection(salesAoA, 'SALES SUMMARY', ['Total Revenue', 'Total Transactions', 'Avg Basket Size'], [
        [salesSum?.totalRevenue ?? 0, salesSum?.transactionCount ?? 0, salesSum?.avgBasket ?? 0],
      ]);

      appendSection(
        salesAoA, 'TOP SELLING PRODUCTS',
        ['#', 'Product', 'Units Sold', 'Revenue'],
        topProds.map((p, i) => [i + 1, p.name, p.quantitySold, p.revenue]),
        ['TOTAL', '', topProds.reduce((s, p) => s + p.quantitySold, 0), sumRev(topProds)],
      );

      appendSection(
        salesAoA, 'SALES BY PAYMENT METHOD',
        ['Payment Method', 'Transactions', 'Revenue'],
        pmethods.map((p) => [paymentLabel(p.paymentMethod), p.count, p.revenue]),
        ['TOTAL', pmethods.reduce((s, p) => s + p.count, 0), sumRev(pmethods)],
      );

      appendSection(
        salesAoA, 'SALES BY CATEGORY',
        ['Category', 'Revenue'],
        categories.map((c) => [c.category, c.revenue]),
        ['TOTAL', sumRev(categories)],
      );

      if (canViewCashier && cashiers.length > 0) {
        appendSection(
          salesAoA, 'SALES BY CASHIER',
          ['Cashier', 'Transactions', 'Revenue'],
          cashiers.map((c) => [c.cashier, c.transactionCount, c.revenue]),
          ['TOTAL', cashiers.reduce((s, c) => s + c.transactionCount, 0), sumRev(cashiers)],
        );
      }

      if (deadStockItems.length > 0) {
        appendSection(
          salesAoA, 'DEAD STOCK (no sales in last 30 days)',
          ['Product', 'Category', 'Days Without Sale', 'Stock', 'Stock Value'],
          deadStockItems.map((d) => [d.productName, d.category, d.daysWithoutSale ?? '', d.stock, d.stockValue]),
          ['TOTAL', '', '', deadStockItems.reduce((s, d) => s + d.stock, 0), deadStockItems.reduce((s, d) => s + d.stockValue, 0)],
        );
      }

      /* ═══════════════════════════════════════════
         SHEET 2 — INVENTORY
      ═══════════════════════════════════════════ */
      const invAoA: SheetRow[] = [
        metaRow('KoMart — Inventory Report'),
        metaRow(`Generated: ${new Date().toLocaleDateString()}`),
        blankRow(),
      ];

      appendSection(invAoA, 'INVENTORY SUMMARY',
        ['Total SKUs', 'Inventory Value', 'Low Stock Items', 'Out of Stock', 'Expiring Soon (30d)'],
        [[invSummary?.totalSkus ?? 0, invSummary?.inventoryValue ?? 0, invSummary?.lowStock ?? 0, invSummary?.outOfStock ?? 0, invSummary?.expiring ?? 0]],
      );

      appendSection(
        invAoA, 'LOW & OUT OF STOCK PRODUCTS',
        ['Product', 'SKU', 'Category', 'Stock', 'Status'],
        (lowStockResult?.data ?? []).map((row) => [
          row.productName, row.sku, row.category, row.stock,
          row.status === 'out' ? 'Out of Stock' : 'Low Stock',
        ]),
      );

      appendSection(
        invAoA, 'EXPIRING PRODUCTS (within 30 days)',
        ['Product', 'Batch', 'Qty', 'Expiry Date', 'Days Left'],
        (expiringResult?.data ?? []).map((row) => [
          row.productName, row.batchNumber, row.quantity, row.expiryDate, row.daysUntilExpiry,
        ]),
      );

      /* ═══════════════════════════════════════════
         SHEET 3 — FINANCIAL
      ═══════════════════════════════════════════ */
      const finAoA: SheetRow[] = [
        metaRow('KoMart — Financial Report'),
        metaRow(`Period: ${range.startDate}  →  ${range.endDate}`),
        metaRow(`Generated: ${new Date().toLocaleDateString()}`),
        blankRow(),
      ];

      appendSection(finAoA, 'FINANCIAL SUMMARY',
        ['Total Revenue', 'Gross Profit', 'Gross Margin %', 'Operating Expenses', 'Setup Investment', 'Net Profit'],
        [[
          profitSum?.totalRevenue ?? 0,
          profitSum?.grossProfit ?? 0,
          `${profitSum?.grossMarginPct ?? 0}%`,
          operatingExpenses,
          expenseSum?.setupInvestment ?? 0,
          netProfit,
        ]],
      );

      const totalMargRev = marginCats.reduce((s, m) => s + m.revenue, 0);
      const totalMargGP  = marginCats.reduce((s, m) => s + m.grossProfit, 0);
      appendSection(
        finAoA, 'MARGIN BY CATEGORY',
        ['Category', 'Revenue', 'Gross Profit', 'Margin %'],
        marginCats.map((m) => [m.category, m.revenue, m.grossProfit, `${m.grossMarginPct}%`]),
        ['TOTAL', totalMargRev, totalMargGP,
          totalMargRev > 0 ? `${((totalMargGP / totalMargRev) * 100).toFixed(1)}%` : '0%'],
      );

      if ((expenseSum?.byCategory ?? []).length > 0) {
        appendSection(
          finAoA, 'EXPENSES BY CATEGORY',
          ['Category', 'Count', 'Amount'],
          (expenseSum?.byCategory ?? []).map((e) => [e.category.replace(/_/g, ' '), e.count, e.amount]),
          [
            'TOTAL',
            (expenseSum?.byCategory ?? []).reduce((s, e) => s + e.count, 0),
            (expenseSum?.byCategory ?? []).reduce((s, e) => s + e.amount, 0),
          ],
        );
      }

      /* ═══════════════════════════════════════════
         SHEET 4 — PURCHASING
      ═══════════════════════════════════════════ */
      const purchAoA: SheetRow[] = [
        metaRow('KoMart — Purchasing Report'),
        metaRow(`Period: ${range.startDate}  →  ${range.endDate}`),
        metaRow(`Generated: ${new Date().toLocaleDateString()}`),
        blankRow(),
      ];

      appendSection(purchAoA, 'PURCHASING SUMMARY',
        ['Total POs', 'Total Spend'],
        [[poSum?.totalOrders ?? 0, poSum?.totalAmount ?? 0]],
      );

      if ((poSum?.byStatus ?? []).length > 0) {
        appendSection(purchAoA, 'PO STATUS BREAKDOWN',
          ['Status', 'Count'],
          (poSum?.byStatus ?? []).map((s) => [PO_STATUS_LABELS[s.status] ?? s.status, s.count]),
          ['TOTAL', (poSum?.byStatus ?? []).reduce((sum, s) => sum + s.count, 0)],
        );
      }

      appendSection(
        purchAoA, 'PURCHASING BY SUPPLIER',
        ['Supplier', 'Orders', 'Total Amount'],
        purchSuppliers.map((p) => [p.supplierName, p.orderCount, p.totalAmount]),
        ['TOTAL', purchSuppliers.reduce((s, p) => s + p.orderCount, 0), sumAmt(purchSuppliers)],
      );

      /* ═══════════════════════════════════════════
         SHEET 5 — CUSTOMERS
      ═══════════════════════════════════════════ */
      const custAoA: SheetRow[] = [
        metaRow('KoMart — Customer Report'),
        metaRow(`Period: ${range.startDate}  →  ${range.endDate}`),
        metaRow(`Generated: ${new Date().toLocaleDateString()}`),
        blankRow(),
      ];

      appendSection(custAoA, 'CUSTOMER ANALYTICS',
        ['Total Members', 'Active Members', 'New Customers', 'Points Redeemed'],
        [[
          loyaltySum?.totalMembers ?? 0,
          loyaltySum?.activeMembers ?? 0,
          loyaltySum?.newCustomers ?? 0,
          loyaltySum?.pointsRedeemed ?? 0,
        ]],
      );

      appendSection(
        custAoA, 'TOP CUSTOMERS',
        ['#', 'Customer', 'Transactions', 'Total Spent'],
        topCusts.map((c, i) => [i + 1, c.customerName, c.transactionCount, c.totalSpent]),
        ['TOTAL', '', topCusts.reduce((s, c) => s + c.transactionCount, 0), topCusts.reduce((s, c) => s + c.totalSpent, 0)],
      );

      /* ═══════════════════════════════════════════
         ASSEMBLE WORKBOOK
      ═══════════════════════════════════════════ */
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, makeSheet(salesAoA, [35, 20, 14, 16, 16]),      'Sales');
      XLSX.utils.book_append_sheet(wb, makeSheet(invAoA,  [35, 14, 16, 12, 12, 16]),  'Inventory');
      XLSX.utils.book_append_sheet(wb, makeSheet(finAoA,  [30, 16, 16, 14, 16]),      'Financial');
      XLSX.utils.book_append_sheet(wb, makeSheet(purchAoA,[35, 10, 18]),              'Purchasing');
      XLSX.utils.book_append_sheet(wb, makeSheet(custAoA, [35, 14, 14, 18]),          'Customers');

      XLSX.writeFile(wb, `komart-report-${range.startDate}-to-${range.endDate}.xlsx`);
      showSuccess('Report exported.');
    } catch (err) {
      showApiError(err, 'Export failed.');
    } finally {
      setExporting(false);
    }
  }, [dateRange, canViewCashier]);

  return (
    <Box>
      <PageHeader
        title="Reports"
        subtitle="Sales, inventory, financial, purchasing and customer analytics"
        action={
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
            {tab !== 'inventory' && (
              <DateRangePicker
                startDate={dateRange.startDate}
                endDate={dateRange.endDate}
                onChange={setDateRange}
              />
            )}
            <Button
              variant="contained"
              startIcon={<TodayIcon />}
              size="small"
              onClick={() => navigate('/reports/daily')}
            >
              Daily Report
            </Button>
            <Button
              variant="outlined"
              startIcon={exporting ? <CircularProgress size={14} color="inherit" /> : <DownloadIcon />}
              size="small"
              onClick={handleExport}
              disabled={exporting}
            >
              {exporting ? 'Exporting…' : 'Export All'}
            </Button>
          </Box>
        }
      />

      <Tabs
        value={tab}
        onChange={(_, v: ReportTab) => setTab(v)}
        variant="scrollable"
        scrollButtons="auto"
        sx={{ mb: 3, bgcolor: 'background.paper', borderRadius: 2, px: 1 }}
      >
        <Tab value="sales" label="Sales" />
        <Tab value="inventory" label="Inventory" />
        <Tab value="financial" label="Financial" />
        <Tab value="purchasing" label="Purchasing" />
        <Tab value="customers" label="Customers" />
      </Tabs>

      {tabError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {getErrorMessage(tabError)}
        </Alert>
      )}

      {/* ── Sales Tab ── */}
      {tab === 'sales' && (
        <Box>
          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid size={{ xs: 6, sm: 3 }}>
              <StatCard title="Total Revenue" value={formatCurrency(totalRevenue)} />
            </Grid>
            <Grid size={{ xs: 6, sm: 3 }}>
              <StatCard title="Avg. Daily Revenue" value={formatCurrency(avgDaily)} />
            </Grid>
            <Grid size={{ xs: 6, sm: 3 }}>
              <StatCard
                title="Best Day"
                value={formatCurrency(maxDay?.revenue ?? 0)}
                subtitle={maxDay?.date ? formatDate(maxDay.date) : ''}
              />
            </Grid>
            <Grid size={{ xs: 6, sm: 3 }}>
              <StatCard
                title="Transactions"
                value={salesSummary?.transactionCount?.toLocaleString() ?? '—'}
                subtitle={
                  salesSummary?.avgBasket
                    ? `Avg. ${formatCurrency(salesSummary.avgBasket)}`
                    : undefined
                }
              />
            </Grid>
          </Grid>

          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid size={{ xs: 12, lg: 8 }}>
              <ChartCard title="Revenue Over Time" loading={revenueLoading} height={280}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={revenue}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey="date" tickFormatter={(v) => formatDate(v)} fontSize={11} />
                    <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} fontSize={11} />
                    <Tooltip
                      formatter={(v) => formatCurrency(Number(v))}
                      labelFormatter={(l) => formatDate(String(l))}
                    />
                    <Area
                      type="monotone"
                      dataKey="revenue"
                      stroke="#E63946"
                      fill="#E63946"
                      fillOpacity={0.15}
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </ChartCard>
            </Grid>
            <Grid size={{ xs: 12, lg: 4 }}>
              <ChartCard title="Sales by Payment Method" height={280}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={paymentChartData}
                      dataKey="revenue"
                      nameKey="label"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      label={false}
                    >
                      {paymentChartData.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v) => formatCurrency(Number(v))} />
                    <Legend formatter={(v) => <span style={{ fontSize: 11 }}>{v}</span>} />
                  </PieChart>
                </ResponsiveContainer>
              </ChartCard>
            </Grid>
          </Grid>

          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid size={{ xs: 12, lg: 4 }}>
              <ChartCard title="Sales by Category" height={280}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={salesByCategory}
                      dataKey="revenue"
                      nameKey="category"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      label={false}
                    >
                      {salesByCategory.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v) => formatCurrency(Number(v))} />
                    <Legend formatter={(v) => <span style={{ fontSize: 11 }}>{v}</span>} />
                  </PieChart>
                </ResponsiveContainer>
              </ChartCard>
            </Grid>
            <Grid size={{ xs: 12, lg: 4 }}>
              <ChartCard title="Sales by Hour" height={280}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={salesByHour}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey="label" fontSize={10} interval={3} />
                    <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} fontSize={11} />
                    <Tooltip formatter={(v) => formatCurrency(Number(v))} />
                    <Bar dataKey="revenue" fill="#457B9D" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            </Grid>
            <Grid size={{ xs: 12, lg: 4 }}>
              <ChartCard title="Sales by Day of Week" height={280}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={salesByDay}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey="label" fontSize={11} />
                    <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} fontSize={11} />
                    <Tooltip formatter={(v) => formatCurrency(Number(v))} />
                    <Bar dataKey="revenue" fill="#2A9D8F" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            </Grid>
          </Grid>

          <Paper sx={{ p: 3, mb: 3 }}>
            <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
              Top Selling Products
            </Typography>
            <Divider sx={{ mb: 2 }} />
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>#</TableCell>
                  <TableCell>Product</TableCell>
                  <TableCell align="right">Units Sold</TableCell>
                  <TableCell align="right">Revenue</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {topProducts.map((p, i) => (
                  <TableRow key={p.productId}>
                    <TableCell>{i + 1}</TableCell>
                    <TableCell>{p.name}</TableCell>
                    <TableCell align="right">{p.quantitySold.toLocaleString()}</TableCell>
                    <TableCell align="right">{formatCurrency(p.revenue)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Paper>

          {canViewCashier && salesByCashier.length > 0 && (
            <Paper sx={{ p: 3, mb: 3 }}>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
                Sales by Cashier
              </Typography>
              <Divider sx={{ mb: 2 }} />
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Cashier</TableCell>
                    <TableCell align="right">Transactions</TableCell>
                    <TableCell align="right">Revenue</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {salesByCashier.map((row) => (
                    <TableRow key={row.cashier}>
                      <TableCell>{row.cashier}</TableCell>
                      <TableCell align="right">{row.transactionCount}</TableCell>
                      <TableCell align="right">{formatCurrency(row.revenue)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Paper>
          )}

          {deadStock.length > 0 && (
            <Paper sx={{ p: 3 }}>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>
                Dead Stock
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Products with stock but no sales in the last 30 days
              </Typography>
              <Divider sx={{ mb: 2 }} />
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Product</TableCell>
                    <TableCell>Category</TableCell>
                    <TableCell align="right">Stock</TableCell>
                    <TableCell align="right">Stock Value</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {deadStock.map((p) => (
                    <TableRow key={p.productId}>
                      <TableCell>{p.productName}</TableCell>
                      <TableCell>{p.category}</TableCell>
                      <TableCell align="right">{p.stock}</TableCell>
                      <TableCell align="right">{formatCurrency(p.stockValue)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Paper>
          )}
        </Box>
      )}

      {/* ── Inventory Tab ── */}
      {tab === 'inventory' && (
        <Box>
          <Box sx={{ mb: 2, maxWidth: 220 }}>
            <TextField
              select
              fullWidth
              size="small"
              label="Product Status"
              value={inventoryStatusFilter}
              onChange={(e) => setInventoryStatusFilter(e.target.value as '' | ProductStatus)}
            >
              <MenuItem value="">All Statuses</MenuItem>
              {PRODUCT_STATUS_OPTIONS.map((s) => (
                <MenuItem key={s.value} value={s.value}>{s.label}</MenuItem>
              ))}
            </TextField>
          </Box>

          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid size={{ xs: 6, sm: 4, md: 2.4 }}>
              <StatCard title="Total SKUs" value={inventorySummary?.totalSkus ?? '—'} />
            </Grid>
            <Grid size={{ xs: 6, sm: 4, md: 2.4 }}>
              <StatCard
                title="Inventory Value"
                value={formatCurrency(inventorySummary?.inventoryValue ?? 0)}
                color="primary.main"
              />
            </Grid>
            <Grid size={{ xs: 6, sm: 4, md: 2.4 }}>
              <StatCard
                title="Low Stock"
                value={inventorySummary?.lowStock ?? '—'}
                color="warning.main"
              />
            </Grid>
            <Grid size={{ xs: 6, sm: 4, md: 2.4 }}>
              <StatCard
                title="Out of Stock"
                value={inventorySummary?.outOfStock ?? '—'}
                color="error.main"
              />
            </Grid>
            <Grid size={{ xs: 6, sm: 4, md: 2.4 }}>
              <StatCard
                title="Expiring Soon"
                value={inventorySummary?.expiring ?? '—'}
                color="info.main"
              />
            </Grid>
          </Grid>

          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid size={{ xs: 12, lg: 6 }}>
              <ChartCard title="Stock Value by Category" height={300}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={inventorySummary?.byCategory ?? []} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis type="number" tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} fontSize={11} />
                    <YAxis type="category" dataKey="category" width={130} fontSize={11} />
                    <Tooltip formatter={(v) => formatCurrency(Number(v))} />
                    <Bar dataKey="stockValue" fill="#E63946" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            </Grid>
            <Grid size={{ xs: 12, lg: 6 }}>
              <Paper sx={{ p: 3, height: '100%' }}>
                <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
                  Low & Out of Stock
                </Typography>
                <Divider sx={{ mb: 2 }} />
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Product</TableCell>
                      <TableCell>Category</TableCell>
                      <TableCell align="right">Stock</TableCell>
                      <TableCell>Stock Level</TableCell>
                      <TableCell>Product Status</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {(lowStockData?.data ?? []).slice(0, 10).map((row) => (
                      <TableRow key={row.productId}>
                        <TableCell>{row.productName}</TableCell>
                        <TableCell>{row.category}</TableCell>
                        <TableCell align="right">{row.stock}</TableCell>
                        <TableCell>
                          <Chip
                            label={row.status === 'out' ? 'Out of stock' : 'Low stock'}
                            color={row.status === 'out' ? 'error' : 'warning'}
                            size="small"
                          />
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={productStatusLabel(row.productStatus)}
                            color={productStatusColor(row.productStatus)}
                            size="small"
                            variant="outlined"
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Paper>
            </Grid>
          </Grid>

          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
              Expiring Soon (30 days)
            </Typography>
            <Divider sx={{ mb: 2 }} />
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Product</TableCell>
                  <TableCell>Batch</TableCell>
                  <TableCell align="right">Qty</TableCell>
                  <TableCell>Expiry</TableCell>
                  <TableCell align="right">Days Left</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(expiringData?.data ?? []).map((row) => (
                  <TableRow key={`${row.productId}-${row.batchNumber}`}>
                    <TableCell>{row.productName}</TableCell>
                    <TableCell>{row.batchNumber}</TableCell>
                    <TableCell align="right">{row.quantity}</TableCell>
                    <TableCell>{formatDate(row.expiryDate)}</TableCell>
                    <TableCell align="right">
                      <Chip
                        label={`${row.daysUntilExpiry}d`}
                        color={row.daysUntilExpiry <= 7 ? 'error' : 'warning'}
                        size="small"
                      />
                    </TableCell>
                  </TableRow>
                ))}
                {(expiringData?.data ?? []).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} align="center" sx={{ color: 'text.secondary', py: 3 }}>
                      No products expiring within 30 days
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Paper>
        </Box>
      )}

      {/* ── Financial Tab ── */}
      {tab === 'financial' && (
        <Box>
          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid size={{ xs: 6, sm: 3 }}>
              <StatCard
                title="Total Revenue"
                value={formatCurrency(profitSummary?.totalRevenue ?? 0)}
                color="success.main"
              />
            </Grid>
            <Grid size={{ xs: 6, sm: 3 }}>
              <StatCard
                title="Gross Profit"
                value={formatCurrency(profitSummary?.grossProfit ?? 0)}
                color="primary.main"
              />
            </Grid>
            <Grid size={{ xs: 6, sm: 3 }}>
              <StatCard
                title="Gross Margin"
                value={`${profitSummary?.grossMarginPct ?? 0}%`}
                color="info.main"
              />
            </Grid>
            <Grid size={{ xs: 6, sm: 3 }}>
              <StatCard
                title="Total Expenses"
                value={formatCurrency(expenseSummary?.totalExpenses ?? 0)}
                subtitle="All costs including setup"
                color="error.main"
              />
            </Grid>
            <Grid size={{ xs: 6, sm: 3 }}>
              <StatCard
                title="Operating Expenses"
                value={formatCurrency(
                  expenseSummary?.operatingExpenses
                    ?? Math.max(0, (expenseSummary?.totalExpenses ?? 0) - (expenseSummary?.setupInvestment ?? 0)),
                )}
                subtitle="Excludes setup / investment"
                color="warning.main"
              />
            </Grid>
            <Grid size={{ xs: 6, sm: 3 }}>
              <StatCard
                title="Setup Investment"
                value={formatCurrency(expenseSummary?.setupInvestment ?? 0)}
                subtitle="One-time costs"
                color="info.main"
              />
            </Grid>
            <Grid size={{ xs: 6, sm: 3 }}>
              <StatCard
                title="Net Profit"
                value={formatCurrency(
                  (profitSummary?.grossProfit ?? 0)
                    - (expenseSummary?.operatingExpenses
                      ?? Math.max(0, (expenseSummary?.totalExpenses ?? 0) - (expenseSummary?.setupInvestment ?? 0))),
                )}
                subtitle="Gross Profit − Operating Expenses"
                color={
                  (profitSummary?.grossProfit ?? 0)
                    - (expenseSummary?.operatingExpenses
                      ?? Math.max(0, (expenseSummary?.totalExpenses ?? 0) - (expenseSummary?.setupInvestment ?? 0))) >= 0
                    ? 'success.main'
                    : 'error.main'
                }
              />
            </Grid>
          </Grid>

          <Box sx={{ mb: 3 }}>
            <ChartCard title="Revenue Trend" loading={profitLoading} height={300}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={profitSummary?.daily ?? []}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="date" tickFormatter={(v) => formatDate(v)} fontSize={11} />
                <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} fontSize={11} />
                <Tooltip
                  formatter={(v) => formatCurrency(Number(v))}
                  labelFormatter={(l) => formatDate(String(l))}
                />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  name="Revenue"
                  stroke="#E63946"
                  fill="#E63946"
                  fillOpacity={0.15}
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>
          </Box>

          {(expenseSummary?.daily ?? []).length > 0 && (
            <Box sx={{ mb: 3 }}>
              <ChartCard title="Daily Expense Trend" loading={expenseSummaryQuery.isLoading} height={240}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={expenseSummary?.daily ?? []}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey="date" tickFormatter={(v) => formatDate(v)} fontSize={11} />
                    <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} fontSize={11} />
                    <Tooltip
                      formatter={(v) => formatCurrency(Number(v))}
                      labelFormatter={(l) => formatDate(String(l))}
                    />
                    <Area
                      type="monotone"
                      dataKey="amount"
                      name="Expenses"
                      stroke="#E9C46A"
                      fill="#E9C46A"
                      fillOpacity={0.2}
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </ChartCard>
            </Box>
          )}

          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
              Margin by Category
            </Typography>
            <Divider sx={{ mb: 2 }} />
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Category</TableCell>
                  <TableCell align="right">Revenue</TableCell>
                  <TableCell align="right">Gross Profit</TableCell>
                  <TableCell align="right">Margin</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {marginByCategory.map((row) => (
                  <TableRow key={row.category}>
                    <TableCell>{row.category}</TableCell>
                    <TableCell align="right">{formatCurrency(row.revenue)}</TableCell>
                    <TableCell align="right">{formatCurrency(row.grossProfit)}</TableCell>
                    <TableCell align="right">{row.grossMarginPct}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Paper>

          {(expenseSummary?.byCategory ?? []).length > 0 && (
            <Grid container spacing={2} sx={{ mt: 2 }}>
              <Grid size={{ xs: 12, lg: 6 }}>
                <ChartCard title="Expenses by Category" height={320}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={expenseSummary?.byCategory ?? []} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                      <XAxis type="number" tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} fontSize={11} />
                      <YAxis type="category" dataKey="category" width={130} fontSize={11} />
                      <Tooltip formatter={(v) => formatCurrency(Number(v))} />
                      <Bar dataKey="amount" name="Amount" fill="#E9C46A" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>
              </Grid>
              <Grid size={{ xs: 12, lg: 6 }}>
                <Paper sx={{ p: 3, height: '100%' }}>
                  <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
                    Expense Breakdown
                  </Typography>
                  <Divider sx={{ mb: 2 }} />
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Category</TableCell>
                        <TableCell align="right">Count</TableCell>
                        <TableCell align="right">Amount</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {(expenseSummary?.byCategory ?? []).map((row) => (
                        <TableRow key={row.category}>
                          <TableCell sx={{ textTransform: 'capitalize' }}>
                            {row.category.replace(/_/g, ' ')}
                          </TableCell>
                          <TableCell align="right">{row.count}</TableCell>
                          <TableCell align="right">{formatCurrency(row.amount)}</TableCell>
                        </TableRow>
                      ))}
                      <TableRow>
                        <TableCell sx={{ fontWeight: 600 }}>Total</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 600 }}>
                          {(expenseSummary?.byCategory ?? []).reduce((s, r) => s + r.count, 0)}
                        </TableCell>
                        <TableCell align="right" sx={{ fontWeight: 600 }}>
                          {formatCurrency(expenseSummary?.totalExpenses ?? 0)}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </Paper>
              </Grid>
            </Grid>
          )}
        </Box>
      )}

      {/* ── Purchasing Tab ── */}
      {tab === 'purchasing' && (
        <Box>
          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid size={{ xs: 6, sm: 4 }}>
              <StatCard title="Total POs" value={poSummary?.totalOrders ?? '—'} />
            </Grid>
            <Grid size={{ xs: 6, sm: 4 }}>
              <StatCard
                title="Total Spend"
                value={formatCurrency(poSummary?.totalAmount ?? 0)}
                color="primary.main"
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <Paper sx={{ p: 2, height: '100%' }}>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                  By Status
                </Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                  {(poSummary?.byStatus ?? []).map((s) => (
                    <Chip
                      key={s.status}
                      label={`${PO_STATUS_LABELS[s.status] ?? s.status}: ${s.count}`}
                      size="small"
                      variant="outlined"
                    />
                  ))}
                </Box>
              </Paper>
            </Grid>
          </Grid>

          <ChartCard title="Spend by Supplier" height={320}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={purchasingBySupplier} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis type="number" tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} fontSize={11} />
                <YAxis type="category" dataKey="supplierName" width={140} fontSize={11} />
                <Tooltip formatter={(v) => formatCurrency(Number(v))} />
                <Bar dataKey="totalAmount" name="Spend" fill="#457B9D" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </Box>
      )}

      {/* ── Customers Tab ── */}
      {tab === 'customers' && (
        <Box>
          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid size={{ xs: 6, sm: 3 }}>
              <StatCard title="Total Members" value={loyaltySummary?.totalMembers ?? '—'} />
            </Grid>
            <Grid size={{ xs: 6, sm: 3 }}>
              <StatCard
                title="Active Members"
                value={loyaltySummary?.activeMembers ?? '—'}
                color="success.main"
              />
            </Grid>
            <Grid size={{ xs: 6, sm: 3 }}>
              <StatCard
                title="New Customers"
                value={loyaltySummary?.newCustomers ?? '—'}
                color="primary.main"
              />
            </Grid>
            <Grid size={{ xs: 6, sm: 3 }}>
              <StatCard
                title="Points Redeemed"
                value={loyaltySummary?.pointsRedeemed?.toLocaleString() ?? '—'}
                color="info.main"
              />
            </Grid>
          </Grid>

          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
              Top Customers
            </Typography>
            <Divider sx={{ mb: 2 }} />
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>#</TableCell>
                  <TableCell>Customer</TableCell>
                  <TableCell align="right">Transactions</TableCell>
                  <TableCell align="right">Total Spent</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {topCustomers.map((c, i) => (
                  <TableRow key={c.customerId}>
                    <TableCell>{i + 1}</TableCell>
                    <TableCell>{c.customerName}</TableCell>
                    <TableCell align="right">{c.transactionCount}</TableCell>
                    <TableCell align="right">{formatCurrency(c.totalSpent)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Paper>
        </Box>
      )}
    </Box>
  );
}
