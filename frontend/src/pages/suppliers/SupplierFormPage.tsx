import { useEffect, useState } from 'react';
import {
  Box,
  Button,
  Grid,
  TextField,
  MenuItem,
  Paper,
  Typography,
  Divider,
  CircularProgress,
  Alert,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SaveIcon from '@mui/icons-material/Save';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '@/components/common/PageHeader';
import { useSupplier, useCreateSupplier, useUpdateSupplier } from '@/hooks/useSuppliers';
import { COUNTRIES } from '@/constants';
import { getErrorMessage } from '@/services/apiClient';

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  country: z.string().min(1, 'Country is required'),
  contactPerson: z.string().min(1, 'Contact person is required'),
  phone: z.string().min(1, 'Phone is required'),
  email: z.union([z.literal(''), z.string().email('Enter a valid email')]),
  address: z.string().min(1, 'Address is required'),
});

type FormValues = z.infer<typeof schema>;

export function SupplierFormPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEditing = !!id;
  const [formError, setFormError] = useState('');

  const { data: supplier, isLoading: supplierLoading } = useSupplier(id ?? '');
  const createMutation = useCreateSupplier();
  const updateMutation = useUpdateSupplier();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      country: '',
      contactPerson: '',
      phone: '',
      email: '',
      address: '',
    },
  });

  useEffect(() => {
    if (supplier) {
      reset({
        name: supplier.name,
        country: supplier.country,
        contactPerson: supplier.contactPerson,
        phone: supplier.phone,
        email: supplier.email ?? '',
        address: supplier.address,
      });
    }
  }, [supplier, reset]);

  const onSubmit = async (values: FormValues) => {
    setFormError('');
    try {
      if (isEditing && id) {
        await updateMutation.mutateAsync({
          id,
          data: { ...values, email: values.email || undefined },
        });
        navigate(`/suppliers/${id}`);
      } else {
        const created = await createMutation.mutateAsync({
          ...values,
          email: values.email || undefined,
        });
        navigate(`/suppliers/${created.id}`);
      }
    } catch (err) {
      setFormError(getErrorMessage(err));
    }
  };

  if (isEditing && supplierLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  const pending = isSubmitting || createMutation.isPending || updateMutation.isPending;

  return (
    <Box component="form" onSubmit={handleSubmit(onSubmit)} noValidate>
      <PageHeader
        title={isEditing ? 'Edit Supplier' : 'Add Supplier'}
        breadcrumbs={[
          { label: 'Suppliers', path: '/suppliers' },
          { label: isEditing ? 'Edit' : 'New' },
        ]}
        action={
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button
              startIcon={<ArrowBackIcon />}
              onClick={() => navigate(isEditing && id ? `/suppliers/${id}` : '/suppliers')}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="contained"
              startIcon={<SaveIcon />}
              loading={pending}
            >
              {isEditing ? 'Update' : 'Create'} Supplier
            </Button>
          </Box>
        }
      />

      <Paper sx={{ p: 3, maxWidth: 720 }}>
        {formError && <Alert severity="error" sx={{ mb: 2 }}>{formError}</Alert>}

        <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>Supplier Details</Typography>
        <Divider sx={{ mb: 3 }} />

        <Grid container spacing={2}>
          <Grid size={12}>
            <TextField
              {...register('name')}
              label="Company Name"
              fullWidth
              required
              error={!!errors.name}
              helperText={errors.name?.message}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              {...register('country')}
              select
              label="Country"
              fullWidth
              required
              error={!!errors.country}
              helperText={errors.country?.message}
            >
              {COUNTRIES.map((c) => (
                <MenuItem key={c} value={c}>{c}</MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              {...register('contactPerson')}
              label="Contact Person"
              fullWidth
              required
              error={!!errors.contactPerson}
              helperText={errors.contactPerson?.message}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              {...register('phone')}
              label="Phone"
              fullWidth
              required
              error={!!errors.phone}
              helperText={errors.phone?.message}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              {...register('email')}
              label="Email"
              type="email"
              fullWidth
              error={!!errors.email}
              helperText={errors.email?.message || 'Optional'}
            />
          </Grid>
          <Grid size={12}>
            <TextField
              {...register('address')}
              label="Address"
              fullWidth
              required
              multiline
              minRows={2}
              error={!!errors.address}
              helperText={errors.address?.message}
            />
          </Grid>
        </Grid>
      </Paper>
    </Box>
  );
}
