import { useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  Tabs,
  Tab,
  Button,
  Chip,
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
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import { useNavigate } from 'react-router-dom';

import { DateRangePicker } from '@/components/common/DateRangePicker';
import { useDashboardStore } from '@/store';
import { adToBs, BS_MONTHS } from '@/utils/nepaliDate';
import { showSuccess, showApiError } from '@/utils/toast';
import { reportsService } from '@/services';

// 5 Pillar Tabs + Customers
import { ExecutiveSummaryTab } from '@/pages/reports/tabs/ExecutiveSummaryTab';
import { SalesMerchandisingTab } from '@/pages/reports/tabs/SalesMerchandisingTab';
import { PurchasesPayablesTab } from '@/pages/reports/tabs/PurchasesPayablesTab';
import { InventoryHealthTab } from '@/pages/reports/tabs/InventoryHealthTab';
import { CashFlowLiquidityTab } from '@/pages/reports/tabs/CashFlowLiquidityTab';
import { CustomersLoyaltyTab } from '@/pages/reports/tabs/CustomersLoyaltyTab';
import { exportReportsWorkbook } from '@/pages/reports/export/reportsExcelExport';

type ReportTab = 'executive' | 'sales' | 'purchasing' | 'inventory' | 'cashflow' | 'customers';

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

export function ReportsPage() {
  const navigate = useNavigate();
  const { dateRange, setDateRange } = useDashboardStore();
  const [activeTab, setActiveTab] = useState<ReportTab>('executive');
  const [isExporting, setIsExporting] = useState(false);

  const bsDateString = formatBsRange(dateRange.startDate, dateRange.endDate);

  const handleFullExport = async () => {
    setIsExporting(true);
    try {
      const [execSummary, salesPerf, itemsSold, purchasing, invHealth, cashFlow] = await Promise.all([
        reportsService.getExecutiveSummary(dateRange).catch(() => null),
        reportsService.getSalesPerformance(dateRange).catch(() => null),
        reportsService.getItemsSold(dateRange).catch(() => null),
        reportsService.getPurchasingPayables(dateRange).catch(() => null),
        reportsService.getInventoryHealth('both', 30, 30).catch(() => null),
        reportsService.getCashFlow(dateRange).catch(() => null),
      ]);

      exportReportsWorkbook({
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
        execSummary,
        salesPerf,
        itemsSold,
        purchasing,
        invHealth,
        cashFlow,
      });

      showSuccess('Full executive workbook exported successfully!');
    } catch (err) {
      showApiError(err, 'Failed to export reports workbook');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pb: 4 }}>
      {/* 1. GLOBAL HEADER & TOOLBAR */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 800, color: 'text.primary' }}>
            Retail Intelligence & Reports
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Accrual P&L, Cash Flow, Merchandising, Supply Chain & Working Capital
          </Typography>
        </Box>

        {/* Action Buttons */}
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

      {/* 2. DATE FILTER & DUAL CALENDAR STRIP */}
      <Paper
        elevation={0}
        sx={{
          p: 2,
          borderRadius: 2.5,
          border: '1px solid',
          borderColor: 'divider',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 2,
        }}
      >
        <DateRangePicker
          startDate={dateRange.startDate}
          endDate={dateRange.endDate}
          onChange={setDateRange}
        />

        {/* Bikram Sambat (BS) Dual Calendar Pill */}
        {bsDateString && (
          <Chip
            icon={<CalendarMonthIcon sx={{ color: '#0284C7' }} />}
            label={`Nepal BS: ${bsDateString}`}
            variant="outlined"
            sx={{
              borderColor: 'rgba(2, 132, 199, 0.3)',
              bgcolor: 'rgba(2, 132, 199, 0.05)',
              fontWeight: 700,
              color: '#0284C7',
              fontSize: '0.8rem',
              py: 0.5,
            }}
          />
        )}
      </Paper>

      {/* 3. FIVE PILLAR TAB NAVIGATION */}
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
          onChange={(_, val) => setActiveTab(val)}
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
            label="1. Executive Financials (P&L)"
          />
          <Tab
            value="sales"
            icon={<MonetizationOnIcon sx={{ fontSize: 20 }} />}
            iconPosition="start"
            label="2. Sales & Merchandising"
          />
          <Tab
            value="purchasing"
            icon={<LocalShippingIcon sx={{ fontSize: 20 }} />}
            iconPosition="start"
            label="3. Purchases & Payables"
          />
          <Tab
            value="inventory"
            icon={<Inventory2Icon sx={{ fontSize: 20 }} />}
            iconPosition="start"
            label="4. Inventory & Health"
          />
          <Tab
            value="cashflow"
            icon={<AccountBalanceWalletIcon sx={{ fontSize: 20 }} />}
            iconPosition="start"
            label="5. Cash Flow & Wallets"
          />
          <Tab
            value="customers"
            icon={<PeopleAltIcon sx={{ fontSize: 20 }} />}
            iconPosition="start"
            label="6. Customers & Loyalty"
          />
        </Tabs>
      </Paper>

      {/* 4. ACTIVE TAB CONTENT PANES */}
      <Box sx={{ mt: 1 }}>
        {activeTab === 'executive' && <ExecutiveSummaryTab />}
        {activeTab === 'sales' && <SalesMerchandisingTab />}
        {activeTab === 'purchasing' && <PurchasesPayablesTab />}
        {activeTab === 'inventory' && <InventoryHealthTab />}
        {activeTab === 'cashflow' && <CashFlowLiquidityTab />}
        {activeTab === 'customers' && <CustomersLoyaltyTab />}
      </Box>
    </Box>
  );
}

export default ReportsPage;
