import { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Paper,
  Typography,
  Chip,
  Divider,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TableContainer,
  CircularProgress,
  Alert,
  MenuItem,
  Select,
  TextField,
  Checkbox,
  Link,
  Grid,
  InputAdornment,
  InputLabel,
  FormControl,
  IconButton,
  Tooltip,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import EditIcon from '@mui/icons-material/Edit';
import InventoryIcon from '@mui/icons-material/Inventory';
import PaymentsIcon from '@mui/icons-material/Payments';
import AssignmentReturnIcon from '@mui/icons-material/AssignmentReturn';
import AddPhotoAlternateOutlinedIcon from '@mui/icons-material/AddPhotoAlternateOutlined';
import CloseIcon from '@mui/icons-material/Close';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { PageHeader } from '@/components/common/PageHeader';
import { NepaliAwareDatePicker } from '@/components/common/NepaliAwareDatePicker';
import { FormModal } from '@/components/common/FormModal';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { ProductQuickViewDialog } from '@/components/products/ProductQuickViewDialog';
import {
  usePurchaseOrder,
  useUpdatePurchaseOrderStatus,
  useReceivePurchaseOrderItems,
  useRecordPurchaseOrderPayment,
  useUpdatePurchaseOrderBill,
} from '@/hooks/usePurchaseOrders';
import { usePurchaseReturns, useReturnableLines } from '@/hooks/usePurchaseReturns';
import { useProductCatalog } from '@/hooks/useProductCatalog';
import { PoReturnDialog } from '@/pages/purchase-orders/components/PoReturnDialog';
import { formatCurrency, canManagePurchaseOrders } from '@/utils';
import { CURRENCY_SYMBOL } from '@/constants';
import { useFormatDate } from '@/hooks/useFormatDate';
import { getErrorMessage } from '@/services/apiClient';
import { productService } from '@/services';
import { showSuccess } from '@/utils/toast';
import { canEditPurchaseOrder } from '@/utils/canEditPurchaseOrder';
import { uploadImagesToCloudinary } from '@/utils/cloudinaryUpload';
import { packSellOption } from '@/utils/uomSell';
import { PAYMENT_METHODS, PO_LINE_STATUS_LABELS, PO_PAYMENT_STATUS_LABELS, PO_STATUS_LABELS } from '@/constants';
import { useAuthStore } from '@/store';
import type {
  Product,
  PurchaseOrderLineStatus,
  PurchaseOrderPaymentStatus,
  PurchaseOrderReceiveItem,
  PurchaseOrderStatus,
} from '@/types';
import {
  PO_DETAIL_FLAT_COLUMNS,
  poDetailFlatColWidths,
  poDetailTableMinWidth,
} from '@/pages/purchase-orders/poLineTableColumns';
import { isLineFullyReceived } from '@/pages/purchase-orders/poPricing';
import {
  PO_LABELS,
  PO_RECEIVE_HINT,
  PO_RECORD_PAYMENT_HINT,
  PO_SELL_AS_OPTIONS,
} from '@/pages/purchase-orders/poTerminology';
import { PoEntryFlowHelp } from '@/pages/purchase-orders/components/PoEntryFlowHelp';
import { excelCellSx, noNumberSpinnerSx } from '@/pages/purchase-orders/inputStyles';

type LastBuyInfo = {
  unitCost: number | null;
  purchasedAt: string | null;
  orderNumber?: string | null;
};

const PAYMENT_SCHEMA = z.object({
  amount: z.number({ error: 'Amount is required' }).positive('Amount must be positive'),
  date: z.string().min(1, 'Payment date is required'),
  paymentMethod: z.string().min(1, 'Payment method is required'),
  billNo: z.string().optional(),
  notes: z.string().optional(),
});

type PaymentFormValues = z.infer<typeof PAYMENT_SCHEMA>;

const STATUS_COLORS: Record<PurchaseOrderStatus, 'default' | 'warning' | 'info' | 'success' | 'error'> = {
  draft: 'default', ordered: 'warning', partial: 'info', received: 'success', cancelled: 'error',
};

const PAYMENT_COLORS: Record<PurchaseOrderPaymentStatus, 'default' | 'warning' | 'success'> = {
  unpaid: 'default',
  partial: 'warning',
  paid: 'success',
};

const LINE_STATUS_COLORS: Record<PurchaseOrderLineStatus, 'default' | 'warning' | 'success'> = {
  pending: 'default',
  partial: 'warning',
  received: 'success',
};

const NEXT_STATUSES: Partial<Record<PurchaseOrderStatus, PurchaseOrderStatus[]>> = {
  draft: ['ordered', 'cancelled'],
  ordered: ['cancelled'],
  // Received / partial with stock posted: cancel blocked — use purchase return
};

const PAYABLE_STATUSES = new Set<PurchaseOrderStatus>(['ordered', 'partial', 'received']);

type SellModeValue = 'unit' | 'piece' | 'both';

interface ReceiveSelection {
  selected: boolean;
  receiveQuantity: number;
  expiryDate: string;
  unitsPerBuyUom?: number;
  sellMode?: SellModeValue;
  sellingPrice?: number;
  packSellingPrice?: number;
}

const headerCellSx = { fontWeight: 700, whiteSpace: 'nowrap', py: 1.25 };

export function PurchaseOrderDetailPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const user = useAuthStore((s) => s.user);
  const formatDate = useFormatDate();
  const canManage = canManagePurchaseOrders(user?.role);
  const [statusValue, setStatusValue] = useState('');
  const [statusError, setStatusError] = useState('');
  const [receiveError, setReceiveError] = useState('');
  const [receiveSelections, setReceiveSelections] = useState<Record<string, ReceiveSelection>>({});
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentError, setPaymentError] = useState('');
  const [returnOpen, setReturnOpen] = useState(false);
  const [billOpen, setBillOpen] = useState(false);
  const [billNumberEdit, setBillNumberEdit] = useState('');
  const [billImagesEdit, setBillImagesEdit] = useState<string[]>([]);
  const [billUploading, setBillUploading] = useState(false);
  const [billError, setBillError] = useState('');
  const [lastBuyMap, setLastBuyMap] = useState<Record<string, LastBuyInfo>>({});
  const [quickViewProduct, setQuickViewProduct] = useState<Product | null>(null);
  const [quickViewLoading, setQuickViewLoading] = useState(false);
  const [receiveConfirmOpen, setReceiveConfirmOpen] = useState(false);

  const {
    register,
    handleSubmit: handlePaymentSubmit,
    control: paymentControl,
    reset: resetPaymentForm,
    formState: { errors: paymentErrors },
  } = useForm<PaymentFormValues>({
    resolver: zodResolver(PAYMENT_SCHEMA),
    defaultValues: {
      amount: undefined,
      date: new Date().toISOString().slice(0, 10),
      paymentMethod: 'cash',
      billNo: '',
      notes: '',
    },
  });

  const { data: po, isLoading, isError } = usePurchaseOrder(id ?? '');
  const { products: catalogProducts } = useProductCatalog();
  const statusMutation = useUpdatePurchaseOrderStatus();
  const receiveMutation = useReceivePurchaseOrderItems();
  const paymentMutation = useRecordPurchaseOrderPayment();
  const billMutation = useUpdatePurchaseOrderBill();
  const canReturnStatus = po?.status === 'partial' || po?.status === 'received';
  const { data: returnableLines = [] } = useReturnableLines(id ?? '', Boolean(id && canReturnStatus));
  const { data: returnsData } = usePurchaseReturns(id ?? '', Boolean(id && canReturnStatus));
  const returns = returnsData?.data ?? [];

  const canReceive = po?.status === 'ordered' || po?.status === 'partial';
  const amountPaid = po?.amountPaid ?? 0;
  const remaining = po ? Math.max(0, Math.round((po.totalAmount - amountPaid) * 100) / 100) : 0;
  const overpaid = po ? Math.max(0, Math.round((amountPaid - po.totalAmount) * 100) / 100) : 0;
  const paymentStatus: PurchaseOrderPaymentStatus = po?.paymentStatus ?? 'unpaid';
  const canPay = Boolean(po && canManage && PAYABLE_STATUSES.has(po.status) && remaining > 0);
  const canReturn = Boolean(canManage && canReturnStatus && returnableLines.length > 0);

  const productById = useMemo(() => {
    const map = new Map<string, Product>();
    for (const p of catalogProducts) map.set(p.id, p);
    return map;
  }, [catalogProducts]);

  useEffect(() => {
    if (!po?.items?.length) {
      setLastBuyMap({});
      return;
    }
    const ids = [...new Set(po.items.map((i) => i.productId))];
    let cancelled = false;
    void Promise.all(
      ids.map(async (productId) => {
        try {
          const res = await productService.getLastPurchaseUnitCost(productId);
          return [productId, {
            unitCost: res.unitCost,
            purchasedAt: res.purchasedAt,
            orderNumber: res.orderNumber ?? null,
          }] as const;
        } catch {
          return [productId, { unitCost: null, purchasedAt: null, orderNumber: null }] as const;
        }
      }),
    ).then((entries) => {
      if (cancelled) return;
      setLastBuyMap(Object.fromEntries(entries));
    });
    return () => { cancelled = true; };
  }, [po?.id, po?.items]);

  const seedReceiveSelection = (productId: string, remainingQty: number): ReceiveSelection => {
    const catalog = productById.get(productId);
    const units = catalog?.unitsPerBuyUom ?? 1;
    const mode = (catalog?.sellMode ?? (units > 1 ? 'both' : 'unit')) as SellModeValue;
    return {
      selected: false,
      receiveQuantity: remainingQty || 1,
      expiryDate: '',
      unitsPerBuyUom: units,
      sellMode: mode,
      sellingPrice: catalog?.sellingPrice ?? 0,
      packSellingPrice:
        (catalog?.packSellingPrice && catalog.packSellingPrice > 0)
          ? catalog.packSellingPrice
          : (catalog ? packSellOption(catalog)?.price : 0) ?? 0,
    };
  };

  const getReceiveSelection = (productId: string, remainingQty: number): ReceiveSelection =>
    receiveSelections[productId] ?? seedReceiveSelection(productId, remainingQty);

  const updateReceiveSelection = (productId: string, remainingQty: number, patch: Partial<ReceiveSelection>) => {
    setReceiveSelections((prev) => {
      const base = prev[productId] ?? seedReceiveSelection(productId, remainingQty);
      return { ...prev, [productId]: { ...base, ...patch } };
    });
  };

  const openProductQuickView = async (productId: string) => {
    setQuickViewLoading(true);
    try {
      const full = await productService.getById(productId);
      setQuickViewProduct(full);
    } catch {
      const fallback = productById.get(productId) ?? null;
      setQuickViewProduct(fallback);
    } finally {
      setQuickViewLoading(false);
    }
  };

  /** Lines that can still receive stock (excludes fully received). */
  const receivableItems = useMemo(
    () => (po?.items ?? []).filter((item) => !isLineFullyReceived(item)),
    [po],
  );

  const selectAllState = useMemo(() => {
    if (receivableItems.length === 0) return { checked: false, indeterminate: false };
    const selectedCount = receivableItems.filter((item) => {
      const rem = item.quantity - item.receivedQuantity;
      return getReceiveSelection(item.productId, rem).selected;
    }).length;
    return {
      checked: selectedCount === receivableItems.length,
      indeterminate: selectedCount > 0 && selectedCount < receivableItems.length,
    };
  }, [receivableItems, receiveSelections]);

  const handleSelectAll = (checked: boolean) => {
    setReceiveSelections((prev) => {
      const next = { ...prev };
      for (const item of receivableItems) {
        const rem = item.quantity - item.receivedQuantity;
        const base = next[item.productId] ?? seedReceiveSelection(item.productId, rem);
        next[item.productId] = { ...base, selected: checked, receiveQuantity: rem > 0 ? rem : 1 };
      }
      return next;
    });
  };

  const itemsToReceive = useMemo((): PurchaseOrderReceiveItem[] => {
    if (!po) return [];
    return po.items
      .filter((item) => {
        if (isLineFullyReceived(item)) return false;
        const rem = item.quantity - item.receivedQuantity;
        const sel = getReceiveSelection(item.productId, rem);
        return sel.selected && sel.receiveQuantity > 0;
      })
      .map((item) => {
        const rem = item.quantity - item.receivedQuantity;
        const sel = getReceiveSelection(item.productId, rem);
        const payload: PurchaseOrderReceiveItem = {
          productId: item.productId,
          receiveQuantity: sel.receiveQuantity,
        };
        if (sel.expiryDate) payload.expiryDate = sel.expiryDate;
        const lineUnits = item.unitsPerBuyUom ?? 1;
        const units = sel.unitsPerBuyUom ?? lineUnits;
        if (units !== lineUnits) {
          payload.unitsPerBuyUom = units;
        } else if (sel.unitsPerBuyUom) {
          payload.unitsPerBuyUom = sel.unitsPerBuyUom;
        }
        if (sel.sellMode) payload.sellMode = sel.sellMode;
        if (sel.sellingPrice != null) payload.sellingPrice = sel.sellingPrice;
        if (sel.packSellingPrice != null) payload.packSellingPrice = sel.packSellingPrice;
        return payload;
      });
  }, [po, receiveSelections]);

  const validateReceivePrices = (): string | null => {
    for (const item of po?.items ?? []) {
      if (isLineFullyReceived(item)) continue;
      const rem = item.quantity - item.receivedQuantity;
      const sel = getReceiveSelection(item.productId, rem);
      if (!sel.selected) continue;
      const units = sel.unitsPerBuyUom ?? item.unitsPerBuyUom ?? 1;
      const mode = sel.sellMode ?? 'unit';
      if (units > 1 && (mode === 'unit' || mode === 'both') && !(sel.packSellingPrice && sel.packSellingPrice > 0)) {
        return `Set Price / pack for ${item.productName}`;
      }
      if ((mode === 'piece' || mode === 'both' || units <= 1) && !(sel.sellingPrice && sel.sellingPrice > 0)) {
        return `Set Price / pc for ${item.productName}`;
      }
    }
    return null;
  };

  const handleStatusChange = async (status: PurchaseOrderStatus) => {
    if (!po) return;
    setStatusError('');
    setStatusValue(status);
    try {
      await statusMutation.mutateAsync({ id: po.id, status });
      showSuccess(`Status set to ${PO_STATUS_LABELS[status] ?? status}.`);
      setStatusValue('');
    } catch (err) {
      setStatusError(getErrorMessage(err));
      setStatusValue('');
    }
  };

  const requestReceive = () => {
    if (!po) return;
    if (itemsToReceive.length === 0) {
      setReceiveError('Select at least one item with a receive qty');
      return;
    }
    const priceErr = validateReceivePrices();
    if (priceErr) {
      setReceiveError(priceErr);
      return;
    }
    setReceiveError('');
    setReceiveConfirmOpen(true);
  };

  const handleReceive = async () => {
    if (!po) return;
    if (itemsToReceive.length === 0) {
      setReceiveError('Select at least one item with a receive qty');
      setReceiveConfirmOpen(false);
      return;
    }
    const priceErr = validateReceivePrices();
    if (priceErr) {
      setReceiveError(priceErr);
      setReceiveConfirmOpen(false);
      return;
    }
    setReceiveError('');
    try {
      await receiveMutation.mutateAsync({ id: po.id, items: itemsToReceive });
      showSuccess(
        `${itemsToReceive.length} line${itemsToReceive.length !== 1 ? 's' : ''} received. Stock and product prices updated.`,
      );
      setReceiveSelections({});
      setReceiveConfirmOpen(false);
      if (quickViewProduct) {
        void openProductQuickView(quickViewProduct.id);
      }
    } catch (err) {
      setReceiveError(getErrorMessage(err));
      setReceiveConfirmOpen(false);
    }
  };

  const openPaymentDialog = () => {
    if (!po) return;
    resetPaymentForm({
      amount: remaining,
      date: new Date().toISOString().slice(0, 10),
      paymentMethod: 'cash',
      billNo: po.billNumber ?? '',
      notes: '',
    });
    setPaymentError('');
    setPaymentOpen(true);
  };

  const handleRecordPayment = async (values: PaymentFormValues) => {
    if (!po) return;
    const amount = values.amount;
    if (!Number.isFinite(amount) || amount <= 0) {
      setPaymentError('Enter a valid payment amount.');
      return;
    }
    if (amount > remaining + 0.001) {
      setPaymentError(`Amount cannot exceed remaining balance (${remaining.toFixed(2)}).`);
      return;
    }
    if (!values.date) {
      setPaymentError('Payment date is required.');
      return;
    }
    setPaymentError('');
    try {
      await paymentMutation.mutateAsync({
        id: po.id,
        data: {
          amount,
          date: values.date,
          paymentMethod: values.paymentMethod,
          billNo: values.billNo?.trim() || undefined,
          notes: values.notes?.trim() || undefined,
        },
      });
      const nextRemaining = Math.max(0, po.totalAmount - (amountPaid + amount));
      showSuccess(
        `Payment of ${formatCurrency(amount)} recorded. Remaining ${formatCurrency(nextRemaining)}.`,
      );
      setPaymentOpen(false);
    } catch (err) {
      setPaymentError(getErrorMessage(err));
    }
  };

  const openBillDialog = () => {
    if (!po) return;
    setBillNumberEdit(po.billNumber ?? '');
    setBillImagesEdit(po.billImages ?? []);
    setBillError('');
    setBillOpen(true);
  };

  const handleSaveBill = async () => {
    if (!po) return;
    setBillError('');
    try {
      await billMutation.mutateAsync({
        id: po.id,
        data: {
          billNumber: billNumberEdit.trim() || null,
          billImages: billImagesEdit,
        },
      });
      showSuccess('Supplier bill updated.');
      setBillOpen(false);
    } catch (err) {
      setBillError(getErrorMessage(err));
    }
  };

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }
  if (isError || !po) return <Alert severity="error">Purchase order not found.</Alert>;

  const nextStatuses = NEXT_STATUSES[po.status] ?? [];
  const receivedCount = po.items.filter((i) => i.receivedQuantity >= i.quantity).length;

  return (
    <Box>
      <PageHeader
        title={po.orderNumber}
        breadcrumbs={[{ label: 'Purchase Orders', path: '/purchase-orders' }, { label: po.orderNumber }]}
        action={
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
            <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/purchase-orders')}>
              Back
            </Button>
            {canManage && canEditPurchaseOrder(po) && (
              <Button
                variant="outlined"
                startIcon={<EditIcon />}
                onClick={() => navigate(`/purchase-orders/${po.id}/edit`)}
              >
                Edit
              </Button>
            )}
            {canManage && canReceive && (
              <Button
                variant="contained"
                startIcon={<InventoryIcon />}
                onClick={requestReceive}
                loading={receiveMutation.isPending}
                disabled={itemsToReceive.length === 0}
              >
                {itemsToReceive.length > 0
                  ? `Process Receipt (${itemsToReceive.length})`
                  : 'Process Receipt'}
              </Button>
            )}
            {canPay && (
              <Button
                variant="outlined"
                startIcon={<PaymentsIcon />}
                onClick={openPaymentDialog}
              >
                Record Payment
              </Button>
            )}
            {canReturn && (
              <Button
                variant="outlined"
                color="warning"
                startIcon={<AssignmentReturnIcon />}
                onClick={() => setReturnOpen(true)}
              >
                Return to supplier
              </Button>
            )}
            {canManage && nextStatuses.length > 0 && (
              <TextField
                select
                size="small"
                label="Update Status"
                value={statusValue}
                disabled={statusMutation.isPending}
                onChange={(e) => {
                  const next = e.target.value as PurchaseOrderStatus;
                  if (next) void handleStatusChange(next);
                }}
                sx={{ minWidth: 170 }}
              >
                {nextStatuses.map((s) => (
                  <MenuItem key={s} value={s}>{PO_STATUS_LABELS[s]}</MenuItem>
                ))}
              </TextField>
            )}
          </Box>
        }
      />

      <Box sx={{ mb: 1, mt: -0.5 }}>
        <PoEntryFlowHelp />
      </Box>

      {(statusError || receiveError) && (
        <Alert severity="error" sx={{ mb: 2 }}>{statusError || receiveError}</Alert>
      )}

      <Grid container spacing={1.5} sx={{ mb: 2, alignItems: 'stretch' }}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Paper
            variant="outlined"
            sx={{
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            <Box
              sx={{
                px: 1.75,
                py: 1.25,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 1,
                borderBottom: 1,
                borderColor: 'divider',
                bgcolor: 'action.hover',
              }}
            >
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase' }}>
                Supplier
              </Typography>
              <Chip
                label={PO_STATUS_LABELS[po.status]}
                color={STATUS_COLORS[po.status]}
                size="small"
                sx={{ fontWeight: 600, height: 22 }}
              />
            </Box>
            <Box sx={{ px: 1.75, py: 1.5, flex: 1 }}>
              <Link
                component={RouterLink}
                to={`/suppliers/${po.supplierId}`}
                variant="body1"
                sx={{ fontWeight: 700, display: 'inline-block', mb: 1.25 }}
                title={po.supplierName}
              >
                {po.supplierName}
              </Link>
              <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 1, mb: 1.5 }}>
                <Typography variant="caption" color="text.secondary">Order total</Typography>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, color: 'primary.main', lineHeight: 1.2 }}>
                  {formatCurrency(po.totalAmount)}
                </Typography>
              </Box>
              <Divider sx={{ mb: 1.25 }} />
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  columnGap: 1.5,
                  rowGap: 1,
                }}
              >
                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.2 }}>Expected delivery</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>{po.expectedDelivery ? formatDate(po.expectedDelivery) : '—'}</Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.2 }}>Items</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>
                    {po.items.length}
                    <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 0.5 }}>
                      · {receivedCount} received
                    </Typography>
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.2 }}>Ordered by</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>{po.orderedBy ?? '—'}</Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.2 }}>Received by</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>{po.receivedBy ?? '—'}</Typography>
                </Box>
              </Box>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.25, lineHeight: 1.4 }}>
                {po.receivedDate ? `Received ${formatDate(po.receivedDate)}` : 'Not received yet'}
                {' · '}Created {formatDate(po.createdAt)}
                {' · '}Updated {formatDate(po.updatedAt)}
              </Typography>
            </Box>
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <Paper
            variant="outlined"
            sx={{
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            <Box
              sx={{
                px: 1.75,
                py: 1.25,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 1,
                flexWrap: 'wrap',
                borderBottom: 1,
                borderColor: 'divider',
                bgcolor: 'action.hover',
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase' }}>
                  Payment
                </Typography>
                <Chip
                  label={PO_PAYMENT_STATUS_LABELS[paymentStatus]}
                  color={PAYMENT_COLORS[paymentStatus]}
                  size="small"
                  variant="outlined"
                  sx={{ fontWeight: 600, height: 22 }}
                />
              </Box>
              {canPay && (
                <Button size="small" variant="contained" startIcon={<PaymentsIcon />} onClick={openPaymentDialog} sx={{ py: 0.25 }}>
                  Record payment
                </Button>
              )}
            </Box>
            <Box sx={{ px: 1.75, py: 1.5, flex: 1, display: 'flex', flexDirection: 'column' }}>
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, mb: 1.25 }}>
                <Box
                  sx={{
                    px: 1.25,
                    py: 1,
                    borderRadius: 1,
                    border: 1,
                    borderColor: 'divider',
                    bgcolor: 'background.default',
                  }}
                >
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.2 }}>Paid</Typography>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.3 }}>
                    {formatCurrency(amountPaid)}
                  </Typography>
                </Box>
                <Box
                  sx={{
                    px: 1.25,
                    py: 1,
                    borderRadius: 1,
                    border: 1,
                    borderColor: remaining > 0 ? 'warning.light' : 'success.light',
                    bgcolor: 'background.default',
                  }}
                >
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.2 }}>Remaining</Typography>
                  <Typography
                    variant="subtitle1"
                    sx={{
                      fontWeight: 700,
                      lineHeight: 1.3,
                      color: remaining > 0 ? 'warning.main' : 'success.main',
                    }}
                  >
                    {formatCurrency(remaining)}
                  </Typography>
                </Box>
              </Box>
              {overpaid > 0 && (
                <Chip
                  label={`Overpaid / credit: ${formatCurrency(overpaid)}`}
                  color="warning"
                  size="small"
                  sx={{ mb: 1, alignSelf: 'flex-start', fontWeight: 600, height: 22 }}
                />
              )}
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1, lineHeight: 1.35 }}>
                {PO_RECORD_PAYMENT_HINT}
              </Typography>
              <Divider sx={{ mb: 1 }} />
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, display: 'block', mb: 0.75 }}>
                Payment history
              </Typography>
              {(po.payments?.length ?? 0) === 0 ? (
                <Typography variant="caption" color="text.secondary">No payments recorded yet.</Typography>
              ) : (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, maxHeight: 160, overflowY: 'auto' }}>
                  {(po.payments ?? []).map((payment, index) => (
                    <Box
                      key={`${payment.expenseId}-${index}`}
                      sx={{
                        display: 'flex',
                        alignItems: 'baseline',
                        justifyContent: 'space-between',
                        gap: 1,
                        py: 0.5,
                        borderBottom: index < (po.payments?.length ?? 0) - 1 ? 1 : 0,
                        borderColor: 'divider',
                      }}
                    >
                      <Box sx={{ minWidth: 0 }}>
                        <Typography variant="body2" sx={{ fontWeight: 500, lineHeight: 1.3 }}>
                          {formatDate(payment.date)}
                          <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 0.75, textTransform: 'capitalize' }}>
                            {payment.paymentMethod}
                          </Typography>
                        </Typography>
                        <Typography variant="caption" color="text.secondary" noWrap>
                          {payment.billNo?.trim() ? `Bill ${payment.billNo}` : 'No bill no.'}
                          {payment.createdBy ? ` · ${payment.createdBy}` : ''}
                        </Typography>
                      </Box>
                      <Typography variant="body2" sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>
                        {formatCurrency(payment.amount)}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              )}
            </Box>
          </Paper>
        </Grid>
      </Grid>

      {(canReturnStatus || returns.length > 0) && (
        <Paper sx={{ p: 2, mb: 2 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
            Purchase returns
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
            Near-term mistakes on this order. For expired / slow stock later, use Supplier → Return goods.
          </Typography>
          {returns.length === 0 ? (
            <Typography variant="body2" color="text.secondary">No returns yet.</Typography>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {returns.map((ret) => (
                <Box
                  key={ret.id}
                  sx={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 2,
                    py: 0.75,
                    borderBottom: 1,
                    borderColor: 'divider',
                  }}
                >
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {ret.returnNumber}
                      <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                        {ret.returnDate} · {ret.settlementType.replace('_', ' ')} · {ret.reason.replace('_', ' ')}
                      </Typography>
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {ret.items.map((i) => `${i.productName} × ${i.returnQty}`).join(', ')}
                    </Typography>
                  </Box>
                  <Typography variant="body2" sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>
                    {formatCurrency(ret.totalAmount)}
                  </Typography>
                </Box>
              ))}
            </Box>
          )}
        </Paper>
      )}

      <Paper sx={{ p: 2 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1, mb: 1.5 }}>
          <Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>Order Items</Typography>
            {canReceive && (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                {PO_RECEIVE_HINT}
              </Typography>
            )}
          </Box>
          <Typography variant="body2" color="text.secondary">
            {po.items.length} product{po.items.length !== 1 ? 's' : ''}
          </Typography>
        </Box>
        <Divider sx={{ mb: 2 }} />

        <TableContainer sx={{ overflowX: 'auto', maxWidth: '100%' }}>
          <Table
            size="small"
            sx={{
              tableLayout: 'auto',
              minWidth: poDetailTableMinWidth(canReceive),
              '& .MuiTableCell-root': { verticalAlign: 'middle', py: 1.25 },
            }}
          >
            <colgroup>
              {poDetailFlatColWidths(canReceive).map((width, i) => (
                <col key={i} style={{ width, minWidth: width }} />
              ))}
            </colgroup>
            <TableHead>
              <TableRow sx={{ bgcolor: 'action.hover' }}>
                {canReceive && (
                  <TableCell padding="checkbox" sx={headerCellSx}>
                    <Checkbox
                      size="small"
                      checked={selectAllState.checked}
                      indeterminate={selectAllState.indeterminate}
                      disabled={receivableItems.length === 0}
                      onChange={(e) => handleSelectAll(e.target.checked)}
                    />
                  </TableCell>
                )}
                <TableCell align="center" sx={headerCellSx}>#</TableCell>
                <TableCell sx={headerCellSx}>{PO_LABELS.product}</TableCell>
                <TableCell align="right" sx={headerCellSx}>{PO_LABELS.ordered}</TableCell>
                <TableCell align="right" sx={headerCellSx}>{PO_LABELS.received}</TableCell>
                {canReceive && <TableCell align="right" sx={headerCellSx}>{PO_LABELS.receive}</TableCell>}
                <TableCell sx={headerCellSx}>{PO_LABELS.buyUom}</TableCell>
                <TableCell align="right" sx={headerCellSx}>{PO_LABELS.pcsInPack}</TableCell>
                <TableCell align="right" sx={headerCellSx}>{PO_LABELS.stockIn}</TableCell>
                <TableCell sx={headerCellSx}>{PO_LABELS.status}</TableCell>
                <TableCell align="right" sx={headerCellSx}>{PO_LABELS.costPack}</TableCell>
                <TableCell align="right" sx={headerCellSx}>{PO_LABELS.costPc}</TableCell>
                <TableCell sx={headerCellSx}>{PO_LABELS.sellAs}</TableCell>
                <TableCell align="right" sx={headerCellSx}>{PO_LABELS.packPrice}</TableCell>
                <TableCell align="right" sx={headerCellSx}>{PO_LABELS.piecePrice}</TableCell>
                <TableCell align="right" sx={headerCellSx}>{PO_LABELS.lastBuy}</TableCell>
                {canReceive && <TableCell sx={headerCellSx}>{PO_LABELS.expiry}</TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {po.items.map((item, index) => {
                const rem = item.quantity - item.receivedQuantity;
                const fullyReceived = isLineFullyReceived(item);
                const receiveSel = getReceiveSelection(item.productId, rem);
                const buyUnit = item.orderUom ?? 'pcs';
                const baseUnit = item.baseUom ?? 'pcs';
                const unitsPerBuy = receiveSel.unitsPerBuyUom ?? item.unitsPerBuyUom ?? 1;
                const orderedTotalUnits = item.quantity * (item.unitsPerBuyUom ?? 1);
                const receiveTotalUnits = receiveSel.selected
                  ? receiveSel.receiveQuantity * unitsPerBuy
                  : 0;
                const costPack = item.unitCost;
                const costPc = unitsPerBuy > 0 ? Math.round((costPack / unitsPerBuy) * 10000) / 10000 : costPack;
                const sellMode = receiveSel.sellMode ?? (unitsPerBuy > 1 ? 'both' : 'unit');
                const showPackPrice = unitsPerBuy > 1 && (sellMode === 'unit' || sellMode === 'both');
                const showPiecePrice = sellMode === 'piece' || sellMode === 'both' || unitsPerBuy <= 1;
                const lineStatus = item.lineStatus ?? (
                  item.receivedQuantity <= 0 ? 'pending'
                  : item.receivedQuantity >= item.quantity ? 'received'
                  : 'partial'
                );
                const defaultPackQty = rem > 0 ? rem : 1;
                const lastBuy = lastBuyMap[item.productId];
                const rowDisabled = canReceive && fullyReceived;
                const inputsEnabled = canReceive && !fullyReceived && receiveSel.selected;

                return (
                  <TableRow
                    key={item.productId}
                    selected={canReceive && !fullyReceived && receiveSel.selected}
                    sx={{
                      opacity: rowDisabled ? 0.55 : 1,
                      ...(canReceive && !fullyReceived && receiveSel.selected
                        ? {
                            '&.Mui-selected': { bgcolor: 'action.hover' },
                            '&.Mui-selected:hover': { bgcolor: 'action.selected' },
                            '& .MuiTableCell-root': { bgcolor: 'transparent' },
                          }
                        : undefined),
                    }}
                  >
                    {canReceive && (
                      <TableCell padding="checkbox">
                        <Tooltip title={fullyReceived ? 'Fully received' : ''}>
                          <span>
                            <Checkbox
                              size="small"
                              checked={!fullyReceived && receiveSel.selected}
                              disabled={fullyReceived}
                              onChange={(e) =>
                                updateReceiveSelection(item.productId, rem, {
                                  selected: e.target.checked,
                                  receiveQuantity: receiveSel.receiveQuantity || defaultPackQty,
                                  unitsPerBuyUom: receiveSel.unitsPerBuyUom ?? item.unitsPerBuyUom ?? 1,
                                })
                              }
                            />
                          </span>
                        </Tooltip>
                      </TableCell>
                    )}
                    <TableCell align="center">
                      <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>
                        {index + 1}
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ minWidth: PO_DETAIL_FLAT_COLUMNS.product }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <Typography variant="body2" sx={{ fontWeight: 500 }} title={item.productName} noWrap>
                          {item.productName}
                        </Typography>
                        <Tooltip title="View product">
                          <span>
                            <IconButton
                              size="small"
                              aria-label="View product"
                              disabled={quickViewLoading}
                              onClick={() => void openProductQuickView(item.productId)}
                            >
                              <VisibilityOutlinedIcon sx={{ fontSize: 18 }} />
                            </IconButton>
                          </span>
                        </Tooltip>
                      </Box>
                    </TableCell>
                    <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                      {item.quantity} {buyUnit}
                    </TableCell>
                    <TableCell align="right">{item.receivedQuantity}</TableCell>
                    {canReceive && (
                      <TableCell align="right">
                        <TextField
                          size="small"
                          type="number"
                          value={receiveSel.receiveQuantity}
                          disabled={!inputsEnabled}
                          onChange={(e) => {
                            const raw = Math.max(1, parseInt(e.target.value, 10) || 1);
                            const capped = rem > 0 ? Math.min(raw, rem) : raw;
                            updateReceiveSelection(item.productId, rem, { receiveQuantity: capped });
                          }}
                          sx={{ width: '100%', minWidth: 72, ...noNumberSpinnerSx }}
                          slotProps={{ htmlInput: { min: 1, max: Math.max(rem, 1) } }}
                        />
                      </TableCell>
                    )}
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{buyUnit}</TableCell>
                    <TableCell align="right">
                      {canReceive ? (
                        <TextField
                          size="small"
                          type="number"
                          value={unitsPerBuy}
                          disabled={!inputsEnabled}
                          onChange={(e) =>
                            updateReceiveSelection(item.productId, rem, {
                              unitsPerBuyUom: Math.max(1, parseInt(e.target.value, 10) || 1),
                            })
                          }
                          sx={{ width: '100%', minWidth: 72, ...noNumberSpinnerSx }}
                          slotProps={{ htmlInput: { min: 1 } }}
                        />
                      ) : (
                        item.unitsPerBuyUom ?? 1
                      )}
                    </TableCell>
                    <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                      {canReceive
                        ? (inputsEnabled ? `${receiveTotalUnits} ${baseUnit}` : '—')
                        : `${orderedTotalUnits} ${baseUnit}`}
                    </TableCell>
                    <TableCell>
                      <Chip label={PO_LINE_STATUS_LABELS[lineStatus]} size="small" color={LINE_STATUS_COLORS[lineStatus]} />
                    </TableCell>
                    <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                      {formatCurrency(costPack)}
                    </TableCell>
                    <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                      {formatCurrency(costPc)}
                    </TableCell>
                    <TableCell>
                      {canReceive ? (
                        <TextField
                          select
                          size="small"
                          value={sellMode}
                          disabled={!inputsEnabled}
                          onChange={(e) =>
                            updateReceiveSelection(item.productId, rem, {
                              sellMode: e.target.value as SellModeValue,
                            })
                          }
                          sx={{ ...excelCellSx, minWidth: 110 }}
                        >
                          {(unitsPerBuy > 1
                            ? PO_SELL_AS_OPTIONS
                            : PO_SELL_AS_OPTIONS.filter((o) => o.value === 'piece')
                          ).map((o) => (
                            <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
                          ))}
                        </TextField>
                      ) : (
                        PO_SELL_AS_OPTIONS.find((o) => o.value === sellMode)?.label ?? sellMode
                      )}
                    </TableCell>
                    <TableCell align="right">
                      {showPackPrice ? (
                        canReceive ? (
                          <TextField
                            size="small"
                            type="number"
                            value={receiveSel.packSellingPrice ?? ''}
                            disabled={!inputsEnabled}
                            onChange={(e) =>
                              updateReceiveSelection(item.productId, rem, {
                                packSellingPrice: Math.max(0, parseFloat(e.target.value) || 0),
                              })
                            }
                            sx={{ width: '100%', minWidth: 80, ...noNumberSpinnerSx }}
                            slotProps={{ htmlInput: { min: 0, step: 0.01, style: { textAlign: 'right' } } }}
                          />
                        ) : (
                          formatCurrency(receiveSel.packSellingPrice ?? 0)
                        )
                      ) : '—'}
                    </TableCell>
                    <TableCell align="right">
                      {showPiecePrice ? (
                        canReceive ? (
                          <TextField
                            size="small"
                            type="number"
                            value={receiveSel.sellingPrice ?? ''}
                            disabled={!inputsEnabled}
                            onChange={(e) =>
                              updateReceiveSelection(item.productId, rem, {
                                sellingPrice: Math.max(0, parseFloat(e.target.value) || 0),
                              })
                            }
                            sx={{ width: '100%', minWidth: 80, ...noNumberSpinnerSx }}
                            slotProps={{ htmlInput: { min: 0, step: 0.01, style: { textAlign: 'right' } } }}
                          />
                        ) : (
                          formatCurrency(receiveSel.sellingPrice ?? 0)
                        )
                      ) : '—'}
                    </TableCell>
                    <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                      {lastBuy?.unitCost != null && lastBuy.unitCost > 0 ? (
                        <Tooltip
                          title={[
                            lastBuy.purchasedAt ? formatDate(lastBuy.purchasedAt) : null,
                            lastBuy.orderNumber ? lastBuy.orderNumber : null,
                          ].filter(Boolean).join(' · ') || 'Previous purchase'}
                        >
                          <span>{formatCurrency(lastBuy.unitCost)}</span>
                        </Tooltip>
                      ) : (
                        <Tooltip title="No prior purchase">
                          <span>—</span>
                        </Tooltip>
                      )}
                    </TableCell>
                    {canReceive && (
                      <TableCell>
                        <Box sx={{ width: '100%', minWidth: 90 }}>
                          <NepaliAwareDatePicker
                            label="Expiry"
                            value={receiveSel.expiryDate}
                            onChange={(d) =>
                              updateReceiveSelection(item.productId, rem, { expiryDate: d })
                            }
                            size="small"
                            disabled={!inputsEnabled}
                            calendarSystem="AD"
                            helperText={undefined}
                          />
                        </Box>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>

        <Divider sx={{ mt: 2, mb: 1 }} />
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            flexWrap: 'wrap',
            gap: 2,
          }}
        >
          <Box sx={{ flex: '1 1 220px', minWidth: 0, maxWidth: 420 }}>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 1,
                mb: 1,
              }}
            >
              <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                Supplier bill
              </Typography>
              {canManage && (
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<EditIcon fontSize="small" />}
                  onClick={openBillDialog}
                >
                  Edit bill
                </Button>
              )}
            </Box>
            {po.billNumber?.trim() ? (
              <Chip
                label={po.billNumber.trim()}
                size="small"
                variant="outlined"
                sx={{ mb: 1.5, fontWeight: 600, maxWidth: '100%' }}
              />
            ) : (
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                No bill number
              </Typography>
            )}
            {po.billImages && po.billImages.length > 0 ? (
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                {po.billImages.map((url) => (
                  <Box
                    key={url}
                    component="a"
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    sx={{
                      display: 'block',
                      lineHeight: 0,
                      borderRadius: 1,
                      overflow: 'hidden',
                      border: 1,
                      borderColor: 'divider',
                      '&:hover': { borderColor: 'primary.main', opacity: 0.92 },
                    }}
                  >
                    <Box
                      component="img"
                      src={url}
                      alt="Supplier bill"
                      sx={{ width: 72, height: 72, objectFit: 'cover', display: 'block' }}
                    />
                  </Box>
                ))}
              </Box>
            ) : (
              <Typography variant="body2" color="text.secondary">
                No bill photos
              </Typography>
            )}
          </Box>
          <Box sx={{ width: '100%', maxWidth: 360 }}>
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
              Order Summary
            </Typography>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.75 }}>
              <Typography variant="body2" color="text.secondary">Subtotal</Typography>
              <Typography variant="body2">{formatCurrency(po.subtotal ?? po.totalAmount)}</Typography>
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.75 }}>
              <Typography variant="body2" color="text.secondary">Discount</Typography>
              <Typography variant="body2">{formatCurrency(po.discount ?? 0)}</Typography>
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
              <Typography variant="body2" color="text.secondary">Additional charges</Typography>
              <Typography variant="body2">{formatCurrency(po.additionalCharges ?? 0)}</Typography>
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', pt: 1, borderTop: 1, borderColor: 'divider' }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Order total</Typography>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }} color="primary">
                {formatCurrency(po.totalAmount)}
              </Typography>
            </Box>
            {overpaid > 0 && (
              <Chip
                label={`Overpaid / credit: ${formatCurrency(overpaid)}`}
                color="warning"
                size="small"
                sx={{ mt: 1, fontWeight: 600 }}
              />
            )}
          </Box>
        </Box>
      </Paper>

      <FormModal
        open={paymentOpen}
        title="Record Payment"
        onClose={() => setPaymentOpen(false)}
        onSubmit={handlePaymentSubmit(handleRecordPayment)}
        submitLabel="Save payment"
        loading={paymentMutation.isPending}
        maxWidth="sm"
      >
        {paymentError && <Alert severity="error" sx={{ mb: 2 }}>{paymentError}</Alert>}
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {PO_RECORD_PAYMENT_HINT} Remaining balance: {formatCurrency(remaining)}.
        </Typography>
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              label="Amount"
              type="number"
              size="small"
              fullWidth
              required
              {...register('amount', { valueAsNumber: true })}
              error={!!paymentErrors.amount}
              helperText={paymentErrors.amount?.message}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">{CURRENCY_SYMBOL}</InputAdornment>
                  ),
                },
              }}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <Controller
              name="date"
              control={paymentControl}
              render={({ field }) => (
                <NepaliAwareDatePicker
                  label="Payment date"
                  value={field.value}
                  onChange={field.onChange}
                  size="small"
                  fullWidth
                />
              )}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <Controller
              name="paymentMethod"
              control={paymentControl}
              render={({ field }) => (
                <FormControl fullWidth required error={!!paymentErrors.paymentMethod} size="small">
                  <InputLabel>Payment method</InputLabel>
                  <Select label="Payment method" {...field}>
                    {PAYMENT_METHODS.map((method) => (
                      <MenuItem key={method.value} value={method.value}>{method.label}</MenuItem>
                    ))}
                  </Select>
                  {paymentErrors.paymentMethod && (
                    <Typography variant="caption" color="error" sx={{ mt: 0.5, ml: 1.75 }}>
                      {paymentErrors.paymentMethod.message}
                    </Typography>
                  )}
                </FormControl>
              )}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              label="Bill no."
              size="small"
              fullWidth
              placeholder="Optional vendor bill / invoice number"
              {...register('billNo')}
              error={!!paymentErrors.billNo}
              helperText={paymentErrors.billNo?.message}
            />
          </Grid>
          <Grid size={{ xs: 12 }}>
            <TextField
              label="Notes"
              size="small"
              fullWidth
              multiline
              minRows={2}
              {...register('notes')}
              error={!!paymentErrors.notes}
              helperText={paymentErrors.notes?.message}
            />
          </Grid>
        </Grid>
      </FormModal>

      <FormModal
        open={billOpen}
        title="Edit supplier bill"
        onClose={() => setBillOpen(false)}
        onSubmit={() => void handleSaveBill()}
        submitLabel="Save bill"
        loading={billMutation.isPending || billUploading}
        maxWidth="sm"
      >
        {billError && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {billError}
          </Alert>
        )}
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          You can update this in any order status.
        </Typography>
        <TextField
          label="Bill number"
          size="small"
          fullWidth
          value={billNumberEdit}
          onChange={(e) => setBillNumberEdit(e.target.value)}
          placeholder="Optional supplier invoice / bill no"
          sx={{ mb: 2 }}
        />
        <Button
          component="label"
          size="small"
          variant="outlined"
          startIcon={<AddPhotoAlternateOutlinedIcon />}
          disabled={billUploading || billMutation.isPending}
        >
          {billUploading ? 'Uploading…' : 'Add bill photos'}
          <input
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => {
              const files = e.target.files;
              if (!files?.length) return;
              setBillUploading(true);
              setBillError('');
              void uploadImagesToCloudinary(files)
                .then((urls) => setBillImagesEdit((prev) => [...prev, ...urls]))
                .catch((err) =>
                  setBillError(err instanceof Error ? err.message : 'Upload failed'),
                )
                .finally(() => {
                  setBillUploading(false);
                  e.target.value = '';
                });
            }}
          />
        </Button>
        {billImagesEdit.length > 0 && (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.25, mt: 2 }}>
            {billImagesEdit.map((url) => (
              <Box key={url} sx={{ position: 'relative', width: 72, height: 72 }}>
                <Box
                  component="img"
                  src={url}
                  alt="Supplier bill"
                  sx={{
                    width: 72,
                    height: 72,
                    objectFit: 'cover',
                    borderRadius: 1,
                    border: 1,
                    borderColor: 'divider',
                    display: 'block',
                  }}
                />
                <IconButton
                  size="small"
                  aria-label="Remove bill photo"
                  onClick={() => setBillImagesEdit((prev) => prev.filter((u) => u !== url))}
                  sx={{
                    position: 'absolute',
                    top: -8,
                    right: -8,
                    bgcolor: 'background.paper',
                    border: 1,
                    borderColor: 'divider',
                    width: 24,
                    height: 24,
                    '&:hover': { bgcolor: 'error.light', color: 'error.contrastText' },
                  }}
                >
                  <CloseIcon sx={{ fontSize: 14 }} />
                </IconButton>
              </Box>
            ))}
          </Box>
        )}
      </FormModal>

      <PoReturnDialog
        open={returnOpen}
        purchaseOrderId={po.id}
        amountPaid={amountPaid}
        onClose={() => setReturnOpen(false)}
      />

      <ProductQuickViewDialog
        product={quickViewProduct}
        open={Boolean(quickViewProduct)}
        onClose={() => setQuickViewProduct(null)}
      />

      <ConfirmDialog
        open={receiveConfirmOpen}
        title="Process receipt?"
        message={`Receive ${itemsToReceive.length} line${itemsToReceive.length !== 1 ? 's' : ''}?\n\nStock will increase and product buy unit, cost, sell as, and sell prices will update.`}
        confirmLabel="Process Receipt"
        cancelLabel="Cancel"
        confirmColor="primary"
        loading={receiveMutation.isPending}
        onConfirm={() => void handleReceive()}
        onCancel={() => setReceiveConfirmOpen(false)}
      />
    </Box>
  );
}
