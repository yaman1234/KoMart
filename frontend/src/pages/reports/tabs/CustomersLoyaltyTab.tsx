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
  InputAdornment,
  Skeleton,
} from '@mui/material';
import PeopleAltIcon from '@mui/icons-material/PeopleAlt';
import SearchIcon from '@mui/icons-material/Search';
import { formatCurrency } from '@/utils';
import { useTopCustomers, useLoyaltySummary } from '@/hooks/useReports';

export function CustomersLoyaltyTab() {
  const { data: topCustomers = [], isLoading: isTopLoading } = useTopCustomers();
  const { data: loyaltySummary, isLoading: isLoyaltyLoading } = useLoyaltySummary();

  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  const filteredCustomers = useMemo(() => {
    return topCustomers.filter((c: any) => {
      const q = searchTerm.toLowerCase();
      if (!q) return true;
      const name = (c.customerName || c.customer_name || '').toLowerCase();
      const phone = (c.phone || c.customerPhone || '').toLowerCase();
      return name.includes(q) || phone.includes(q);
    });
  }, [topCustomers, searchTerm]);

  const paginatedCustomers = useMemo(() => {
    const start = page * rowsPerPage;
    return filteredCustomers.slice(start, start + rowsPerPage);
  }, [filteredCustomers, page, rowsPerPage]);

  const customerTotals = useMemo(() => {
    let tx = 0;
    let spent = 0;
    filteredCustomers.forEach((c: any) => {
      tx += c.transactionCount ?? c.transaction_count ?? 0;
      spent += c.totalSpent ?? c.total_spent ?? 0;
    });
    const avg = tx > 0 ? spent / tx : 0;
    return { count: filteredCustomers.length, tx, spent, avg };
  }, [filteredCustomers]);

  if (isTopLoading && isLoyaltyLoading) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <Grid container spacing={2}>
          {Array.from({ length: 4 }).map((_, i) => (
            <Grid size={{ xs: 6, sm: 3 }} key={i}>
              <Skeleton variant="rounded" height={90} sx={{ borderRadius: 2 }} />
            </Grid>
          ))}
        </Grid>
        <Skeleton variant="rounded" height={380} sx={{ borderRadius: 3 }} />
      </Box>
    );
  }

  const ls = (loyaltySummary || {}) as any;
  const totalMembers = ls.totalMembers ?? ls.total_members;
  const activeMembers = ls.activeMembers ?? ls.active_members;
  const newCustomers = ls.newCustomers ?? ls.new_customers;
  const pointsRedeemed = ls.pointsRedeemed ?? ls.points_redeemed;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* Loyalty KPI Cards */}
      <Grid container spacing={2}>
        <Grid size={{ xs: 6, sm: 3 }}>
          <Paper elevation={0} sx={{ p: 2, borderRadius: 2.5, border: '1px solid', borderColor: 'divider', bgcolor: 'rgba(99, 102, 241, 0.08)' }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>Total Members</Typography>
            <Typography variant="h6" sx={{ fontWeight: 700, color: '#4338CA', mt: 0.5 }}>
              {totalMembers !== undefined ? Number(totalMembers).toLocaleString() : '—'}
            </Typography>
          </Paper>
        </Grid>
        <Grid size={{ xs: 6, sm: 3 }}>
          <Paper elevation={0} sx={{ p: 2, borderRadius: 2.5, border: '1px solid', borderColor: 'divider', bgcolor: 'rgba(16, 185, 129, 0.08)' }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>Active Members</Typography>
            <Typography variant="h6" sx={{ fontWeight: 700, color: '#047857', mt: 0.5 }}>
              {activeMembers !== undefined ? Number(activeMembers).toLocaleString() : '—'}
            </Typography>
          </Paper>
        </Grid>
        <Grid size={{ xs: 6, sm: 3 }}>
          <Paper elevation={0} sx={{ p: 2, borderRadius: 2.5, border: '1px solid', borderColor: 'divider', bgcolor: 'rgba(2, 132, 199, 0.08)' }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>New Customers</Typography>
            <Typography variant="h6" sx={{ fontWeight: 700, color: '#0284C7', mt: 0.5 }}>
              {newCustomers !== undefined ? Number(newCustomers).toLocaleString() : '—'}
            </Typography>
          </Paper>
        </Grid>
        <Grid size={{ xs: 6, sm: 3 }}>
          <Paper elevation={0} sx={{ p: 2, borderRadius: 2.5, border: '1px solid', borderColor: 'divider', bgcolor: 'rgba(245, 158, 11, 0.08)' }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>Points Redeemed</Typography>
            <Typography variant="h6" sx={{ fontWeight: 700, color: '#B45309', mt: 0.5 }}>
              {pointsRedeemed !== undefined ? Number(pointsRedeemed).toLocaleString() : '—'}
            </Typography>
          </Paper>
        </Grid>
      </Grid>

      {/* Top Customers Table */}
      <Paper elevation={0} sx={{ p: 3, borderRadius: 3, border: '1px solid', borderColor: 'divider' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2, flexWrap: 'wrap', gap: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <PeopleAltIcon sx={{ color: '#6366F1' }} />
            <Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                Top Customers by Lifetime Spend
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {filteredCustomers.length} loyalty members · Total spend: {formatCurrency(customerTotals.spent)}
              </Typography>
            </Box>
          </Box>

          <TextField
            size="small"
            placeholder="Search by customer name..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setPage(0);
            }}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
                  </InputAdornment>
                ),
              },
            }}
            sx={{ width: 260 }}
          />
        </Box>

        <TableContainer sx={{ maxHeight: 420 }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 700, width: 50 }}>#</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Customer Name</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>Transactions</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>Avg Basket Spend</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>Total Spent</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {paginatedCustomers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                    No customer transaction records found.
                  </TableCell>
                </TableRow>
              ) : (
                paginatedCustomers.map((c: any, i) => {
                  const cId = c.customerId || c.customer_id || `cust-${i}`;
                  const cName = c.customerName || c.customer_name || 'Walk-In Customer';
                  const txCount = c.transactionCount ?? c.transaction_count ?? 0;
                  const totalSpent = c.totalSpent ?? c.total_spent ?? 0;
                  const avgSpend = txCount > 0 ? totalSpent / txCount : 0;

                  return (
                    <TableRow key={cId} hover>
                      <TableCell sx={{ color: 'text.secondary', fontSize: '0.75rem', fontVariantNumeric: 'tabular-nums' }}>
                        {page * rowsPerPage + i + 1}
                      </TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>{cName}</TableCell>
                      <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                        {txCount.toLocaleString()}
                      </TableCell>
                      <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', color: '#6366F1' }}>
                        {formatCurrency(avgSpend)}
                      </TableCell>
                      <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: '#047857' }}>
                        {formatCurrency(totalSpent)}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
            <TableFooter sx={{ position: 'sticky', bottom: 0, bgcolor: 'background.paper', zIndex: 1, boxShadow: '0 -2px 6px rgba(0,0,0,0.06)' }}>
              <TableRow sx={{ '& td': { fontWeight: 800, borderTop: '2px solid', borderColor: 'divider' } }}>
                <TableCell />
                <TableCell>Total ({customerTotals.count} Customers)</TableCell>
                <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                  {customerTotals.tx.toLocaleString()}
                </TableCell>
                <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', color: '#6366F1' }}>
                  {formatCurrency(customerTotals.avg)}
                </TableCell>
                <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', color: '#047857' }}>
                  {formatCurrency(customerTotals.spent)}
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </TableContainer>

        <TablePagination
          component="div"
          count={filteredCustomers.length}
          page={page}
          onPageChange={(_, p) => setPage(p)}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={(e) => {
            setRowsPerPage(parseInt(e.target.value, 10));
            setPage(0);
          }}
          rowsPerPageOptions={[10, 25, 50]}
        />
      </Paper>
    </Box>
  );
}

