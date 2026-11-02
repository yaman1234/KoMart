import { useMemo, useState } from 'react';
import {
  Box,
  Grid,
  Paper,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableFooter,
  TablePagination,
  Skeleton,
  Stack,
  Divider,
  Button,
  TextField,
  MenuItem,
  Chip,
} from '@mui/material';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import TodayIcon from '@mui/icons-material/Today';
import ShowChartIcon from '@mui/icons-material/ShowChart';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import { useNavigate } from 'react-router-dom';
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  Legend,
} from 'recharts';
import { formatCurrency } from '@/utils';
import { useCashFlowStatement } from '@/hooks/useReports';
import { AsOfChip, ReportEmptyState, ReportErrorState } from '@/pages/reports/components';

const WALLET_LABELS: Record<string, string> = {
  cash: 'Cash in Till',
  bank: 'Bank Operating Account',
  esewa: 'eSewa Merchant Wallet',
};

function walletLabel(wallet: string) {
  return WALLET_LABELS[wallet] || wallet;
}

export function CashFlowLiquidityTab() {
  const navigate = useNavigate();
  const { data, isLoading, isError, refetch } = useCashFlowStatement();

  const [dayFilter, setDayFilter] = useState<'ACTIVITY' | 'ALL' | 'SURPLUS' | 'DEFICIT'>('ACTIVITY');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);

  const walletsList = useMemo(() => data?.wallets || [], [data]);

  const walletTotals = useMemo(() => {
    let open = 0;
    let inf = 0;
    let outf = 0;
    let net = 0;
    let close = 0;
    walletsList.forEach((w) => {
      open += w.openingBalance ?? w.opening_balance ?? 0;
      inf += w.totalInflows ?? w.total_inflows ?? 0;
      outf += w.totalOutflows ?? w.total_outflows ?? 0;
      net += w.netMovement ?? w.net_movement ?? 0;
      close += w.closingBalance ?? w.closing_balance ?? 0;
    });
    return { open, inf, outf, net, close };
  }, [walletsList]);

  const movements = useMemo(() => data?.movements ?? [], [data]);

  const movementCountsByDate = useMemo(() => {
    const counts: Record<string, number> = {};
    movements.forEach((row) => {
      const day = row.date;
      counts[day] = (counts[day] || 0) + 1;
    });
    return counts;
  }, [movements]);

  const walletSplitByDate = useMemo(() => {
    const map: Record<string, { cashIn: number; cashOut: number; bankIn: number; bankOut: number; esewaIn: number; esewaOut: number }> = {};
    movements.forEach((row) => {
      const day = row.date;
      if (!map[day]) {
        map[day] = { cashIn: 0, cashOut: 0, bankIn: 0, bankOut: 0, esewaIn: 0, esewaOut: 0 };
      }
      const bucket = map[day];
      const amt = row.amount || 0;
      const isIn = row.direction === 'in';
      if (row.wallet === 'cash') {
        if (isIn) bucket.cashIn += amt;
        else bucket.cashOut += amt;
      } else if (row.wallet === 'bank') {
        if (isIn) bucket.bankIn += amt;
        else bucket.bankOut += amt;
      } else if (row.wallet === 'esewa') {
        if (isIn) bucket.esewaIn += amt;
        else bucket.esewaOut += amt;
      }
    });
    return map;
  }, [movements]);

  const dailyTrend = useMemo(() => {
    const raw = data?.dailyTrend ?? data?.daily_trend ?? [];
    return raw.map((d) => {
      const split = walletSplitByDate[d.date];
      return {
        date: d.date,
        inflows: d.inflows ?? 0,
        outflows: d.outflows ?? 0,
        net: d.net ?? (d.inflows ?? 0) - (d.outflows ?? 0),
        label: d.date.slice(5), // MM-DD
        movements: movementCountsByDate[d.date] || 0,
        cashIn: split?.cashIn ?? 0,
        cashOut: split?.cashOut ?? 0,
        bankIn: split?.bankIn ?? 0,
        bankOut: split?.bankOut ?? 0,
        esewaIn: split?.esewaIn ?? 0,
        esewaOut: split?.esewaOut ?? 0,
      };
    });
  }, [data, movementCountsByDate, walletSplitByDate]);

  const dailyRows = useMemo(() => {
    return dailyTrend.filter((row) => {
      const hasActivity = row.inflows > 0 || row.outflows > 0 || row.movements > 0;
      if (dayFilter === 'ACTIVITY') return hasActivity;
      if (dayFilter === 'SURPLUS') return hasActivity && row.net >= 0;
      if (dayFilter === 'DEFICIT') return hasActivity && row.net < 0;
      return true;
    });
  }, [dailyTrend, dayFilter]);

  const pagedDailyRows = useMemo(() => {
    const start = page * rowsPerPage;
    return dailyRows.slice(start, start + rowsPerPage);
  }, [dailyRows, page, rowsPerPage]);

  const dailyTotals = useMemo(() => {
    let inflow = 0;
    let outflow = 0;
    let movementsCount = 0;
    dailyRows.forEach((row) => {
      inflow += row.inflows;
      outflow += row.outflows;
      movementsCount += row.movements;
    });
    return { inflow, outflow, net: inflow - outflow, days: dailyRows.length, movementsCount };
  }, [dailyRows]);

  if (isError && !data) {
    return (
      <ReportErrorState
        title="Could not load Cash Flow & Wallets"
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
          {Array.from({ length: 3 }).map((_, i) => (
            <Grid size={{ xs: 12, sm: 4 }} key={i}>
              <Skeleton variant="rounded" height={105} sx={{ borderRadius: 2.5 }} />
            </Grid>
          ))}
        </Grid>
        <Skeleton variant="rounded" height={280} sx={{ borderRadius: 3 }} />
        <Skeleton variant="rounded" height={400} sx={{ borderRadius: 3 }} />
      </Box>
    );
  }

  const inf = data.inflows || ({} as any);
  const salesCash = inf.salesCash ?? inf.sales_cash ?? 0;
  const salesBank = inf.salesBank ?? inf.sales_bank ?? 0;
  const salesEsewa = inf.salesEsewa ?? inf.sales_esewa ?? 0;
  const supplierRefunds = inf.supplierRefunds ?? inf.supplier_refunds ?? 0;
  const transfersIn = inf.transfersIn ?? inf.transfers_in ?? 0;
  const adjustmentsIn = inf.adjustmentsIn ?? inf.adjustments_in ?? 0;
  const otherInflows = inf.otherInflows ?? inf.other_inflows ?? 0;
  const totalInflows = inf.totalInflows ?? inf.total_inflows ?? 0;

  const outf = data.outflows || ({} as any);
  const supplierPoPayments = outf.supplierPoPayments ?? outf.supplier_po_payments ?? 0;
  const operatingExpenses = outf.operatingExpenses ?? outf.operating_expenses ?? 0;
  const setupInvestment = outf.setupInvestment ?? outf.setup_investment ?? 0;
  const transfersOut = outf.transfersOut ?? outf.transfers_out ?? 0;
  const adjustmentsOut = outf.adjustmentsOut ?? outf.adjustments_out ?? 0;
  const otherOutflows = outf.otherOutflows ?? outf.other_outflows ?? 0;
  const totalOutflows = outf.totalOutflows ?? outf.total_outflows ?? 0;

  const netCashFlow = data.netCashFlow ?? data.net_cash_flow ?? totalInflows - totalOutflows;
  const isSurplus = netCashFlow >= 0;
  const showDailyChart = dailyTrend.length > 1;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* 1. TOP CASH FLOW SUMMARY STRIP */}
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, sm: 4 }}>
          <Paper
            elevation={0}
            sx={{
              p: 2.5,
              borderRadius: 2.5,
              border: '1px solid',
              borderColor: 'divider',
              bgcolor: 'rgba(16, 185, 129, 0.08)',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
              <ArrowDownwardIcon sx={{ color: '#10B981', fontSize: 20 }} />
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                Total Cash Inflows
              </Typography>
            </Box>
            <Typography variant="h5" sx={{ fontWeight: 800, color: '#047857', fontVariantNumeric: 'tabular-nums' }}>
              +{formatCurrency(totalInflows)}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              POS sales, return refunds & collections
            </Typography>
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, sm: 4 }}>
          <Paper
            elevation={0}
            sx={{
              p: 2.5,
              borderRadius: 2.5,
              border: '1px solid',
              borderColor: 'divider',
              bgcolor: 'rgba(244, 63, 94, 0.08)',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
              <ArrowUpwardIcon sx={{ color: '#F43F5E', fontSize: 20 }} />
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                Total Cash Outflows
              </Typography>
            </Box>
            <Typography variant="h5" sx={{ fontWeight: 800, color: '#BE123C', fontVariantNumeric: 'tabular-nums' }}>
              -{formatCurrency(totalOutflows)}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Supplier bills, store overheads & disbursements
            </Typography>
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, sm: 4 }}>
          <Paper
            elevation={0}
            sx={{
              p: 2.5,
              borderRadius: 2.5,
              border: '1px solid',
              borderColor: isSurplus ? '#10B981' : '#F43F5E',
              bgcolor: isSurplus ? 'rgba(13, 148, 136, 0.08)' : 'rgba(244, 63, 94, 0.08)',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
              <AccountBalanceWalletIcon sx={{ color: isSurplus ? '#0D9488' : '#F43F5E', fontSize: 20 }} />
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                Net Cash Flow
              </Typography>
            </Box>
            <Typography
              variant="h5"
              sx={{
                fontWeight: 800,
                color: isSurplus ? '#0F766E' : '#BE123C',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {isSurplus ? `+${formatCurrency(netCashFlow)}` : formatCurrency(netCashFlow)}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {isSurplus ? 'Net Cash Surplus Generated' : 'Net Cash Deficit Funded'}
            </Typography>
          </Paper>
        </Grid>
      </Grid>

      {/* 2. DAILY INFLOW VS OUTFLOW CHART */}
      {showDailyChart ? (
        <Paper
          elevation={0}
          sx={{
            p: 3,
            borderRadius: 3,
            border: '1px solid',
            borderColor: 'divider',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2, flexWrap: 'wrap', gap: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <ShowChartIcon sx={{ color: '#0284C7' }} />
              <Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                    Daily Cash Inflows vs Outflows
                  </Typography>
                  <AsOfChip kind="period" />
                </Box>
                <Typography variant="caption" color="text.secondary">
                  Wallet ledger movements by business day across the selected date filter
                </Typography>
              </Box>
            </Box>
          </Box>
          <Box sx={{ width: '100%', minWidth: 0, height: 280 }}>
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={280}>
              <ComposedChart data={dailyTrend} margin={{ top: 10, right: 16, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={{ stroke: '#E5E7EB' }} />
                <YAxis
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={{ stroke: '#E5E7EB' }}
                  tickFormatter={(v) => `Rs. ${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
                />
                <RechartsTooltip
                  formatter={(val: any, name: any) => [formatCurrency(Number(val) || 0), String(name)]}
                  labelFormatter={(_, payload) => payload?.[0]?.payload?.date || ''}
                />
                <Legend />
                <Bar dataKey="inflows" name="Inflows" fill="#10B981" radius={[3, 3, 0, 0]} maxBarSize={28} />
                <Bar dataKey="outflows" name="Outflows" fill="#F43F5E" radius={[3, 3, 0, 0]} maxBarSize={28} />
                <Line
                  type="monotone"
                  dataKey="net"
                  name="Net"
                  stroke="#0284C7"
                  strokeWidth={2}
                  dot={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </Box>
        </Paper>
      ) : (
        <ReportEmptyState message="Daily inflow/outflow chart needs a multi-day range. Widen the dates above to compare day-by-day cash movement." />
      )}

      {/* 3. DUAL-COLUMN CASH INFLOWS VS OUTFLOWS STATEMENT */}
      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 6 }}>
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
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
              <ArrowDownwardIcon sx={{ color: '#10B981' }} />
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                A. Cash Inflows (Collections)
              </Typography>
            </Box>

            <Stack spacing={1.5} sx={{ flex: 1 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 0.5 }}>
                <Typography variant="body2">POS Register Cash Collections</Typography>
                <Typography variant="body2" sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                  {formatCurrency(salesCash)}
                </Typography>
              </Box>

              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 0.5 }}>
                <Typography variant="body2">POS Card & Bank Swipe Collections</Typography>
                <Typography variant="body2" sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                  {formatCurrency(salesBank)}
                </Typography>
              </Box>

              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 0.5 }}>
                <Typography variant="body2">POS eSewa / Digital Wallet Collections</Typography>
                <Typography variant="body2" sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                  {formatCurrency(salesEsewa)}
                </Typography>
              </Box>

              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 0.5 }}>
                <Typography variant="body2">Supplier Return Refunds Collected</Typography>
                <Typography variant="body2" sx={{ fontWeight: 700, color: '#10B981', fontVariantNumeric: 'tabular-nums' }}>
                  {formatCurrency(supplierRefunds)}
                </Typography>
              </Box>

              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 0.5 }}>
                <Typography variant="body2">Transfers & Adjustments In</Typography>
                <Typography variant="body2" sx={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                  {formatCurrency(transfersIn + adjustmentsIn + otherInflows)}
                </Typography>
              </Box>

              <Divider sx={{ my: 1 }} />

              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  p: 1.5,
                  borderRadius: 1.5,
                  bgcolor: 'rgba(16, 185, 129, 0.08)',
                }}
              >
                <Typography variant="subtitle2" sx={{ fontWeight: 800, color: '#047857' }}>
                  Total Period Cash Inflows
                </Typography>
                <Typography variant="subtitle1" sx={{ fontWeight: 800, color: '#047857', fontVariantNumeric: 'tabular-nums' }}>
                  +{formatCurrency(totalInflows)}
                </Typography>
              </Box>
            </Stack>
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
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
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
              <ArrowUpwardIcon sx={{ color: '#F43F5E' }} />
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                B. Cash Outflows (Disbursements)
              </Typography>
            </Box>

            <Stack spacing={1.5} sx={{ flex: 1 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 0.5 }}>
                <Typography variant="body2">Supplier PO Bill Payments</Typography>
                <Typography variant="body2" sx={{ fontWeight: 700, color: '#F43F5E', fontVariantNumeric: 'tabular-nums' }}>
                  ({formatCurrency(supplierPoPayments)})
                </Typography>
              </Box>

              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 0.5 }}>
                <Typography variant="body2">Operating Expenses (Rent, Utilities, Staff)</Typography>
                <Typography variant="body2" sx={{ fontWeight: 700, color: '#F43F5E', fontVariantNumeric: 'tabular-nums' }}>
                  ({formatCurrency(operatingExpenses)})
                </Typography>
              </Box>

              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 0.5 }}>
                <Typography variant="body2">Setup & Capital Investments</Typography>
                <Typography variant="body2" sx={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                  {setupInvestment > 0 ? `(${formatCurrency(setupInvestment)})` : '—'}
                </Typography>
              </Box>

              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 0.5 }}>
                <Typography variant="body2">Transfers & Adjustments Out</Typography>
                <Typography variant="body2" sx={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                  {transfersOut + adjustmentsOut + otherOutflows > 0
                    ? `(${formatCurrency(transfersOut + adjustmentsOut + otherOutflows)})`
                    : '—'}
                </Typography>
              </Box>

              <Divider sx={{ my: 1 }} />

              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  p: 1.5,
                  borderRadius: 1.5,
                  bgcolor: 'rgba(244, 63, 94, 0.08)',
                }}
              >
                <Typography variant="subtitle2" sx={{ fontWeight: 800, color: '#BE123C' }}>
                  Total Period Cash Outflows
                </Typography>
                <Typography variant="subtitle1" sx={{ fontWeight: 800, color: '#BE123C', fontVariantNumeric: 'tabular-nums' }}>
                  -{formatCurrency(totalOutflows)}
                </Typography>
              </Box>
            </Stack>
          </Paper>
        </Grid>
      </Grid>

      {/* 4. PER-DAY CASH INFLOWS & OUTFLOWS */}
      <Paper
        elevation={0}
        sx={{
          p: 3,
          borderRadius: 3,
          border: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            mb: 2,
            flexWrap: 'wrap',
            gap: 2,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <ReceiptLongIcon sx={{ color: '#0284C7' }} />
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                  Cash Inflows & Outflows Detail
                </Typography>
                <AsOfChip kind="period" />
              </Box>
              <Typography variant="caption" color="text.secondary">
                Daily totals for the selected date filter, with wallet split where ledger lines exist
              </Typography>
            </Box>
          </Box>

          <TextField
            select
            size="small"
            label="Days"
            value={dayFilter}
            onChange={(e) => {
              setDayFilter(e.target.value as typeof dayFilter);
              setPage(0);
            }}
            sx={{ minWidth: 180 }}
          >
            <MenuItem value="ACTIVITY">Days with activity</MenuItem>
            <MenuItem value="ALL">All days in range</MenuItem>
            <MenuItem value="SURPLUS">Surplus days only</MenuItem>
            <MenuItem value="DEFICIT">Deficit days only</MenuItem>
          </TextField>
        </Box>

        {dailyRows.length === 0 ? (
          <ReportEmptyState message="No daily cash activity in the selected date filter." />
        ) : (
          <>
            <TableContainer sx={{ maxHeight: 480 }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700, width: 44 }}>#</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Date</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>
                      Movements
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>
                      Inflows
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>
                      Outflows
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>
                      Net
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>
                      Cash Net
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>
                      Bank Net
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>
                      eSewa Net
                    </TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Result</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {pagedDailyRows.map((row, idx) => {
                    const cashNet = row.cashIn - row.cashOut;
                    const bankNet = row.bankIn - row.bankOut;
                    const esewaNet = row.esewaIn - row.esewaOut;
                    const hasWalletSplit = row.movements > 0;
                    return (
                      <TableRow key={row.date} hover>
                        <TableCell sx={{ color: 'text.secondary', fontSize: '0.75rem', fontVariantNumeric: 'tabular-nums' }}>
                          {page * rowsPerPage + idx + 1}
                        </TableCell>
                        <TableCell sx={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                          {row.date}
                        </TableCell>
                        <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                          {row.movements || '—'}
                        </TableCell>
                        <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', color: '#047857', fontWeight: 700 }}>
                          {row.inflows > 0 ? `+${formatCurrency(row.inflows)}` : formatCurrency(0)}
                        </TableCell>
                        <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', color: '#BE123C', fontWeight: 700 }}>
                          {row.outflows > 0 ? `-${formatCurrency(row.outflows)}` : formatCurrency(0)}
                        </TableCell>
                        <TableCell
                          align="right"
                          sx={{
                            fontVariantNumeric: 'tabular-nums',
                            fontWeight: 800,
                            color: row.net >= 0 ? '#047857' : '#BE123C',
                          }}
                        >
                          {row.net >= 0 ? `+${formatCurrency(row.net)}` : formatCurrency(row.net)}
                        </TableCell>
                        <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', color: cashNet >= 0 ? '#047857' : '#BE123C' }}>
                          {hasWalletSplit ? (cashNet >= 0 ? `+${formatCurrency(cashNet)}` : formatCurrency(cashNet)) : '—'}
                        </TableCell>
                        <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', color: bankNet >= 0 ? '#047857' : '#BE123C' }}>
                          {hasWalletSplit ? (bankNet >= 0 ? `+${formatCurrency(bankNet)}` : formatCurrency(bankNet)) : '—'}
                        </TableCell>
                        <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', color: esewaNet >= 0 ? '#047857' : '#BE123C' }}>
                          {hasWalletSplit ? (esewaNet >= 0 ? `+${formatCurrency(esewaNet)}` : formatCurrency(esewaNet)) : '—'}
                        </TableCell>
                        <TableCell>
                          {row.inflows === 0 && row.outflows === 0 ? (
                            <Chip size="small" label="Quiet" variant="outlined" />
                          ) : (
                            <Chip
                              size="small"
                              label={row.net >= 0 ? 'Surplus' : 'Deficit'}
                              color={row.net >= 0 ? 'success' : 'error'}
                              variant="outlined"
                              sx={{ fontWeight: 600 }}
                            />
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
                <TableFooter sx={{ position: 'sticky', bottom: 0, bgcolor: 'background.paper', zIndex: 1 }}>
                  <TableRow sx={{ '& td': { fontWeight: 800, borderTop: '2px solid', borderColor: 'divider' } }}>
                    <TableCell />
                    <TableCell>
                      Period total ({dailyTotals.days} days)
                    </TableCell>
                    <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                      {dailyTotals.movementsCount || '—'}
                    </TableCell>
                    <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', color: '#047857' }}>
                      +{formatCurrency(dailyTotals.inflow)}
                    </TableCell>
                    <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', color: '#BE123C' }}>
                      -{formatCurrency(dailyTotals.outflow)}
                    </TableCell>
                    <TableCell
                      align="right"
                      sx={{
                        fontVariantNumeric: 'tabular-nums',
                        color: dailyTotals.net >= 0 ? '#047857' : '#BE123C',
                      }}
                    >
                      {dailyTotals.net >= 0 ? `+${formatCurrency(dailyTotals.net)}` : formatCurrency(dailyTotals.net)}
                    </TableCell>
                    <TableCell colSpan={4} />
                  </TableRow>
                </TableFooter>
              </Table>
            </TableContainer>
            <TablePagination
              component="div"
              count={dailyRows.length}
              page={page}
              onPageChange={(_, next) => setPage(next)}
              rowsPerPage={rowsPerPage}
              onRowsPerPageChange={(e) => {
                setRowsPerPage(parseInt(e.target.value, 10));
                setPage(0);
              }}
              rowsPerPageOptions={[25, 50, 100]}
            />
          </>
        )}
      </Paper>

      {/* 5. MULTI-WALLET LIQUIDITY & MOVEMENT LEDGER */}
      <Paper
        elevation={0}
        sx={{
          p: 3,
          borderRadius: 3,
          border: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <AccountBalanceWalletIcon sx={{ color: '#0284C7' }} />
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                  Period Wallet Movements
                </Typography>
                <AsOfChip kind="period" />
              </Box>
              <Typography variant="caption" color="text.secondary">
                Opening → period in/out → closing for till, bank, and merchant wallets. Staff custody float lives on
                Executive Working Capital / Day Book.
              </Typography>
            </Box>
          </Box>

          <Button
            size="small"
            variant="outlined"
            startIcon={<TodayIcon />}
            onClick={() => navigate('/reports/daily')}
          >
            Today's Day Book
          </Button>
        </Box>

        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 700, width: 44 }}>#</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Wallet Account</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>
                  Opening Balance
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>
                  Period Inflows
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>
                  Period Outflows
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>
                  Net Movement
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>
                  Closing Balance
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {walletsList.map((w, idx) => {
                const openBal = w.openingBalance ?? w.opening_balance ?? 0;
                const wInflows = w.totalInflows ?? w.total_inflows ?? 0;
                const wOutflows = w.totalOutflows ?? w.total_outflows ?? 0;
                const wNet = w.netMovement ?? w.net_movement ?? 0;
                const closeBal = w.closingBalance ?? w.closing_balance ?? 0;

                return (
                  <TableRow key={w.wallet} hover>
                    <TableCell sx={{ color: 'text.secondary', fontSize: '0.75rem', fontVariantNumeric: 'tabular-nums' }}>
                      {idx + 1}
                    </TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>{walletLabel(w.wallet)}</TableCell>
                    <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                      {formatCurrency(openBal)}
                    </TableCell>
                    <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', color: '#10B981' }}>
                      +{formatCurrency(wInflows)}
                    </TableCell>
                    <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', color: '#F43F5E' }}>
                      -{formatCurrency(wOutflows)}
                    </TableCell>
                    <TableCell
                      align="right"
                      sx={{
                        fontVariantNumeric: 'tabular-nums',
                        fontWeight: 700,
                        color: wNet >= 0 ? '#10B981' : '#F43F5E',
                      }}
                    >
                      {wNet >= 0 ? `+${formatCurrency(wNet)}` : formatCurrency(wNet)}
                    </TableCell>
                    <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 800, color: '#0284C7' }}>
                      {formatCurrency(closeBal)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
            <TableFooter
              sx={{ position: 'sticky', bottom: 0, bgcolor: 'background.paper', zIndex: 1, boxShadow: '0 -2px 6px rgba(0,0,0,0.06)' }}
            >
              <TableRow sx={{ '& td': { fontWeight: 800, borderTop: '2px solid', borderColor: 'divider' } }}>
                <TableCell />
                <TableCell>Total Liquid Position</TableCell>
                <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                  {formatCurrency(walletTotals.open)}
                </TableCell>
                <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', color: '#10B981' }}>
                  +{formatCurrency(walletTotals.inf)}
                </TableCell>
                <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', color: '#F43F5E' }}>
                  -{formatCurrency(walletTotals.outf)}
                </TableCell>
                <TableCell
                  align="right"
                  sx={{
                    fontVariantNumeric: 'tabular-nums',
                    color: walletTotals.net >= 0 ? '#10B981' : '#F43F5E',
                  }}
                >
                  {walletTotals.net >= 0 ? `+${formatCurrency(walletTotals.net)}` : formatCurrency(walletTotals.net)}
                </TableCell>
                <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', color: '#0284C7' }}>
                  {formatCurrency(walletTotals.close)}
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </TableContainer>
      </Paper>
    </Box>
  );
}
