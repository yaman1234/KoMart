import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Grid,
  IconButton,
  MenuItem,
  Paper,
  TextField,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import { SUPPLIER_PAYMENT_METHODS } from '@/constants';
import { uploadImageToCloudinary } from '@/utils/cloudinaryUpload';
import type { SupplierPaymentDetail, SupplierPaymentMethod } from '@/types';

const MAX_PAYMENT_DETAILS = 10;

interface SupplierPaymentFieldsProps {
  value: SupplierPaymentDetail[];
  onChange: (next: SupplierPaymentDetail[]) => void;
  onUploadingChange?: (uploading: boolean) => void;
}

export function SupplierPaymentFields({ value, onChange, onUploadingChange }: SupplierPaymentFieldsProps) {
  const [uploadingIndex, setUploadingIndex] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState('');

  useEffect(() => {
    onUploadingChange?.(uploadingIndex !== null);
  }, [uploadingIndex, onUploadingChange]);

  const updateRow = (index: number, patch: Partial<SupplierPaymentDetail>) => {
    onChange(value.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)));
  };

  const uploadQr = (index: number, file: File | undefined, input: HTMLInputElement) => {
    if (!file) return;
    setUploadError('');
    setUploadingIndex(index);
    void uploadImageToCloudinary(file)
      .then((url) => updateRow(index, { qrImageUrl: url }))
      .catch((err: unknown) => {
        setUploadError(err instanceof Error ? err.message : 'Image upload failed.');
      })
      .finally(() => {
        setUploadingIndex(null);
        input.value = '';
      });
  };

  return (
    <Paper sx={{ p: 3, maxWidth: 720, mt: 3 }}>
      <Typography variant="h6" sx={{ fontWeight: 600, mb: 0.5 }}>
        Payment details
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        eSewa, Fonepay, Khalti, bank, or another way to pay this supplier. QR images are optional.
      </Typography>

      {uploadError && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setUploadError('')}>
          {uploadError}
        </Alert>
      )}

      {value.length === 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          No payment options yet.
        </Typography>
      )}

      {value.map((row, index) => (
        <Box
          key={index}
          sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 2, mb: 2 }}
        >
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
              Option {index + 1}
            </Typography>
            <IconButton
              aria-label={`Remove payment option ${index + 1}`}
              size="small"
              type="button"
              onClick={() => onChange(value.filter((_, rowIndex) => rowIndex !== index))}
            >
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Box>

          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                select
                label="Method"
                value={row.method}
                fullWidth
                required
                onChange={(event) => updateRow(index, { method: event.target.value as SupplierPaymentMethod })}
              >
                {SUPPLIER_PAYMENT_METHODS.map((method) => (
                  <MenuItem key={method.value} value={method.value}>
                    {method.label}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label="Label"
                value={row.label ?? ''}
                fullWidth
                placeholder="Optional nickname"
                onChange={(event) => updateRow(index, { label: event.target.value })}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label="Account name"
                value={row.accountName ?? ''}
                fullWidth
                onChange={(event) => updateRow(index, { accountName: event.target.value })}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label="Account number"
                value={row.accountNumber ?? ''}
                fullWidth
                onChange={(event) => updateRow(index, { accountNumber: event.target.value })}
              />
            </Grid>
            <Grid size={12}>
              <TextField
                label="Bank name"
                value={row.bankName ?? ''}
                fullWidth
                onChange={(event) => updateRow(index, { bankName: event.target.value })}
              />
            </Grid>
          </Grid>

          <Box sx={{ mt: 2 }}>
            <Button
              component="label"
              size="small"
              variant="outlined"
              type="button"
              disabled={uploadingIndex === index}
            >
              {uploadingIndex === index ? 'Uploading…' : row.qrImageUrl ? 'Replace QR image' : 'Upload QR image'}
              <input
                type="file"
                accept="image/*"
                hidden
                onChange={(event) => uploadQr(index, event.target.files?.[0], event.target)}
              />
            </Button>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
              Image files only, up to 5 MB.
            </Typography>
            {row.qrImageUrl && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mt: 1.5 }}>
                <Box
                  component="img"
                  src={row.qrImageUrl}
                  alt="QR preview"
                  sx={{
                    width: 72,
                    height: 72,
                    objectFit: 'cover',
                    borderRadius: 1,
                    border: 1,
                    borderColor: 'divider',
                  }}
                />
                <Button
                  size="small"
                  color="error"
                  type="button"
                  onClick={() => updateRow(index, { qrImageUrl: undefined })}
                >
                  Remove QR
                </Button>
              </Box>
            )}
          </Box>
        </Box>
      ))}

      <Button
        type="button"
        startIcon={<AddIcon />}
        onClick={() => onChange([...value, { method: 'esewa' }])}
        disabled={value.length >= MAX_PAYMENT_DETAILS}
      >
        Add payment option
      </Button>
      {value.length >= MAX_PAYMENT_DETAILS && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
          Up to {MAX_PAYMENT_DETAILS} payment options.
        </Typography>
      )}
    </Paper>
  );
}
