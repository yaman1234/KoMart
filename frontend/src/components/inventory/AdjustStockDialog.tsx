import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  MenuItem,
  Radio,
  RadioGroup,
  TextField,
  Typography,
} from '@mui/material';
import { formatStockQty } from '@/utils/uomDisplay';
import type { InventoryItem, StockAdjustment, StockAdjustmentType } from '@/types';
import { INVENTORY_ADJUSTMENT_TYPES } from './constants';

interface AdjustStockDialogProps {
  open: boolean;
  item: InventoryItem | null;
  createdBy: string;
  loading?: boolean;
  onClose: () => void;
  onSubmit: (payload: Omit<StockAdjustment, 'id' | 'createdAt'>) => void;
}

export function AdjustStockDialog({
  open,
  item,
  createdBy,
  loading,
  onClose,
  onSubmit,
}: AdjustStockDialogProps) {
  const [batchId, setBatchId] = useState('');
  const [qty, setQty] = useState('');
  const [type, setType] = useState<StockAdjustmentType>('adjustment');
  const [reason, setReason] = useState('');
  const [mode, setMode] = useState<'delta' | 'target'>('target');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [error, setError] = useState('');

  const activeBatches = item?.batches.filter((b) => b.quantity > 0) ?? [];

  useEffect(() => {
    if (!open || !item) return;
    const firstBatch = item.batches.find((b) => b.quantity > 0);
    setBatchId(firstBatch?.id ?? '');
    setQty('');
    setType('adjustment');
    setReason('');
    setError('');
    setMode('target');
    setAdvancedOpen(false);
  }, [open, item]);

  const handleSubmit = () => {
    if (!item) return;
    let quantity: number;
    if (mode === 'target') {
      const target = parseInt(qty, 10);
      if (isNaN(target) || target < 0) { setError('Enter a valid target stock (≥ 0)'); return; }
      quantity = target - item.stock;
      if (quantity === 0) { setError('Target matches current stock'); return; }
    } else {
      quantity = parseInt(qty, 10);
    }
    if (isNaN(quantity) || quantity === 0) { setError('Enter a non-zero quantity'); return; }
    if (!reason.trim()) { setError('Reason is required'); return; }
    onSubmit({
      productId: item.id,
      batchId: batchId || undefined,
      type,
      quantity,
      reason: reason.trim(),
      createdBy,
    });
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>
        Correct stock{item ? ` — ${item.name}` : ''}
        <Typography variant="body2" color="text.secondary">
          Current stock: {item ? formatStockQty(item.stock, item.uom ?? '') : '—'}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
          Use for count mismatch, damage, or correction — not for new deliveries.
        </Typography>
      </DialogTitle>
      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <FormControl component="fieldset" sx={{ mt: 1, mb: 1 }}>
          <RadioGroup
            row
            value={mode}
            onChange={(e) => { setMode(e.target.value as 'delta' | 'target'); setQty(''); setError(''); }}
          >
            <FormControlLabel value="target" control={<Radio size="small" />} label="Set target stock" />
            <FormControlLabel value="delta" control={<Radio size="small" />} label="Adjust by +/- delta" />
          </RadioGroup>
        </FormControl>
        <TextField
          select
          label="Type"
          value={type}
          onChange={(e) => setType(e.target.value as StockAdjustmentType)}
          fullWidth
          margin="normal"
        >
          {INVENTORY_ADJUSTMENT_TYPES.map((t) => (
            <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>
          ))}
        </TextField>
        <Button size="small" onClick={() => setAdvancedOpen((o) => !o)} sx={{ mb: 1 }}>
          {advancedOpen ? 'Hide' : 'Show'} advanced batch options
        </Button>
        <Collapse in={advancedOpen}>
          {activeBatches.length > 0 && (
            <TextField
              select
              label="Batch (optional)"
              value={batchId}
              onChange={(e) => setBatchId(e.target.value)}
              fullWidth
              margin="normal"
              helperText="Leave blank to apply FEFO across batches when reducing stock"
            >
              <MenuItem value="">Auto (FEFO)</MenuItem>
              {activeBatches.map((b) => (
                <MenuItem key={b.id} value={b.id}>
                  {b.batchNumber} ({b.quantity} units)
                </MenuItem>
              ))}
            </TextField>
          )}
        </Collapse>
        <TextField
          label={mode === 'target' ? 'Target stock' : 'Quantity (use negative to reduce)'}
          value={qty}
          onChange={(e) => { setQty(e.target.value); setError(''); }}
          type="number"
          fullWidth
          margin="normal"
          helperText={
            qty && item
              ? mode === 'target'
                ? (() => {
                    const target = parseInt(qty, 10);
                    if (isNaN(target)) return '';
                    const delta = target - item.stock;
                    return delta === 0
                      ? 'No change needed'
                      : `Will adjust by ${delta > 0 ? '+' : ''}${delta} → new stock ${target}`;
                  })()
                : `New stock: ${item.stock + (parseInt(qty, 10) || 0)}`
              : ''
          }
        />
        <TextField
          label="Reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          fullWidth
          margin="normal"
          multiline
          rows={2}
        />
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleSubmit} loading={loading}>
          Apply correction
        </Button>
      </DialogActions>
    </Dialog>
  );
}
