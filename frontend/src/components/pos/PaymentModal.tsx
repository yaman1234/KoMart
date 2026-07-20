import { useState, useEffect, useRef, useMemo, type ReactNode } from 'react';
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
  IconButton,
  Autocomplete,
} from '@mui/material';
import AddShoppingCartIcon from '@mui/icons-material/AddShoppingCart';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import LocalOfferOutlinedIcon from '@mui/icons-material/LocalOfferOutlined';
import { CustomerPicker } from '@/components/pos/CustomerPicker';
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';
import DeleteIcon from '@mui/icons-material/Delete';
import { formatAmount, formatCurrency } from '@/utils';
import { formatSellLineSubtitle } from '@/utils/uomDisplay';
import { cartLineKey } from '@/utils/cartLine';
import { cashTenderSuggestions } from '@/utils/cashTenderSuggestions';
import { useCheckoutDraft, type CartMutators, type CheckoutDiscountType } from '@/hooks/useCheckoutDraft';
import { ReceiptView } from '@/components/pos/ReceiptView';
import { ReceiptActions } from '@/components/pos/ReceiptActions';
import type { AppliedPromotion, CartItem, PaymentMethod, Product, ReceiptBranding, Transaction } from '@/types';
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

export interface PaymentConfirmPayload {
  method: PaymentMethod;
  tendered?: number;
  items: CartItem[];
  subtotal: number;
  total: number;
  manualDiscount: number;
  loyaltyPointsRedeemed: number;
  notes: string;
  promotionDiscount: number;
  appliedPromotions: AppliedPromotion[];
  discount: number;
}

interface PaymentModalProps {
  open: boolean;
  items: CartItem[];
  cartMutators: CartMutators;
  initialDiscountType?: CheckoutDiscountType;
  initialDiscountInput?: number;
  initialLoyaltyPointsRedeemed?: number;
  products: Product[];
  productCategoryMap: Record<string, string>;
  customerId: string | null;
  onCustomerChange: (id: string | null) => void;
  onAddCustomer: () => void;
  customer?: PaymentCustomerInfo | null;
  loading?: boolean;
  transaction?: Transaction | null;
  tenderedAmount?: number;
  error?: string;
  defaultPaymentMethod?: PaymentMethod;
  autoPrint?: boolean;
  receiptBranding?: ReceiptBranding;
  onConfirm: (payload: PaymentConfirmPayload) => void;
  onClose: () => void;
  onNewSale: () => void;
}

const METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'bank', label: 'Bank' },
  { value: 'esewa', label: 'eSewa' },
];

const noNumberSpinnerSx = {
  MozAppearance: 'textfield',
  '& input[type=number]': { MozAppearance: 'textfield' },
  '& input[type=number]::-webkit-outer-spin-button, & input[type=number]::-webkit-inner-spin-button': {
    WebkitAppearance: 'none',
    margin: 0,
  },
} as const;

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
  cartMutators,
  initialDiscountType = null,
  initialDiscountInput = 0,
  initialLoyaltyPointsRedeemed = 0,
  products,
  productCategoryMap,
  customerId,
  onCustomerChange,
  onAddCustomer,
  customer,
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
  const [addProductValue, setAddProductValue] = useState<Product | null>(null);
  const printedTxnId = useRef<string | null>(null);
  const openSessionRef = useRef(false);
  const customerIdAtOpenRef = useRef<string | null>(customerId);

  const resolvedDefaultMethod: PaymentMethod =
    defaultPaymentMethod === 'card'
      ? 'bank'
      : (defaultPaymentMethod as string) === 'khalti'
        ? 'esewa'
        : defaultPaymentMethod;

  const draft = useCheckoutDraft(items, productCategoryMap, cartMutators);

  const sellableProducts = useMemo(
    () => products.filter((p) => p.sellingPrice > 0),
    [products],
  );

  useEffect(() => {
    if (!open) {
      openSessionRef.current = false;
      return;
    }
    if (transaction || openSessionRef.current) return;

    openSessionRef.current = true;
    customerIdAtOpenRef.current = customerId;
    draft.initDraft({
      discountType: initialDiscountType,
      discountInput: initialDiscountInput,
      loyaltyPointsRedeemed: initialLoyaltyPointsRedeemed,
    });
    setMethod(resolvedDefaultMethod);
    setTendered('');
    setAddProductValue(null);
    printedTxnId.current = null;
  }, [
    open,
    transaction,
    resolvedDefaultMethod,
    initialDiscountType,
    initialDiscountInput,
    initialLoyaltyPointsRedeemed,
    customerId,
    draft.initDraft,
  ]);

  useEffect(() => {
    if (!open || !openSessionRef.current) return;
    if (customerIdAtOpenRef.current === customerId) return;
    customerIdAtOpenRef.current = customerId;
    draft.setLoyalty(0);
  }, [customerId, open, draft.setLoyalty]);

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
  const change = tenderedNum - draft.total;
  const showReceipt = !!transaction;
  const cashSuggestions = useMemo(() => cashTenderSuggestions(draft.total), [draft.total]);
  const breakdown = draft.discountBreakdown;

  const handleConfirm = () => {
    onConfirm({
      method,
      tendered: method === 'cash' ? tenderedNum : undefined,
      items: draft.paymentItems,
      subtotal: draft.subtotal,
      total: draft.total,
      manualDiscount: draft.manualDiscount,
      loyaltyPointsRedeemed: draft.loyaltyPointsRedeemed,
      notes: draft.notes.trim(),
      promotionDiscount: draft.promotionDiscount,
      appliedPromotions: draft.appliedPromotions,
      discount: breakdown.promotionCartDiscount + draft.manualDiscount + draft.loyaltyPointsRedeemed,
    });
  };

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

  const totalUnits = draft.items.reduce((sum, item) => sum + item.quantity, 0);
  const customerLoyalty = customer?.loyaltyPoints ?? 0;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ fontWeight: 700, pb: 1 }}>
        Confirm Payment
        <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 400, mt: 0.25 }}>
          {totalUnits} item{totalUnits === 1 ? '' : 's'} · {formatCurrency(draft.total)}
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
          <Paper variant="outlined" sx={{ p: 1.75, borderRadius: 2 }}>
            <CustomerPicker
              customerId={customerId}
              onCustomerChange={onCustomerChange}
              onAddCustomer={onAddCustomer}
            />
          </Paper>

          <Paper variant="outlined" sx={{ p: 1.75, borderRadius: 2 }}>
            <SectionLabel>Discounts</SectionLabel>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 0.75, mb: 1 }}>
              <ToggleButtonGroup
                value={draft.discountType}
                exclusive
                size="small"
                onChange={(_, v: CheckoutDiscountType) => {
                  draft.setDiscount(v ?? null, 0);
                }}
              >
                <ToggleButton value="flat" sx={{ px: 1.25, py: 0.35, fontSize: '0.75rem' }}>NPR</ToggleButton>
                <ToggleButton value="pct" sx={{ px: 1.25, py: 0.35, fontSize: '0.75rem' }}>%</ToggleButton>
              </ToggleButtonGroup>
              {draft.discountType !== null && (
                <TextField
                  placeholder={draft.discountType === 'pct' ? '%' : 'NPR'}
                  type="number"
                  size="small"
                  value={draft.discountInput || ''}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value) || 0;
                    const max = draft.discountType === 'pct' ? 100 : draft.netAfterPromo;
                    draft.setDiscount(draft.discountType, Math.min(Math.max(0, v), max));
                  }}
                  slotProps={{
                    htmlInput: {
                      min: 0,
                      max: draft.discountType === 'pct' ? 100 : draft.netAfterPromo,
                      step: draft.discountType === 'pct' ? 5 : 10,
                    },
                  }}
                  sx={{
                    width: 88,
                    ...noNumberSpinnerSx,
                    '& .MuiInputBase-root': { height: 30 },
                  }}
                />
              )}
            </Box>

            {customerLoyalty > 0 && (
              <TextField
                label="Loyalty points (1 pt = NPR 1)"
                type="number"
                size="small"
                fullWidth
                value={draft.loyaltyInput || ''}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10) || 0;
                  draft.setLoyalty(Math.min(v, customerLoyalty, draft.maxLoyalty));
                }}
                slotProps={{
                  htmlInput: { min: 0, max: Math.min(customerLoyalty, draft.maxLoyalty) },
                }}
                sx={{ mb: 1, ...noNumberSpinnerSx }}
              />
            )}

            {breakdown.appliedPromotions.length > 0 && (
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.5 }}>
                {breakdown.appliedPromotions.map((promo) => (
                  <Chip
                    key={promo.ruleId}
                    icon={<LocalOfferOutlinedIcon />}
                    label={`${promo.name} (−${formatAmount(promo.amount)})`}
                    size="small"
                    color="success"
                    variant="outlined"
                  />
                ))}
              </Box>
            )}
          </Paper>
        </Box>

        <SectionLabel>Order items</SectionLabel>
        <Box
          sx={{
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 1.5,
            mb: 1,
            overflow: 'hidden',
          }}
        >
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: '32px minmax(0, 1fr) 88px 72px 64px 80px 36px',
              bgcolor: 'primary.main',
              color: 'primary.contrastText',
              px: 1.25,
              py: 0.875,
              gap: 0.5,
              position: 'sticky',
              top: 0,
              zIndex: 1,
            }}
          >
            {['#', 'Item', 'Qty', 'Price', 'Disc', 'Total', ''].map((label, i) => (
              <Typography
                key={label || 'actions'}
                variant="caption"
                sx={{
                  fontWeight: 700,
                  textAlign: i >= 2 && i < 6 ? 'right' : i === 0 ? 'center' : 'left',
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
            {draft.items.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ p: 2, textAlign: 'center' }}>
                No items — add a product below
              </Typography>
            ) : (
              draft.items.map((item, index) => {
                const lineKey = cartLineKey(item.productId, item.sellUom);
                const perUnitDiscount = draft.paymentItems.find(
                  (p) => cartLineKey(p.productId, p.sellUom) === lineKey,
                )?.discount ?? 0;
                const lineDiscount = perUnitDiscount * item.quantity;
                const lineGross = item.price * item.quantity;
                const lineNet = lineGross - lineDiscount;

                return (
                  <Box
                    key={lineKey}
                    sx={{
                      display: 'grid',
                      gridTemplateColumns: '32px minmax(0, 1fr) 88px 72px 64px 80px 36px',
                      px: 1.25,
                      py: 0.75,
                      gap: 0.5,
                      alignItems: 'center',
                      borderBottom: '1px solid',
                      borderColor: 'divider',
                      bgcolor: index % 2 === 0 ? 'background.paper' : 'action.hover',
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
                        {item.sellUom ? ` · ${formatSellLineSubtitle(item.sellUom, item.unitFactor, item.uom ?? 'pcs')}` : ''}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', gap: 0.25 }}>
                      <IconButton
                        size="small"
                        aria-label="Decrease quantity"
                        onClick={() => draft.updateQty(item.productId, item.quantity - 1, item.sellUom)}
                        disabled={item.quantity <= 1}
                        sx={{ p: 0.25, width: 22, height: 22 }}
                      >
                        <RemoveIcon sx={{ fontSize: 14 }} />
                      </IconButton>
                      <Typography variant="body2" sx={{ minWidth: 20, textAlign: 'center', fontWeight: 700, fontSize: '0.75rem' }}>
                        {item.quantity}
                      </Typography>
                      <IconButton
                        size="small"
                        aria-label="Increase quantity"
                        onClick={() => draft.updateQty(item.productId, item.quantity + 1, item.sellUom)}
                        sx={{ p: 0.25, width: 22, height: 22 }}
                      >
                        <AddIcon sx={{ fontSize: 14 }} />
                      </IconButton>
                    </Box>
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
                    <IconButton
                      size="small"
                      aria-label="Remove item"
                      onClick={() => draft.removeLine(item.productId, item.sellUom)}
                      sx={{ p: 0.25 }}
                    >
                      <DeleteIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  </Box>
                );
              })
            )}
          </Box>
        </Box>

        <Autocomplete
          size="small"
          options={sellableProducts}
          value={addProductValue}
          onChange={(_, product) => {
            if (!product) return;
            draft.addProduct(product);
            setAddProductValue(null);
          }}
          getOptionLabel={(p) => `${p.name} (${p.sku})`}
          renderInput={(params) => <TextField {...params} label="Add product" placeholder="Search products…" />}
          sx={{ mb: 2 }}
        />

        <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, mb: 2, bgcolor: 'action.hover' }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
            <Typography variant="body2" color="text.secondary">Subtotal</Typography>
            <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums' }}>{formatAmount(draft.subtotal)}</Typography>
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
              {formatCurrency(draft.total)}
            </Typography>
          </Box>
        </Paper>

        <TextField
          label="Remarks / description"
          multiline
          minRows={2}
          maxRows={4}
          fullWidth
          value={draft.notes}
          onChange={(e) => draft.setNotes(e.target.value)}
          slotProps={{ htmlInput: { maxLength: 500 } }}
          helperText={`${draft.notes.length}/500`}
          sx={{ mb: 2 }}
        />

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
          <>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mb: 1 }}>
              {cashSuggestions.map((amount) => (
                <Chip
                  key={amount}
                  label={formatCurrency(amount)}
                  size="small"
                  clickable
                  color={tenderedNum === amount ? 'primary' : 'default'}
                  onClick={() => setTendered(String(amount))}
                />
              ))}
            </Box>
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', mb: 1 }}>
              <TextField
                label="Cash tendered (NPR)"
                value={tendered}
                onChange={(e) => setTendered(e.target.value)}
                type="number"
                size="small"
                autoFocus
                disabled={loading}
                sx={{ flex: 1, minWidth: 0, ...noNumberSpinnerSx }}
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
          </>
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
              {formatCurrency(draft.total)}
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
          disabled={
            draft.items.length === 0
            || (method === 'cash' && (tenderedNum <= 0 || tenderedNum < draft.total))
          }
          onClick={handleConfirm}
          sx={{ minWidth: 180 }}
        >
          Confirm Payment
        </Button>
      </DialogActions>
    </Dialog>
  );
}
