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
      <Dialog open={open} maxWidth="sm" fullWidth>
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
            borderRadius: 1.5,
            mb: 2,
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: '36px minmax(0, 1fr) 44px 76px 84px',
              bgcolor: 'primary.main',
              color: 'primary.contrastText',
              px: 1.25,
              py: 1,
              gap: 0.75,
            }}
          >
            {[
              { label: 'SN', align: 'center' as const },
              { label: 'Item', align: 'left' as const },
              { label: 'Qty', align: 'center' as const },
              { label: 'Price', align: 'right' as const },
              { label: 'Amount', align: 'right' as const },
            ].map((h) => (
              <Typography
                key={h.label}
                variant="caption"
                sx={{
                  fontWeight: 700,
                  textAlign: h.align,
                  letterSpacing: 0.3,
                  fontSize: '0.7rem',
                  textTransform: 'uppercase',
                }}
              >
                {h.label}
              </Typography>
            ))}
          </Box>

          {/* Rows */}
          <Box sx={{ maxHeight: 280, overflow: 'auto' }}>
            {items.map((item, index) => (
              <Box
                key={item.productId}
                sx={{
                  display: 'grid',
                  gridTemplateColumns: '36px minmax(0, 1fr) 44px 76px 84px',
                  px: 1.25,
                  py: 0.875,
                  gap: 0.75,
                  alignItems: 'center',
                  borderBottom: '1px solid',
                  borderColor: 'divider',
                  bgcolor: index % 2 === 0 ? 'background.paper' : 'action.hover',
                  '&:last-child': { borderBottom: 0 },
                }}
              >
                <Typography
                  variant="body2"
                  sx={{
                    textAlign: 'center',
                    fontWeight: 700,
                    color: 'text.secondary',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {index + 1}
                </Typography>
                <Typography
                  variant="body2"
                  sx={{
                    fontWeight: 600,
                    fontSize: '0.875rem',
                    lineHeight: 1.35,
                    wordBreak: 'break-word',
                  }}
                >
                  {item.name}
                </Typography>
                <Typography
                  variant="body2"
                  sx={{ textAlign: 'center', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}
                >
                  {item.quantity}
                </Typography>
                <Typography
                  variant="body2"
                  sx={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontSize: '0.8125rem' }}
                >
                  {formatAmount(item.price)}
                </Typography>
                <Typography
                  variant="body2"
                  sx={{ textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}
                >
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

        {/* Payment method + quick amounts (same row when cash) */}
        <Box
          sx={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 1,
            mb: method === 'cash' ? 1.25 : 2.5,
          }}
        >
          <Typography variant="subtitle2" sx={{ flexShrink: 0, mr: 0.25 }}>
            Payment Method
          </Typography>
          <ToggleButtonGroup
            value={method}
            exclusive
            onChange={(_, v: PaymentMethod) => v && setMethod(v)}
            size="small"
            sx={{ flexShrink: 0 }}
          >
            {METHODS.map((m) => (
              <ToggleButton key={m.value} value={m.value} sx={{ px: 2, py: 0.5 }}>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>{m.label}</Typography>
              </ToggleButton>
            ))}
          </ToggleButtonGroup>

          {method === 'cash' && (
            <>
              <Divider orientation="vertical" flexItem sx={{ mx: 0.25, display: { xs: 'none', sm: 'block' } }} />
              <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
                Quick
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, flex: 1, minWidth: 0 }}>
                <Button
                  size="small"
                  variant={tenderedNum === summary.total ? 'contained' : 'outlined'}
                  onClick={() => setTendered(summary.total.toString())}
                  sx={{ minWidth: 0, px: 1, py: 0.25, fontSize: '0.75rem' }}
                >
                  Exact
                </Button>
                {QUICK_CASH.filter((v) => v >= summary.total).slice(0, 5).map((v) => (
                  <Button
                    key={v}
                    size="small"
                    variant={tenderedNum === v ? 'contained' : 'outlined'}
                    onClick={() => setTendered(v.toString())}
                    sx={{ minWidth: 0, px: 1, py: 0.25, fontSize: '0.75rem' }}
                  >
                    {v.toLocaleString()}
                  </Button>
                ))}
              </Box>
            </>
          )}
        </Box>

        {/* Cash tendered + change (same row) */}
        {method === 'cash' && (
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', mb: 2.5 }}>
            <TextField
              label="Cash Tendered (NPR)"
              value={tendered}
              onChange={(e) => setTendered(e.target.value)}
              type="number"
              size="small"
              autoFocus
              sx={{ flex: 1, minWidth: 0 }}
              slotProps={{ htmlInput: { min: 0, step: 10 } }}
            />
            {tenderedNum > 0 && (
              <Alert
                severity={change >= 0 ? 'success' : 'error'}
                icon={false}
                sx={{
                  flex: 1,
                  minWidth: 0,
                  py: 0.75,
                  px: 1.25,
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <Box
                  sx={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    width: '100%',
                    gap: 1,
                  }}
                >
                  <Typography variant="caption" sx={{ fontWeight: 600, lineHeight: 1.3 }}>
                    {change >= 0 ? 'Change to return' : 'Amount short'}
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>
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
