import { useEffect, useState } from 'react';
import {
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  MenuItem,
  Typography,
} from '@mui/material';
import { CustomerPicker } from '@/components/pos/CustomerPicker';
import { useCustomer } from '@/hooks/useCustomers';
import { PAYMENT_METHODS } from '@/constants';
import { formatCurrency } from '@/utils';
import { getErrorMessage } from '@/services/apiClient';
import type { PaymentMethod, Transaction } from '@/types';

interface SaleEditDialogProps {
  open: boolean;
  transaction: Transaction;
  onClose: () => void;
  onSave: (payload: {
    customerId?: string | null;
    customerName?: string;
    paymentMethod: PaymentMethod;
    discount: number;
    loyaltyPointsRedeemed: number;
  }) => Promise<void>;
  saving?: boolean;
}

export function SaleEditDialog({
  open,
  transaction,
  onClose,
  onSave,
  saving,
}: SaleEditDialogProps) {
  const [customerId, setCustomerId] = useState<string | null>(transaction.customerId ?? null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(transaction.paymentMethod);
  const [discount, setDiscount] = useState(String(transaction.discount));
  const [loyaltyPoints, setLoyaltyPoints] = useState(String(transaction.loyaltyPointsRedeemed));
  const [error, setError] = useState('');

  const { data: selectedCustomer } = useCustomer(customerId ?? '');

  useEffect(() => {
    if (!open) return;
    setCustomerId(transaction.customerId ?? null);
    setPaymentMethod(transaction.paymentMethod);
    setDiscount(String(transaction.discount));
    setLoyaltyPoints(String(transaction.loyaltyPointsRedeemed));
    setError('');
  }, [open, transaction]);

  const discountNum = parseFloat(discount) || 0;
  const previewTotal = Math.max(0, Math.round((transaction.subtotal - discountNum + transaction.tax) * 100) / 100);

  const handleSubmit = async () => {
    if (discountNum > transaction.subtotal) {
      setError('Discount cannot exceed subtotal');
      return;
    }
    const points = parseInt(loyaltyPoints, 10);
    if (isNaN(points) || points < 0) {
      setError('Enter a valid loyalty points value');
      return;
    }
    try {
      await onSave({
        customerId,
        customerName: customerId
          ? (selectedCustomer?.name ?? transaction.customerName ?? 'Customer')
          : 'Walk-In Customer',
        paymentMethod,
        discount: discountNum,
        loyaltyPointsRedeemed: points,
      });
      onClose();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Edit Sale — {transaction.transactionNumber}</DialogTitle>
      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Line items cannot be changed here. Update customer, payment, or discount only.
        </Typography>

        <CustomerPicker
          customerId={customerId}
          onCustomerChange={setCustomerId}
          onAddCustomer={() => {}}
        />

        <TextField
          select
          fullWidth
          label="Payment Method"
          value={paymentMethod}
          onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
          margin="normal"
        >
          {PAYMENT_METHODS.map((m) => (
            <MenuItem key={m.value} value={m.value}>{m.label}</MenuItem>
          ))}
        </TextField>

        <TextField
          fullWidth
          label="Overall Discount (NPR)"
          type="number"
          value={discount}
          onChange={(e) => { setDiscount(e.target.value); setError(''); }}
          margin="normal"
          slotProps={{ htmlInput: { min: 0, max: transaction.subtotal, step: 0.01 } }}
        />

        <TextField
          fullWidth
          label="Loyalty Points Redeemed"
          type="number"
          value={loyaltyPoints}
          onChange={(e) => { setLoyaltyPoints(e.target.value); setError(''); }}
          margin="normal"
          slotProps={{ htmlInput: { min: 0, step: 1 } }}
        />

        <Typography variant="body2" sx={{ mt: 2 }}>
          New total: <strong>{formatCurrency(previewTotal)}</strong>
        </Typography>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={saving}>Cancel</Button>
        <Button variant="contained" onClick={handleSubmit} loading={saving}>
          Save Changes
        </Button>
      </DialogActions>
    </Dialog>
  );
}
