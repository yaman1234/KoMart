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
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '@/components/common/PageHeader';
import { useSupplier, useCreateSupplier, useUpdateSupplier } from '@/hooks/useSuppliers';
import { COUNTRIES } from '@/constants';
import { getErrorMessage } from '@/services/apiClient';
import { showSuccess } from '@/utils/toast';
import { navigateBack } from '@/utils';
import type { SupplierPaymentDetail } from '@/types';
import { cleanSupplierPaymentDetail, qrImageUrlError } from '@/pages/suppliers/supplierPoKpis';
import { SupplierPaymentFields } from '@/pages/suppliers/components/SupplierPaymentFields';

const schema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  country: z.string().min(1, 'Country is required'),
  contactPerson: z.string().trim().min(1, 'Contact person is required'),
  phone: z.string().trim().min(1, 'Phone is required')
    .regex(/^[0-9+\s-]+$/, 'Use digits, spaces, + or dashes only')
    .refine((value) => {
      const digits = value.replace(/\D/g, '').length;
      return digits >= 7 && digits <= 15;
    }, 'Enter 7 to 15 digits'),
  email: z.union([z.literal(''), z.string().email('Enter a valid email')]),
  address: z.string().trim().min(1, 'Address is required'),
});

type FormValues = z.infer<typeof schema>;

export function SupplierFormPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEditing = !!id;
  const [formError, setFormError] = useState('');
  const [paymentDetails, setPaymentDetails] = useState<SupplierPaymentDetail[]>([]);
  const [qrUploading, setQrUploading] = useState(false);

  const { data: supplier, isLoading: supplierLoading, isError: supplierError } = useSupplier(id ?? '');
  const createMutation = useCreateSupplier();
  const updateMutation = useUpdateSupplier();

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    mode: 'onTouched',
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
      setPaymentDetails(supplier.paymentDetails ?? []);
    }
  }, [supplier, reset]);

  const onSubmit = async (values: FormValues) => {
    setFormError('');
    if (qrUploading) {
      setFormError('Wait for the QR upload to finish.');
      return;
    }
    const qrError = paymentDetails.map((row) => qrImageUrlError(row.qrImageUrl)).find(Boolean);
    if (qrError) {
      setFormError(qrError);
      return;
    }
    const payload = {
      ...values,
      email: values.email || undefined,
      paymentDetails: paymentDetails.map(cleanSupplierPaymentDetail),
    };
    try {
      if (isEditing && id) {
        await updateMutation.mutateAsync({
          id,
          data: payload,
        });
        showSuccess('Supplier updated.');
        navigate(`/suppliers/${id}`);
      } else {
        const created = await createMutation.mutateAsync(payload);
        showSuccess('Supplier created.');
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

  if (isEditing && (supplierError || !supplier)) {
    return <Alert severity="error">Supplier not found.</Alert>;
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
              onClick={() => navigateBack(navigate, isEditing && id ? `/suppliers/${id}` : '/suppliers')}
            >
              Cancel
            </Button>
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
              <Button
                type="submit"
                variant="contained"
                startIcon={<SaveIcon />}
                loading={pending}
                disabled={pending || qrUploading}
              >
                {isEditing ? 'Update' : 'Create'} Supplier
              </Button>
              {qrUploading && (
                <Typography variant="caption" color="text.secondary">
                  Wait for the QR upload to finish.
                </Typography>
              )}
            </Box>
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
            <Controller
              name="country"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
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
              )}
            />
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

      <SupplierPaymentFields
        value={paymentDetails}
        onChange={setPaymentDetails}
        onUploadingChange={setQrUploading}
      />
    </Box>
  );
}
