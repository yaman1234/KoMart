import { useState, useEffect } from 'react';
import {
  Box,
  Grid,
  Paper,
  Typography,
  TextField,
  InputAdornment,
  Avatar,
  Card,
  CardActionArea,
  CardContent,
  IconButton,
  Divider,
  Button,
  Chip,
  Tabs,
  Tab,
  Badge,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Collapse,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  ToggleButtonGroup,
  ToggleButton,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import QrCodeScannerIcon from '@mui/icons-material/QrCodeScanner';
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';
import DeleteIcon from '@mui/icons-material/Delete';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import LocalOfferIcon from '@mui/icons-material/LocalOffer';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import { useQueryClient } from '@tanstack/react-query';

import { useProducts } from '@/hooks/useProducts';
import { useCreateCustomer, useCustomer } from '@/hooks/useCustomers';
import { useCartStore, useAuthStore } from '@/store';
import { transactionService } from '@/services';
import { formatAmount, formatCurrency } from '@/utils';
import { PRODUCT_CATEGORIES, QUERY_KEYS } from '@/constants';
import { PaymentModal } from '@/components/pos/PaymentModal';
import { CustomerPicker } from '@/components/pos/CustomerPicker';
import type { Product, Transaction, PaymentMethod } from '@/types';

// ── Quick-create customer form ────────────────────────────────────────────────
interface CreateCustForm { name: string; phone: string; email: string }
const EMPTY_FORM: CreateCustForm = { name: '', phone: '', email: '' };

export function POSPage() {
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [receipt, setReceipt] = useState<Transaction | null>(null);
  const [processing, setProcessing] = useState(false);
  const [discountOpen, setDiscountOpen] = useState(false);
  const [discountType, setDiscountType] = useState<'flat' | 'pct'>('flat');
  const [discountInput, setDiscountInput] = useState(0);
  const [qtyErrors, setQtyErrors] = useState<Record<string, string>>({});
  const [tenderedAmount, setTenderedAmount] = useState<number | undefined>(undefined);

  // Quick-create customer dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [custForm, setCustForm] = useState<CreateCustForm>(EMPTY_FORM);
  const [custFormError, setCustFormError] = useState('');

  const queryClient = useQueryClient();
  const { items, addItem, removeItem, updateQuantity, customerId, setCustomer, clearCart, loyaltyPointsRedeemed } = useCartStore();

  // Backspace = remove last cart item (when not typing in an input)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      const isEditable = tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable;
      if (e.key === 'Backspace' && !isEditable && items.length > 0) {
        removeItem(items[items.length - 1].productId);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [items, removeItem]);
  const user = useAuthStore((s) => s.user);
  const createCustomerMutation = useCreateCustomer();

  const { data: productsData } = useProducts({ search, pageSize: 50 });
  const { data: paymentCustomer } = useCustomer(customerId ?? '');

  const products = productsData?.data ?? [];
  const allCategories = ['All', ...Array.from(new Set(PRODUCT_CATEGORIES))];
  const displayedProducts = categoryFilter === 'All'
    ? products
    : products.filter((p) => p.category === categoryFilter);

  // ── Cart totals (prices are tax-inclusive — no separate tax line) ──────────
  const subtotal = items.reduce((s, i) => s + i.price * i.quantity, 0);
  const overallDiscount = discountType === 'pct'
    ? Math.round(subtotal * discountInput / 100 * 100) / 100
    : discountInput;
  const totalDiscount = overallDiscount + loyaltyPointsRedeemed;
  const total = Math.max(0, subtotal - totalDiscount);

  // ── Stock helpers ─────────────────────────────────────────────────────────
  const getStock = (productId: string) =>
    products.find((p) => p.id === productId)?.stock ?? Infinity;

  const handleAddProduct = (product: Product) => {
    if (product.stock === 0) return;
    const existing = items.find((i) => i.productId === product.id);
    if (existing && existing.quantity >= product.stock) {
      setQtyErrors((prev) => ({ ...prev, [product.id]: `Only ${product.stock} in stock` }));
      return;
    }
    addItem({
      productId: product.id,
      name: product.name,
      sku: product.sku,
      image: product.images[0],
      price: product.sellingPrice,
      quantity: 1,
      discount: 0,
    });
    setQtyErrors((prev) => { const n = { ...prev }; delete n[product.id]; return n; });
  };

  const handleQtyChange = (productId: string, newQty: number) => {
    if (isNaN(newQty) || newQty < 1) { updateQuantity(productId, 0); return; }
    const stock = getStock(productId);
    if (newQty > stock) {
      setQtyErrors((prev) => ({ ...prev, [productId]: `Max ${stock} in stock` }));
      updateQuantity(productId, stock);
    } else {
      setQtyErrors((prev) => { const n = { ...prev }; delete n[productId]; return n; });
      updateQuantity(productId, newQty);
    }
  };

  // ── Payment ────────────────────────────────────────────────────────────────
  const handlePayment = async (method: PaymentMethod, tendered?: number) => {
    if (items.length === 0) return;
    setTenderedAmount(tendered);
    setProcessing(true);
    try {
      const txn = await transactionService.create({
        customerId: customerId ?? undefined,
        customerName: paymentCustomer?.name ?? 'Walk-In',
        items,
        subtotal,
        discount: totalDiscount,
        tax: 0,
        loyaltyPointsRedeemed,
        total,
        paymentMethod: method,
        createdBy: user?.name ?? 'Cashier',
      });
      // Keep modal open — PaymentModal switches to receipt view
      setReceipt(txn);
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.products });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.inventory });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.dashboard });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.transactions });
    } finally {
      setProcessing(false);
    }
  };

  const handleNewSale = () => {
    clearCart();
    setReceipt(null);
    setPaymentOpen(false);
    setSearch('');
    setDiscountInput(0);
    setDiscountType('flat');
    setDiscountOpen(false);
    setQtyErrors({});
    setTenderedAmount(undefined);
  };

  // ── Quick create customer ─────────────────────────────────────────────────
  const handleCreateCustomer = async () => {
    if (!custForm.name.trim()) { setCustFormError('Name is required'); return; }
    if (!custForm.phone.trim()) { setCustFormError('Phone is required'); return; }
    try {
      const created = await createCustomerMutation.mutateAsync({
        name: custForm.name.trim(),
        phone: custForm.phone.trim(),
        email: custForm.email.trim(),
      });
      setCustomer(created.id);
      setCreateOpen(false);
      setCustForm(EMPTY_FORM);
      setCustFormError('');
    } catch {
      setCustFormError('Failed to create customer. Try again.');
    }
  };

  return (
    <Box
      sx={{
        flex: 1,
        display: 'flex',
        minHeight: 0,
        maxHeight: 'calc(100dvh - 88px)',
        height: 'calc(100dvh - 88px)',
        width: '100%',
        gap: 0,
        overflow: 'hidden',
      }}
    >
      {/* ── Left: Product Grid (fills all space left of cart) ── */}
      <Box
        sx={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0,
          minHeight: 0,
          pr: { xs: 1.5, sm: 2 },
          overflow: 'hidden',
        }}
      >
        <Paper sx={{ p: 2, mb: 2 }}>
          <TextField
            fullWidth
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search products or scan barcode..."
            size="small"
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start"><SearchIcon color="action" /></InputAdornment>
                ),
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton size="small"><QrCodeScannerIcon /></IconButton>
                  </InputAdornment>
                ),
              },
            }}
          />
        </Paper>

        <Tabs
          value={categoryFilter}
          onChange={(_, v: string) => setCategoryFilter(v)}
          variant="scrollable"
          scrollButtons="auto"
          sx={{ mb: 2, bgcolor: 'background.paper', borderRadius: 2, px: 1 }}
        >
          {allCategories.map((cat) => (
            <Tab key={cat} value={cat} label={cat} sx={{ minWidth: 80 }} />
          ))}
        </Tabs>

        <Box sx={{ flex: 1, overflow: 'auto' }}>
          <Grid container spacing={1.5}>
            {displayedProducts.map((product) => {
              const inCart = items.find((i) => i.productId === product.id);
              const atMax = !!inCart && inCart.quantity >= product.stock;
              return (
                <Grid key={product.id} size={{ xs: 6, sm: 4, md: 3, lg: 2, xl: 2 }}>
                  <Tooltip title={qtyErrors[product.id] ?? ''} open={!!qtyErrors[product.id]}>
                    <Card
                      sx={{
                        height: '100%',
                        opacity: product.stock === 0 ? 0.45 : 1,
                        border: inCart ? 2 : 0,
                        borderColor: atMax ? 'warning.main' : 'primary.main',
                      }}
                    >
                      <CardActionArea
                        onClick={() => handleAddProduct(product)}
                        disabled={product.stock === 0}
                        sx={{ height: '100%' }}
                      >
                        <CardContent sx={{ p: 1.5 }}>
                          <Avatar
                            src={product.images[0]}
                            variant="rounded"
                            sx={{ width: '100%', height: 80, mb: 1, borderRadius: 1 }}
                          >
                            {product.name[0]}
                          </Avatar>
                          <Typography variant="caption" sx={{ fontWeight: 600, lineHeight: 1.3 }} noWrap>
                            {product.name}
                          </Typography>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 0.5 }}>
                            <Typography variant="body2" color="primary" sx={{ fontWeight: 700 }}>
                              {formatCurrency(product.sellingPrice)}
                            </Typography>
                            <Chip
                              label={product.stock === 0 ? 'Out' : product.stock}
                              size="small"
                              color={product.stock === 0 ? 'error' : product.stock <= product.lowStockThreshold ? 'warning' : 'default'}
                              sx={{ height: 18, fontSize: '0.65rem' }}
                            />
                          </Box>
                        </CardContent>
                      </CardActionArea>
                    </Card>
                  </Tooltip>
                </Grid>
              );
            })}
            {displayedProducts.length === 0 && (
              <Grid size={12}>
                <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
                  No products found
                </Typography>
              </Grid>
            )}
          </Grid>
        </Box>
      </Box>

      {/* ── Right: Cart Panel (fixed width, flush to right edge) ── */}
      <Paper
        elevation={2}
        sx={{
          width: { xs: 440, sm: 500, md: 540 },
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          p: { xs: 1.5, sm: 2 },
          borderRadius: '12px 0 0 12px',
          borderRight: 0,
          alignSelf: 'stretch',
          minHeight: 0,
          maxHeight: '100%',
          overflow: 'hidden',
        }}
      >

        <CustomerPicker
          customerId={customerId}
          onCustomerChange={setCustomer}
          onAddCustomer={() => { setCustForm(EMPTY_FORM); setCustFormError(''); setCreateOpen(true); }}
        />

        <Divider sx={{ flexShrink: 0 }} />

        {/* Cart header */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 1.25, flexShrink: 0 }}>
          <Badge badgeContent={items.length} color="primary">
            <ShoppingCartIcon />
          </Badge>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, flex: 1 }}>Cart</Typography>
          {items.length > 0 && (
            <Button size="small" color="error" onClick={() => { clearCart(); setDiscountInput(0); setQtyErrors({}); }}>
              Clear
            </Button>
          )}
        </Box>

        {/* Cart items — scrollable middle section */}
        <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto', mb: 1 }}>
          {items.length === 0 ? (
            <Box sx={{ py: 6, textAlign: 'center' }}>
              <ShoppingCartIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
              <Typography color="text.secondary" variant="body2">
                Tap a product to add it
              </Typography>
            </Box>
          ) : (
            <TableContainer>
              <Table
                size="small"
                stickyHeader
                sx={{ tableLayout: 'fixed', width: '100%' }}
              >
                <colgroup>
                  <col />
                  <col style={{ width: 96 }} />
                  <col style={{ width: 58 }} />
                  <col style={{ width: 62 }} />
                  <col style={{ width: 32 }} />
                </colgroup>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700, pl: 0, pr: 0.5 }}>Item</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 700, px: 0.25, whiteSpace: 'nowrap' }}>Qty</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, px: 0.25, whiteSpace: 'nowrap' }}>Price</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, px: 0.25, whiteSpace: 'nowrap' }}>Total</TableCell>
                    <TableCell padding="none" />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {items.map((item) => {
                    const stock = getStock(item.productId);
                    const err = qtyErrors[item.productId];
                    return (
                      <TableRow key={item.productId} sx={{ '&:last-child td': { border: 0 } }}>
                        <TableCell sx={{ pl: 0, pr: 1, verticalAlign: 'top' }}>
                          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, minWidth: 0 }}>
                            <Avatar
                              src={item.image}
                              variant="rounded"
                              sx={{ width: 36, height: 36, flexShrink: 0, mt: 0.25 }}
                            >
                              {item.name[0]}
                            </Avatar>
                            <Box sx={{ minWidth: 0, flex: 1 }}>
                              <Typography
                                variant="body2"
                                sx={{
                                  fontWeight: 600,
                                  fontSize: '0.8125rem',
                                  lineHeight: 1.35,
                                  whiteSpace: 'normal',
                                  wordBreak: 'break-word',
                                }}
                              >
                                {item.name}
                              </Typography>
                              {err && (
                                <Typography variant="caption" color="warning.main" sx={{ display: 'block', mt: 0.25 }}>
                                  {err}
                                </Typography>
                              )}
                            </Box>
                          </Box>
                        </TableCell>

                        {/* Qty controls */}
                        <TableCell align="center" sx={{ px: 0.25 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0 }}>
                            <IconButton
                              size="small"
                              onClick={() => handleQtyChange(item.productId, item.quantity - 1)}
                              sx={{ p: 0.2 }}
                            >
                              <RemoveIcon sx={{ fontSize: 13 }} />
                            </IconButton>
                            <TextField
                              value={item.quantity}
                              onChange={(e) => handleQtyChange(item.productId, parseInt(e.target.value))}
                              type="number"
                              size="small"
                              sx={{ width: 36 }}
                              slotProps={{
                                htmlInput: {
                                  min: 1,
                                  max: stock,
                                  style: { textAlign: 'center', padding: '2px 2px', fontSize: '0.8rem' },
                                },
                              }}
                            />
                            <IconButton
                              size="small"
                              onClick={() => handleQtyChange(item.productId, item.quantity + 1)}
                              disabled={item.quantity >= stock}
                              sx={{ p: 0.2 }}
                            >
                              <AddIcon sx={{ fontSize: 13 }} />
                            </IconButton>
                          </Box>
                        </TableCell>

                        {/* Unit price */}
                        <TableCell align="right" sx={{ px: 0.25 }}>
                          <Typography variant="caption" noWrap sx={{ fontSize: '0.72rem' }}>
                            {formatAmount(item.price)}
                          </Typography>
                        </TableCell>

                        {/* Line total */}
                        <TableCell align="right" sx={{ px: 0.25 }}>
                          <Typography variant="caption" sx={{ fontWeight: 600, fontSize: '0.72rem' }} noWrap>
                            {formatAmount(item.price * item.quantity)}
                          </Typography>
                        </TableCell>

                        {/* Delete */}
                        <TableCell padding="none">
                          <IconButton size="small" color="error" onClick={() => removeItem(item.productId)}>
                            <DeleteIcon sx={{ fontSize: 14 }} />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Box>

        {/* Footer: discount + totals + pay — always visible */}
        <Box sx={{ flexShrink: 0 }}>
        <Divider sx={{ mb: 1 }} />

        {/* Collapsible Discount Section */}
        <Box
          sx={{ display: 'flex', alignItems: 'center', cursor: 'pointer', mb: 0.5, userSelect: 'none' }}
          onClick={() => setDiscountOpen((v) => !v)}
        >
          <LocalOfferIcon fontSize="small" sx={{ mr: 0.75, color: 'text.secondary' }} />
          <Typography variant="body2" sx={{ flex: 1, fontWeight: 600 }}>Discount</Typography>
          {overallDiscount > 0 && (
            <Chip
              label={`-${formatAmount(overallDiscount)}`}
              size="small"
              color="success"
              sx={{ mr: 1, height: 20, fontSize: '0.7rem' }}
            />
          )}
          {discountOpen ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
        </Box>
        <Collapse in={discountOpen}>
          <Box sx={{ display: 'flex', gap: 1, pb: 1.5, pt: 0.5, alignItems: 'flex-start' }}>
            {/* NPR / % toggle */}
            <ToggleButtonGroup
              value={discountType}
              exclusive
              size="small"
              onChange={(_, v: 'flat' | 'pct') => v && setDiscountType(v)}
              sx={{ flexShrink: 0 }}
            >
              <ToggleButton value="flat" sx={{ px: 1.5, py: 0.75, fontSize: '0.75rem' }}>NPR</ToggleButton>
              <ToggleButton value="pct"  sx={{ px: 1.5, py: 0.75, fontSize: '0.75rem' }}>%</ToggleButton>
            </ToggleButtonGroup>

            <TextField
              label={discountType === 'pct' ? 'Discount (%)' : 'Discount (NPR)'}
              type="number"
              size="small"
              fullWidth
              value={discountInput || ''}
              onChange={(e) => {
                const v = parseFloat(e.target.value) || 0;
                const max = discountType === 'pct' ? 100 : subtotal;
                setDiscountInput(Math.min(Math.max(0, v), max));
              }}
              slotProps={{ htmlInput: { min: 0, max: discountType === 'pct' ? 100 : subtotal, step: discountType === 'pct' ? 5 : 10 } }}
              helperText={discountType === 'pct' && discountInput > 0
                ? `= ${formatAmount(overallDiscount)}`
                : 'Applied to entire bill'}
            />
          </Box>
        </Collapse>

        <Divider sx={{ mb: 1 }} />

        {/* Totals */}
        <Box sx={{ mb: 1.5 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
            <Typography variant="body2" color="text.secondary">Subtotal</Typography>
            <Typography variant="body2">{formatAmount(subtotal)}</Typography>
          </Box>
          {totalDiscount > 0 && (
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
              <Typography variant="body2" color="success.main">Discount</Typography>
              <Typography variant="body2" color="success.main">- {formatAmount(totalDiscount)}</Typography>
            </Box>
          )}
          <Divider sx={{ my: 0.75 }} />
          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>Total</Typography>
            <Typography variant="h6" sx={{ fontWeight: 700 }} color="primary">
              {formatCurrency(total)}
            </Typography>
          </Box>
        </Box>

        <Button
          fullWidth
          variant="contained"
          size="large"
          disabled={items.length === 0}
          onClick={() => setPaymentOpen(true)}
          sx={{ py: 1.5, fontSize: '1rem', fontWeight: 700 }}
        >
          Pay {formatCurrency(total)}
        </Button>
        </Box>
      </Paper>

      {/* ── Payment modal (transitions to receipt on success) ─────────────── */}
      <PaymentModal
        open={paymentOpen}
        items={items}
        summary={{ subtotal, discount: totalDiscount, total }}
        loading={processing}
        transaction={receipt}
        tenderedAmount={tenderedAmount}
        onConfirm={handlePayment}
        onClose={() => {
          if (!receipt) setPaymentOpen(false);
        }}
        onNewSale={handleNewSale}
      />

      {/* ── Quick-create customer dialog ───────────────────────────────────── */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>New Customer</DialogTitle>
        <DialogContent>
          {custFormError && <Alert severity="error" sx={{ mb: 2 }}>{custFormError}</Alert>}
          <TextField
            label="Full Name"
            value={custForm.name}
            onChange={(e) => { setCustForm((f) => ({ ...f, name: e.target.value })); setCustFormError(''); }}
            fullWidth
            margin="normal"
            required
            autoFocus
          />
          <TextField
            label="Phone Number"
            value={custForm.phone}
            onChange={(e) => { setCustForm((f) => ({ ...f, phone: e.target.value })); setCustFormError(''); }}
            fullWidth
            margin="normal"
            required
          />
          <TextField
            label="Email (optional)"
            value={custForm.email}
            onChange={(e) => setCustForm((f) => ({ ...f, email: e.target.value }))}
            fullWidth
            margin="normal"
            type="email"
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setCreateOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            startIcon={<PersonAddIcon />}
            loading={createCustomerMutation.isPending}
            onClick={() => void handleCreateCustomer()}
          >
            Create & Select
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
