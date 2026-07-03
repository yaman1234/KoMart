import { useState } from 'react';
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Grid,
  Alert,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { PageHeader } from '@/components/common/PageHeader';
import { SearchBar } from '@/components/common/SearchBar';
import { DataTable, type Column } from '@/components/tables/DataTable';
import { useCustomers, useCreateCustomer } from '@/hooks/useCustomers';
import { formatDate, formatCurrency } from '@/utils';
import { MEMBERSHIP_TIER_LABELS } from '@/constants';
import { getErrorMessage } from '@/services/apiClient';
import { showSuccess } from '@/utils/toast';
import type { Customer, MembershipTier } from '@/types';

const TIER_COLORS: Record<MembershipTier, 'default' | 'warning' | 'info' | 'primary'> = {
  bronze: 'default',
  silver: 'info',
  gold: 'warning',
  platinum: 'primary',
};

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  phone: z.string().min(1, 'Phone is required'),
  email: z.string(),
  birthday: z.string(),
});

type FormValues = z.infer<typeof schema>;

export function CustomersPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [addOpen, setAddOpen] = useState(false);
  const [formError, setFormError] = useState('');

  const { data, isLoading } = useCustomers({ search, page: page + 1, pageSize: 10 });
  const createMutation = useCreateCustomer();

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', birthday: '' },
  });

  const columns: Column<Customer>[] = [
    { id: 'name', label: 'Name', minWidth: 160, accessor: 'name' },
    { id: 'phone', label: 'Phone', accessor: 'phone' },
    { id: 'email', label: 'Email', accessor: 'email' },
    {
      id: 'tier',
      label: 'Tier',
      render: (row) => (
        <Chip
          label={MEMBERSHIP_TIER_LABELS[row.membershipTier]}
          color={TIER_COLORS[row.membershipTier]}
          size="small"
        />
      ),
    },
    {
      id: 'points',
      label: 'Points',
      align: 'right',
      render: (row) => row.loyaltyPoints.toLocaleString(),
    },
    {
      id: 'spent',
      label: 'Total Spent',
      align: 'right',
      render: (row) => formatCurrency(row.totalSpent),
    },
    {
      id: 'joined',
      label: 'Joined',
      render: (row) => formatDate(row.createdAt),
    },
  ];

  const onSubmit = async (values: FormValues) => {
    setFormError('');
    try {
      await createMutation.mutateAsync({
        name: values.name,
        phone: values.phone,
        email: values.email ?? '',
        birthday: values.birthday || undefined,
      });
      showSuccess('Customer created.');
      setAddOpen(false);
      reset();
    } catch (err) {
      setFormError(getErrorMessage(err));
    }
  };

  return (
    <Box>
      <PageHeader
        title="Customers"
        subtitle={`${data?.total ?? 0} registered customers`}
        action={
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setAddOpen(true)}>
            Add Customer
          </Button>
        }
      />

      <Box sx={{ mb: 3 }}>
        <SearchBar
          value={search}
          onChange={(v) => { setSearch(v); setPage(0); }}
          placeholder="Search by name, phone or email..."
        />
      </Box>

      <DataTable
        columns={columns}
        rows={data?.data ?? []}
        loading={isLoading}
        page={page}
        pageSize={10}
        total={data?.total}
        onPageChange={setPage}
        getRowId={(r) => r.id}
        onRowClick={(r) => navigate(`/customers/${r.id}`)}
      />

      {/* Add Customer Dialog */}
      <Dialog open={addOpen} onClose={() => setAddOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add Customer</DialogTitle>
        <DialogContent>
          {formError && <Alert severity="error" sx={{ mb: 2 }}>{formError}</Alert>}
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid size={12}>
              <TextField {...register('name')} label="Full Name" fullWidth error={!!errors.name} helperText={errors.name?.message} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField {...register('phone')} label="Phone" fullWidth error={!!errors.phone} helperText={errors.phone?.message} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField {...register('email')} label="Email" type="email" fullWidth />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                {...register('birthday')}
                label="Birthday"
                type="date"
                fullWidth
                slotProps={{ inputLabel: { shrink: true } }}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => { setAddOpen(false); reset(); }}>Cancel</Button>
          <Button
            variant="contained"
            loading={isSubmitting || createMutation.isPending}
            onClick={handleSubmit(onSubmit)}
          >
            Add Customer
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
