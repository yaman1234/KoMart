import { useState, useEffect, useMemo, useCallback, memo, useRef } from 'react';
import {
  Box,
  Grid,
  Paper,
  Typography,
  TextField,
  InputAdornment,
  Card,
  CardActionArea,
  CardContent,
  IconButton,
  Divider,
  Button,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Badge,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  ToggleButtonGroup,
  ToggleButton,
  Chip,
  CircularProgress,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import QrCodeScannerIcon from '@mui/icons-material/QrCodeScanner';
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';
import DeleteIcon from '@mui/icons-material/Delete';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import LocalOfferIcon from '@mui/icons-material/LocalOffer';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import PaymentIcon from '@mui/icons-material/Payment';
import VisibilityIcon from '@mui/icons-material/Visibility';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import { useQueryClient } from '@tanstack/react-query';

import { useInfiniteProducts } from '@/hooks/useProducts';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useEvaluateDiscounts, useDiscountRules } from '@/hooks/useDiscounts';
import { useCreateCustomer, useCustomer } from '@/hooks/useCustomers';
import { useSuppliers } from '@/hooks/useSuppliers';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { useCartStore, useAuthStore } from '@/store';
import { transactionService } from '@/services';
import { getErrorMessage } from '@/services/apiClient';
import { showSuccess } from '@/utils/toast';
import { formatAmount, formatCurrency } from '@/utils';
import { DROPDOWN_PAGE_SIZE, POS_PRODUCTS_PAGE_SIZE, PRODUCT_CATEGORIES, QUERY_KEYS } from '@/constants';
import { useStoreSettings } from '@/hooks/useSettings';
import { receiptBrandingFromSettings } from '@/utils/receiptPrint';
import { buildProductDiscountMap } from '@/utils/discountDisplay';
import { PaymentModal } from '@/components/pos/PaymentModal';
import { CustomerPicker } from '@/components/pos/CustomerPicker';
import { PriceWithUom } from '@/components/products/PriceWithUom';
import { ProductQuickViewDialog } from '@/components/products/ProductQuickViewDialog';
import { DRAWER_COLLAPSED } from '@/layouts/Sidebar';
import type { Product, Transaction, PaymentMethod } from '@/types';

const CART_EXPANDED_WIDTH = 'clamp(300px, 38vw, 540px)';

const qtyBadgeSx = {
  '& .MuiBadge-badge': {
    fontWeight: 800,
    fontSize: '0.8rem',
    minWidth: 22,
    height: 22,
    px: 0.5,
    bgcolor: 'error.main',
    color: 'error.contrastText',
    boxShadow: '0 2px 6px rgba(0,0,0,0.35)',
    border: '2px solid',
    borderColor: 'background.paper',
  },
} as const;

const noNumberSpinnerSx = {
  MozAppearance: 'textfield',
  '& input[type=number]': { MozAppearance: 'textfield' },
  '& input[type=number]::-webkit-outer-spin-button, & input[type=number]::-webkit-inner-spin-button': {
    WebkitAppearance: 'none',
    margin: 0,
  },
} as const;

interface CreateCustForm { name: string; phone: string; email: string }
const EMPTY_FORM: CreateCustForm = { name: '', phone: '', email: '' };

interface CollapsedCartRailProps {
  totalUnits: number;
  total: number;
  hasItems: boolean;
  onExpand: () => void;
  onPay: () => void;
}

interface ProductCardProps {
  product: Product;
  qtyInCart: number;
  discountLabel?: string | null;
  onAdd: (product: Product) => void;
  onViewDetails: (product: Product) => void;
}

const POS_IMAGE_CHIP_SX = {
  height: 18,
  fontSize: '0.55rem',
  fontWeight: 700,
  bgcolor: 'rgba(0,0,0,0.62)',
  color: 'common.white',
  border: '1px solid rgba(255,255,255,0.2)',
  backdropFilter: 'blur(4px)',
  '& .MuiChip-label': { px: 0.6 },
  maxWidth: '100%',
} as const;

const ProductCard = memo(function ProductCard({ product, qtyInCart, discountLabel, onAdd, onViewDetails }: ProductCardProps) {
  const inCart = qtyInCart > 0;
  const notBillable = product.sellingPrice <= 0;
  const stockColor =
    product.stock === 0 ? 'error' : product.stock <= product.lowStockThreshold ? 'warning' : 'success';
  const stockLabel =
    product.stock === 0
      ? 'Out'
      : product.stock <= product.lowStockThreshold
        ? `Low: ${product.stock}`
        : String(product.stock);
  const visibleTags = (product.tags ?? []).slice(0, 2);
  const hiddenTagCount = Math.max(0, (product.tags ?? []).length - visibleTags.length);
  const cardDisabled = product.stock === 0 || notBillable;

  return (
    <Card
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        opacity: cardDisabled ? 0.45 : 1,
        border: inCart ? 2 : 0,
        borderColor: 'primary.main',
      }}
    >
      <CardActionArea
        onClick={() => onAdd(product)}
        disabled={cardDisabled}
        sx={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'stretch' }}
      >
        {/* Image section with qty overlay */}
        <Box sx={{ position: 'relative', flexShrink: 0 }}>
          {product.images[0] ? (
            <Box
              component="img"
              src={product.images[0]}
              alt={product.name}
              sx={{
                width: '100%',
                height: 110,
                objectFit: 'cover',
                display: 'block',
                bgcolor: 'action.hover',
              }}
            />
          ) : (
            <Box
              sx={{
                width: '100%',
                height: 110,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                bgcolor: 'action.hover',
                fontSize: '1.75rem',
                fontWeight: 700,
                color: 'text.disabled',
                userSelect: 'none',
              }}
            >
              {(product.name[0] ?? '?').toUpperCase()}
            </Box>
          )}
          {qtyInCart > 0 && (
            <Box
              sx={{
                position: 'absolute',
                top: 6,
                right: 6,
                minWidth: 22,
                height: 22,
                px: 0.5,
                borderRadius: '11px',
                bgcolor: 'error.main',
                color: 'error.contrastText',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 800,
                fontSize: '0.8rem',
                lineHeight: 1,
                boxShadow: '0 2px 6px rgba(0,0,0,0.35)',
                border: '2px solid',
                borderColor: 'background.paper',
                zIndex: 2,
              }}
            >
              {qtyInCart}
            </Box>
          )}

          {product.category && (
            <Box sx={{ position: 'absolute', top: 6, left: 6, zIndex: 1, maxWidth: 'calc(100% - 40px)' }}>
              <Chip label={product.category} size="small" sx={POS_IMAGE_CHIP_SX} />
            </Box>
          )}

          <Box
            sx={{
              position: 'absolute',
              bottom: 6,
              left: 6,
              right: 6,
              zIndex: 1,
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'space-between',
              gap: 0.5,
            }}
          >
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.4, minWidth: 0, flex: '1 1 auto', pr: 0.5 }}>
              {visibleTags.map((tag) => (
                <Chip key={tag} label={tag} size="small" sx={POS_IMAGE_CHIP_SX} />
              ))}
              {hiddenTagCount > 0 && (
                <Chip label={`+${hiddenTagCount}`} size="small" sx={POS_IMAGE_CHIP_SX} />
              )}
              {discountLabel && (
                <Tooltip title={discountLabel}>
                  <Chip
                    icon={<LocalOfferIcon sx={{ fontSize: '0.7rem !important', color: 'inherit !important' }} />}
                    label={discountLabel}
                    size="small"
                    sx={{ ...POS_IMAGE_CHIP_SX, bgcolor: 'rgba(46,125,50,0.85)' }}
                  />
                </Tooltip>
              )}
            </Box>
            <IconButton
              size="small"
              aria-label="View product details"
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onViewDetails(product);
              }}
              sx={{
                width: 28,
                height: 28,
                flexShrink: 0,
                bgcolor: 'rgba(0,0,0,0.62)',
                color: 'common.white',
                border: '1px solid rgba(255,255,255,0.2)',
                backdropFilter: 'blur(4px)',
                '&:hover': { bgcolor: 'rgba(0,0,0,0.78)' },
              }}
            >
              <VisibilityIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Box>
        </Box>

        {/* Info section */}
        <CardContent sx={{ p: 1.25, pt: 1, flexGrow: 1, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          <Typography
            variant="caption"
            sx={{
              fontWeight: 600,
              lineHeight: 1.3,
              fontSize: '0.75rem',
              display: '-webkit-box',
              WebkitBoxOrient: 'vertical',
              WebkitLineClamp: 2,
              overflow: 'hidden',
            }}
            title={product.name}
          >
            {product.name}
          </Typography>
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 0.5,
              mt: 'auto',
              minWidth: 0,
            }}
          >
            <Box sx={{ minWidth: 0, overflow: 'hidden', flex: '1 1 auto' }}>
              <PriceWithUom
                price={product.sellingPrice}
                uom={product.uom ?? 'pcs'}
                priceSx={{ fontSize: { xs: '0.7rem', sm: '0.8125rem' } }}
              />
            </Box>
            <Chip
              label={stockLabel}
              color={stockColor}
              size="small"
              sx={{ height: 18, fontSize: '0.6rem', fontWeight: 700, flexShrink: 0 }}
            />
          </Box>
        </CardContent>
      </CardActionArea>
    </Card>
  );
});

interface CartQtyStepperProps {
  quantity: number;
  onDecrement: () => void;
  onIncrement: () => void;
}

const CartQtyStepper = memo(function CartQtyStepper({
  quantity,
  onDecrement,
  onIncrement,
}: CartQtyStepperProps) {
  return (
    <Box
      component="span"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.25,
        flexShrink: 0,
        touchAction: 'manipulation',
      }}
    >
      <IconButton
        type="button"
        size="small"
        aria-label="Decrease quantity"
        onClick={(e) => {
          e.stopPropagation();
          onDecrement();
        }}
        sx={{ p: 0.35, width: 24, height: 24 }}
      >
        <RemoveIcon sx={{ fontSize: 13, pointerEvents: 'none' }} />
      </IconButton>
      <Typography
        component="span"
        variant="body2"
        sx={{
          minWidth: 24,
          textAlign: 'center',
          fontWeight: 800,
          fontSize: '0.75rem',
          fontVariantNumeric: 'tabular-nums',
          userSelect: 'none',
          lineHeight: 1.4,
          px: 0.5,
          py: 0.25,
          borderRadius: 1,
          bgcolor: 'primary.main',
          color: 'primary.contrastText',
        }}
      >
        {quantity}
      </Typography>
      <IconButton
        type="button"
        size="small"
        aria-label="Increase quantity"
        onClick={(e) => {
          e.stopPropagation();
          onIncrement();
        }}
        sx={{ p: 0.35, width: 24, height: 24 }}
      >
        <AddIcon sx={{ fontSize: 13, pointerEvents: 'none' }} />
      </IconButton>
    </Box>
  );
});

function CollapsedCartRail({ totalUnits, total, hasItems, onExpand, onPay }: CollapsedCartRailProps) {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        height: '100%',
        py: 1,
        gap: 1.5,
      }}
    >
      <Tooltip title="Expand cart" placement="left">
        <IconButton onClick={onExpand} size="small">
          <ChevronLeftIcon />
        </IconButton>
      </Tooltip>

      <Tooltip title="View cart" placement="left">
        <IconButton onClick={onExpand} sx={{ my: 1 }}>
          <Badge badgeContent={totalUnits} invisible={totalUnits === 0} sx={qtyBadgeSx}>
            <ShoppingCartIcon />
          </Badge>
        </IconButton>
      </Tooltip>

      <Typography
        variant="caption"
        sx={{
          writingMode: 'vertical-rl',
          textOrientation: 'mixed',
          transform: 'rotate(180deg)',
          fontWeight: 700,
          color: 'primary.main',
          fontSize: '0.7rem',
          letterSpacing: 0.5,
          flex: 1,
        }}
      >
        {formatCurrency(total)}
      </Typography>

      <Tooltip title={hasItems ? 'Pay' : 'Cart is empty'} placement="left">
        <span>
          <IconButton color="primary" disabled={!hasItems} onClick={onPay}>
            <PaymentIcon />
          </IconButton>
        </span>
      </Tooltip>
    </Box>
  );
}

export function POSPage() {
  const isMobile = useIsMobile();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [supplierIdFilter, setSupplierIdFilter] = useState('');
  const [priceSort, setPriceSort] = useState<'asc' | 'desc' | ''>('');
  const productGridSentinelRef = useRef<HTMLDivElement | null>(null);
  const stockByIdRef = useRef(new Map<string, number>());
  const [cartCollapsed, setCartCollapsed] = useState(isMobile);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [receipt, setReceipt] = useState<Transaction | null>(null);
  const [processing, setProcessing] = useState(false);
  const [paymentError, setPaymentError] = useState('');
  const [discountType, setDiscountType] = useState<'flat' | 'pct' | null>(null);
  const [discountInput, setDiscountInput] = useState(0);
  const [tenderedAmount, setTenderedAmount] = useState<number | undefined>(undefined);

  // Quick-create customer dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [custForm, setCustForm] = useState<CreateCustForm>(EMPTY_FORM);
  const [custFormError, setCustFormError] = useState('');
  const [detailProduct, setDetailProduct] = useState<Product | null>(null);

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
  const { data: storeSettings } = useStoreSettings();
  const receiptBranding = storeSettings ? receiptBrandingFromSettings(storeSettings) : undefined;
  const createCustomerMutation = useCreateCustomer();

  const {
    data: infiniteProductsData,
    isLoading: productsLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useInfiniteProducts({
    search: debouncedSearch || undefined,
    category: categoryFilter || undefined,
    supplierId: supplierIdFilter || undefined,
    sellableOnly: true,
    pageSize: POS_PRODUCTS_PAGE_SIZE,
  });
  const { data: discountRules = [] } = useDiscountRules(true);
  const { data: paymentCustomer } = useCustomer(customerId ?? '');
  const { data: suppliersData } = useSuppliers({ pageSize: DROPDOWN_PAGE_SIZE });
  const suppliers = suppliersData?.data ?? [];

  const products = infiniteProductsData?.pages.flatMap((p) => p.data) ?? [];

  useEffect(() => {
    for (const p of products) {
      stockByIdRef.current.set(p.id, p.stock);
    }
  }, [products]);

  useEffect(() => {
    const el = productGridSentinelRef.current;
    if (!el || productsLoading) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          void fetchNextPage();
        }
      },
      { rootMargin: '200px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [productsLoading, hasNextPage, isFetchingNextPage, fetchNextPage, products.length]);

  const productDiscountMap = useMemo(
    () => buildProductDiscountMap(products, discountRules),
    [products, discountRules],
  );

  const productCategoryMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const p of products) map[p.id] = p.category;
    return map;
  }, [products]);

  const cartItemsForDiscount = useMemo(
    () => items.map((i) => ({
      ...i,
      category: i.category ?? productCategoryMap[i.productId] ?? '',
    })),
    [items, productCategoryMap],
  );

  const { data: discountEval } = useEvaluateDiscounts(cartItemsForDiscount, '');

  const lineDiscountMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const line of discountEval?.lineItems ?? []) {
      map.set(line.productId, line.perUnitDiscount);
    }
    return map;
  }, [discountEval]);

  const displayedProducts = useMemo(() => products
    .filter((p) => {
      if (p.stock === 0) return false;
      if (p.sellingPrice <= 0) return false;
      if (categoryFilter && p.category !== categoryFilter) return false;
      if (supplierIdFilter && p.supplierId !== supplierIdFilter) return false;
      return true;
      })
    .sort((a, b) => {
      if (priceSort === 'asc') return a.sellingPrice - b.sellingPrice;
      if (priceSort === 'desc') return b.sellingPrice - a.sellingPrice;
      return 0;
    }), [products, categoryFilter, supplierIdFilter, priceSort]);

  const cartQuantities = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of items) map.set(item.productId, item.quantity);
    return map;
  }, [items]);

  // ── Cart totals (prices are tax-inclusive — no separate tax line) ──────────
  const subtotal = items.reduce((s, i) => s + i.price * i.quantity, 0);
  const promotionLineDiscount = discountEval?.lineDiscountTotal ?? 0;
  const promotionCartDiscount = discountEval?.cartDiscount ?? 0;
  const netAfterPromo = Math.max(0, subtotal - promotionLineDiscount - promotionCartDiscount);
  const manualDiscount = discountType === null
    ? 0
    : discountType === 'pct'
      ? Math.round(netAfterPromo * discountInput / 100 * 100) / 100
      : Math.min(discountInput, netAfterPromo);
  const totalDiscount = promotionLineDiscount + promotionCartDiscount + manualDiscount + loyaltyPointsRedeemed;
  const total = Math.max(0, subtotal - totalDiscount);
  const totalUnits = items.reduce((s, i) => s + i.quantity, 0);

  const paymentItems = useMemo(
    () => items.map((item) => ({
      ...item,
      discount: lineDiscountMap.get(item.productId) ?? 0,
    })),
    [items, lineDiscountMap],
  );

  const paymentCustomerInfo = useMemo(() => {
    if (!customerId || !paymentCustomer) {
      return { name: 'Walk-In Customer', isWalkIn: true as const };
    }
    return {
      name: paymentCustomer.name,
      phone: paymentCustomer.phone,
      email: paymentCustomer.email || undefined,
      membershipTier: paymentCustomer.membershipTier,
      loyaltyPoints: paymentCustomer.loyaltyPoints,
      isWalkIn: false as const,
    };
  }, [customerId, paymentCustomer]);

  const discountBreakdown = useMemo(
    () => ({
      promotionLineDiscount,
      promotionCartDiscount,
      manualDiscount,
      loyaltyPointsRedeemed,
      appliedPromotions: discountEval?.appliedPromotions ?? [],
      totalDiscount,
    }),
    [
      promotionLineDiscount,
      promotionCartDiscount,
      manualDiscount,
      loyaltyPointsRedeemed,
      discountEval?.appliedPromotions,
      totalDiscount,
    ],
  );

  const handleCollapsedPay = () => {
    if (items.length === 0) return;
    setCartCollapsed(false);
    setPaymentOpen(true);
  };

  // ── Stock helpers ─────────────────────────────────────────────────────────
  const getProductStock = useCallback((productId: string): number => {
    return stockByIdRef.current.get(productId) ?? 0;
  }, []);

  const handleAddProduct = useCallback((product: Product) => {
    if (product.stock === 0 || product.sellingPrice <= 0) return;
    const currentQty = items.find((i) => i.productId === product.id)?.quantity ?? 0;
    if (currentQty >= product.stock) return;
    addItem({
      productId: product.id,
      name: product.name,
      sku: product.sku,
      image: product.images[0],
      price: product.sellingPrice,
      quantity: 1,
      discount: 0,
      category: product.category,
    });
  }, [addItem, items, products]);

  const handleQtyChange = useCallback((productId: string, newQty: number) => {
    if (isNaN(newQty) || newQty < 1) {
      updateQuantity(productId, 0);
      return;
    }
    const stock = getProductStock(productId);
    if (stock > 0 && newQty > stock) return;
    updateQuantity(productId, newQty);
  }, [updateQuantity, getProductStock]);

  // ── Payment ────────────────────────────────────────────────────────────────
  const handlePayment = async (method: PaymentMethod, tendered?: number) => {
    if (items.length === 0) return;
    setPaymentError('');
    setTenderedAmount(tendered);
    setProcessing(true);
    try {
      const txn = await transactionService.create({
        customerId: customerId ?? undefined,
        customerName: paymentCustomer?.name ?? 'Walk-In',
        items: items.map((item) => ({
          ...item,
          discount: lineDiscountMap.get(item.productId) ?? 0,
        })),
        subtotal,
        promotionDiscount: discountEval?.promotionDiscountTotal ?? 0,
        manualDiscount,
        appliedPromotions: discountEval?.appliedPromotions ?? [],
        discount: promotionCartDiscount + manualDiscount + loyaltyPointsRedeemed,
        tax: 0,
        loyaltyPointsRedeemed,
        total,
        paymentMethod: method,
        createdBy: user?.name ?? 'Cashier',
      });
      // Keep modal open — PaymentModal switches to receipt view
      setReceipt(txn);
      showSuccess('Sale completed successfully.');
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.products });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.inventory });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.dashboard });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.transactions });
    } catch (err) {
      setPaymentError(getErrorMessage(err));
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
    setDiscountType(null);
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
      showSuccess('Customer created.');
      setCreateOpen(false);
      setCustForm(EMPTY_FORM);
      setCustFormError('');
    } catch (err) {
      setCustFormError(getErrorMessage(err));
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

        <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap', alignItems: 'center' }}>
          <FormControl size="small" sx={{ minWidth: 140 }}>
            <InputLabel>Category</InputLabel>
            <Select
              value={categoryFilter}
              label="Category"
              onChange={(e) => setCategoryFilter(e.target.value)}
            >
              <MenuItem value="">All</MenuItem>
              {PRODUCT_CATEGORIES.map((c) => (
                <MenuItem key={c} value={c}>{c}</MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl size="small" sx={{ minWidth: 140 }}>
            <InputLabel>Supplier</InputLabel>
            <Select
              value={supplierIdFilter}
              label="Supplier"
              onChange={(e) => setSupplierIdFilter(e.target.value)}
            >
              <MenuItem value="">All</MenuItem>
              {suppliers.map((s) => (
                <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>
              ))}
            </Select>
          </FormControl>

          <ToggleButtonGroup
            value={priceSort}
            exclusive
            size="small"
            onChange={(_, v: 'asc' | 'desc' | null) => setPriceSort(v ?? '')}
            sx={{ '& .MuiToggleButton-root': { px: 1.25, py: 0.5 } }}
          >
            <ToggleButton value="asc">
              <ArrowUpwardIcon fontSize="small" sx={{ mr: 0.5 }} />
              Price
            </ToggleButton>
            <ToggleButton value="desc">
              <ArrowDownwardIcon fontSize="small" sx={{ mr: 0.5 }} />
              Price
            </ToggleButton>
          </ToggleButtonGroup>
        </Box>

        <Box sx={{ flex: 1, overflow: 'auto' }}>
          <Grid container spacing={1.5} columns={{ xs: 2, sm: 3, md: 5 }}>
            {displayedProducts.map((product) => (
              <Grid key={product.id} size={1}>
                <ProductCard
                  product={product}
                  qtyInCart={cartQuantities.get(product.id) ?? 0}
                  discountLabel={productDiscountMap.get(product.id)}
                  onAdd={handleAddProduct}
                  onViewDetails={setDetailProduct}
                />
              </Grid>
            ))}
            {displayedProducts.length === 0 && !productsLoading && (
              <Grid size={{ xs: 2, sm: 3, md: 5 }}>
                <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
                  No products found
                </Typography>
              </Grid>
            )}
            {productsLoading && (
              <Grid size={{ xs: 2, sm: 3, md: 5 }}>
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                  <CircularProgress size={28} />
                </Box>
              </Grid>
            )}
            {!productsLoading && hasNextPage && (
              <Grid size={{ xs: 2, sm: 3, md: 5 }}>
                <Box ref={productGridSentinelRef} sx={{ py: 2, textAlign: 'center' }}>
                  {isFetchingNextPage && <CircularProgress size={24} />}
                </Box>
              </Grid>
            )}
          </Grid>
        </Box>
      </Box>

      {/* ── Right: Cart Panel (collapsible, flush to right edge) ── */}
      <Paper
        elevation={2}
        sx={(theme) => ({
          width: cartCollapsed ? DRAWER_COLLAPSED : CART_EXPANDED_WIDTH,
          flexShrink: 0,
          minWidth: 0,
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column',
          p: cartCollapsed ? 0.5 : { xs: 1.5, sm: 2 },
          borderRadius: '12px 0 0 12px',
          borderRight: 0,
          alignSelf: 'stretch',
          minHeight: 0,
          maxHeight: '100%',
          overflow: 'hidden',
          transition: theme.transitions.create('width'),
        })}
      >
        {cartCollapsed ? (
          <CollapsedCartRail
            totalUnits={totalUnits}
            total={total}
            hasItems={items.length > 0}
            onExpand={() => setCartCollapsed(false)}
            onPay={handleCollapsedPay}
          />
        ) : (
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              flex: 1,
              minWidth: 0,
              minHeight: 0,
              overflow: 'hidden',
            }}
          >
        <CustomerPicker
          customerId={customerId}
          onCustomerChange={setCustomer}
          onAddCustomer={() => { setCustForm(EMPTY_FORM); setCustFormError(''); setCreateOpen(true); }}
        />

        <Divider sx={{ flexShrink: 0, my: 0 }} />

        {/* Cart header */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            minHeight: 44,
            py: 0.5,
            flexShrink: 0,
          }}
        >
          <Typography variant="subtitle1" sx={{ fontWeight: 600, lineHeight: 1.2 }}>
            Cart
          </Typography>
          <Badge badgeContent={totalUnits} invisible={totalUnits === 0} sx={qtyBadgeSx}>
            <ShoppingCartIcon fontSize="small" />
          </Badge>
          <Box sx={{ flex: 1 }} />
          {items.length > 0 && (
            <Button
              size="small"
              color="error"
              sx={{ minWidth: 0, px: 1 }}
              onClick={() => { clearCart(); setDiscountInput(0); setDiscountType(null); }}
            >
              Clear
            </Button>
          )}
          <Tooltip title="Collapse cart">
            <IconButton size="small" onClick={() => setCartCollapsed(true)} sx={{ flexShrink: 0 }}>
              <ChevronRightIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>

        {/* Cart items — scrollable middle section */}
        <Box sx={{ flex: 1, minHeight: 0, minWidth: 0, overflowY: 'auto', mb: 0.5 }}>
          {items.length === 0 ? (
            <Box sx={{ py: 6, textAlign: 'center' }}>
              <ShoppingCartIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
              <Typography color="text.secondary" variant="body2">
                Tap a product to add it
              </Typography>
            </Box>
          ) : (
            <TableContainer sx={{ width: '100%' }}>
              <Table
                size="small"
                sx={{
                  tableLayout: 'fixed',
                  width: '100%',
                  '& .MuiTableCell-root': {
                    verticalAlign: 'middle',
                    py: 0.75,
                    px: 0.5,
                    borderColor: 'divider',
                  },
                }}
              >
                <colgroup>
                  <col style={{ width: '7%' }} />
                  <col style={{ width: 'auto' }} />
                  <col style={{ width: '26%' }} />
                  <col style={{ width: '17%' }} />
                  <col style={{ width: '17%' }} />
                  <col style={{ width: '9%' }} />
                </colgroup>
                <TableHead>
                  <TableRow sx={{ bgcolor: 'action.hover' }}>
                    <TableCell align="center" sx={{ fontWeight: 700, px: 0.25, fontSize: '0.7rem' }}>SN</TableCell>
                    <TableCell sx={{ fontWeight: 700, pl: 0, pr: 0.5, fontSize: '0.7rem' }}>Item</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 700, px: 0.25, fontSize: '0.7rem' }}>Qty</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, px: 0.25, fontSize: '0.7rem' }}>Price</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, px: 0.25, fontSize: '0.7rem' }}>Total</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 700, px: 0, width: 32 }} />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {items.map((item, index) => {
                    return (
                      <TableRow key={item.productId} sx={{ '&:last-child td': { borderBottom: 0 } }}>
                        <TableCell align="center" sx={{ px: 0.25 }}>
                          <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>
                            {index + 1}
                          </Typography>
                        </TableCell>

                        <TableCell sx={{ pl: 0, pr: 0.5, minWidth: 0 }}>
                          <Typography
                            variant="body2"
                            sx={{
                              fontWeight: 600,
                              fontSize: '0.8125rem',
                              lineHeight: 1.35,
                              wordBreak: 'break-word',
                            }}
                          >
                            {item.name}
                          </Typography>
                        </TableCell>

                        <TableCell align="center" sx={{ px: 0.25 }}>
                          <CartQtyStepper
                            quantity={item.quantity}
                            onDecrement={() => handleQtyChange(item.productId, item.quantity - 1)}
                            onIncrement={() => handleQtyChange(item.productId, item.quantity + 1)}
                          />
                        </TableCell>

                        <TableCell align="right" sx={{ px: 0.25 }}>
                          <Typography
                            variant="caption"
                            sx={{
                              fontSize: '0.75rem',
                              fontVariantNumeric: 'tabular-nums',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {formatAmount(item.price)}
                          </Typography>
                        </TableCell>

                        <TableCell align="right" sx={{ px: 0.25 }}>
                          <Typography
                            variant="caption"
                            sx={{
                              fontWeight: 600,
                              fontSize: '0.75rem',
                              fontVariantNumeric: 'tabular-nums',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {formatAmount(item.price * item.quantity)}
                          </Typography>
                        </TableCell>

                        <TableCell align="center" sx={{ px: 0, width: 32 }}>
                          <IconButton
                            type="button"
                            size="small"
                            color="error"
                            aria-label="Remove item"
                            onClick={() => removeItem(item.productId)}
                            sx={{ width: 24, height: 24, p: 0 }}
                          >
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

        {/* Footer: totals + pay — always visible */}
        <Box sx={{ flexShrink: 0, pt: 0.5, bgcolor: 'background.paper', boxShadow: '0 -2px 8px rgba(0,0,0,0.06)' }}>
        <Divider sx={{ mb: 1 }} />

        <Box sx={{ mb: 1.25 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: 24, mb: 0.75 }}>
            <Typography variant="body2" color="text.secondary">Subtotal</Typography>
            <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums' }}>
              {formatAmount(subtotal)}
            </Typography>
          </Box>

          {(discountEval?.appliedPromotions.length ?? 0) > 0 && (
            <Box sx={{ mb: 0.75 }}>
              {discountEval?.appliedPromotions.map((promo) => (
                <Box key={promo.ruleId} sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.25 }}>
                  <Typography variant="caption" color="success.main">{promo.name}</Typography>
                  <Typography variant="caption" color="success.main" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                    - {formatAmount(promo.amount)}
                  </Typography>
                </Box>
              ))}
            </Box>
          )}

          {/* Discount: label + controls + amount (single row) */}
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.5,
              minHeight: 32,
              mb: 0.75,
              flexWrap: 'wrap',
            }}
          >
            <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.2, flexShrink: 0 }}>
              Discount
            </Typography>
            <LocalOfferIcon fontSize="small" sx={{ color: 'text.secondary', flexShrink: 0 }} />
            <ToggleButtonGroup
              value={discountType}
              exclusive
              size="small"
              onChange={(_, v: 'flat' | 'pct' | null) => {
                setDiscountType(v);
                setDiscountInput(0);
              }}
              sx={{
                flexShrink: 0,
                '& .MuiToggleButton-root': { px: 1.25, py: 0.35, fontSize: '0.75rem', lineHeight: 1.3 },
              }}
            >
              <ToggleButton value="flat">NPR</ToggleButton>
              <ToggleButton value="pct">%</ToggleButton>
            </ToggleButtonGroup>
            {discountType !== null && (
              <TextField
                placeholder={discountType === 'pct' ? '%' : 'NPR'}
                type="number"
                size="small"
                autoFocus
                value={discountInput || ''}
                onChange={(e) => {
                  const v = parseFloat(e.target.value) || 0;
                  const max = discountType === 'pct' ? 100 : netAfterPromo;
                  setDiscountInput(Math.min(Math.max(0, v), max));
                }}
                slotProps={{
                  htmlInput: {
                    min: 0,
                    max: discountType === 'pct' ? 100 : netAfterPromo,
                    step: discountType === 'pct' ? 5 : 10,
                  },
                }}
                sx={{
                  width: 80,
                  flexShrink: 0,
                  ...noNumberSpinnerSx,
                  '& .MuiInputBase-root': { height: 30 },
                  '& .MuiInputBase-input': { py: 0.5, px: 1, fontSize: '0.8125rem', textAlign: 'right' },
                }}
              />
            )}
            {totalDiscount > 0 && (
              <Typography
                variant="body2"
                color="success.main"
                sx={{
                  ml: 'auto',
                  flexShrink: 0,
                  fontWeight: 600,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                - {formatAmount(totalDiscount)}
              </Typography>
            )}
          </Box>

          <Divider sx={{ mb: 0.75 }} />
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.2 }}>Total</Typography>
            <Typography variant="h6" sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }} color="primary">
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
          </Box>
        )}
      </Paper>

      {/* ── Payment modal (transitions to receipt on success) ─────────────── */}
      <PaymentModal
        open={paymentOpen}
        items={paymentItems}
        summary={{ subtotal, total }}
        customer={paymentCustomerInfo}
        discountBreakdown={discountBreakdown}
        loading={processing}
        error={paymentError}
        transaction={receipt}
        tenderedAmount={tenderedAmount}
        defaultPaymentMethod={storeSettings?.defaultPaymentMethod}
        autoPrint={storeSettings?.autoPrint}
        receiptBranding={receiptBranding}
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

      <ProductQuickViewDialog
        product={detailProduct}
        open={!!detailProduct}
        onClose={() => setDetailProduct(null)}
        discountLabel={detailProduct ? productDiscountMap.get(detailProduct.id) : null}
      />
    </Box>
  );
}
