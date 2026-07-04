import { useState, useEffect, useRef, type ReactNode } from 'react';
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
  Paper,
  Chip,
} from '@mui/material';
import AddShoppingCartIcon from '@mui/icons-material/AddShoppingCart';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import PersonIcon from '@mui/icons-material/Person';
import LocalOfferOutlinedIcon from '@mui/icons-material/LocalOfferOutlined';
import { formatAmount, formatCurrency } from '@/utils';
import { ReceiptView } from '@/components/pos/ReceiptView';
import { ReceiptActions } from '@/components/pos/ReceiptActions';
import type { AppliedPromotion, CartItem, PaymentMethod, ReceiptBranding, Transaction } from '@/types';
import { printTransactionReceipt } from '@/utils/receiptPrint';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PaymentCustomerInfo {
  name: string;
  phone?: string;
  email?: string;
  membershipTier?: string;
  loyaltyPoints?: number;
  isWalkIn?: boolean;
}

export interface PaymentDiscountBreakdown {
  promotionLineDiscount: number;
  promotionCartDiscount: number;
  manualDiscount: number;
  loyaltyPointsRedeemed: number;
  appliedPromotions: AppliedPromotion[];
  totalDiscount: number;
}

interface PaymentSummary {
  subtotal: number;
  total: number;
}

interface PaymentModalProps {
  open: boolean;
  items: CartItem[];
  summary: PaymentSummary;
  customer?: PaymentCustomerInfo | null;
  discountBreakdown?: PaymentDiscountBreakdown;
  loading?: boolean;
  transaction?: Transaction | null;
  tenderedAmount?: number;
  error?: string;
  defaultPaymentMethod?: PaymentMethod;
  autoPrint?: boolean;
  receiptBranding?: ReceiptBranding;
  onConfirm: (method: PaymentMethod, tendered?: number) => void;
  onClose: () => void;
  onNewSale: () => void;
}

const METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
  { value: 'esewa', label: 'eSewa' },
  { value: 'khalti', label: 'Khalti' },
];

function formatTier(tier?: string): string {
  if (!tier) return '';
  return tier.charAt(0).toUpperCase() + tier.slice(1);
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <Typography
      variant="overline"
      sx={{ fontWeight: 700, letterSpacing: 0.8, color: 'text.secondary', display: 'block', mb: 1 }}
    >
      {children}
    </Typography>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export function PaymentModal({
  open,
  items,
  summary,
  customer,
  discountBreakdown,
  loading,
  transaction,
  tenderedAmount,
  error,
  defaultPaymentMethod = 'cash',
  autoPrint = false,
  receiptBranding,
  onConfirm,
  onClose,
  onNewSale,
}: PaymentModalProps) {
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [tendered, setTendered] = useState('');
  const printedTxnId = useRef<string | null>(null);

  const breakdown = discountBreakdown ?? {
    promotionLineDiscount: 0,
    promotionCartDiscount: 0,
    manualDiscount: 0,
    loyaltyPointsRedeemed: 0,
    appliedPromotions: [],
    totalDiscount: 0,
  };

  useEffect(() => {
    if (open && !transaction) {
      setMethod(defaultPaymentMethod);
      setTendered('');
      printedTxnId.current = null;
    }
  }, [open, transaction, defaultPaymentMethod]);

  useEffect(() => {
    if (!transaction) {
      printedTxnId.current = null;
      return;
    }
    if (autoPrint && printedTxnId.current !== transaction.id) {
      printedTxnId.current = transaction.id;
      const cash = tenderedAmount ?? (method === 'cash' ? parseFloat(tendered) || undefined : undefined);
      printTransactionReceipt(transaction, cash, receiptBranding);
    }
  }, [transaction, autoPrint, tenderedAmount, method, tendered, receiptBranding]);

  const tenderedNum = parseFloat(tendered) || 0;
  const change = tenderedNum - summary.total;
  const showReceipt = !!transaction;
  const customerName = customer?.name ?? 'Walk-In Customer';
  const isWalkIn = customer?.isWalkIn ?? !customer?.phone;

  if (showReceipt) {
    const txn = transaction!;
    const cash = tenderedAmount ?? (method === 'cash' ? tenderedNum : undefined);

    return (
      <Dialog open={open} maxWidth="sm" fullWidth>
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
          <ReceiptView transaction={txn} tenderedAmount={cash} branding={receiptBranding} />
        </DialogContent>

        <DialogActions sx={{ px: 2, pb: 2, gap: 1, flexDirection: 'column', alignItems: 'stretch' }}>
          <ReceiptActions transaction={txn} tenderedAmount={cash} branding={receiptBranding} compact />
          <Button variant="contained" fullWidth startIcon={<AddShoppingCartIcon />} onClick={onNewSale}>
            New Sale
          </Button>
        </DialogActions>
      </Dialog>
    );
  }

  const totalUnits = items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ fontWeight: 700, pb: 1 }}>
        Confirm Payment
        <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 400, mt: 0.25 }}>
          {totalUnits} item{totalUnits === 1 ? '' : 's'} · {formatCurrency(summary.total)}
        </Typography>
      </DialogTitle>

      <DialogContent sx={{ pt: 0 }}>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: 'minmax(0, 1fr) minmax(0, 1.2fr)' },
            gap: 2,
            mb: 2,
          }}
        >
          {/* Customer */}
          <Paper variant="outlined" sx={{ p: 1.75, borderRadius: 2 }}>
            <SectionLabel>Customer</SectionLabel>
            <Box sx={{ display: 'flex', gap: 1.25, alignItems: 'flex-start' }}>
              <Box
                sx={{
                  width: 40,
                  height: 40,
                  borderRadius: '50%',
                  bgcolor: isWalkIn ? 'action.selected' : 'primary.main',
                  color: isWalkIn ? 'text.secondary' : 'primary.contrastText',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <PersonIcon fontSize="small" />
              </Box>
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, lineHeight: 1.3 }}>
                  {customerName}
                </Typography>
                {isWalkIn ? (
                  <Typography variant="caption" color="text.secondary">
                    Walk-in sale
                  </Typography>
                ) : (
                  <Box sx={{ mt: 0.5 }}>
                    {customer?.phone && (
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                        {customer.phone}
                      </Typography>
                    )}
                    {customer?.email && (
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', wordBreak: 'break-all' }}>
                        {customer.email}
                      </Typography>
                    )}
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.25 }}>
                      {customer?.membershipTier && (
                        <Chip
                          label={formatTier(customer.membershipTier)}
                          size="small"
                          variant="outlined"
                          sx={{ height: 20, fontSize: '0.65rem' }}
                        />
                      )}
                      {customer?.loyaltyPoints != null && customer.loyaltyPoints > 0 && (
                        <Chip
                          label={`${customer.loyaltyPoints} pts`}
                          size="small"
                          color="primary"
                          variant="outlined"
                          sx={{ height: 20, fontSize: '0.65rem' }}
                        />
                      )}
                    </Box>
                  </Box>
                )}
              </Box>
            </Box>
          </Paper>

          {/* Discount summary */}
          <Paper variant="outlined" sx={{ p: 1.75, borderRadius: 2 }}>
            <SectionLabel>Discounts</SectionLabel>
            {breakdown.totalDiscount <= 0 ? (
              <Typography variant="body2" color="text.secondary">
                No discounts applied
              </Typography>
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                {breakdown.appliedPromotions.map((promo) => (
                  <Box key={promo.ruleId} sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0 }}>
                      <LocalOfferOutlinedIcon sx={{ fontSize: 14, color: 'success.main', flexShrink: 0 }} />
                      <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap title={promo.name}>
                        {promo.name}
                      </Typography>
                    </Box>
                    <Typography variant="body2" color="success.main" sx={{ fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                      - {formatAmount(promo.amount)}
                    </Typography>
                  </Box>
                ))}
                {breakdown.manualDiscount > 0 && (
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="body2" color="text.secondary">Manual discount</Typography>
                    <Typography variant="body2" color="success.main" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                      - {formatAmount(breakdown.manualDiscount)}
                    </Typography>
                  </Box>
                )}
                {breakdown.loyaltyPointsRedeemed > 0 && (
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="body2" color="text.secondary">Loyalty redemption</Typography>
                    <Typography variant="body2" color="success.main" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                      - {formatAmount(breakdown.loyaltyPointsRedeemed)}
                    </Typography>
                  </Box>
                )}
                <Divider sx={{ my: 0.25 }} />
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>Total savings</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 700, color: 'success.main', fontVariantNumeric: 'tabular-nums' }}>
                    - {formatAmount(breakdown.totalDiscount)}
                  </Typography>
                </Box>
              </Box>
            )}
          </Paper>
        </Box>

        {/* Items table */}
        <SectionLabel>Order items</SectionLabel>
        <Box
          sx={{
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 1.5,
            mb: 2,
            overflow: 'hidden',
          }}
        >
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: '32px minmax(0, 1fr) 40px 72px 64px 80px',
              bgcolor: 'primary.main',
              color: 'primary.contrastText',
              px: 1.25,
              py: 0.875,
              gap: 0.5,
            }}
          >
            {['#', 'Item', 'Qty', 'Price', 'Disc', 'Total'].map((label, i) => (
              <Typography
                key={label}
                variant="caption"
                sx={{
                  fontWeight: 700,
                  textAlign: i >= 2 ? 'right' : i === 0 ? 'center' : 'left',
                  fontSize: '0.68rem',
                  textTransform: 'uppercase',
                  letterSpacing: 0.3,
                }}
              >
                {label}
              </Typography>
            ))}
          </Box>

          <Box sx={{ maxHeight: 240, overflow: 'auto' }}>
            {items.map((item, index) => {
              const lineGross = item.price * item.quantity;
              const lineDiscount = (item.discount ?? 0) * item.quantity;
              const lineNet = lineGross - lineDiscount;

              return (
                <Box
                  key={item.productId}
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: '32px minmax(0, 1fr) 40px 72px 64px 80px',
                    px: 1.25,
                    py: 0.75,
                    gap: 0.5,
                    alignItems: 'center',
                    borderBottom: '1px solid',
                    borderColor: 'divider',
                    bgcolor: index % 2 === 0 ? 'background.paper' : 'action.hover',
                    '&:last-child': { borderBottom: 0 },
                  }}
                >
                  <Typography variant="caption" sx={{ textAlign: 'center', fontWeight: 700, color: 'text.secondary' }}>
                    {index + 1}
                  </Typography>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.8125rem', lineHeight: 1.3 }} noWrap title={item.name}>
                      {item.name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
                      {item.sku}
                    </Typography>
                  </Box>
                  <Typography variant="body2" sx={{ textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                    {item.quantity}
                  </Typography>
                  <Typography variant="body2" sx={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontSize: '0.8125rem' }}>
                    {formatAmount(item.price)}
                  </Typography>
                  <Typography
                    variant="body2"
                    sx={{
                      textAlign: 'right',
                      fontVariantNumeric: 'tabular-nums',
                      fontSize: '0.8125rem',
                      color: lineDiscount > 0 ? 'success.main' : 'text.disabled',
                    }}
                  >
                    {lineDiscount > 0 ? `- ${formatAmount(lineDiscount)}` : '—'}
                  </Typography>
                  <Typography variant="body2" sx={{ textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                    {formatAmount(lineNet)}
                  </Typography>
                </Box>
              );
            })}
          </Box>
        </Box>

        {/* Bill totals */}
        <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, mb: 2.5, bgcolor: 'action.hover' }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
            <Typography variant="body2" color="text.secondary">Subtotal</Typography>
            <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums' }}>{formatAmount(summary.subtotal)}</Typography>
          </Box>
          {breakdown.promotionLineDiscount > 0 && (
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
              <Typography variant="body2" color="text.secondary">Item promotions</Typography>
              <Typography variant="body2" color="success.main" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                - {formatAmount(breakdown.promotionLineDiscount)}
              </Typography>
            </Box>
          )}
          {breakdown.promotionCartDiscount > 0 && (
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
              <Typography variant="body2" color="text.secondary">Cart promotion</Typography>
              <Typography variant="body2" color="success.main" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                - {formatAmount(breakdown.promotionCartDiscount)}
              </Typography>
            </Box>
          )}
          {breakdown.manualDiscount > 0 && (
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
              <Typography variant="body2" color="text.secondary">Manual discount</Typography>
              <Typography variant="body2" color="success.main" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                - {formatAmount(breakdown.manualDiscount)}
              </Typography>
            </Box>
          )}
          {breakdown.loyaltyPointsRedeemed > 0 && (
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
              <Typography variant="body2" color="text.secondary">Loyalty redemption</Typography>
              <Typography variant="body2" color="success.main" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                - {formatAmount(breakdown.loyaltyPointsRedeemed)}
              </Typography>
            </Box>
          )}
          <Divider sx={{ my: 1 }} />
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>Amount due</Typography>
            <Typography variant="h6" sx={{ fontWeight: 700, color: 'primary.main', fontVariantNumeric: 'tabular-nums' }}>
              {formatCurrency(summary.total)}
            </Typography>
          </Box>
        </Paper>

        <SectionLabel>Payment</SectionLabel>
        <Box sx={{ mb: method === 'cash' ? 1.25 : 2 }}>
          <ToggleButtonGroup
            value={method}
            exclusive
            onChange={(_, v: PaymentMethod) => v && setMethod(v)}
            size="small"
            disabled={loading}
            fullWidth
          >
            {METHODS.map((m) => (
              <ToggleButton key={m.value} value={m.value} sx={{ py: 0.75 }}>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>{m.label}</Typography>
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
        </Box>

        {method === 'cash' && (
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', mb: 1 }}>
            <TextField
              label="Cash tendered (NPR)"
              value={tendered}
              onChange={(e) => setTendered(e.target.value)}
              type="number"
              size="small"
              autoFocus
              disabled={loading}
              sx={{ flex: 1, minWidth: 0 }}
              slotProps={{ htmlInput: { min: 0, step: 10 } }}
            />
            {tenderedNum > 0 && (
              <Alert
                severity={change >= 0 ? 'success' : 'error'}
                icon={false}
                sx={{ flex: 1, minWidth: 0, py: 0.75, px: 1.25, display: 'flex', alignItems: 'center' }}
              >
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', gap: 1 }}>
                  <Typography variant="caption" sx={{ fontWeight: 600 }}>
                    {change >= 0 ? 'Change' : 'Short'}
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
              py: 2,
              border: '2px dashed',
              borderColor: 'primary.light',
              borderRadius: 2,
              mb: 1,
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

      <DialogActions sx={{ px: 3, pb: 2, pt: 0 }}>
        <Button onClick={onClose} disabled={loading}>Cancel</Button>
        <Button
          variant="contained"
          size="large"
          loading={loading}
          disabled={method === 'cash' && (tenderedNum <= 0 || tenderedNum < summary.total)}
          onClick={() => onConfirm(method, method === 'cash' ? tenderedNum : undefined)}
          sx={{ minWidth: 180 }}
        >
          Confirm Payment
        </Button>
      </DialogActions>
    </Dialog>
  );
}
