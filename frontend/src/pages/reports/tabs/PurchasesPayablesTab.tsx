import { useState, useMemo } from 'react';
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
  TextField,
  MenuItem,
  InputAdornment,
  Chip,
  Skeleton,
  Stack,
  Tooltip,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import AssignmentReturnIcon from '@mui/icons-material/AssignmentReturn';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { formatCurrency } from '@/utils';
import { usePurchasingPayables } from '@/hooks/useReports';

export function PurchasesPayablesTab() {
  const { data, isLoading } = usePurchasingPayables();

  const [searchTerm, setSearchTerm] = useState('');
  const [balanceFilter, setBalanceFilter] = useState<'ALL' | 'HAS_BALANCE' | 'CLEARED'>('ALL');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);

  const supplierList = useMemo(() => {
    return data?.supplierLedger || data?.supplier_ledger || [];
  }, [data]);

  const filteredSuppliers = useMemo(() => {
    return supplierList.filter((s) => {
      const search = searchTerm.toLowerCase();
      const name = (s.supplierName || s.supplier_name || '').toLowerCase();
      const phone = (s.phone || '').toLowerCase();
      const matchSearch = !search || name.includes(search) || phone.includes(search);
      if (!matchSearch) return false;

      const balance = s.outstandingBalance ?? s.outstanding_balance ?? 0;
      if (balanceFilter === 'HAS_BALANCE' && balance <= 0) return false;
      if (balanceFilter === 'CLEARED' && balance > 0) return false;

      return true;
    });
  }, [supplierList, searchTerm, balanceFilter]);

  const paginatedSuppliers = useMemo(() => {
    const start = page * rowsPerPage;
    return filteredSuppliers.slice(start, start + rowsPerPage);
  }, [filteredSuppliers, page, rowsPerPage]);

  const supplierTotals = useMemo(() => {
    let orders = 0;
    let gross = 0;
    let disc = 0;
    let charges = 0;
    let net = 0;
    let paid = 0;
    let bal = 0;
    filteredSuppliers.forEach((s) => {
      orders += s.orderCount ?? s.order_count ?? 0;
      gross += s.grossPurchases ?? s.gross_purchases ?? 0;
      disc += s.discounts ?? 0;
      charges += s.additionalCharges ?? s.additional_charges ?? 0;
      net += s.netPurchases ?? s.net_purchases ?? 0;
      paid += s.amountPaid ?? s.amount_paid ?? 0;
      bal += s.outstandingBalance ?? s.outstanding_balance ?? 0;
    });
    return { orders, gross, disc, charges, net, paid, bal };
  }, [filteredSuppliers]);

  if (isLoading || !data) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <Grid container spacing={2}>
          {Array.from({ length: 5 }).map((_, i) => (
            <Grid size={{ xs: 12, sm: 6, md: 2.4 }} key={i}>
              <Skeleton variant="rounded" height={100} sx={{ borderRadius: 2.5 }} />
            </Grid>
          ))}
        </Grid>
        <Skeleton variant="rounded" height={420} sx={{ borderRadius: 3 }} />
      </Box>
    );
  }

  const aging = data.apAging || data.ap_aging || ({} as any);
  const cur30 = aging.current_0_30 ?? aging.current0To30 ?? 0;
  const age60 = aging.aging_31_60 ?? aging.aging31To60 ?? 0;
  const age90 = aging.aging_61_90 ?? aging.aging61To90 ?? 0;
  const over90 = aging.over_90 ?? aging.over90 ?? 0;

  const totalOutstandingAp = data.totalOutstandingAp ?? data.total_outstanding_ap ?? aging.totalAp ?? aging.total_ap ?? 0;
  const grossPurchases = data.grossPurchases ?? data.gross_purchases ?? 0;
  const purchaseDiscounts = data.purchaseDiscounts ?? data.purchase_discounts ?? 0;
  const additionalCharges = data.additionalCharges ?? data.additional_charges ?? 0;
  const netPurchases = data.netPurchases ?? data.net_purchases ?? 0;
  const totalPurchaseReturnsValue = data.totalPurchaseReturnsValue ?? data.total_purchase_returns_value ?? 0;
  const totalReturnRefundsReceived = data.totalReturnRefundsReceived ?? data.total_return_refunds_received ?? 0;
  const totalSupplierReceivables = data.totalSupplierReceivables ?? data.total_supplier_receivables ?? 0;
  const returnsLedger = data.returnsLedger || data.returns_ledger || [];

  const totalApDenom = totalOutstandingAp > 0 ? totalOutstandingAp : 1;
  const pctCurrent = Math.round((cur30 / totalApDenom) * 100);
  const pct31_60 = Math.round((age60 / totalApDenom) * 100);
  const pct61_90 = Math.round((age90 / totalApDenom) * 100);
  const pctOver90 = Math.round((over90 / totalApDenom) * 100);

  const kpis = [
    {
      label: 'Gross Purchases',
      value: grossPurchases,
      subtitle: 'PO subtotal before adjustments',
      tooltip: 'Total value of all merchandise ordered on purchase orders before discounts or freight.',
      color: '#0284C7',
      bg: 'rgba(2, 132, 199, 0.08)',
    },
    {
      label: 'PO Discounts',
      value: purchaseDiscounts,
      isNegative: true,
      subtitle: 'Negotiated trade discounts',
      tooltip: 'Discounts negotiated with suppliers on purchase orders.',
      color: '#10B981',
      bg: 'rgba(16, 185, 129, 0.08)',
    },
    {
      label: 'Freight & Charges',
      value: additionalCharges,
      subtitle: 'Transportation & unloading',
      tooltip: 'Added transportation, freight, customs, or unloading charges incurred on purchase orders.',
      color: '#F59E0B',
      bg: 'rgba(245, 158, 11, 0.08)',
    },
    {
      label: 'Net Purchases',
      value: netPurchases,
      subtitle: 'Net procurement obligation',
      tooltip: 'Total net purchase obligation across all POs (Gross Purchases minus Discounts plus Freight).',
      color: '#6366F1',
      bg: 'rgba(99, 102, 241, 0.08)',
    },
    {
      label: 'Total AP Owed',
      value: totalOutstandingAp,
      subtitle: 'Unpaid vendor bills (AP liability)',
      tooltip: 'Total Accounts Payable (AP) Owed: The total money your store owes to suppliers for received or confirmed purchase orders (Total PO Value minus supplier payments already disbursed). It represents your outstanding vendor liability.',
      color: totalOutstandingAp > 0 ? '#F43F5E' : '#10B981',
      bg: totalOutstandingAp > 0 ? 'rgba(244, 63, 94, 0.08)' : 'rgba(16, 185, 129, 0.08)',
    },
  ];

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* 1. PROCUREMENT & AP OVERVIEW KPIS */}
      <Grid container spacing={2}>
        {kpis.map((kpi, idx) => (
          <Grid size={{ xs: 12, sm: 6, md: 2.4 }} key={idx}>
            <Paper
              elevation={0}
              sx={{
                p: 2,
                borderRadius: 2.5,
                border: '1px solid',
                borderColor: 'divider',
                backgroundColor: kpi.bg,
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
                {kpi.isNegative && kpi.value > 0 ? `-${formatCurrency(kpi.value)}` : formatCurrency(kpi.value)}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                {kpi.subtitle}
              </Typography>
            </Paper>
          </Grid>
        ))}
      </Grid>

      {/* 2. ACCOUNTS PAYABLE AGING PROGRESS BAR */}
      <Paper
        elevation={0}
        sx={{
          p: 3,
          borderRadius: 3,
          border: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                  Accounts Payable (AP) Aging Breakdown
                </Typography>
                <Tooltip
                  title="Accounts Payable (AP) Aging categorizes unpaid vendor obligations by age: Current (0–30 days), Due (31–60 days), Overdue (61–90 days), and Critical Overdue (>90 days). Helps prioritize cash disbursements and avoid supplier credit holds."
                  arrow
                >
                  <InfoOutlinedIcon sx={{ fontSize: 16, color: 'text.secondary', cursor: 'pointer' }} />
                </Tooltip>
              </Box>
              <Typography variant="caption" color="text.secondary">
                Total Outstanding Vendor Debt: {formatCurrency(totalOutstandingAp)}
              </Typography>
            </Box>
          </Box>
          <Chip
            icon={totalOutstandingAp === 0 ? <CheckCircleIcon /> : <WarningAmberIcon />}
            label={totalOutstandingAp === 0 ? 'All Cleared' : `${pctOver90}% Critical Overdue`}
            color={totalOutstandingAp === 0 ? 'success' : pctOver90 > 20 ? 'error' : 'warning'}
            size="small"
            variant="outlined"
          />
        </Box>

        {/* Multi-segmented Aging Bar */}
        <Box sx={{ width: '100%', height: 10, borderRadius: 2, display: 'flex', overflow: 'hidden', bgcolor: 'divider', mb: 2 }}>
          {cur30 > 0 && (
            <Tooltip title={`0-30 Days (Current): ${formatCurrency(cur30)} (${pctCurrent}%)`}>
              <Box sx={{ width: `${pctCurrent}%`, bgcolor: '#10B981', transition: 'width 0.3s' }} />
            </Tooltip>
          )}
          {age60 > 0 && (
            <Tooltip title={`31-60 Days (Due): ${formatCurrency(age60)} (${pct31_60}%)`}>
              <Box sx={{ width: `${pct31_60}%`, bgcolor: '#EAB308', transition: 'width 0.3s' }} />
            </Tooltip>
          )}
          {age90 > 0 && (
            <Tooltip title={`61-90 Days (Overdue): ${formatCurrency(age90)} (${pct61_90}%)`}>
              <Box sx={{ width: `${pct61_90}%`, bgcolor: '#F97316', transition: 'width 0.3s' }} />
            </Tooltip>
          )}
          {over90 > 0 && (
            <Tooltip title={`>90 Days (Critical Overdue): ${formatCurrency(over90)} (${pctOver90}%)`}>
              <Box sx={{ width: `${pctOver90}%`, bgcolor: '#EF4444', transition: 'width 0.3s' }} />
            </Tooltip>
          )}
        </Box>

        {/* Compact Aging Metrics Strip */}
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: '#10B981', flexShrink: 0 }} />
            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>Current (0–30d)</Typography>
              <Typography variant="body2" sx={{ fontWeight: 700, color: '#047857', fontVariantNumeric: 'tabular-nums' }}>
                {formatCurrency(cur30)} ({pctCurrent}%)
              </Typography>
            </Box>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: '#EAB308', flexShrink: 0 }} />
            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>Due (31–60d)</Typography>
              <Typography variant="body2" sx={{ fontWeight: 700, color: '#A16207', fontVariantNumeric: 'tabular-nums' }}>
                {formatCurrency(age60)} ({pct31_60}%)
              </Typography>
            </Box>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: '#F97316', flexShrink: 0 }} />
            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>Overdue (61–90d)</Typography>
              <Typography variant="body2" sx={{ fontWeight: 700, color: '#C2410C', fontVariantNumeric: 'tabular-nums' }}>
                {formatCurrency(age90)} ({pct61_90}%)
              </Typography>
            </Box>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: '#EF4444', flexShrink: 0 }} />
            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>Critical (&gt;90d)</Typography>
              <Typography variant="body2" sx={{ fontWeight: 800, color: '#B91C1C', fontVariantNumeric: 'tabular-nums' }}>
                {formatCurrency(over90)} ({pctOver90}%)
              </Typography>
            </Box>
          </Box>
        </Box>
      </Paper>

      {/* 3. SUPPLIER LEDGER & BILL RECONCILIATION TABLE */}
      <Paper
        elevation={0}
        sx={{
          p: 3,
          borderRadius: 3,
          border: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 2, mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <LocalShippingIcon sx={{ color: '#0284C7' }} />
            <Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                Supplier Ledger & Balance Reconciliation
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Audit trail of purchase orders, payments, and unpaid balances
              </Typography>
            </Box>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <TextField
              size="small"
              placeholder="Search supplier..."
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setPage(0); }}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon fontSize="small" />
                    </InputAdornment>
                  ),
                },
              }}
              sx={{ width: 200 }}
            />

            <TextField
              select
              size="small"
              value={balanceFilter}
              onChange={(e) => { setBalanceFilter(e.target.value as any); setPage(0); }}
              sx={{ minWidth: 150 }}
            >
              <MenuItem value="ALL">All Suppliers</MenuItem>
              <MenuItem value="HAS_BALANCE">Has Balance Due</MenuItem>
              <MenuItem value="CLEARED">Cleared / Zero Balance</MenuItem>
            </TextField>
          </Box>
        </Box>

        <TableContainer sx={{ maxHeight: 420 }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 700, width: 45 }}>#</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Supplier Name</TableCell>
                <TableCell align="center" sx={{ fontWeight: 700 }}>Orders</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>Gross PO</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>Discounts</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>Freight/Charges</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>Net PO Total</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>Amount Paid</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>Balance Due</TableCell>
                <TableCell align="center" sx={{ fontWeight: 700 }}>Aging Status</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {paginatedSuppliers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} align="center" sx={{ py: 6, color: 'text.secondary' }}>
                    No supplier records found matching the filter.
                  </TableCell>
                </TableRow>
              ) : (
                paginatedSuppliers.map((s, idx) => {
                  const sId = s.supplierId || s.supplier_id || '';
                  const sName = s.supplierName || s.supplier_name || 'Unknown Supplier';
                  const pan = s.panNumber || s.pan_number || '';
                  const orderCount = s.orderCount ?? s.order_count ?? 0;
                  const gross = s.grossPurchases ?? s.gross_purchases ?? 0;
                  const disc = s.discounts ?? 0;
                  const charges = s.additionalCharges ?? s.additional_charges ?? 0;
                  const net = s.netPurchases ?? s.net_purchases ?? 0;
                  const paid = s.amountPaid ?? s.amount_paid ?? 0;
                  const bal = s.outstandingBalance ?? s.outstanding_balance ?? 0;
                  const sAging = s.aging || ({} as any);
                  const sOver90 = sAging.over_90 ?? sAging.over90 ?? 0;
                  const sAge90 = sAging.aging_61_90 ?? sAging.aging61To90 ?? 0;
                  const sAge60 = sAging.aging_31_60 ?? sAging.aging31To60 ?? 0;

                  let agingBadge = <Chip label="Cleared" size="small" color="success" variant="outlined" />;
                  if (bal > 0) {
                    if (sOver90 > 0) {
                      agingBadge = <Chip label=">90d Critical" size="small" color="error" />;
                    } else if (sAge90 > 0) {
                      agingBadge = <Chip label="61-90d Overdue" size="small" color="warning" />;
                    } else if (sAge60 > 0) {
                      agingBadge = <Chip label="31-60d Due" size="small" sx={{ bgcolor: 'rgba(234, 179, 8, 0.15)', color: '#A16207' }} />;
                    } else {
                      agingBadge = <Chip label="<30d Current" size="small" color="info" variant="outlined" />;
                    }
                  }

                  return (
                    <TableRow key={sId || sName} hover>
                      <TableCell sx={{ fontWeight: 600, color: 'text.secondary', width: 45 }}>
                        {page * rowsPerPage + idx + 1}
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>{sName}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {pan ? `PAN: ${pan}` : s.phone || 'No contact'}
                        </Typography>
                      </TableCell>
                      <TableCell align="center">
                        <Chip label={`${orderCount} POs`} size="small" sx={{ fontSize: '0.75rem' }} />
                      </TableCell>
                      <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                        {formatCurrency(gross)}
                      </TableCell>
                      <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', color: '#10B981' }}>
                        {disc > 0 ? `-${formatCurrency(disc)}` : '—'}
                      </TableCell>
                      <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', color: '#F59E0B' }}>
                        {charges > 0 ? `+${formatCurrency(charges)}` : '—'}
                      </TableCell>
                      <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                        {formatCurrency(net)}
                      </TableCell>
                      <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', color: '#047857' }}>
                        {formatCurrency(paid)}
                      </TableCell>
                      <TableCell
                        align="right"
                        sx={{
                          fontVariantNumeric: 'tabular-nums',
                          fontWeight: 700,
                          color: bal > 0 ? '#F43F5E' : '#10B981',
                        }}
                      >
                        {formatCurrency(bal)}
                      </TableCell>
                      <TableCell align="center">{agingBadge}</TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
            {filteredSuppliers.length > 0 && (
              <TableFooter sx={{ position: 'sticky', bottom: 0, zIndex: 2 }}>
                <TableRow
                  sx={{
                    bgcolor: (theme) => (theme.palette.mode === 'dark' ? 'grey.900' : '#f8fafc'),
                    '& td': {
                      fontWeight: 800,
                      borderTop: '2px solid',
                      borderColor: 'divider',
                      bgcolor: (theme) => (theme.palette.mode === 'dark' ? 'grey.900' : '#f8fafc'),
                    },
                  }}
                >
                  <TableCell>—</TableCell>
                  <TableCell sx={{ fontWeight: 800 }}>Total ({filteredSuppliers.length} Suppliers)</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 800 }}>
                    <Chip label={`${supplierTotals.orders} POs`} size="small" sx={{ fontWeight: 800 }} />
                  </TableCell>
                  <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 800 }}>
                    {formatCurrency(supplierTotals.gross)}
                  </TableCell>
                  <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 800, color: '#10B981' }}>
                    {supplierTotals.disc > 0 ? `-${formatCurrency(supplierTotals.disc)}` : 'Rs. 0.00'}
                  </TableCell>
                  <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 800, color: '#F59E0B' }}>
                    {supplierTotals.charges > 0 ? `+${formatCurrency(supplierTotals.charges)}` : 'Rs. 0.00'}
                  </TableCell>
                  <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 800 }}>
                    {formatCurrency(supplierTotals.net)}
                  </TableCell>
                  <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 800, color: '#047857' }}>
                    {formatCurrency(supplierTotals.paid)}
                  </TableCell>
                  <TableCell
                    align="right"
                    sx={{
                      fontVariantNumeric: 'tabular-nums',
                      fontWeight: 800,
                      color: supplierTotals.bal > 0 ? '#F43F5E' : '#10B981',
                    }}
                  >
                    {formatCurrency(supplierTotals.bal)}
                  </TableCell>
                  <TableCell align="center">—</TableCell>
                </TableRow>
              </TableFooter>
            )}
          </Table>
        </TableContainer>

        <TablePagination
          component="div"
          count={filteredSuppliers.length}
          page={page}
          onPageChange={(_, newPage) => setPage(newPage)}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={(e) => {
            setRowsPerPage(parseInt(e.target.value, 10));
            setPage(0);
          }}
          rowsPerPageOptions={[10, 25, 50]}
        />
      </Paper>

      {/* 4. PURCHASE RETURNS & OPEN SUPPLIER RECEIVABLES (CREDIT NOTES) */}
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
            <AssignmentReturnIcon sx={{ color: '#7C3AED' }} />
            <Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                Purchase Returns & Supplier Receivables (Debit Notes)
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Damaged/expired goods returned to vendors and pending cash/cheque refunds
              </Typography>
            </Box>
          </Box>

          <Stack direction="row" spacing={2}>
            <Box sx={{ textAlign: 'right' }}>
              <Typography variant="caption" color="text.secondary">Total Returns Recorded</Typography>
              <Typography variant="body2" sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                {formatCurrency(totalPurchaseReturnsValue)}
              </Typography>
            </Box>
            <Box sx={{ textAlign: 'right' }}>
              <Typography variant="caption" color="text.secondary">Refunds Collected</Typography>
              <Typography variant="body2" sx={{ fontWeight: 700, color: '#10B981', fontVariantNumeric: 'tabular-nums' }}>
                {formatCurrency(totalReturnRefundsReceived)}
              </Typography>
            </Box>
            <Box sx={{ textAlign: 'right' }}>
              <Typography variant="caption" color="text.secondary">Open Receivables</Typography>
              <Typography variant="body2" sx={{ fontWeight: 800, color: '#7C3AED', fontVariantNumeric: 'tabular-nums' }}>
                {formatCurrency(totalSupplierReceivables)}
              </Typography>
            </Box>
          </Stack>
        </Box>

        <TableContainer sx={{ maxHeight: 300 }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 700, width: 45 }}>#</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Return #</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Return Date</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Supplier</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>PO Reference</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>Total Value</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>Refund Received</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>Pending Refund</TableCell>
                <TableCell align="center" sx={{ fontWeight: 700 }}>Settlement</TableCell>
                <TableCell align="center" sx={{ fontWeight: 700 }}>Status</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {returnsLedger.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                    No purchase return credit notes recorded in this period.
                  </TableCell>
                </TableRow>
              ) : (
                returnsLedger.map((ret, idx) => {
                  const retId = ret.returnId || ret.return_id || '';
                  const retNumber = ret.returnNumber || ret.return_number || '';
                  const retDate = ret.returnDate || ret.return_date || '';
                  const supName = ret.supplierName || ret.supplier_name || 'Vendor';
                  const poRef = ret.orderNumber || ret.order_number || '';
                  const totVal = ret.totalAmount ?? ret.total_amount ?? 0;
                  const refRec = ret.amountReceived ?? ret.amount_received ?? 0;
                  const pendRec = ret.pendingReceivable ?? ret.pending_receivable ?? 0;
                  const setType = ret.settlementType || ret.settlement_type || 'cash';
                  const status = ret.status || 'completed';

                  return (
                    <TableRow key={retId || retNumber} hover>
                      <TableCell sx={{ fontWeight: 600, color: 'text.secondary', width: 45 }}>
                        {idx + 1}
                      </TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>{retNumber}</TableCell>
                      <TableCell>{retDate}</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>{supName}</TableCell>
                      <TableCell>{poRef || '—'}</TableCell>
                      <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                        {formatCurrency(totVal)}
                      </TableCell>
                      <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', color: '#10B981' }}>
                        {formatCurrency(refRec)}
                      </TableCell>
                      <TableCell
                        align="right"
                        sx={{
                          fontVariantNumeric: 'tabular-nums',
                          fontWeight: 700,
                          color: pendRec > 0 ? '#7C3AED' : 'text.secondary',
                        }}
                      >
                        {formatCurrency(pendRec)}
                      </TableCell>
                      <TableCell align="center">
                        <Chip
                          label={setType}
                          size="small"
                          variant="outlined"
                          sx={{ textTransform: 'capitalize', fontSize: '0.75rem' }}
                        />
                      </TableCell>
                      <TableCell align="center">
                        <Chip
                          label={status}
                          size="small"
                          color={status === 'completed' ? 'success' : status === 'approved' ? 'info' : 'default'}
                          sx={{ textTransform: 'capitalize', fontSize: '0.75rem' }}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Box>
  );
}

