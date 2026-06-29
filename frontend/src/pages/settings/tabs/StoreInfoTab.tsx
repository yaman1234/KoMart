import { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Grid,
  TextField,
  Typography,
  Alert,
  Paper,
  InputAdornment,
  Switch,
  FormControlLabel,
  CircularProgress,
} from '@mui/material';
import StoreIcon from '@mui/icons-material/Store';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { QUERY_KEYS } from '@/constants';
import { settingsService } from '@/services';
import { useAuthStore } from '@/store';
import { isAdmin } from '@/utils';
import { getErrorMessage } from '@/services/apiClient';

export function StoreInfoTab() {
  const user = useAuthStore((s) => s.user);
  const canEdit = isAdmin(user?.role);
  const queryClient = useQueryClient();

  const { data: settings, isLoading } = useQuery({
    queryKey: QUERY_KEYS.settings,
    queryFn: settingsService.get,
  });

  const [form, setForm] = useState({
    storeName: '',
    address: '',
    phone: '',
    email: '',
    currency: 'NPR',
    taxRate: 13,
    taxInclusive: false,
    loyaltyPointsPerCurrency: 100,
  });
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (settings) {
      setForm({
        storeName: settings.storeName ?? '',
        address: settings.address ?? '',
        phone: settings.phone ?? '',
        email: settings.email ?? '',
        currency: settings.currency ?? 'NPR',
        taxRate: settings.taxRate ?? 13,
        taxInclusive: settings.taxInclusive ?? false,
        loyaltyPointsPerCurrency: settings.loyaltyPointsPerCurrency ?? 100,
      });
    }
  }, [settings]);

  const updateMutation = useMutation({
    mutationFn: () =>
      settingsService.update({
        storeName: form.storeName,
        address: form.address,
        phone: form.phone,
        email: form.email,
        currency: form.currency,
        taxRate: form.taxRate,
        taxInclusive: form.taxInclusive,
        loyaltyPointsPerCurrency: form.loyaltyPointsPerCurrency,
      }),
    onSuccess: () => {
      setSuccess(true);
      setError('');
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.settings });
      setTimeout(() => setSuccess(false), 3000);
    },
    onError: (err) => {
      setError(getErrorMessage(err));
    },
  });

  const change = (key: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.type === 'checkbox' ? e.target.checked :
      (key === 'taxRate' || key === 'loyaltyPointsPerCurrency') ? Number(e.target.value) :
      e.target.value;
    setForm((f) => ({ ...f, [key]: value }));
  };

  if (isLoading) return <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>;

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
        <StoreIcon color="primary" />
        <Typography variant="h6" sx={{ fontWeight: 700 }}>Store Information</Typography>
      </Box>

      {!canEdit && (
        <Alert severity="info" sx={{ mb: 3 }}>
          You are viewing store settings in read-only mode. Only admins can modify these settings.
        </Alert>
      )}
      {success && <Alert severity="success" sx={{ mb: 2 }}>Settings saved successfully.</Alert>}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Paper sx={{ p: 3 }}>
        <Grid container spacing={2.5}>
          <Grid size={12}>
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>Basic Info</Typography>
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <TextField
              label="Store Name"
              value={form.storeName}
              onChange={change('storeName')}
              fullWidth
              disabled={!canEdit}
            />
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <TextField
              label="Email"
              type="email"
              value={form.email}
              onChange={change('email')}
              fullWidth
              disabled={!canEdit}
            />
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <TextField
              label="Phone"
              value={form.phone}
              onChange={change('phone')}
              fullWidth
              disabled={!canEdit}
            />
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <TextField
              label="Currency"
              value={form.currency}
              onChange={change('currency')}
              fullWidth
              disabled={!canEdit}
            />
          </Grid>
          <Grid size={12}>
            <TextField
              label="Address"
              value={form.address}
              onChange={change('address')}
              fullWidth
              multiline
              rows={2}
              disabled={!canEdit}
            />
          </Grid>

          <Grid size={12}>
            <Typography variant="subtitle2" color="text.secondary" gutterBottom sx={{ mt: 1 }}>Tax & Loyalty</Typography>
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <TextField
              label="Tax Rate (%)"
              type="number"
              value={form.taxRate}
              onChange={change('taxRate')}
              fullWidth
              disabled={!canEdit}
              slotProps={{ input: { endAdornment: <InputAdornment position="end">%</InputAdornment> } }}
            />
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <TextField
              label="Loyalty Points per 100 Currency"
              type="number"
              value={form.loyaltyPointsPerCurrency}
              onChange={change('loyaltyPointsPerCurrency')}
              fullWidth
              disabled={!canEdit}
            />
          </Grid>
          <Grid size={{ xs: 12, md: 4 }} sx={{ display: 'flex', alignItems: 'center' }}>
            <FormControlLabel
              control={
                <Switch
                  checked={form.taxInclusive}
                  onChange={change('taxInclusive')}
                  disabled={!canEdit}
                />
              }
              label="Tax Inclusive Pricing"
            />
          </Grid>

          {canEdit && (
            <Grid size={12} sx={{ display: 'flex', justifyContent: 'flex-end', mt: 1 }}>
              <Button
                variant="contained"
                onClick={() => updateMutation.mutate()}
                loading={updateMutation.isPending}
              >
                Save Changes
              </Button>
            </Grid>
          )}
        </Grid>
      </Paper>
    </Box>
  );
}
