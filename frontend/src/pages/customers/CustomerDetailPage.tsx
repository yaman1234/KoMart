import {
  Box,
  Grid,
  Paper,
  Typography,
  Chip,
  Divider,
  CircularProgress,
  Alert,
  Button,
  LinearProgress,
  Avatar,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '@/components/common/PageHeader';
import { DataTable, type Column } from '@/components/tables/DataTable';
import { useCustomer, useCustomerTransactions } from '@/hooks/useCustomers';
import { formatCurrency, formatDate, getInitials } from '@/utils';
import { MEMBERSHIP_TIER_LABELS } from '@/constants';
import type { Transaction, MembershipTier } from '@/types';

const TIER_COLORS: Record<MembershipTier, 'default' | 'warning' | 'info' | 'primary'> = {
  bronze: 'default', silver: 'info', gold: 'warning', platinum: 'primary',
};

const PROGRESS_COLOR: Record<MembershipTier, 'primary' | 'info' | 'warning'> = {
  bronze: 'primary', silver: 'info', gold: 'warning', platinum: 'primary',
};

const TIER_THRESHOLDS: Record<MembershipTier, number> = {
  bronze: 10000, silver: 25000, gold: 50000, platinum: 100000,
};

const txnColumns: Column<Transaction>[] = [
  { id: 'number', label: 'Transaction', accessor: 'transactionNumber' },
  { id: 'items', label: 'Items', render: (r) => `${r.items.length} item(s)` },
  { id: 'total', label: 'Total', align: 'right', render: (r) => formatCurrency(r.total) },
  { id: 'payment', label: 'Payment', render: (r) => r.paymentMethod.toUpperCase() },
  { id: 'date', label: 'Date', render: (r) => formatDate(r.createdAt) },
];

export function CustomerDetailPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { data: customer, isLoading, isError } = useCustomer(id ?? '');
  const { data: transactions = [] } = useCustomerTransactions(id ?? '');

  if (isLoading) return <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress /></Box>;
  if (isError || !customer) return <Alert severity="error">Customer not found.</Alert>;

  const tierThreshold = TIER_THRESHOLDS[customer.membershipTier];
  const progressPct = Math.min((customer.totalSpent / tierThreshold) * 100, 100);

  return (
    <Box>
      <PageHeader
        title={customer.name}
        breadcrumbs={[{ label: 'Customers', path: '/customers' }, { label: customer.name }]}
        action={
          <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/customers')}>Back</Button>
        }
      />

      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 4 }}>
          <Paper sx={{ p: 3, textAlign: 'center', mb: 3 }}>
            <Avatar sx={{ width: 80, height: 80, mx: 'auto', mb: 2, bgcolor: 'primary.main', fontSize: '2rem' }}>
              {getInitials(customer.name)}
            </Avatar>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>{customer.name}</Typography>
            <Chip
              label={MEMBERSHIP_TIER_LABELS[customer.membershipTier]}
              color={TIER_COLORS[customer.membershipTier]}
              sx={{ mt: 1 }}
            />
          </Paper>

          <Paper sx={{ p: 3, mb: 3 }}>
            <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>Contact</Typography>
            <Divider sx={{ mb: 2 }} />
            {[
              { label: 'Phone', value: customer.phone },
              { label: 'Email', value: customer.email || '—' },
              { label: 'Birthday', value: customer.birthday ? formatDate(customer.birthday) : '—' },
              { label: 'Member Since', value: formatDate(customer.createdAt) },
            ].map((row) => (
              <Box key={row.label} sx={{ display: 'flex', justifyContent: 'space-between', mb: 1.5 }}>
                <Typography variant="body2" color="text.secondary">{row.label}</Typography>
                <Typography variant="body2" sx={{ fontWeight: 500 }}>{row.value}</Typography>
              </Box>
            ))}
          </Paper>

          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>Loyalty & Spending</Typography>
            <Divider sx={{ mb: 2 }} />
            <Box sx={{ textAlign: 'center', mb: 3 }}>
              <Typography variant="h3" sx={{ fontWeight: 800 }} color="primary">
                {customer.loyaltyPoints.toLocaleString()}
              </Typography>
              <Typography variant="body2" color="text.secondary">Loyalty Points</Typography>
            </Box>
            <Box sx={{ mb: 1 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                <Typography variant="caption">
                  {MEMBERSHIP_TIER_LABELS[customer.membershipTier]} Member
                </Typography>
                <Typography variant="caption">
                  {formatCurrency(customer.totalSpent)} / {formatCurrency(tierThreshold)}
                </Typography>
              </Box>
              <LinearProgress
                variant="determinate"
                value={progressPct}
                sx={{ height: 8, borderRadius: 1 }}
                color={PROGRESS_COLOR[customer.membershipTier]}
              />
            </Box>
            <Typography variant="caption" color="text.secondary">
              Total Spent: {formatCurrency(customer.totalSpent)}
            </Typography>
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, md: 8 }}>
          <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>Purchase History</Typography>
          <DataTable
            columns={txnColumns}
            rows={transactions}
            getRowId={(r) => r.id}
            onRowClick={(row) => navigate(`/sales/${row.id}`)}
            emptyMessage="No transactions yet"
          />
        </Grid>
      </Grid>
    </Box>
  );
}
