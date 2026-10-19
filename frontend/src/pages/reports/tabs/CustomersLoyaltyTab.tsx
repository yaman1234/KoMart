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

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* Loyalty KPI Cards */}
      <Grid container spacing={2}>
        <Grid size={{ xs: 6, sm: 3 }}>
          <Paper elevation={0} sx={{ p: 2, borderRadius: 2.5, border: '1px solid', borderColor: 'divider', bgcolor: 'rgba(99, 102, 241, 0.08)' }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>Total Members</Typography>
            <Typography variant="h6" sx={{ fontWeight: 700, color: '#4338CA', mt: 0.5 }}>
              {loyaltySummary?.totalMembers?.toLocaleString() ?? '—'}
            </Typography>
          </Paper>
        </Grid>
        <Grid size={{ xs: 6, sm: 3 }}>
          <Paper elevation={0} sx={{ p: 2, borderRadius: 2.5, border: '1px solid', borderColor: 'divider', bgcolor: 'rgba(16, 185, 129, 0.08)' }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>Active Members</Typography>
            <Typography variant="h6" sx={{ fontWeight: 700, color: '#047857', mt: 0.5 }}>
              {loyaltySummary?.activeMembers?.toLocaleString() ?? '—'}
            </Typography>
          </Paper>
        </Grid>
        <Grid size={{ xs: 6, sm: 3 }}>
          <Paper elevation={0} sx={{ p: 2, borderRadius: 2.5, border: '1px solid', borderColor: 'divider', bgcolor: 'rgba(2, 132, 199, 0.08)' }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>New Customers</Typography>
            <Typography variant="h6" sx={{ fontWeight: 700, color: '#0284C7', mt: 0.5 }}>
              {loyaltySummary?.newCustomers?.toLocaleString() ?? '—'}
            </Typography>
          </Paper>
        </Grid>
        <Grid size={{ xs: 6, sm: 3 }}>
          <Paper elevation={0} sx={{ p: 2, borderRadius: 2.5, border: '1px solid', borderColor: 'divider', bgcolor: 'rgba(245, 158, 11, 0.08)' }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>Points Redeemed</Typography>
            <Typography variant="h6" sx={{ fontWeight: 700, color: '#B45309', mt: 0.5 }}>
              {loyaltySummary?.pointsRedeemed?.toLocaleString() ?? '—'}
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
                topCustomers.map((c, i) => (
                  <TableRow key={c.customerId} hover>
                    <TableCell>{i + 1}</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>{c.customerName}</TableCell>
                    <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                      {c.transactionCount}
                    </TableCell>
                    <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: '#047857' }}>
                      {formatCurrency(c.totalSpent)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Box>
  );
}
