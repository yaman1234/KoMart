import { useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  Tabs,
  Tab,
  Button,
  CircularProgress,
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import TodayIcon from '@mui/icons-material/Today';
import QueryStatsIcon from '@mui/icons-material/QueryStats';
import MonetizationOnIcon from '@mui/icons-material/MonetizationOn';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import PeopleAltIcon from '@mui/icons-material/PeopleAlt';
import SecurityIcon from '@mui/icons-material/Security';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { useDashboardStore } from '@/store';
import { adToBs, BS_MONTHS } from '@/utils/nepaliDate';
import { showSuccess, showWarning, showApiError, showError } from '@/utils/toast';
import { reportsService } from '@/services';
import { ReportContextBar } from '@/pages/reports/components';

import { ExecutiveSummaryTab } from '@/pages/reports/tabs/ExecutiveSummaryTab';
import { SalesMerchandisingTab } from '@/pages/reports/tabs/SalesMerchandisingTab';
import { PurchasesPayablesTab } from '@/pages/reports/tabs/PurchasesPayablesTab';
import { InventoryHealthTab } from '@/pages/reports/tabs/InventoryHealthTab';
import { CashFlowLiquidityTab } from '@/pages/reports/tabs/CashFlowLiquidityTab';
import { CustomersLoyaltyTab } from '@/pages/reports/tabs/CustomersLoyaltyTab';
import { LossAuditTab } from '@/pages/reports/tabs/LossAuditTab';
import { exportReportsWorkbook } from '@/pages/reports/export/reportsExcelExport';

type ReportTab = 'executive' | 'sales' | 'purchasing' | 'inventory' | 'cashflow' | 'audit' | 'customers';

const EXPORT_SHEETS = [
  'Executive P&L',
  'Sales performance',
  'Items sold',
  'Purchasing & payables',
  'Inventory & health',
  'Cash flow & wallets',
  'Loss audit',
  'Customers',
] as const;

function formatBsRange(adStart: string, adEnd: string): string {
  const bsStart = adToBs(adStart);
  const bsEnd = adToBs(adEnd);
  if (!bsStart || !bsEnd) return '';

  const [sy, sm, sd] = bsStart.split('-').map(Number);
  const [ey, em, ed] = bsEnd.split('-').map(Number);

  const startMonthName = BS_MONTHS[sm - 1] || `Month ${sm}`;
  const endMonthName = BS_MONTHS[em - 1] || `Month ${em}`;

  if (sy === ey && sm === em) {
    return `${startMonthName} ${sd} – ${ed}, ${sy} BS`;
  } else if (sy === ey) {
    return `${startMonthName} ${sd} – ${endMonthName} ${ed}, ${sy} BS`;
  }
  return `${startMonthName} ${sd}, ${sy} – ${endMonthName} ${ed}, ${ey} BS`;
}

async function fetchSheet<T>(label: string, fn: () => Promise<T>): Promise<{ label: string; data: T | null; ok: boolean }> {
  try {
    const data = await fn();
    return { label, data, ok: true };
  } catch {
    return { label, data: null, ok: false };
  }
}

export function ReportsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { dateRange, setDateRange } = useDashboardStore();
  const [isExporting, setIsExporting] = useState(false);

  const urlTab = searchParams.get('tab') as ReportTab;
  const validTabs: ReportTab[] = ['executive', 'sales', 'purchasing', 'inventory', 'cashflow', 'audit', 'customers'];
  const activeTab: ReportTab = validTabs.includes(urlTab) ? urlTab : 'executive';

  const handleTabChange = (_: React.SyntheticEvent, newValue: ReportTab) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('tab', newValue);
      return next;
    }, { replace: true });
  };

  const bsDateString = formatBsRange(dateRange.startDate, dateRange.endDate);

  const handleFullExport = async () => {
    setIsExporting(true);
    try {
      const results = await Promise.all([
        fetchSheet(EXPORT_SHEETS[0], () => reportsService.getExecutiveSummary(dateRange)),
        fetchSheet(EXPORT_SHEETS[1], () => reportsService.getSalesPerformance(dateRange)),
        fetchSheet(EXPORT_SHEETS[2], async () => {
          const page = await reportsService.getItemsSold(dateRange, { page: 1, pageSize: 1000 });
          return page.data;
        }),
        fetchSheet(EXPORT_SHEETS[3], () => reportsService.getPurchasingPayables(dateRange)),
        fetchSheet(EXPORT_SHEETS[4], () => reportsService.getInventoryHealth('both', 30, 30)),
        fetchSheet(EXPORT_SHEETS[5], () => reportsService.getCashFlow(dateRange)),
        fetchSheet(EXPORT_SHEETS[6], () => reportsService.getLossAudit(dateRange, 20)),
        fetchSheet(EXPORT_SHEETS[7], async () => {
          const [topCustomers, loyaltySummary] = await Promise.all([
            reportsService.getTopCustomers(dateRange, 50),
            reportsService.getLoyaltySummary(dateRange),
          ]);
          return { topCustomers, loyaltySummary };
        }),
      ]);

      const [execSummary, salesPerf, itemsSold, purchasing, invHealth, cashFlow, lossAudit, customersBundle] = results;
      const succeeded = results.filter((r) => r.ok);
      const failed = results.filter((r) => !r.ok);

      if (succeeded.length === 0) {
        showError('Export failed — no report sheets could be loaded.');
        return;
      }

      exportReportsWorkbook({
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
        execSummary: execSummary.data,
        salesPerf: salesPerf.data,
        itemsSold: itemsSold.data,
        purchasing: purchasing.data,
        invHealth: invHealth.data,
        cashFlow: cashFlow.data,
        lossAudit: lossAudit.data,
        topCustomers: customersBundle.data?.topCustomers ?? null,
        loyaltySummary: customersBundle.data?.loyaltySummary ?? null,
      });

      if (failed.length === 0) {
        showSuccess(`Workbook exported (${succeeded.length}/${EXPORT_SHEETS.length} sheets).`);
      } else {
        showWarning(
          `Workbook exported with ${succeeded.length}/${EXPORT_SHEETS.length} sheets. Failed: ${failed
            .map((f) => f.label)
            .join(', ')}.`,
        );
      }
    } catch (err) {
      showApiError(err, 'Failed to export reports workbook');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pb: 4 }}>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 800, color: 'text.primary' }}>
            Retail Intelligence & Reports
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Accrual P&L, Cash Flow, Merchandising, Supply Chain & Working Capital
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Button
            variant="outlined"
            startIcon={<TodayIcon />}
            onClick={() => navigate('/reports/daily')}
            sx={{ fontWeight: 600, borderColor: 'divider' }}
          >
            Today's Day Book
          </Button>

          <Button
            variant="contained"
            color="primary"
            startIcon={isExporting ? <CircularProgress size={16} color="inherit" /> : <DownloadIcon />}
            onClick={handleFullExport}
            disabled={isExporting}
            sx={{ fontWeight: 700 }}
          >
            {isExporting ? 'Generating Excel...' : 'Export Excel Workbook'}
          </Button>
        </Box>
      </Box>

      <ReportContextBar
        startDate={dateRange.startDate}
        endDate={dateRange.endDate}
        onDateRangeChange={setDateRange}
        bsDateString={bsDateString || undefined}
      />

      <Paper
        elevation={0}
        sx={{
          borderRadius: 2.5,
          border: '1px solid',
          borderColor: 'divider',
          bgcolor: 'background.paper',
        }}
      >
        <Tabs
          value={activeTab}
          onChange={handleTabChange}
          variant="scrollable"
          scrollButtons="auto"
          sx={{
            px: 1,
            '& .MuiTab-root': {
              minHeight: 52,
              fontWeight: 700,
              fontSize: '0.875rem',
              textTransform: 'none',
              gap: 1,
            },
          }}
        >
          <Tab
            value="executive"
            icon={<QueryStatsIcon sx={{ fontSize: 20 }} />}
            iconPosition="start"
            label="Executive Financials"
          />
          <Tab
            value="sales"
            icon={<MonetizationOnIcon sx={{ fontSize: 20 }} />}
            iconPosition="start"
            label="Sales & Merchandising"
          />
          <Tab
            value="purchasing"
            icon={<LocalShippingIcon sx={{ fontSize: 20 }} />}
            iconPosition="start"
            label="Purchases & Payables"
          />
          <Tab
            value="inventory"
            icon={<Inventory2Icon sx={{ fontSize: 20 }} />}
            iconPosition="start"
            label="Inventory & Health"
          />
          <Tab
            value="cashflow"
            icon={<AccountBalanceWalletIcon sx={{ fontSize: 20 }} />}
            iconPosition="start"
            label="Cash Flow & Wallets"
          />
          <Tab
            value="audit"
            icon={<SecurityIcon sx={{ fontSize: 20 }} />}
            iconPosition="start"
            label="Loss & Operational Audit"
          />
          <Tab
            value="customers"
            icon={<PeopleAltIcon sx={{ fontSize: 20 }} />}
            iconPosition="start"
            label="Customers & Loyalty"
          />
        </Tabs>
      </Paper>

      <Box sx={{ mt: 1 }}>
        {activeTab === 'executive' && <ExecutiveSummaryTab />}
        {activeTab === 'sales' && <SalesMerchandisingTab />}
        {activeTab === 'purchasing' && <PurchasesPayablesTab />}
        {activeTab === 'inventory' && <InventoryHealthTab />}
        {activeTab === 'cashflow' && <CashFlowLiquidityTab />}
        {activeTab === 'audit' && <LossAuditTab />}
        {activeTab === 'customers' && <CustomersLoyaltyTab />}
      </Box>
    </Box>
  );
}

export default ReportsPage;
