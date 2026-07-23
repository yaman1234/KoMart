import { useEffect, useState } from 'react';
import dayjs from 'dayjs';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  TextField,
  Typography,
} from '@mui/material';
import { NepaliAwareDatePicker } from '@/components/common/NepaliAwareDatePicker';
import { UomConversionHint } from '@/components/uom/UomUi';
import { formatStockQty } from '@/utils/uomDisplay';
import type { InventoryItem } from '@/types';
import type { Supplier } from '@/types';
import type { ReceiveBatchPayload } from '@/services';

interface ReceiveStockDialogProps {
  open: boolean;
  item: InventoryItem | null;
  suppliers: Supplier[];
  loading?: boolean;
  onClose: () => void;
  onSubmit: (payload: ReceiveBatchPayload) => void;
}

export function ReceiveStockDialog({
  open,
  item,
  suppliers,
  loading,
  onClose,
  onSubmit,
}: ReceiveStockDialogProps) {
  const [batch, setBatch] = useState('');
  const [qty, setQty] = useState('');
  const [expiry, setExpiry] = useState('');
  const [costPrice, setCostPrice] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open || !item) return;
    setBatch(dayjs().format('YYYY-MM-DD'));
    setQty('');
    setExpiry('');
    setCostPrice(String(item.costPrice));
    setSupplierId(item.supplierId);
    setError('');
  }, [open, item]);

  const handleSubmit = () => {
    if (!item) return;
    const quantity = parseInt(qty, 10);
    const unitCost = parseFloat(costPrice);
    if (isNaN(quantity) || quantity < 1) { setError('Enter a quantity ≥ 1'); return; }
    if (!batch.trim()) { setError('Batch number is required'); return; }
    if (!supplierId) { setError('Select a supplier'); return; }
    if (isNaN(unitCost) || unitCost < 0) { setError('Enter a valid cost price'); return; }
    onSubmit({
      productId: item.id,
      batchNumber: batch.trim(),
      quantity,
      expiryDate: expiry || undefined,
      unitCost,
      supplierId,
    });
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        Add stock (new batch){item ? ` — ${item.name}` : ''}
        <Typography variant="body2" color="text.secondary">
          Current stock: {item ? formatStockQty(item.stock, item.uom ?? '') : '—'}
        </Typography>
      </DialogTitle>
      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {item && (
          <Box sx={{ mb: 2 }}>
            <UomConversionHint
              buyUom={item.buyUom ?? item.uom ?? ''}
              baseUom={item.uom ?? ''}
              factor={item.unitsPerBuyUom ?? 1}
            />
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
              Quantity is in base units. For pack receive, use Purchase Orders. Sell price is edited on the Product page.
            </Typography>
          </Box>
        )}
        <TextField
          label="Batch Number"
          value={batch}
          onChange={(e) => { setBatch(e.target.value); setError(''); }}
          fullWidth
          margin="normal"
          required
        />
        <TextField
          select
          label="Supplier"
          value={supplierId}
          onChange={(e) => { setSupplierId(e.target.value); setError(''); }}
          fullWidth
          margin="normal"
          required
          helperText={supplierId ? undefined : 'Select the supplier for this receipt'}
        >
          {suppliers.map((s) => (
            <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>
          ))}
        </TextField>
        <TextField
          label="Cost Price (per base)"
          value={costPrice}
          onChange={(e) => { setCostPrice(e.target.value); setError(''); }}
          type="number"
          fullWidth
          margin="normal"
          required
          slotProps={{ htmlInput: { min: 0, step: 0.01 } }}
        />
        <TextField
          label={`Quantity (base: ${item?.uom ?? ''})`}
          value={qty}
          onChange={(e) => { setQty(e.target.value); setError(''); }}
          type="number"
          required
          fullWidth
          margin="normal"
          slotProps={{ htmlInput: { min: 1 } }}
          helperText="Stock increases in base units"
        />
        <NepaliAwareDatePicker
          label="Expiry Date"
          value={expiry}
          onChange={setExpiry}
          fullWidth
          calendarSystem="AD"
          helperText="Gregorian (AD) — manufacturer expiry. Leave blank if none."
        />
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" color="success" onClick={handleSubmit} loading={loading}>
          Confirm receipt
        </Button>
      </DialogActions>
    </Dialog>
  );
}
