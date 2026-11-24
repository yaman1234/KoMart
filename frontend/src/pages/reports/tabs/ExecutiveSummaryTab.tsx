import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  Chip,
  Grid,
  Paper,
  Typography,
  Divider,
  Skeleton,
  Stack,
  Tooltip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  LinearProgress,
  Collapse,
  ToggleButton,
  ToggleButtonGroup,
  Alert,
} from '@mui/material';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import PointOfSaleIcon from '@mui/icons-material/PointOfSale';
import PeopleAltIcon from '@mui/icons-material/PeopleAlt';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import AssignmentReturnIcon from '@mui/icons-material/AssignmentReturn';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import StorefrontIcon from '@mui/icons-material/Storefront';
import PaymentsIcon from '@mui/icons-material/Payments';

import { formatCurrency } from '@/utils';
import { useExecutiveSummary } from '@/hooks/useReports';
import { AsOfChip, ReportErrorState, TeaserTable } from '@/pages/reports/components';


export function ExecutiveSummaryTab() {
  const navigate = useNavigate();
  const { data, isLoading, isError, refetch } = useExecutiveSummary();

  const [showBridge, setShowBridge] = useState(false);
  const [showExpenseDetails, setShowExpenseDetails] = useState(false);
  const [wcMode, setWcMode] = useState<'live' | 'closing'>('live');

  const expenseCategories = useMemo(() => {
    const list = (data as any)?.opexByCategory || (data as any)?.opex_by_category || [];
    return list.filter(
      (c: any) => c.category !== 'purchase_order' && c.category !== 'setup_investment'
    );
  }, [data]);

  if (isError && !data) {
    return (
      <ReportErrorState
        title="Could not load Executive Financials"
        onRetry={() => {
          void refetch();
        }}
      />
    );
  }

  if (isLoading || !data) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <Grid container spacing={2}>
          {Array.from({ length: 4 }).map((_, i) => (
            <Grid size={{ xs: 12, sm: 6, md: 3 }} key={i}>
              <Skeleton variant="rounded" height={105} sx={{ borderRadius: 2.5 }} />
            </Grid>
          ))}
        </Grid>
        <Skeleton variant="rounded" height={220} sx={{ borderRadius: 3 }} />
        <Grid container spacing={3}>
          <Grid size={{ xs: 12, md: 6 }}>
            <Skeleton variant="rounded" height={360} sx={{ borderRadius: 3 }} />
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <Skeleton variant="rounded" height={360} sx={{ borderRadius: 3 }} />
          </Grid>
        </Grid>
      </Box>
    );
  }

  // Raw data fallbacks
  const pnl = (data.pnl || {}) as any;
  const bridge = (data.cashBridge || data.cash_bridge || {}) as any;
  const wcLive = (data.workingCapital || data.working_capital || {}) as any;
  const wcClosing = (data.workingCapitalClosing || (data as any).working_capital_closing || wcLive) as any;
  const wc = wcMode === 'closing' ? wcClosing : wcLive;
  const tax = (data.taxVat || data.tax_vat || {}) as any;
  const ive = (data.incomeVsExpenses || (data as any).income_vs_expenses || {}) as any;
  const rvp = (data.receivablesVsPayables || (data as any).receivables_vs_payables || {}) as any;
  const topCreditors = (data.topCreditors || (data as any).top_creditors || []) as any[];
  const periodTillVariance = (data as any).periodTillVariance ?? (data as any).period_till_variance ?? 0;
  const topCategories = ((data as any).topCategories || (data as any).top_categories || []) as any[];
  const tenderMixList = ((data as any).tenderMix || (data as any).tender_mix || []) as any[];


  // P&L metrics
  const grossSales = pnl.grossSales ?? pnl.gross_sales ?? ive.gross_sales ?? 0;
  const totalDiscounts = pnl.totalDiscounts ?? pnl.total_discounts ?? ive.total_discounts ?? 0;
  const itemMarkdowns = pnl.itemMarkdowns ?? pnl.item_markdowns ?? ive.item_markdowns ?? 0;
  const billDiscounts = pnl.billDiscounts ?? pnl.bill_discounts ?? ive.bill_discounts ?? 0;
  const netSales = pnl.netSales ?? pnl.net_sales ?? ive.net_sales ?? 0;
  const totalCogs = pnl.totalCogs ?? pnl.total_cogs ?? ive.total_cogs ?? 0;
  const grossProfit = pnl.grossProfit ?? pnl.gross_profit ?? ive.gross_profit ?? 0;
  const grossMarginPct = pnl.grossMarginPct ?? pnl.gross_margin_pct ?? ive.gross_margin_pct ?? 0;
  const operatingExpenses = pnl.operatingExpenses ?? pnl.operating_expenses ?? ive.operating_expenses ?? 0;
  const inventoryShrinkage = pnl.inventoryShrinkage ?? pnl.inventory_shrinkage ?? 0;
  const setupInvestment = pnl.setupInvestment ?? pnl.setup_investment ?? 0;
  const netStoreEarnings = pnl.netProfit ?? pnl.net_profit ?? 0;
  const zeroCostLineCount = pnl.zeroCostLineCount ?? pnl.zero_cost_line_count ?? 0;
  const operatingProfit = pnl.operatingProfit ?? pnl.operating_profit ?? 0;
  const operatingMarginPct = pnl.operatingMarginPct ?? pnl.operating_margin_pct ?? 0;
  const totalCosts = ive.total_costs ?? (totalCogs + operatingExpenses + inventoryShrinkage);
  const operatingSurplus = ive.operating_surplus ?? (netSales - totalCosts);
  const costToIncomeRatio = ive.cost_to_income_ratio ?? (netSales > 0 ? (totalCosts / netSales) * 100 : 0);

  // Working Capital metrics (selected snapshot)
  const bankBalance = wc.bankBalance ?? wc.bank_balance ?? 0;
  const esewaBalance = wc.esewaBalance ?? wc.esewa_balance ?? 0;
  const bankAndDigital = wc.bankAndDigitalTotal ?? wc.bank_and_digital_total ?? (bankBalance + esewaBalance);
  const cashTillBalance = wc.cashTillBalance ?? wc.cash_till_balance ?? 0;
  const tillVariance = wc.tillVariance ?? wc.till_variance ?? 0;
  const cashWithStaff = wc.cashWithStaff ?? wc.cash_with_staff ?? 0;
  const inventoryValue = wc.inventoryValue ?? wc.inventory_value ?? 0;
  const accountsPayable = wc.accountsPayable ?? wc.accounts_payable ?? rvp.accounts_payable ?? 0;
  const accountsReceivable = wc.accountsReceivable ?? wc.accounts_receivable ?? rvp.accounts_receivable ?? 0;
  const totalLiquidCash = wc.totalLiquidCash ?? wc.total_liquid_cash ?? (bankAndDigital + cashTillBalance + cashWithStaff);
  const totalWorkingCapital = wc.totalWorkingCapital ?? wc.total_working_capital ?? (totalLiquidCash + inventoryValue);
  const netWorkingCapital = wc.netWorkingCapital ?? wc.net_working_capital ?? ((totalWorkingCapital + accountsReceivable) - accountsPayable);
  const cashCoverageRatio = wc.cashCoverageRatio ?? wc.cash_coverage_ratio ?? (accountsPayable > 0 ? totalLiquidCash / accountsPayable : 0);
  const wcAsOf = wc.asOfDate ?? wc.as_of_date ?? '';
  const netFloat = rvp.net_float ?? (accountsReceivable - accountsPayable);

  // AP Aging
  const apAging = rvp.ap_aging || rvp.apAging || ({} as any);
  const over90 = apAging.over_90 ?? 0;

  // Cash bridge & Tax
  const accrualOperatingProfit = bridge.accrualOperatingProfit ?? bridge.accrual_operating_profit ?? 0;
  const nonCashConsumption = bridge.nonCashConsumption ?? bridge.non_cash_consumption ?? 0;
  const cogsInventoryReduction = bridge.cogsInventoryReduction ?? bridge.cogs_inventory_reduction ?? 0;
  const supplierPoPayments = bridge.supplierPoPayments ?? bridge.supplier_po_payments ?? 0;
  const supplierRefundsCollected = bridge.supplierRefundsCollected ?? bridge.supplier_refunds_collected ?? 0;
  const timingFloatDifference = bridge.timingFloatDifference ?? bridge.timing_float_difference ?? 0;
  const netCashFlow = bridge.netCashFlow ?? bridge.net_cash_flow ?? 0;

  const taxableSales = tax.taxableSales ?? tax.taxable_sales ?? 0;
  const exemptSales = tax.exemptSales ?? tax.exempt_sales ?? 0;
  const outputVat13 = tax.outputVat13 ?? tax.output_vat_13 ?? 0;
  const roundOff = tax.roundOff ?? tax.round_off ?? 0;

  // Top KPI summary strip
  const kpis = [
    {
      label: 'Net Sales Turnover',
      value: netSales,
      subtitle: `${grossSales > 0 ? ((totalDiscounts / grossSales) * 100).toFixed(1) : '0.0'}% discount rate · Gross ${formatCurrency(grossSales)}`,
      tooltip: 'Realized revenue from scanned customer sales after deducting all item markdowns and bill discounts.',
      color: '#0284C7',
      bg: 'rgba(2, 132, 199, 0.08)',
    },
    {
      label: 'Gross Profit',
      value: grossProfit,
      subtitle: `Trading Margin: ${Number(grossMarginPct).toFixed(1)}% · COGS: ${formatCurrency(totalCogs)}`,
      tooltip: 'Trading profit generated purely from product turnover: Net Sales Revenue minus Cost of Goods Sold (FEFO batch costing).',
      color: '#6366F1',
      bg: 'rgba(99, 102, 241, 0.08)',
    },
    {
      label: 'Operating Profit (EBIT)',
      value: operatingProfit,
      subtitle: `Operating Margin: ${Number(operatingMarginPct).toFixed(1)}% · Overheads: ${formatCurrency(operatingExpenses)}`,
      tooltip: 'Core retail operating earnings (Gross Profit minus Store Operating Expenses such as rent, salaries, utilities).',
      color: operatingProfit >= 0 ? '#10B981' : '#F43F5E',
      bg: operatingProfit >= 0 ? 'rgba(16, 185, 129, 0.08)' : 'rgba(244, 63, 94, 0.08)',
    },
    {
      label: 'Total Working Capital',
      value: totalWorkingCapital,
      subtitle: `Liquid Cash: ${formatCurrency(totalLiquidCash)} · Stock: ${formatCurrency(inventoryValue)}`,
      tooltip: 'Total active operating capital in the business, comprising physical cash in till, bank & digital balances, staff custody float, and current stock at cost.',
      color: '#0D9488',
      bg: 'rgba(13, 148, 136, 0.08)',
    },
  ];

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3.5 }}>
      {zeroCostLineCount > 0 && (
        <Alert severity="warning" sx={{ borderRadius: 2.5 }}>
          {zeroCostLineCount} sale line{zeroCostLineCount === 1 ? '' : 's'} still have zero cost after batch / product / last-PO
          fallbacks — margins may be overstated. Review Sales & Merchandising.
        </Alert>
      )}
      {/* 0. TOP EXECUTIVE KPI STRIP */}
      <Grid container spacing={2}>
        {kpis.map((kpi, idx) => (
          <Grid size={{ xs: 12, sm: 6, md: 3 }} key={idx}>
            <Paper
              elevation={0}
              sx={{
                p: 2,
                borderRadius: 2.5,
                border: '1px solid',
                borderColor: 'divider',
                backgroundColor: kpi.bg,
                transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                '&:hover': {
                  transform: 'translateY(-2px)',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
                },
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 0.5 }}>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                  {kpi.label}
                </Typography>
                {kpi.tooltip && (
                  <Tooltip title={kpi.tooltip} arrow placement="top">
                    <InfoOutlinedIcon sx={{ fontSize: 15, color: 'text.secondary', cursor: 'pointer', flexShrink: 0 }} />
                  </Tooltip>
                )}
              </Box>
              <Typography
                variant="h6"
                sx={{
                  fontWeight: 700,
                  color: kpi.color,
                  fontVariantNumeric: 'tabular-nums',
                  mt: 0.5,
                }}
              >
                {formatCurrency(kpi.value)}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                {kpi.subtitle}
              </Typography>
            </Paper>
          </Grid>
        ))}
      </Grid>

      {/* ========================================================================= */}
      {/* 1. WORKING CAPITAL & LIQUIDITY SNAPSHOT SECTION                           */}
      {/* ========================================================================= */}
      <Paper
        elevation={0}
        sx={{
          p: 3,
          borderRadius: 3,
          border: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 1.5, mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.2 }}>
            <AccountBalanceWalletIcon sx={{ color: '#0D9488', fontSize: 26 }} />
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                  1. Working Capital & Operating Assets
                </Typography>
                <AsOfChip kind={wcMode === 'closing' ? 'closing' : 'live'} />
              </Box>
              <Typography variant="caption" color="text.secondary">
                Bank, till, and staff custody
                {wcAsOf ? ` as of ${wcAsOf}` : ''}. Inventory & AP/AR stay live stock/liability snapshots.
                {periodTillVariance !== 0
                  ? ` Period till variance: ${periodTillVariance > 0 ? '+' : ''}${formatCurrency(periodTillVariance)}.`
                  : ''}
              </Typography>
            </Box>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <ToggleButtonGroup
              exclusive
              size="small"
              value={wcMode}
              onChange={(_, next) => {
                if (next) setWcMode(next);
              }}
              sx={{
                '& .MuiToggleButton-root': {
                  textTransform: 'none',
                  fontWeight: 700,
                  fontSize: 12,
                  px: 1.25,
                  py: 0.35,
                },
              }}
            >
              <ToggleButton value="closing">Period closing</ToggleButton>
              <ToggleButton value="live">Live today</ToggleButton>
            </ToggleButtonGroup>
            <Button
              size="small"
              variant="outlined"
              endIcon={<ArrowForwardIcon fontSize="small" />}
              onClick={() => navigate('/reports?tab=cashflow')}
              sx={{ textTransform: 'none', fontWeight: 600, fontSize: 12 }}
            >
              Inspect Wallets & Cash Flow
            </Button>
            <Button
              size="small"
              variant="outlined"
              endIcon={<ArrowForwardIcon fontSize="small" />}
              onClick={() => navigate('/reports?tab=inventory')}
              sx={{ textTransform: 'none', fontWeight: 600, fontSize: 12 }}
            >
              View Inventory Health
            </Button>
          </Box>
        </Box>

        <Grid container spacing={2}>
          {/* Card 1: Bank & Digital */}
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <Paper
              elevation={0}
              sx={{
                p: 2,
                borderRadius: 2,
                border: '1px solid',
                borderColor: 'divider',
                bgcolor: 'rgba(2, 132, 199, 0.04)',
                height: '100%',
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <AccountBalanceIcon sx={{ color: '#0284C7', fontSize: 20 }} />
                <Typography variant="body2" sx={{ fontWeight: 700 }}>
                  Bank & Digital Accounts
                </Typography>
              </Box>
              <Typography variant="h6" sx={{ fontWeight: 800, color: '#0284C7', fontVariantNumeric: 'tabular-nums' }}>
                {formatCurrency(bankAndDigital)}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                Bank: {formatCurrency(bankBalance)} · eSewa: {formatCurrency(esewaBalance)}
              </Typography>
            </Paper>
          </Grid>

          {/* Card 2: Cash Till */}
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <Paper
              elevation={0}
              sx={{
                p: 2,
                borderRadius: 2,
                border: '1px solid',
                borderColor: 'divider',
                bgcolor: 'rgba(16, 185, 129, 0.04)',
                height: '100%',
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <PointOfSaleIcon sx={{ color: '#10B981', fontSize: 20 }} />
                <Typography variant="body2" sx={{ fontWeight: 700 }}>
                  Cash in Till (Registers)
                </Typography>
              </Box>
              <Typography variant="h6" sx={{ fontWeight: 800, color: '#10B981', fontVariantNumeric: 'tabular-nums' }}>
                {formatCurrency(cashTillBalance)}
              </Typography>
              <Typography
                variant="caption"
                sx={{
                  display: 'block',
                  mt: 0.5,
                  fontWeight: 700,
                  color: tillVariance === 0 ? 'text.secondary' : tillVariance > 0 ? '#047857' : '#BE123C',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {tillVariance === 0
                  ? 'Variance not counted yet'
                  : `Till variance ${tillVariance > 0 ? '+' : ''}${formatCurrency(tillVariance)}`}
              </Typography>
            </Paper>
          </Grid>

          {/* Card 3: Cash with Staff */}
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <Paper
              elevation={0}
              sx={{
                p: 2,
                borderRadius: 2,
                border: '1px solid',
                borderColor: 'divider',
                bgcolor: 'rgba(245, 158, 11, 0.04)',
                height: '100%',
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <PeopleAltIcon sx={{ color: '#F59E0B', fontSize: 20 }} />
                <Typography variant="body2" sx={{ fontWeight: 700 }}>
                  Cash with Staff (Custody)
                </Typography>
              </Box>
              <Typography variant="h6" sx={{ fontWeight: 800, color: '#F59E0B', fontVariantNumeric: 'tabular-nums' }}>
                {formatCurrency(cashWithStaff)}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                Open staff custody taken for procurement / transit
              </Typography>
            </Paper>
          </Grid>

          {/* Card 4: Inventory Valuation */}
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <Paper
              elevation={0}
              sx={{
                p: 2,
                borderRadius: 2,
                border: '1px solid',
                borderColor: 'divider',
                bgcolor: 'rgba(99, 102, 241, 0.04)',
                height: '100%',
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <Inventory2Icon sx={{ color: '#6366F1', fontSize: 20 }} />
                <Typography variant="body2" sx={{ fontWeight: 700 }}>
                  Inventory Valuation
                </Typography>
              </Box>
              <Typography variant="h6" sx={{ fontWeight: 800, color: '#6366F1', fontVariantNumeric: 'tabular-nums' }}>
                {formatCurrency(inventoryValue)}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                Batch-weighted merchandise asset value at cost
              </Typography>
            </Paper>
          </Grid>
        </Grid>

        {/* Working Capital Summary Banner */}
        <Box
          sx={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 2,
            mt: 2.5,
            p: 2,
            borderRadius: 2,
            bgcolor: 'background.default',
            border: '1px dashed',
            borderColor: 'divider',
          }}
        >
          <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 3 }}>
            <Box>
              <Typography variant="caption" color="text.secondary">Total Liquid Cash (Bank + Till + Staff):</Typography>
              <Typography variant="body1" sx={{ fontWeight: 800, color: '#047857', fontVariantNumeric: 'tabular-nums' }}>
                {formatCurrency(totalLiquidCash)}
              </Typography>
            </Box>
            <Divider orientation="vertical" flexItem />
            <Box>
              <Typography variant="caption" color="text.secondary">Total Operating Capital (Cash + Stock):</Typography>
              <Typography variant="body1" sx={{ fontWeight: 800, color: '#0F766E', fontVariantNumeric: 'tabular-nums' }}>
                {formatCurrency(totalWorkingCapital)}
              </Typography>
            </Box>
            <Divider orientation="vertical" flexItem />
            <Box>
              <Typography variant="caption" color="text.secondary">Net Working Capital (Assets - AP):</Typography>
              <Typography variant="body1" sx={{ fontWeight: 800, color: netWorkingCapital >= 0 ? '#0284C7' : '#F43F5E', fontVariantNumeric: 'tabular-nums' }}>
                {formatCurrency(netWorkingCapital)}
              </Typography>
            </Box>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="caption" color="text.secondary">Cash Coverage Ratio:</Typography>
            <Chip
              label={`${cashCoverageRatio >= 99 ? '∞' : cashCoverageRatio.toFixed(1)}x Liquid Cash vs AP`}
              size="small"
              icon={cashCoverageRatio >= 1.0 ? <CheckCircleIcon /> : <WarningAmberIcon />}
              color={cashCoverageRatio >= 1.0 ? 'success' : 'warning'}
              sx={{ fontWeight: 700 }}
            />
          </Box>
        </Box>
      </Paper>

      {/* ========================================================================= */}
      {/* 2. INCOME VS EXPENSES (OPERATING ENGINE)                                 */}
      {/* ========================================================================= */}
      <Paper
        elevation={0}
        sx={{
          p: 3,
          borderRadius: 3,
          border: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 1.5, mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.2 }}>
            <TrendingUpIcon sx={{ color: '#0284C7', fontSize: 26 }} />
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                  2. Income vs Expenses Comparison
                </Typography>
                <AsOfChip kind="period" />
              </Box>
              <Typography variant="caption" color="text.secondary">
                Period turnover vs direct product acquisition costs and categorized store overheads
              </Typography>
            </Box>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Button
              size="small"
              variant="outlined"
              endIcon={<ArrowForwardIcon fontSize="small" />}
              onClick={() => navigate('/reports?tab=sales')}
              sx={{ textTransform: 'none', fontWeight: 600, fontSize: 12 }}
            >
              Sales Merchandising
            </Button>
            <Button
              size="small"
              variant="outlined"
              endIcon={<ArrowForwardIcon fontSize="small" />}
              onClick={() => navigate('/expenses')}
              sx={{ textTransform: 'none', fontWeight: 600, fontSize: 12 }}
            >
              Expenses Ledger
            </Button>
          </Box>
        </Box>

        <Grid container spacing={3}>
          {/* Income Column */}
          <Grid size={{ xs: 12, md: 6 }}>
            <Paper
              elevation={0}
              sx={{
                p: 2.5,
                borderRadius: 2,
                border: '1px solid',
                borderColor: 'divider',
                bgcolor: 'rgba(2, 132, 199, 0.03)',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 800, color: '#0284C7' }}>
                  A. Operating Sales Revenue (Turnover)
                </Typography>
                <StorefrontIcon sx={{ color: '#0284C7', fontSize: 20 }} />
              </Box>

              <Stack spacing={1} sx={{ flex: 1 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2">Gross Sales (Shelf Price):</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                    {formatCurrency(grossSales)}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', pl: 1.5, color: 'text.secondary' }}>
                  <Typography variant="caption">(-) Item Markdown Discounts:</Typography>
                  <Typography variant="caption" sx={{ fontVariantNumeric: 'tabular-nums', color: '#F43F5E' }}>
                    ({formatCurrency(itemMarkdowns)})
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', pl: 1.5, color: 'text.secondary' }}>
                  <Typography variant="caption">(-) Bill & Loyalty Discounts:</Typography>
                  <Typography variant="caption" sx={{ fontVariantNumeric: 'tabular-nums', color: '#F43F5E' }}>
                    ({formatCurrency(billDiscounts)})
                  </Typography>
                </Box>
                <Divider sx={{ my: 0.5 }} />
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', p: 1.5, borderRadius: 1.5, bgcolor: 'rgba(2, 132, 199, 0.08)' }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 800, color: '#0369A1' }}>
                    Total Net Sales Income
                  </Typography>
                  <Typography variant="h6" sx={{ fontWeight: 800, color: '#0369A1', fontVariantNumeric: 'tabular-nums' }}>
                    {formatCurrency(netSales)}
                  </Typography>
                </Box>
              </Stack>
            </Paper>
          </Grid>

          {/* Expenses Column */}
          <Grid size={{ xs: 12, md: 6 }}>
            <Paper
              elevation={0}
              sx={{
                p: 2.5,
                borderRadius: 2,
                border: '1px solid',
                borderColor: 'divider',
                bgcolor: 'rgba(244, 63, 94, 0.03)',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 800, color: '#BE123C' }}>
                  B. Operating Costs & Overheads
                </Typography>
                <TrendingDownIcon sx={{ color: '#BE123C', fontSize: 20 }} />
              </Box>

              <Stack spacing={1} sx={{ flex: 1 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2">Cost of Goods Sold (COGS):</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 700, color: '#BE123C', fontVariantNumeric: 'tabular-nums' }}>
                    {formatCurrency(totalCogs)}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', pl: 1.5, color: 'text.secondary' }}>
                  <Typography variant="caption">Store Operating Overheads (OpEx):</Typography>
                  <Typography variant="caption" sx={{ fontVariantNumeric: 'tabular-nums', color: '#BE123C' }}>
                    {formatCurrency(operatingExpenses)}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', pl: 1.5, color: 'text.secondary' }}>
                  <Typography variant="caption">Cost of Sales Margin:</Typography>
                  <Typography variant="caption" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                    {grossSales > 0 ? ((totalCogs / netSales) * 100).toFixed(1) : '0.0'}% of Net Sales
                  </Typography>
                </Box>
                <Divider sx={{ my: 0.5 }} />
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', p: 1.5, borderRadius: 1.5, bgcolor: 'rgba(244, 63, 94, 0.08)' }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 800, color: '#9F1239' }}>
                    Total Operating Costs
                  </Typography>
                  <Typography variant="h6" sx={{ fontWeight: 800, color: '#9F1239', fontVariantNumeric: 'tabular-nums' }}>
                    {formatCurrency(totalCosts)}
                  </Typography>
                </Box>
              </Stack>
            </Paper>
          </Grid>
        </Grid>

        {/* Operating Surplus / Cost-to-Income Comparison Bar */}
        <Box
          sx={{
            mt: 2.5,
            p: 2,
            borderRadius: 2,
            bgcolor: 'background.default',
            border: '1px solid',
            borderColor: 'divider',
          }}
        >
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
                Period Operating Surplus:
              </Typography>
              <Typography
                variant="subtitle1"
                sx={{
                  fontWeight: 900,
                  color: operatingSurplus >= 0 ? '#047857' : '#BE123C',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {operatingSurplus >= 0 ? `+${formatCurrency(operatingSurplus)}` : formatCurrency(operatingSurplus)}
              </Typography>
            </Box>
            <Typography variant="caption" color="text.secondary">
              Cost-to-Income Ratio: <strong>{costToIncomeRatio.toFixed(1)}%</strong> (Remaining Margin: {(100 - costToIncomeRatio).toFixed(1)}%)
            </Typography>
          </Box>
          <LinearProgress
            variant="determinate"
            value={Math.min(100, Math.max(0, costToIncomeRatio))}
            sx={{
              height: 8,
              borderRadius: 4,
              bgcolor: 'rgba(16, 185, 129, 0.2)',
              '& .MuiLinearProgress-bar': {
                bgcolor: costToIncomeRatio > 90 ? '#F43F5E' : '#0284C7',
                borderRadius: 4,
              },
            }}
          />
        </Box>
      </Paper>

      {/* ========================================================================= */}
      {/* 3. RECEIVABLES VS PAYABLES (CREDIT & OBLIGATION FLOAT)                     */}
      {/* ========================================================================= */}
      <Paper
        elevation={0}
        sx={{
          p: 3,
          borderRadius: 3,
          border: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 1.5, mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.2 }}>
            <LocalShippingIcon sx={{ color: '#EA580C', fontSize: 26 }} />
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                  3. Receivables vs Payables Position
                </Typography>
                <Chip
                  label="Vendor Credit & Float"
                  size="small"
                  variant="outlined"
                  sx={{ borderColor: '#EA580C', color: '#EA580C', fontWeight: 600, fontSize: 11 }}
                />
              </Box>
              <Typography variant="caption" color="text.secondary">
                Money owed to KoMart by suppliers vs outstanding unpaid purchase orders owed to vendors
              </Typography>
            </Box>
          </Box>

          <Button
            size="small"
            variant="outlined"
            endIcon={<ArrowForwardIcon fontSize="small" />}
            onClick={() => navigate('/reports?tab=purchasing')}
            sx={{ textTransform: 'none', fontWeight: 600, fontSize: 12 }}
          >
            Manage Supplier Ledgers
          </Button>
        </Box>

        <Grid container spacing={3}>
          {/* Receivables Card */}
          <Grid size={{ xs: 12, md: 6 }}>
            <Paper
              elevation={0}
              sx={{
                p: 2.5,
                borderRadius: 2,
                border: '1px solid',
                borderColor: 'divider',
                bgcolor: 'rgba(16, 185, 129, 0.03)',
                height: '100%',
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                <AssignmentReturnIcon sx={{ color: '#10B981', fontSize: 20 }} />
                <Typography variant="subtitle2" sx={{ fontWeight: 800, color: '#047857' }}>
                  Receivables (Owed to KoMart)
                </Typography>
              </Box>
              <Typography variant="h5" sx={{ fontWeight: 900, color: '#047857', fontVariantNumeric: 'tabular-nums' }}>
                {formatCurrency(accountsReceivable)}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                Pending vendor return refunds and credit notes for returned defective or expired stock
              </Typography>
            </Paper>
          </Grid>

          {/* Payables Card */}
          <Grid size={{ xs: 12, md: 6 }}>
            <Paper
              elevation={0}
              sx={{
                p: 2.5,
                borderRadius: 2,
                border: '1px solid',
                borderColor: 'divider',
                bgcolor: 'rgba(244, 63, 94, 0.03)',
                height: '100%',
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <LocalShippingIcon sx={{ color: '#F43F5E', fontSize: 20 }} />
                  <Typography variant="subtitle2" sx={{ fontWeight: 800, color: '#BE123C' }}>
                    Payables (Owed by KoMart)
                  </Typography>
                </Box>
                <Typography variant="caption" color="text.secondary">
                  Active PO Bills
                </Typography>
              </Box>
              <Typography variant="h5" sx={{ fontWeight: 900, color: '#BE123C', fontVariantNumeric: 'tabular-nums' }}>
                {formatCurrency(accountsPayable)}
              </Typography>

              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.25 }}>
                {over90 > 0
                  ? `Critical 90d+ overdue: ${formatCurrency(over90)} — open Purchasing for full aging.`
                  : 'No critical 90d+ balances. Full aging lives on Purchases & Payables.'}
              </Typography>
            </Paper>
          </Grid>
        </Grid>

        {/* Net Float & Coverage Bar */}
        <Box
          sx={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 2,
            mt: 2.5,
            p: 2,
            borderRadius: 2,
            bgcolor: 'background.default',
            border: '1px dashed',
            borderColor: 'divider',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Typography variant="caption" color="text.secondary">Net Obligation Float (Receivables - Payables):</Typography>
            <Typography
              variant="body1"
              sx={{
                fontWeight: 800,
                color: netFloat >= 0 ? '#047857' : '#BE123C',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {netFloat >= 0 ? `+${formatCurrency(netFloat)} (Net Creditor)` : `${formatCurrency(netFloat)} (Net Debtor)`}
            </Typography>
          </Box>

          <Typography variant="caption" color="text.secondary">
            Liquid cash ({formatCurrency(totalLiquidCash)}) covers <strong>{(cashCoverageRatio * 100).toFixed(0)}%</strong> of current vendor payables.
          </Typography>
        </Box>
      </Paper>

      {/* ========================================================================= */}
      {/* 4. AUDITED RETAIL PROFIT & LOSS STATEMENT (P&L WATERFALL)                */}
      {/* ========================================================================= */}
      <Paper
        elevation={0}
        sx={{
          p: 3,
          borderRadius: 3,
          border: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 1.5, mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.2 }}>
            <TrendingUpIcon sx={{ color: '#6366F1', fontSize: 26 }} />
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                  4. Audited Retail Profit & Loss Statement (P&L)
                </Typography>
                <AsOfChip kind="period" />
              </Box>
              <Typography variant="caption" color="text.secondary">
                Standard multi-step retail accounting waterfall showing value flow from shelf scans down to true operating earnings
              </Typography>
            </Box>
          </Box>

          <Button
            size="small"
            variant={showBridge ? 'contained' : 'outlined'}
            color="primary"
            onClick={() => setShowBridge(!showBridge)}
            sx={{ textTransform: 'none', fontWeight: 600, fontSize: 12 }}
          >
            {showBridge ? 'Hide Cash-to-Profit Bridge' : 'View Cash-to-Profit Bridge'}
          </Button>
        </Box>

        <TableContainer sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: 'background.default' }}>
                <TableCell sx={{ fontWeight: 700 }}>Line Item / Accounting Stage</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>Amount (NPR)</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700, width: 140 }}>% Turnover</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {/* Gross Sales */}
              <TableRow hover>
                <TableCell sx={{ fontWeight: 600 }}>1. Gross Sales (Shelf Price)</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                  {formatCurrency(grossSales)}
                </TableCell>
                <TableCell align="right" sx={{ color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>
                  {grossSales > 0 ? ((grossSales / netSales) * 100).toFixed(1) : '100.0'}%
                </TableCell>
              </TableRow>

              {/* Discounts */}
              <TableRow hover>
                <TableCell sx={{ pl: 4, color: 'text.secondary' }}>(-) Item Markdown Discounts</TableCell>
                <TableCell align="right" sx={{ color: '#F43F5E', fontVariantNumeric: 'tabular-nums' }}>
                  ({formatCurrency(itemMarkdowns)})
                </TableCell>
                <TableCell align="right" sx={{ color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>
                  {netSales > 0 ? ((itemMarkdowns / netSales) * 100).toFixed(1) : '0.0'}%
                </TableCell>
              </TableRow>

              <TableRow hover>
                <TableCell sx={{ pl: 4, color: 'text.secondary' }}>(-) Bill & Loyalty Promotional Discounts</TableCell>
                <TableCell align="right" sx={{ color: '#F43F5E', fontVariantNumeric: 'tabular-nums' }}>
                  ({formatCurrency(billDiscounts)})
                </TableCell>
                <TableCell align="right" sx={{ color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>
                  {netSales > 0 ? ((billDiscounts / netSales) * 100).toFixed(1) : '0.0'}%
                </TableCell>
              </TableRow>

              {/* Net Sales */}
              <TableRow sx={{ bgcolor: 'rgba(2, 132, 199, 0.06)' }}>
                <TableCell sx={{ fontWeight: 800, color: '#0284C7' }}>2. Net Sales Revenue (Realized Turnover)</TableCell>
                <TableCell align="right" sx={{ fontWeight: 800, color: '#0284C7', fontVariantNumeric: 'tabular-nums' }}>
                  {formatCurrency(netSales)}
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 800, color: '#0284C7', fontVariantNumeric: 'tabular-nums' }}>
                  100.0%
                </TableCell>
              </TableRow>

              {/* COGS */}
              <TableRow hover>
                <TableCell sx={{ pl: 4, color: 'text.secondary' }}>(-) Cost of Goods Sold (FEFO Batch Acquisition Cost)</TableCell>
                <TableCell align="right" sx={{ color: '#F43F5E', fontVariantNumeric: 'tabular-nums' }}>
                  ({formatCurrency(totalCogs)})
                </TableCell>
                <TableCell align="right" sx={{ color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>
                  {netSales > 0 ? ((totalCogs / netSales) * 100).toFixed(1) : '0.0'}%
                </TableCell>
              </TableRow>

              {/* Gross Profit */}
              <TableRow sx={{ bgcolor: 'rgba(99, 102, 241, 0.08)' }}>
                <TableCell sx={{ fontWeight: 800, color: '#4338CA' }}>3. Gross Trading Profit</TableCell>
                <TableCell align="right" sx={{ fontWeight: 800, color: '#4338CA', fontVariantNumeric: 'tabular-nums' }}>
                  {formatCurrency(grossProfit)}
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 800, color: '#4338CA', fontVariantNumeric: 'tabular-nums' }}>
                  {Number(grossMarginPct).toFixed(1)}%
                </TableCell>
              </TableRow>

              {/* Operating Expenses */}
              <TableRow hover>
                <TableCell sx={{ pl: 4 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                      (-) Store Operating Overheads (Staff, Rent, Utilities, Transport)
                    </Typography>
                    {expenseCategories.length > 0 && (
                      <Button
                        size="small"
                        onClick={() => setShowExpenseDetails(!showExpenseDetails)}
                        endIcon={showExpenseDetails ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                        sx={{ textTransform: 'none', py: 0, px: 0.5, fontSize: 11 }}
                      >
                        {showExpenseDetails ? 'Hide' : `${expenseCategories.length} categories`}
                      </Button>
                    )}
                  </Box>
                </TableCell>
                <TableCell align="right" sx={{ color: '#F43F5E', fontVariantNumeric: 'tabular-nums' }}>
                  ({formatCurrency(operatingExpenses)})
                </TableCell>
                <TableCell align="right" sx={{ color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>
                  {netSales > 0 ? ((operatingExpenses / netSales) * 100).toFixed(1) : '0.0'}%
                </TableCell>
              </TableRow>

              {/* Collapsible Expense Categories */}
              {showExpenseDetails && expenseCategories.map((c: any) => (
                <TableRow key={c.category} sx={{ bgcolor: 'background.default' }}>
                  <TableCell sx={{ pl: 8, color: 'text.secondary', fontSize: '0.75rem', textTransform: 'capitalize' }}>
                    • {String(c.category || '').replace(/_/g, ' ')} ({c.count ?? 1} txn)
                  </TableCell>
                  <TableCell align="right" sx={{ fontSize: '0.75rem', color: '#F43F5E', fontVariantNumeric: 'tabular-nums' }}>
                    ({formatCurrency(c.amount ?? 0)})
                  </TableCell>
                  <TableCell align="right" sx={{ fontSize: '0.75rem', color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>
                    {netSales > 0 ? (((c.amount ?? 0) / netSales) * 100).toFixed(1) : '0.0'}%
                  </TableCell>
                </TableRow>
              ))}

              {/* Shrinkage / write-offs (pre-EBIT) */}
              <TableRow hover>
                <TableCell sx={{ pl: 4, color: 'text.secondary' }}>
                  (-) Inventory Spoilage & Shrinkage Write-offs
                </TableCell>
                <TableCell align="right" sx={{ color: '#F43F5E', fontVariantNumeric: 'tabular-nums' }}>
                  ({formatCurrency(inventoryShrinkage)})
                </TableCell>
                <TableCell align="right" sx={{ color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>
                  {netSales > 0 ? ((inventoryShrinkage / netSales) * 100).toFixed(1) : '0.0'}%
                </TableCell>
              </TableRow>

              {/* Operating Profit (EBIT) */}
              <TableRow sx={{ bgcolor: operatingProfit >= 0 ? 'rgba(16, 185, 129, 0.12)' : 'rgba(244, 63, 94, 0.12)' }}>
                <TableCell sx={{ fontWeight: 800, color: operatingProfit >= 0 ? '#047857' : '#BE123C' }}>
                  4. Operating Profit / EBIT (Earnings Before Interest & Taxes)
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 900, color: operatingProfit >= 0 ? '#047857' : '#BE123C', fontVariantNumeric: 'tabular-nums' }}>
                  {formatCurrency(operatingProfit)}
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 800, color: operatingProfit >= 0 ? '#047857' : '#BE123C', fontVariantNumeric: 'tabular-nums' }}>
                  {Number(operatingMarginPct).toFixed(1)}%
                </TableCell>
              </TableRow>

              {/* Statutory & Non-Operating Adjustments */}
              <TableRow hover>
                <TableCell sx={{ pl: 4, color: 'text.secondary' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                    <ReceiptLongIcon sx={{ fontSize: 16, color: '#7C3AED' }} />
                    <span>IRD 13% Output VAT Collected (Government Liability)</span>
                  </Box>
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 600, color: '#7C3AED', fontVariantNumeric: 'tabular-nums' }}>
                  {formatCurrency(outputVat13)}
                </TableCell>
                <TableCell align="right" sx={{ color: 'text.secondary' }}>
                  {outputVat13 > 0 ? 'Tax' : '—'}
                </TableCell>
              </TableRow>

              <TableRow hover>
                <TableCell sx={{ pl: 6, color: 'text.secondary', fontSize: '0.8rem' }}>• Taxable Sales Base (13% VAT)</TableCell>
                <TableCell align="right" sx={{ fontSize: '0.8rem', fontVariantNumeric: 'tabular-nums' }}>
                  {formatCurrency(taxableSales)}
                </TableCell>
                <TableCell align="right" sx={{ fontSize: '0.8rem', color: 'text.secondary' }}>
                  {netSales > 0 ? ((taxableSales / netSales) * 100).toFixed(1) : '0.0'}%
                </TableCell>
              </TableRow>

              <TableRow hover>
                <TableCell sx={{ pl: 6, color: 'text.secondary', fontSize: '0.8rem' }}>• Tax-Exempt Sales (Basic Groceries & Fresh Produce)</TableCell>
                <TableCell align="right" sx={{ fontSize: '0.8rem', fontVariantNumeric: 'tabular-nums' }}>
                  {formatCurrency(exemptSales)}
                </TableCell>
                <TableCell align="right" sx={{ fontSize: '0.8rem', color: 'text.secondary' }}>
                  {netSales > 0 ? ((exemptSales / netSales) * 100).toFixed(1) : '0.0'}%
                </TableCell>
              </TableRow>

              <TableRow hover>
                <TableCell sx={{ pl: 4, color: 'text.secondary' }}>Cash Currency Round-Off Adjustments</TableCell>
                <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                  {roundOff >= 0 ? `+${formatCurrency(roundOff)}` : formatCurrency(roundOff)}
                </TableCell>
                <TableCell align="right" sx={{ color: 'text.secondary' }}>—</TableCell>
              </TableRow>

              <TableRow hover>
                <TableCell sx={{ pl: 4, color: 'text.secondary' }}>
                  (-) Setup & Capital Investments (CapEx)
                </TableCell>
                <TableCell align="right" sx={{ color: '#F43F5E', fontVariantNumeric: 'tabular-nums' }}>
                  ({formatCurrency(setupInvestment)})
                </TableCell>
                <TableCell align="right" sx={{ color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>
                  {netSales > 0 ? ((setupInvestment / netSales) * 100).toFixed(1) : '0.0'}%
                </TableCell>
              </TableRow>

              <TableRow sx={{ bgcolor: 'rgba(15, 118, 110, 0.1)' }}>
                <TableCell sx={{ fontWeight: 900, color: '#0F766E' }}>
                  5. Net Store Earnings
                </TableCell>
                <TableCell
                  align="right"
                  sx={{
                    fontWeight: 900,
                    color: netStoreEarnings >= 0 ? '#0F766E' : '#BE123C',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {formatCurrency(netStoreEarnings)}
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 700, color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>
                  {netSales > 0 ? ((netStoreEarnings / netSales) * 100).toFixed(1) : '0.0'}%
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </TableContainer>

        {/* Cash-to-Profit Bridge Collapsible */}
        <Collapse in={showBridge}>
          <Paper
            elevation={0}
            sx={{
              p: 2.5,
              borderRadius: 2,
              border: '1px solid',
              borderColor: 'divider',
              mt: 2,
              bgcolor: 'rgba(13, 148, 136, 0.04)',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <AccountBalanceWalletIcon sx={{ color: '#0D9488', fontSize: 20 }} />
              <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
                Cash-to-Profit Reconciliation Bridge
              </Typography>
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
              Reconciles paper P&L operating profit with physical cash and digital bank balance movements over the selected period
            </Typography>

            <Stack spacing={1}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>Operating Profit (P&L):</Typography>
                <Typography variant="body2" sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                  {formatCurrency(accrualOperatingProfit)}
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', pl: 2, color: 'text.secondary' }}>
                <Typography variant="caption">(+) Internal Store Use (Non-Cash Expense):</Typography>
                <Typography variant="caption" sx={{ color: '#10B981', fontVariantNumeric: 'tabular-nums' }}>
                  +{formatCurrency(nonCashConsumption)}
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', pl: 2, color: 'text.secondary' }}>
                <Typography variant="caption">(+) Product Cost Depleted (Stock Reduction):</Typography>
                <Typography variant="caption" sx={{ color: '#10B981', fontVariantNumeric: 'tabular-nums' }}>
                  +{formatCurrency(cogsInventoryReduction)}
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', pl: 2, color: 'text.secondary' }}>
                <Typography variant="caption">(-) Supplier PO Bill Payments (Cash Outflow):</Typography>
                <Typography variant="caption" sx={{ color: '#F43F5E', fontVariantNumeric: 'tabular-nums' }}>
                  ({formatCurrency(supplierPoPayments)})
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', pl: 2, color: 'text.secondary' }}>
                <Typography variant="caption">(+) Supplier Return Refunds (Cash Inflow):</Typography>
                <Typography variant="caption" sx={{ color: '#10B981', fontVariantNumeric: 'tabular-nums' }}>
                  +{formatCurrency(supplierRefundsCollected)}
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', pl: 2, color: 'text.secondary' }}>
                <Typography variant="caption">(±) Float & Non-Operating Differences:</Typography>
                <Typography variant="caption" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                  {timingFloatDifference >= 0 ? `+${formatCurrency(timingFloatDifference)}` : formatCurrency(timingFloatDifference)}
                </Typography>
              </Box>
              <Divider sx={{ my: 0.5 }} />
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 800, color: '#0F766E' }}>
                  Net Actual Cash Movement (Till & Bank):
                </Typography>
                <Typography variant="subtitle1" sx={{ fontWeight: 800, color: netCashFlow >= 0 ? '#0F766E' : '#BE123C', fontVariantNumeric: 'tabular-nums' }}>
                  {netCashFlow >= 0 ? `+${formatCurrency(netCashFlow)}` : formatCurrency(netCashFlow)}
                </Typography>
              </Box>
            </Stack>
          </Paper>
        </Collapse>
      </Paper>

      {/* ========================================================================= */}
      {/* 5. ACTION TEASERS (hub — full detail on pillar tabs)                       */}
      {/* ========================================================================= */}
      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 6, lg: 4 }}>
          <Paper
            elevation={0}
            sx={{
              p: 2.5,
              borderRadius: 3,
              border: '1px solid',
              borderColor: 'divider',
              height: '100%',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
              <LocalShippingIcon sx={{ color: '#EA580C', fontSize: 20 }} />
              <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
                Top Creditors
              </Typography>
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
              Largest unpaid supplier balances — settle from supplier account
            </Typography>
            <TeaserTable
              maxRows={3}
              rows={topCreditors}
              emptyMessage="No outstanding supplier balances. All purchase orders are settled."
              viewAllLabel="Open payables"
              onViewAll={() => navigate('/reports?tab=purchasing')}
              getRowKey={(c) => c.supplierId || c.supplier_id || c.supplierName}
              columns={[
                {
                  id: 'name',
                  label: 'Supplier',
                  render: (c) => (
                    <Typography component="span" sx={{ fontWeight: 600, fontSize: '0.75rem' }}>
                      {c.supplierName || c.supplier_name || 'Supplier'}
                    </Typography>
                  ),
                },
                {
                  id: 'bal',
                  label: 'Due',
                  align: 'right',
                  render: (c) => (
                    <Typography
                      component="span"
                      sx={{ fontWeight: 700, color: '#BE123C', fontSize: '0.75rem', fontVariantNumeric: 'tabular-nums' }}
                    >
                      {formatCurrency(c.outstandingBalance ?? c.outstanding_balance ?? 0)}
                    </Typography>
                  ),
                },
                {
                  id: 'pay',
                  label: '',
                  align: 'right',
                  width: 72,
                  render: (c) => {
                    const sid = c.supplierId || c.supplier_id;
                    if (!sid) return null;
                    return (
                      <Button
                        size="small"
                        onClick={() => navigate(`/suppliers/${sid}`)}
                        sx={{ textTransform: 'none', fontWeight: 700, fontSize: 11, minWidth: 0, px: 0.75 }}
                      >
                        Pay
                      </Button>
                    );
                  },
                },
              ]}
            />
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, md: 6, lg: 4 }}>
          <Paper
            elevation={0}
            sx={{
              p: 2.5,
              borderRadius: 3,
              border: '1px solid',
              borderColor: 'divider',
              height: '100%',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
              <StorefrontIcon sx={{ color: '#0284C7', fontSize: 20 }} />
              <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
                Category Margins
              </Typography>
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
              Top departments by contribution — full matrix on Sales
            </Typography>
            <TeaserTable
              maxRows={3}
              rows={topCategories}
              emptyMessage="No sales recorded for this period."
              viewAllLabel="Open merchandising"
              onViewAll={() => navigate('/reports?tab=sales')}
              getRowKey={(cat) => cat.category}
              columns={[
                {
                  id: 'category',
                  label: 'Category',
                  render: (cat) => (
                    <Typography
                      component="span"
                      sx={{ fontWeight: 600, fontSize: '0.75rem', textTransform: 'capitalize' }}
                    >
                      {cat.category}
                    </Typography>
                  ),
                },
                {
                  id: 'net',
                  label: 'Net',
                  align: 'right',
                  render: (cat) => (
                    <Typography
                      component="span"
                      sx={{ fontWeight: 700, fontSize: '0.75rem', fontVariantNumeric: 'tabular-nums' }}
                    >
                      {formatCurrency(cat.netRevenue ?? (cat as any).net_revenue ?? 0)}
                    </Typography>
                  ),
                },
                {
                  id: 'margin',
                  label: 'Margin',
                  align: 'right',
                  render: (cat) => {
                    const margin = cat.grossMarginPct ?? (cat as any).gross_margin_pct ?? 0;
                    return (
                      <Typography
                        component="span"
                        sx={{
                          fontWeight: 700,
                          color: margin >= 0 ? '#047857' : '#BE123C',
                          fontSize: '0.75rem',
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {Number(margin).toFixed(1)}%
                      </Typography>
                    );
                  },
                },
              ]}
            />
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, md: 12, lg: 4 }}>
          <Paper
            elevation={0}
            sx={{
              p: 2.5,
              borderRadius: 3,
              border: '1px solid',
              borderColor: 'divider',
              height: '100%',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
              <PaymentsIcon sx={{ color: '#0D9488', fontSize: 20 }} />
              <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
                Tender Mix
              </Typography>
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
              How customers settled — full mix on Sales & Merchandising
            </Typography>
            <TeaserTable
              maxRows={3}
              rows={tenderMixList}
              emptyMessage="No tender collections in this period."
              viewAllLabel="Full tender mix"
              onViewAll={() => navigate('/reports?tab=sales')}
              getRowKey={(t, idx) => t.method || t.payment_method || idx}
              columns={[
                {
                  id: 'method',
                  label: 'Method',
                  render: (t) => (
                    <Typography
                      component="span"
                      sx={{ fontWeight: 600, fontSize: '0.75rem', textTransform: 'capitalize' }}
                    >
                      {t.method || t.payment_method || 'Other'}
                    </Typography>
                  ),
                },
                {
                  id: 'amount',
                  label: 'Collected',
                  align: 'right',
                  render: (t) => (
                    <Typography
                      component="span"
                      sx={{ fontWeight: 700, fontSize: '0.75rem', fontVariantNumeric: 'tabular-nums' }}
                    >
                      {formatCurrency(t.amount ?? 0)}
                    </Typography>
                  ),
                },
                {
                  id: 'share',
                  label: 'Share',
                  align: 'right',
                  render: (t) => (
                    <Typography
                      component="span"
                      sx={{ fontWeight: 700, fontSize: '0.75rem', fontVariantNumeric: 'tabular-nums' }}
                    >
                      {Number(t.sharePct ?? t.share_pct ?? 0).toFixed(1)}%
                    </Typography>
                  ),
                },
              ]}
            />
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}
