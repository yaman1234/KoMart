import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Grid,
  Paper,
  Typography,
  Divider,
  Chip,
  Skeleton,
  Stack,
  Tooltip,
  Button,
} from '@mui/material';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import { formatCurrency } from '@/utils';
import { useExecutiveSummary, useExpenseSummary } from '@/hooks/useReports';

export function ExecutiveSummaryTab() {
  const navigate = useNavigate();
  const { data, isLoading } = useExecutiveSummary();
  const { data: expenseSummary } = useExpenseSummary();

  if (isLoading || !data) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <Grid container spacing={2}>
          {Array.from({ length: 8 }).map((_, i) => (
            <Grid size={{ xs: 12, sm: 6, md: 3 }} key={i}>
              <Skeleton variant="rounded" height={105} sx={{ borderRadius: 2 }} />
            </Grid>
          ))}
        </Grid>
        <Grid container spacing={3}>
          <Grid size={{ xs: 12, md: 6 }}>
            <Skeleton variant="rounded" height={420} sx={{ borderRadius: 2 }} />
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <Skeleton variant="rounded" height={420} sx={{ borderRadius: 2 }} />
          </Grid>
        </Grid>
      </Box>
    );
  }

  const pnl = (data.pnl || {}) as any;
  const bridge = (data.cashBridge || data.cash_bridge || {}) as any;
  const wc = (data.workingCapital || data.working_capital || {}) as any;
  const tax = (data.taxVat || data.tax_vat || {}) as any;

  const grossSales = pnl.grossSales ?? pnl.gross_sales ?? 0;
  const totalDiscounts = pnl.totalDiscounts ?? pnl.total_discounts ?? 0;
  const itemMarkdowns = pnl.itemMarkdowns ?? pnl.item_markdowns ?? 0;
  const billDiscounts = pnl.billDiscounts ?? pnl.bill_discounts ?? 0;
  const netSales = pnl.netSales ?? pnl.net_sales ?? 0;
  const totalCogs = pnl.totalCogs ?? pnl.total_cogs ?? 0;
  const grossProfit = pnl.grossProfit ?? pnl.gross_profit ?? 0;
  const grossMarginPct = pnl.grossMarginPct ?? pnl.gross_margin_pct ?? 0;
  const operatingExpenses = pnl.operatingExpenses ?? pnl.operating_expenses ?? 0;
  const operatingProfit = pnl.operatingProfit ?? pnl.operating_profit ?? 0;
  const operatingMarginPct = pnl.operatingMarginPct ?? pnl.operating_margin_pct ?? 0;

  const accrualOperatingProfit = bridge.accrualOperatingProfit ?? bridge.accrual_operating_profit ?? 0;
  const nonCashConsumption = bridge.nonCashConsumption ?? bridge.non_cash_consumption ?? 0;
  const cogsInventoryReduction = bridge.cogsInventoryReduction ?? bridge.cogs_inventory_reduction ?? 0;
  const supplierPoPayments = bridge.supplierPoPayments ?? bridge.supplier_po_payments ?? 0;
  const supplierRefundsCollected = bridge.supplierRefundsCollected ?? bridge.supplier_refunds_collected ?? 0;
  const timingFloatDifference = bridge.timingFloatDifference ?? bridge.timing_float_difference ?? 0;
  const netCashFlow = bridge.netCashFlow ?? bridge.net_cash_flow ?? 0;

  const inventoryValue = wc.inventoryValue ?? wc.inventory_value ?? 0;
  const accountsPayable = wc.accountsPayable ?? wc.accounts_payable ?? 0;
  const accountsReceivable = wc.accountsReceivable ?? wc.accounts_receivable ?? 0;

  const expenseCategories = useMemo(() => {
    const list = expenseSummary?.byCategory || (expenseSummary as any)?.by_category || [];
    return list.filter(
      (c: any) => c.category !== 'purchase_order' && c.category !== 'setup_investment'
    );
  }, [expenseSummary]);

  const taxableSales = tax.taxableSales ?? tax.taxable_sales ?? 0;
  const exemptSales = tax.exemptSales ?? tax.exempt_sales ?? 0;
  const outputVat13 = tax.outputVat13 ?? tax.output_vat_13 ?? 0;
  const roundOff = tax.roundOff ?? tax.round_off ?? 0;

  const kpis = [
    {
      label: 'Gross Sales',
      value: grossSales,
      subtitle: 'Total shelf scan value',
      color: '#10B981',
      bg: 'rgba(16, 185, 129, 0.08)',
    },
    {
      label: 'Total Discounts',
      value: totalDiscounts,
      isNegative: true,
      subtitle: `${grossSales > 0 ? ((totalDiscounts / grossSales) * 100).toFixed(1) : '0.0'}% retail markdown`,
      color: '#F43F5E',
      bg: 'rgba(244, 63, 94, 0.08)',
    },
    {
      label: 'Net Sales Revenue',
      value: netSales,
      subtitle: 'Turnover after all markdowns',
      color: '#0284C7',
      bg: 'rgba(2, 132, 199, 0.08)',
    },
    {
      label: 'Cost of Goods Sold (COGS)',
      value: totalCogs,
      isNegative: true,
      subtitle: 'FEFO acquisition batch cost',
      color: '#F59E0B',
      bg: 'rgba(245, 158, 11, 0.08)',
    },
    {
      label: 'Gross Trading Profit',
      value: grossProfit,
      subtitle: `Trading Margin: ${Number(grossMarginPct).toFixed(1)}%`,
      color: '#6366F1',
      bg: 'rgba(99, 102, 241, 0.08)',
    },
    {
      label: 'Operating Expenses',
      value: operatingExpenses,
      isNegative: true,
      subtitle: 'Excl. supplier PO payments',
      color: '#EA580C',
      bg: 'rgba(234, 88, 12, 0.08)',
    },
    {
      label: 'Operating EBIT',
      value: operatingProfit,
      subtitle: `Operating Margin: ${Number(operatingMarginPct).toFixed(1)}%`,
      color: operatingProfit >= 0 ? '#10B981' : '#F43F5E',
      bg: operatingProfit >= 0 ? 'rgba(16, 185, 129, 0.08)' : 'rgba(244, 63, 94, 0.08)',
    },
    {
      label: 'Net Cash Flow',
      value: netCashFlow,
      subtitle: 'Actual net cash delta',
      color: netCashFlow >= 0 ? '#0D9488' : '#F43F5E',
      bg: netCashFlow >= 0 ? 'rgba(13, 148, 136, 0.08)' : 'rgba(244, 63, 94, 0.08)',
    },
  ];

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* 1. TOP EXECUTIVE KPI STRIP */}
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
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                {kpi.label}
              </Typography>
              <Typography
                variant="h6"
                sx={{
                  fontWeight: 700,
                  color: kpi.color,
                  fontVariantNumeric: 'tabular-nums',
                  mt: 0.5,
                }}
              >
                {kpi.isNegative && kpi.value > 0 ? `-${formatCurrency(kpi.value)}` : formatCurrency(kpi.value)}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                {kpi.subtitle}
              </Typography>
            </Paper>
          </Grid>
        ))}
      </Grid>

      {/* 2. MAIN FINANCIAL VISUALIZATIONS: TRADING P&L WATERFALL & CASH-TO-PROFIT BRIDGE */}
      <Grid container spacing={3}>
        {/* Waterfall P&L */}
        <Grid size={{ xs: 12, lg: 6 }}>
          <Paper
            elevation={0}
            sx={{
              p: 3,
              borderRadius: 3,
              border: '1px solid',
              borderColor: 'divider',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <TrendingUpIcon sx={{ color: '#6366F1' }} />
                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                  Trading Profit & Loss Statement (P&L)
                </Typography>
              </Box>
              <Chip
                label="Accrual Accounting"
                size="small"
                variant="outlined"
                sx={{ borderColor: '#6366F1', color: '#6366F1', fontWeight: 600 }}
              />
            </Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>
              Audited multi-step income statement showing value flow from shelf scans to true retail operating earnings.
            </Typography>

            <Stack spacing={1.5} sx={{ flex: 1 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 0.5 }}>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>Gross Scanned Sales</Typography>
                <Typography variant="body2" sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                  {formatCurrency(grossSales)}
                </Typography>
              </Box>

              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pl: 2, color: 'text.secondary' }}>
                <Typography variant="caption">(-) Item Price Markdowns</Typography>
                <Typography variant="caption" sx={{ fontVariantNumeric: 'tabular-nums', color: '#F43F5E' }}>
                  ({formatCurrency(itemMarkdowns)})
                </Typography>
              </Box>

              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pl: 2, color: 'text.secondary' }}>
                <Typography variant="caption">(-) Bill & Loyalty Discounts</Typography>
                <Typography variant="caption" sx={{ fontVariantNumeric: 'tabular-nums', color: '#F43F5E' }}>
                  ({formatCurrency(billDiscounts)})
                </Typography>
              </Box>

              <Divider sx={{ my: 0.5 }} />

              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 0.5 }}>
                <Typography variant="body2" sx={{ fontWeight: 700, color: '#0284C7' }}>Net Sales Turnover</Typography>
                <Typography variant="body2" sx={{ fontWeight: 700, color: '#0284C7', fontVariantNumeric: 'tabular-nums' }}>
                  {formatCurrency(netSales)}
                </Typography>
              </Box>

              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pl: 2, color: 'text.secondary' }}>
                <Typography variant="caption">(-) Cost of Goods Sold (FEFO Batch Cost)</Typography>
                <Typography variant="caption" sx={{ fontVariantNumeric: 'tabular-nums', color: '#F43F5E' }}>
                  ({formatCurrency(totalCogs)})
                </Typography>
              </Box>

              <Divider sx={{ my: 0.5 }} />

              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  p: 1.5,
                  borderRadius: 1.5,
                  bgcolor: 'rgba(99, 102, 241, 0.08)',
                }}
              >
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 700, color: '#4338CA' }}>
                    Gross Trading Profit
                  </Typography>
                  <Typography variant="caption" sx={{ color: '#6366F1' }}>
                    Trading Margin: {Number(grossMarginPct).toFixed(1)}%
                  </Typography>
                </Box>
                <Typography variant="subtitle1" sx={{ fontWeight: 800, color: '#4338CA', fontVariantNumeric: 'tabular-nums' }}>
                  {formatCurrency(grossProfit)}
                </Typography>
              </Box>

              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pl: 2, color: 'text.secondary' }}>
                <Typography variant="caption">(-) Operating Overheads (Rent, Staff, Utilities)</Typography>
                <Typography variant="caption" sx={{ fontVariantNumeric: 'tabular-nums', color: '#F43F5E' }}>
                  ({formatCurrency(operatingExpenses)})
                </Typography>
              </Box>

              <Divider sx={{ my: 0.5 }} />

              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  p: 1.5,
                  borderRadius: 1.5,
                  bgcolor: operatingProfit >= 0 ? 'rgba(16, 185, 129, 0.1)' : 'rgba(244, 63, 94, 0.1)',
                  border: '1px solid',
                  borderColor: operatingProfit >= 0 ? '#10B981' : '#F43F5E',
                }}
              >
                <Box>
                  <Typography variant="subtitle2" sx={{ fontWeight: 800, color: operatingProfit >= 0 ? '#047857' : '#BE123C' }}>
                    Operating Profit (EBIT)
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    EBIT Margin: {Number(operatingMarginPct).toFixed(1)}% · Excludes CapEx & PO payments
                  </Typography>
                </Box>
                <Typography
                  variant="h6"
                  sx={{
                    fontWeight: 800,
                    color: operatingProfit >= 0 ? '#047857' : '#BE123C',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {formatCurrency(operatingProfit)}
                </Typography>
              </Box>
            </Stack>
          </Paper>
        </Grid>

        {/* Cash-to-Profit Bridge & Working Capital */}
        <Grid size={{ xs: 12, lg: 6 }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, height: '100%' }}>
            {/* Cash-to-Profit Bridge Card */}
            <Paper
              elevation={0}
              sx={{
                p: 3,
                borderRadius: 3,
                border: '1px solid',
                borderColor: 'divider',
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <AccountBalanceWalletIcon sx={{ color: '#0D9488' }} />
                  <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                    Cash-to-Profit Reconciliation Bridge
                  </Typography>
                </Box>
                <Tooltip title="Explains the exact mathematical difference between your accrual paper profit and the actual cash movement in your till and bank accounts.">
                  <InfoOutlinedIcon fontSize="small" sx={{ color: 'text.secondary' }} />
                </Tooltip>
              </Box>

              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Reconciles accrual P&L profit with physical and digital cash movements over the selected period.
              </Typography>

              <Stack spacing={1.2}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    Accrual Operating Profit (P&L)
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                    {formatCurrency(accrualOperatingProfit)}
                  </Typography>
                </Box>

                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pl: 1.5, color: 'text.secondary' }}>
                  <Typography variant="caption">(+) Internal Store Non-Cash Consumption</Typography>
                  <Typography variant="caption" sx={{ fontVariantNumeric: 'tabular-nums', color: '#10B981' }}>
                    +{formatCurrency(nonCashConsumption)}
                  </Typography>
                </Box>

                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pl: 1.5, color: 'text.secondary' }}>
                  <Typography variant="caption">(+) Non-Cash COGS Expense (Stock Depleted)</Typography>
                  <Typography variant="caption" sx={{ fontVariantNumeric: 'tabular-nums', color: '#10B981' }}>
                    +{formatCurrency(cogsInventoryReduction)}
                  </Typography>
                </Box>

                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pl: 1.5, color: 'text.secondary' }}>
                  <Typography variant="caption">(-) Supplier PO Bill Payments (Cash Disbursed)</Typography>
                  <Typography variant="caption" sx={{ fontVariantNumeric: 'tabular-nums', color: '#F43F5E' }}>
                    ({formatCurrency(supplierPoPayments)})
                  </Typography>
                </Box>

                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pl: 1.5, color: 'text.secondary' }}>
                  <Typography variant="caption">(+) Supplier Return Refunds Collected</Typography>
                  <Typography variant="caption" sx={{ fontVariantNumeric: 'tabular-nums', color: '#10B981' }}>
                    +{formatCurrency(supplierRefundsCollected)}
                  </Typography>
                </Box>

                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pl: 1.5, color: 'text.secondary' }}>
                  <Typography variant="caption">(±) Float & Non-Operating Cash Timing</Typography>
                  <Typography variant="caption" sx={{ fontVariantNumeric: 'tabular-nums', color: timingFloatDifference >= 0 ? '#10B981' : '#F43F5E' }}>
                    {timingFloatDifference >= 0 ? `+${formatCurrency(timingFloatDifference)}` : `(${formatCurrency(Math.abs(timingFloatDifference))})`}
                  </Typography>
                </Box>

                <Divider sx={{ my: 0.5 }} />

                <Box
                  sx={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    p: 1.5,
                    borderRadius: 1.5,
                    bgcolor: netCashFlow >= 0 ? 'rgba(13, 148, 136, 0.08)' : 'rgba(244, 63, 94, 0.08)',
                    border: '1px solid',
                    borderColor: netCashFlow >= 0 ? '#0D9488' : '#F43F5E',
                  }}
                >
                  <Box>
                    <Typography variant="subtitle2" sx={{ fontWeight: 800, color: netCashFlow >= 0 ? '#0F766E' : '#BE123C' }}>
                      Period Net Cash Inflow / Outflow
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Exact net change in till and digital bank balances
                    </Typography>
                  </Box>
                  <Typography
                    variant="h6"
                    sx={{
                      fontWeight: 800,
                      color: netCashFlow >= 0 ? '#0F766E' : '#BE123C',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {netCashFlow >= 0 ? `+${formatCurrency(netCashFlow)}` : formatCurrency(netCashFlow)}
                  </Typography>
                </Box>
              </Stack>
            </Paper>

            {/* IRD Tax & Working Capital Strip */}
            <Grid container spacing={2}>
              {/* Working Capital Snapshot */}
              <Grid size={{ xs: 12, sm: 6 }}>
                <Paper
                  elevation={0}
                  sx={{
                    p: 2,
                    borderRadius: 2.5,
                    border: '1px solid',
                    borderColor: 'divider',
                    height: '100%',
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                    <Inventory2Icon sx={{ color: '#0284C7', fontSize: 20 }} />
                    <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                      Working Capital
                    </Typography>
                  </Box>
                  <Stack spacing={0.75}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography variant="caption" color="text.secondary">Inventory Valuation:</Typography>
                      <Typography variant="caption" sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                        {formatCurrency(inventoryValue)}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography variant="caption" color="text.secondary">Accounts Payable (AP):</Typography>
                      <Typography variant="caption" sx={{ fontWeight: 700, color: '#F43F5E', fontVariantNumeric: 'tabular-nums' }}>
                        {formatCurrency(accountsPayable)}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography variant="caption" color="text.secondary">Supplier Receivables:</Typography>
                      <Typography variant="caption" sx={{ fontWeight: 700, color: '#10B981', fontVariantNumeric: 'tabular-nums' }}>
                        {formatCurrency(accountsReceivable)}
                      </Typography>
                    </Box>
                  </Stack>
                </Paper>
              </Grid>

              {/* IRD Tax & 13% VAT Summary */}
              <Grid size={{ xs: 12, sm: 6 }}>
                <Paper
                  elevation={0}
                  sx={{
                    p: 2,
                    borderRadius: 2.5,
                    border: '1px solid',
                    borderColor: 'divider',
                    height: '100%',
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                    <ReceiptLongIcon sx={{ color: '#7C3AED', fontSize: 20 }} />
                    <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                      IRD VAT & Round-Off
                    </Typography>
                  </Box>
                  <Stack spacing={0.75}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography variant="caption" color="text.secondary">Taxable Sales:</Typography>
                      <Typography variant="caption" sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                        {formatCurrency(taxableSales)}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography variant="caption" color="text.secondary">Exempt / Basic Foods:</Typography>
                      <Typography variant="caption" sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                        {formatCurrency(exemptSales)}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography variant="caption" color="text.secondary">13% Output VAT:</Typography>
                      <Typography variant="caption" sx={{ fontWeight: 700, color: '#7C3AED', fontVariantNumeric: 'tabular-nums' }}>
                        {formatCurrency(outputVat13)}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography variant="caption" color="text.secondary">Paisa Round-Off:</Typography>
                      <Typography variant="caption" sx={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                        {roundOff >= 0 ? `+${formatCurrency(roundOff)}` : formatCurrency(roundOff)}
                      </Typography>
                    </Box>
                  </Stack>
                </Paper>
              </Grid>
            </Grid>

            {/* Operating Overheads Breakdown Card */}
            <Paper
              elevation={0}
              sx={{
                p: 2,
                borderRadius: 2.5,
                border: '1px solid',
                borderColor: 'divider',
                mt: 2,
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <AccountBalanceWalletIcon sx={{ color: '#EA580C', fontSize: 20 }} />
                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                    Operating Overheads Breakdown (OpEx)
                  </Typography>
                </Box>
                <Button
                  size="small"
                  onClick={() => navigate('/expenses')}
                  sx={{ textTransform: 'none', fontSize: 12, fontWeight: 600 }}
                >
                  View Expenses Ledger →
                </Button>
              </Box>

              {expenseCategories.length === 0 ? (
                <Typography variant="caption" color="text.secondary">
                  No operating overheads recorded for this selected period.
                </Typography>
              ) : (
                <Stack spacing={1}>
                  {expenseCategories.map((c: any) => (
                    <Box key={c.category} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography variant="caption" sx={{ textTransform: 'capitalize', fontWeight: 600 }}>
                          {String(c.category || '').replace(/_/g, ' ')}
                        </Typography>
                        <Chip label={`${c.count ?? 1} txn`} size="small" sx={{ height: 18, fontSize: 10 }} />
                      </Box>
                      <Typography variant="caption" sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: '#EA580C' }}>
                        {formatCurrency(c.amount ?? 0)}
                      </Typography>
                    </Box>
                  ))}
                  <Divider sx={{ my: 0.5 }} />
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="caption" sx={{ fontWeight: 700 }}>Total Period Operating Expenses:</Typography>
                    <Typography variant="caption" sx={{ fontWeight: 800, color: '#EA580C', fontVariantNumeric: 'tabular-nums' }}>
                      {formatCurrency(operatingExpenses)}
                    </Typography>
                  </Box>
                </Stack>
              )}
            </Paper>
          </Box>
        </Grid>
      </Grid>
    </Box>
  );
}
