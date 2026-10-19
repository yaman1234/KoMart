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
} from '@mui/material';
import PeopleAltIcon from '@mui/icons-material/PeopleAlt';
import { formatCurrency } from '@/utils';
import { useTopCustomers, useLoyaltySummary } from '@/hooks/useReports';

export function CustomersLoyaltyTab() {
  const { data: topCustomers = [], isLoading: isTopLoading } = useTopCustomers();
  const { data: loyaltySummary, isLoading: isLoyaltyLoading } = useLoyaltySummary();

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
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <PeopleAltIcon sx={{ color: '#6366F1' }} />
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            Top Customers by Lifetime Spend
          </Typography>
        </Box>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 700, width: 60 }}>#</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Customer Name</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>Transactions</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>Total Spent</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {topCustomers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                    No customer transaction records found.
                  </TableCell>
                </TableRow>
              ) : (
                topCustomers.map((c: any, i) => {
                  const cId = c.customerId || c.customer_id || `cust-${i}`;
                  const cName = c.customerName || c.customer_name || 'Walk-In Customer';
                  const txCount = c.transactionCount ?? c.transaction_count ?? 0;
                  const totalSpent = c.totalSpent ?? c.total_spent ?? 0;

                  return (
                    <TableRow key={cId} hover>
                      <TableCell>{i + 1}</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>{cName}</TableCell>
                      <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                        {txCount.toLocaleString()}
                      </TableCell>
                      <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: '#047857' }}>
                        {formatCurrency(totalSpent)}
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

