import { useMemo } from 'react';
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
  Skeleton,
  Stack,
  Divider,
  Button,
} from '@mui/material';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import TodayIcon from '@mui/icons-material/Today';
import { useNavigate } from 'react-router-dom';
import { formatCurrency } from '@/utils';
import { useCashFlowStatement } from '@/hooks/useReports';

export function CashFlowLiquidityTab() {
  const navigate = useNavigate();
  const { data, isLoading } = useCashFlowStatement();

  const walletsList = useMemo(() => {
    return data?.wallets || [];
  }, [data]);

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

  const netCashFlow = data.netCashFlow ?? data.net_cash_flow ?? (totalInflows - totalOutflows);
  const isSurplus = netCashFlow >= 0;

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

      {/* 2. DUAL-COLUMN CASH INFLOWS VS OUTFLOWS STATEMENT */}
      <Grid container spacing={3}>
        {/* Inflows Column */}
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

        {/* Outflows Column */}
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

      {/* 3. MULTI-WALLET LIQUIDITY & MOVEMENT LEDGER */}
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
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                Live Wallet Balances & Period Movements
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Audit trail across physical cash registers, bank accounts, and merchant wallets
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
                <TableCell sx={{ fontWeight: 700 }}>Wallet Account</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>Opening Balance</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>Period Inflows</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>Period Outflows</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>Net Movement</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>Closing Balance</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {walletsList.map((w) => {
                const openBal = w.openingBalance ?? w.opening_balance ?? 0;
                const wInflows = w.totalInflows ?? w.total_inflows ?? 0;
                const wOutflows = w.totalOutflows ?? w.total_outflows ?? 0;
                const wNet = w.netMovement ?? w.net_movement ?? 0;
                const closeBal = w.closingBalance ?? w.closing_balance ?? 0;

                return (
                  <TableRow key={w.wallet} hover>
                    <TableCell sx={{ fontWeight: 600, textTransform: 'capitalize' }}>
                      {w.wallet === 'cash' ? '💵 Cash in Till' : w.wallet === 'bank' ? '🏦 Bank Operating Account' : `📱 ${w.wallet} Merchant Wallet`}
                    </TableCell>
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
          </Table>
        </TableContainer>
      </Paper>
    </Box>
  );
}

