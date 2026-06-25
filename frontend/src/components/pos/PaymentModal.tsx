import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Divider,
  ToggleButtonGroup,
  ToggleButton,
  TextField,
  Alert,
  Stack,
} from '@mui/material';
import PrintIcon from '@mui/icons-material/Print';
import AddShoppingCartIcon from '@mui/icons-material/AddShoppingCart';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { formatAmount, formatCurrency } from '@/utils';
import { ReceiptView, buildReceiptHtml, printReceipt } from '@/components/pos/ReceiptView';
import type { CartItem, PaymentMethod, Transaction } from '@/types';

// ── Types ─────────────────────────────────────────────────────────────────────

interface PaymentSummary {
  subtotal: number;
  discount: number;
  total: number;
}

interface PaymentModalProps {
  open: boolean;
  items: CartItem[];
  summary: PaymentSummary;
  loading?: boolean;
  /** Set after the transaction is saved — triggers receipt view */
  transaction?: Transaction | null;
  /** Cash tendered amount (for change display on receipt) */
  tenderedAmount?: number;
  onConfirm: (method: PaymentMethod, tendered?: number) => void;
  onClose: () => void;
  onNewSale: () => void;
}

const METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'cash',  label: 'Cash'  },
  { value: 'esewa', label: 'eSewa' },
];

// Common cash denominations (NPR)
const QUICK_CASH = [100, 200, 500, 1000, 2000, 5000];

// ── Component ─────────────────────────────────────────────────────────────────

export function PaymentModal({
  open,
  items,
  summary,
  loading,
  transaction,
  tenderedAmount,
  onConfirm,
  onClose,
  onNewSale,
}: PaymentModalProps) {
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [tendered, setTendered] = useState('');

  // Reset payment form when modal opens for a new sale
  useEffect(() => {
    if (open && !transaction) {
      setMethod('cash');
      setTendered('');
    }
  }, [open, transaction]);

  const tenderedNum = parseFloat(tendered) || 0;
  const change      = tenderedNum - summary.total;
  const showReceipt = !!transaction;

  // ── Receipt view ─────────────────────────────────────────────────────────
  if (showReceipt) {
    const txn     = transaction!;
    const cash    = tenderedAmount ?? (method === 'cash' ? tenderedNum : undefined);

    return (
      <Dialog open={open} maxWidth="sm" fullWidth disableEscapeKeyDown>
        {/* Success header */}
        <Box sx={{ bgcolor: 'success.main', py: 2, textAlign: 'center' }}>
          <CheckCircleIcon sx={{ color: '#fff', fontSize: 36, mb: 0.5 }} />
          <Typography variant="h6" sx={{ color: '#fff', fontWeight: 700 }}>
            Payment Successful
          </Typography>
          <Typography variant="body2" sx={{ color: 'success.light' }}>
            {txn.transactionNumber}
          </Typography>
        </Box>

        <DialogContent sx={{ px: 2, pt: 2, pb: 1 }}>
          <ReceiptView transaction={txn} tenderedAmount={cash} />
        </DialogContent>

        <DialogActions sx={{ px: 2, pb: 2, gap: 1 }}>
          <Button
            variant="outlined"
            startIcon={<PrintIcon />}
            onClick={() => printReceipt(buildReceiptHtml(txn, cash))}
          >
            Print
          </Button>
          <Button
            variant="contained"
            fullWidth
            startIcon={<AddShoppingCartIcon />}
            onClick={onNewSale}
          >
            New Sale
          </Button>
        </DialogActions>
      </Dialog>
    );
  }

  // ── Payment selection view ────────────────────────────────────────────────
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 700, pb: 1 }}>Confirm Payment</DialogTitle>
      <DialogContent sx={{ pt: 0 }}>

        {/* ── Items table ── */}
        <Box
          sx={{
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 1,
            mb: 2,
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1fr) 40px 72px 80px',
              bgcolor: 'action.hover',
              px: 1.5,
              py: 0.75,
              gap: 1,
            }}
          >
            {['Item', 'Qty', 'Unit Price', 'Amount'].map((h) => (
              <Typography
                key={h}
                variant="caption"
                color="text.primary"
                sx={{ fontWeight: 700, textAlign: h === 'Item' ? 'left' : 'right' }}
              >
                {h}
              </Typography>
            ))}
          </Box>
          <Divider />

          {/* Rows */}
          <Box sx={{ maxHeight: 220, overflow: 'auto' }}>
            {items.map((item) => (
              <Box
                key={item.productId}
                sx={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(0, 1fr) 40px 72px 80px',
                  px: 1.5,
                  py: 0.75,
                  gap: 1,
                  alignItems: 'center',
                  borderBottom: '1px solid',
                  borderColor: 'divider',
                  '&:last-child': { borderBottom: 0 },
                }}
              >
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="body2" noWrap sx={{ fontWeight: 500 }}>
                    {item.name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">{item.sku}</Typography>
                </Box>
                <Typography variant="body2" sx={{ textAlign: 'right' }}>{item.quantity}</Typography>
                <Typography variant="body2" sx={{ textAlign: 'right' }}>
                  {formatAmount(item.price)}
                </Typography>
                <Typography variant="body2" sx={{ textAlign: 'right', fontWeight: 600 }}>
                  {formatAmount(item.price * item.quantity)}
                </Typography>
              </Box>
            ))}
          </Box>
        </Box>

        {/* ── Bill summary ── */}
        <Box sx={{ bgcolor: 'action.hover', borderRadius: 2, p: 2, mb: 2.5 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
            <Typography variant="body2" color="text.secondary">Subtotal</Typography>
            <Typography variant="body2">{formatAmount(summary.subtotal)}</Typography>
          </Box>
          {summary.discount > 0 && (
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
              <Typography variant="body2" color="success.main">Discount</Typography>
              <Typography variant="body2" color="success.main">
                - {formatAmount(summary.discount)}
              </Typography>
            </Box>
          )}
          <Divider sx={{ my: 1 }} />
          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>Total</Typography>
            <Typography variant="h6" sx={{ fontWeight: 700 }} color="primary">
              {formatCurrency(summary.total)}
            </Typography>
          </Box>
        </Box>

        {/* Payment method */}
        <Typography variant="subtitle2" sx={{ mb: 1 }}>Payment Method</Typography>
        <ToggleButtonGroup
          value={method}
          exclusive
          onChange={(_, v: PaymentMethod) => v && setMethod(v)}
          fullWidth
          sx={{ mb: 2.5 }}
        >
          {METHODS.map((m) => (
            <ToggleButton key={m.value} value={m.value} sx={{ py: 1 }}>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>{m.label}</Typography>
            </ToggleButton>
          ))}
        </ToggleButtonGroup>

        {/* Cash flow */}
        {method === 'cash' && (
          <Box>
            {/* Quick-amount chips */}
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.75 }}>
              Quick amounts
            </Typography>
            <Stack direction="row" flexWrap="wrap" gap={0.75} sx={{ mb: 1.5 }}>
              <Button
                size="small"
                variant={tenderedNum === summary.total ? 'contained' : 'outlined'}
                onClick={() => setTendered(summary.total.toString())}
                sx={{ minWidth: 0, px: 1.25 }}
              >
                Exact
              </Button>
              {QUICK_CASH.filter((v) => v >= summary.total).slice(0, 5).map((v) => (
                <Button
                  key={v}
                  size="small"
                  variant={tenderedNum === v ? 'contained' : 'outlined'}
                  onClick={() => setTendered(v.toString())}
                  sx={{ minWidth: 0, px: 1.25 }}
                >
                  {v.toLocaleString()}
                </Button>
              ))}
            </Stack>

            <TextField
              label="Cash Tendered (NPR)"
              value={tendered}
              onChange={(e) => setTendered(e.target.value)}
              type="number"
              fullWidth
              autoFocus
              slotProps={{ htmlInput: { min: 0, step: 10 } }}
            />

            {tenderedNum > 0 && (
              <Alert
                severity={change >= 0 ? 'success' : 'error'}
                sx={{ mt: 1.5 }}
                icon={false}
              >
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {change >= 0 ? 'Change to return' : 'Amount short'}
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>
                    {formatCurrency(Math.abs(change))}
                  </Typography>
                </Box>
              </Alert>
            )}
          </Box>
        )}

        {method !== 'cash' && (
          <Box
            sx={{
              textAlign: 'center',
              py: 2.5,
              border: '2px dashed',
              borderColor: 'primary.light',
              borderRadius: 2,
            }}
          >
            <Typography variant="h6" color="primary" sx={{ fontWeight: 700 }}>
              {formatCurrency(summary.total)}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              Collect via {METHODS.find((m) => m.value === method)?.label}
            </Typography>
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={loading}>Cancel</Button>
        <Button
          variant="contained"
          size="large"
          loading={loading}
          disabled={method === 'cash' && (tenderedNum <= 0 || tenderedNum < summary.total)}
          onClick={() => onConfirm(method, method === 'cash' ? tenderedNum : undefined)}
          sx={{ minWidth: 160 }}
        >
          Confirm Payment
        </Button>
      </DialogActions>
    </Dialog>
  );
}
