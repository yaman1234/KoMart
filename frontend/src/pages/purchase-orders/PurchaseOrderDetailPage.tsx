import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
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
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Grid,
  InputAdornment,
  InputLabel,
  FormControl,
  IconButton,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import CloseIcon from '@mui/icons-material/Close';
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera';
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { PageHeader } from '@/components/common/PageHeader';
import { NepaliAwareDatePicker } from '@/components/common/NepaliAwareDatePicker';
import { FormModal } from '@/components/common/FormModal';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { PoDetailActions } from '@/pages/purchase-orders/components/PoDetailActions';
import { PoHistoryTabs } from '@/pages/purchase-orders/components/PoHistoryTabs';
import {
  usePurchaseOrder,
  useUpdatePurchaseOrderStatus,
  useReceivePurchaseOrderItems,
  useRecordPurchaseOrderPayment,
  usePoWorkflowAction,
  useUpdatePurchaseOrderBillImages,
} from '@/hooks/usePurchaseOrders';
import {
  useCreatePurchaseReturn,
  usePurchaseReturns,
  useReturnableLines,
} from '@/hooks/usePurchaseReturns';
import { formatCurrency, canManagePurchaseOrders, formatDateTime, isAdmin } from '@/utils';
import { CURRENCY_SYMBOL } from '@/constants';
import { useFormatDate } from '@/hooks/useFormatDate';
import { apiClient, getErrorMessage } from '@/services/apiClient';
import { showSuccess } from '@/utils/toast';
import { uploadImagesToCloudinary } from '@/utils/cloudinaryUpload';
import { PAYMENT_METHODS, PO_LINE_STATUS_LABELS, PO_PAYMENT_STATUS_LABELS, PO_STATUS_LABELS } from '@/constants';
import { useAuthStore } from '@/store';
import type {
  PurchaseOrderLineStatus,
  PurchaseOrderPaymentStatus,
  PurchaseOrderReceiveItem,
  PurchaseOrderStatus,
} from '@/types';
import { PO_LABELS, PO_RECEIVE_HINT, PO_RETURN_HINT, PO_BILL_NO_HINT, PO_AUTO_OPEN_PAY_AFTER_RECEIVE, PO_BILL_IMAGES_HINT } from '@/pages/purchase-orders/poTerminology';
import {
  poDetailColWidths,
  poDetailTableMinWidth,
} from '@/pages/purchase-orders/poLineTableColumns';

const PAYMENT_SCHEMA = z.object({
  amount: z.number({ error: 'Amount is required' }).positive('Amount must be positive'),
  date: z.string().min(1, 'Payment date is required'),
  paymentMethod: z.string().min(1, 'Payment method is required'),
  billNo: z.string().optional(),
  notes: z.string().optional(),
});

type PaymentFormValues = z.infer<typeof PAYMENT_SCHEMA>;

const STATUS_COLORS: Record<PurchaseOrderStatus, 'default' | 'warning' | 'info' | 'success' | 'error'> = {
  draft: 'default',
  pending_approval: 'warning',
  approved: 'info',
  rejected: 'error',
  ordered: 'warning',
  partial: 'info',
  received: 'success',
  closed: 'default',
  cancelled: 'error',
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

const PAYABLE_STATUSES = new Set<PurchaseOrderStatus>(['ordered', 'partial', 'received', 'closed']);

interface ReceiveSelection {
  selected: boolean;
  receiveQuantity: number;
  expiryDate: string;
  unitsPerBuyUom?: number;
}

const headerCellSx = { fontWeight: 700, whiteSpace: 'nowrap', py: 0.75 };

export function PurchaseOrderDetailPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const user = useAuthStore((s) => s.user);
  const formatDate = useFormatDate();
  const canManage = canManagePurchaseOrders(user?.role);
  const [statusError, setStatusError] = useState('');
  const [receiveError, setReceiveError] = useState('');
  const [cancelOpen, setCancelOpen] = useState(false);
  const [receiveBillNo, setReceiveBillNo] = useState('');
  const [pendingBillImages, setPendingBillImages] = useState<string[]>([]);
  const [billUploadBusy, setBillUploadBusy] = useState(false);
  const [receiveSelections, setReceiveSelections] = useState<Record<string, ReceiveSelection>>({});
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentError, setPaymentError] = useState('');
  const [returnOpen, setReturnOpen] = useState(false);
  const [returnError, setReturnError] = useState('');
  const [returnQtys, setReturnQtys] = useState<Record<string, string>>({});
  const [returnRemarks, setReturnRemarks] = useState('');
  const [returnPaymentMethod, setReturnPaymentMethod] = useState('cash');
  const [returnSettlement, setReturnSettlement] = useState<'refund' | 'credit' | 'replacement' | 'pending'>('refund');
  const [returnReason, setReturnReason] = useState('other');
  const [returnBillNo, setReturnBillNo] = useState('');
  const [returnDate, setReturnDate] = useState(() => new Date().toISOString().slice(0, 10));

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
  const statusMutation = useUpdatePurchaseOrderStatus();
  const workflowMutation = usePoWorkflowAction();
  const receiveMutation = useReceivePurchaseOrderItems();
  const billImagesMutation = useUpdatePurchaseOrderBillImages();
  const paymentMutation = useRecordPurchaseOrderPayment();
  const returnMutation = useCreatePurchaseReturn();
  const { data: returnsData } = usePurchaseReturns(id ?? '', Boolean(id));
  const { data: returnableLines = [], isFetching: returnableLoading } = useReturnableLines(
    id ?? '',
    returnOpen && Boolean(id),
  );
  const { data: receiptsData } = useQuery({
    queryKey: ['goodsReceipts', id],
    queryFn: async () => {
      const { data } = await apiClient.get(`/purchase-orders/${id}/goods-receipts`);
      return data as { data: Array<Record<string, unknown>>; total: number };
    },
    enabled: Boolean(id),
  });
  const { data: invoicesData } = useQuery({
    queryKey: ['purchaseInvoices', id],
    queryFn: async () => {
      const { data } = await apiClient.get(`/purchase-orders/${id}/invoices`);
      return data as { data: Array<Record<string, unknown>>; total: number };
    },
    enabled: Boolean(id),
  });

  useEffect(() => {
    if (po?.billNo?.trim()) {
      setReceiveBillNo(po.billNo.trim());
    }
  }, [po?.id, po?.billNo]);

  const canReceive = po?.status === 'ordered' || po?.status === 'partial';
  const amountPaid = po?.amountPaid ?? 0;
  const remaining = po ? Math.max(0, Math.round((po.totalAmount - amountPaid) * 100) / 100) : 0;
  const paymentStatus: PurchaseOrderPaymentStatus = po?.paymentStatus ?? 'unpaid';
  const canPay = Boolean(
    po
    && canManage
    && PAYABLE_STATUSES.has(po.status)
    && remaining > 0
    && (invoicesData?.data?.length ?? 0) > 0,
  );
  const hasReceivedStock = Boolean(
    po?.items.some((item) => item.receivedQuantity > 0),
  );
  const canReturn = Boolean(
    canManage
    && po
    && po.status !== 'cancelled'
    && po.status !== 'draft'
    && hasReceivedStock,
  );

  const getReceiveSelection = (productId: string, remaining: number): ReceiveSelection =>
    receiveSelections[productId] ?? { selected: false, receiveQuantity: remaining || 1, expiryDate: '' };

  const updateReceiveSelection = (productId: string, remaining: number, patch: Partial<ReceiveSelection>) => {
    setReceiveSelections((prev) => {
      const base = prev[productId] ?? { selected: false, receiveQuantity: remaining || 1, expiryDate: '' };
      return { ...prev, [productId]: { ...base, ...patch } };
    });
  };

  const receivableItems = useMemo(() => po?.items ?? [], [po]);

  const selectAllState = useMemo(() => {
    if (receivableItems.length === 0) return { checked: false, indeterminate: false };
    const selectedCount = receivableItems.filter((item) => {
      const remaining = item.quantity - item.receivedQuantity;
      return getReceiveSelection(item.productId, remaining).selected;
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
        const remaining = item.quantity - item.receivedQuantity;
        const base = next[item.productId] ?? { receiveQuantity: remaining > 0 ? remaining : 1, expiryDate: '', selected: false };
        next[item.productId] = { ...base, selected: checked, receiveQuantity: remaining > 0 ? remaining : 1 };
      }
      return next;
    });
  };

  const itemsToReceive = useMemo((): PurchaseOrderReceiveItem[] => {
    if (!po) return [];
    return po.items
      .filter((item) => {
        const remaining = item.quantity - item.receivedQuantity;
        const sel = getReceiveSelection(item.productId, remaining);
        return sel.selected && sel.receiveQuantity > 0;
      })
      .map((item) => {
        const remaining = item.quantity - item.receivedQuantity;
        const sel = getReceiveSelection(item.productId, remaining);
        const payload: PurchaseOrderReceiveItem = {
          productId: item.productId,
          receiveQuantity: sel.receiveQuantity,
        };
        if (sel.expiryDate) payload.expiryDate = sel.expiryDate;
        const lineUnits = item.unitsPerBuyUom ?? 1;
        if (sel.unitsPerBuyUom && sel.unitsPerBuyUom !== lineUnits) {
          payload.unitsPerBuyUom = sel.unitsPerBuyUom;
        }
        return payload;
      });
  }, [po, receiveSelections]);

  const handleCancelOrder = async () => {
    if (!po) return;
    setStatusError('');
    try {
      await statusMutation.mutateAsync({ id: po.id, status: 'cancelled' });
      showSuccess('Purchase Order cancelled.');
      setCancelOpen(false);
    } catch (err) {
      setStatusError(getErrorMessage(err));
      setCancelOpen(false);
    }
  };

  const handlePlaceOrder = async () => {
    if (!po) return;
    setStatusError('');
    try {
      await statusMutation.mutateAsync({ id: po.id, status: 'ordered' });
      showSuccess('Order placed.');
    } catch (err) {
      setStatusError(getErrorMessage(err));
    }
  };

  const openPaymentDialog = (opts?: { amount?: number; billNo?: string }) => {
    if (!po) return;
    const payRemaining = opts?.amount ?? remaining;
    resetPaymentForm({
      amount: payRemaining > 0 ? payRemaining : remaining,
      date: new Date().toISOString().slice(0, 10),
      paymentMethod: 'cash',
      billNo: opts?.billNo ?? (po.billNo?.trim() || ''),
      notes: '',
    });
    setPaymentError('');
    setPaymentOpen(true);
  };

  const finishReceive = async (items: PurchaseOrderReceiveItem[]) => {
    if (!po) return;
    if (items.length === 0) {
      setReceiveError('Select at least one item with a receive qty');
      return;
    }
    setReceiveError('');
    try {
      const updated = await receiveMutation.mutateAsync({
        id: po.id,
        items,
        billNo: receiveBillNo.trim() || undefined,
        billImages: pendingBillImages.length ? pendingBillImages : undefined,
      });
      showSuccess('Goods received — invoice created.');
      setReceiveSelections({});
      const bill = receiveBillNo.trim() || updated.billNo?.trim() || po.billNo?.trim() || '';
      setReceiveBillNo('');
      setPendingBillImages([]);
      if (PO_AUTO_OPEN_PAY_AFTER_RECEIVE) {
        const paid = updated.amountPaid ?? 0;
        const due = Math.max(0, Math.round((updated.totalAmount - paid) * 100) / 100);
        if (due > 0) {
          openPaymentDialog({ amount: due, billNo: bill });
        }
      }
    } catch (err) {
      setReceiveError(getErrorMessage(err));
    }
  };

  const handleBillFilesSelected = async (files: FileList | null) => {
    if (!files?.length || !po) return;
    setBillUploadBusy(true);
    setReceiveError('');
    try {
      const urls = await uploadImagesToCloudinary(files);
      if (!urls.length) return;
      if (canReceive) {
        setPendingBillImages((prev) => [...prev, ...urls]);
      } else if (canManage && po.status !== 'cancelled') {
        const next = [...(po.billImages ?? []), ...urls];
        await billImagesMutation.mutateAsync({ id: po.id, billImages: next });
        showSuccess('Bill image(s) saved.');
      }
    } catch (err) {
      setReceiveError(getErrorMessage(err));
    } finally {
      setBillUploadBusy(false);
    }
  };

  const handleRemoveSavedBillImage = async (url: string) => {
    if (!po || !canManage) return;
    const next = (po.billImages ?? []).filter((u) => u !== url);
    try {
      await billImagesMutation.mutateAsync({ id: po.id, billImages: next });
      showSuccess('Bill image removed.');
    } catch (err) {
      setStatusError(getErrorMessage(err));
    }
  };

  const handleReceive = async () => {
    await finishReceive(itemsToReceive);
  };

  const handleWorkflow = async (action: 'submit' | 'approve' | 'reject' | 'send' | 'close') => {
    if (!po) return;
    setStatusError('');
    try {
      await workflowMutation.mutateAsync({ id: po.id, action });
      const messages: Record<typeof action, string> = {
        submit: 'Submitted for approval.',
        approve: 'Purchase Order approved.',
        reject: 'Purchase Order rejected.',
        send: 'Purchase Order sent to supplier.',
        close: 'Purchase Order closed.',
      };
      showSuccess(messages[action]);
    } catch (err) {
      setStatusError(getErrorMessage(err));
    }
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
      const updated = await paymentMutation.mutateAsync({
        id: po.id,
        data: {
          amount,
          date: values.date,
          paymentMethod: values.paymentMethod,
          billNo: values.billNo?.trim() || undefined,
          notes: values.notes?.trim() || undefined,
        },
      });
      showSuccess('Payment recorded and expense created.');
      setPaymentOpen(false);
      const paidUp = (updated.paymentStatus === 'paid')
        || Math.max(0, updated.totalAmount - (updated.amountPaid ?? 0)) < 0.001;
      if (canManage && updated.status === 'received' && paidUp) {
        try {
          await workflowMutation.mutateAsync({ id: po.id, action: 'close' });
          showSuccess('Order fully paid — closed.');
        } catch {
          // Close is best-effort; payment already succeeded.
        }
      }
    } catch (err) {
      setPaymentError(getErrorMessage(err));
    }
  };

  const openReturnDialog = () => {
    setReturnError('');
    setReturnRemarks('');
    setReturnPaymentMethod('cash');
    setReturnSettlement('refund');
    setReturnReason('other');
    setReturnDate(new Date().toISOString().slice(0, 10));
    setReturnBillNo(po?.billNo?.trim() || '');
    setReturnQtys({});
    setReturnOpen(true);
  };

  const handlePostReturn = async () => {
    if (!po) return;
    const items = returnableLines
      .map((line) => {
        const raw = returnQtys[line.productId] ?? '';
        const qty = parseInt(raw, 10);
        return { productId: line.productId, returnQty: Number.isFinite(qty) ? qty : 0, max: line.availableQty };
      })
      .filter((row) => row.returnQty > 0);

    if (items.length === 0) {
      setReturnError('Enter a return qty for at least one product.');
      return;
    }
    for (const row of items) {
      if (row.returnQty > row.max) {
        setReturnError(`Return qty cannot exceed available leftover (${row.max}).`);
        return;
      }
    }
    setReturnError('');
    try {
      const result = await returnMutation.mutateAsync({
        purchaseOrderId: po.id,
        items: items.map(({ productId, returnQty }) => ({ productId, returnQty })),
        remarks: returnRemarks.trim() || undefined,
        paymentMethod: returnPaymentMethod,
        billNo: returnBillNo.trim() || undefined,
        returnDate: returnDate || undefined,
        settlementType: returnSettlement,
        reason: returnReason as 'damaged' | 'wrong_item' | 'expired' | 'quality' | 'other',
        confirmImmediately: true,
      });
      showSuccess(`Purchase return ${result.returnNumber} posted.`);
      setReturnOpen(false);
    } catch (err) {
      setReturnError(getErrorMessage(err));
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

  const canCancel = isAdmin(user?.role) && [
    'draft',
    'pending_approval',
    'approved',
    'ordered',
    'partial',
    'received',
    'closed',
    'rejected',
  ].includes(po.status);
  const workflowBusy = workflowMutation.isPending || statusMutation.isPending;
  const receivedUnits = po.items.reduce(
    (sum, item) => sum + item.receivedQuantity * (item.unitsPerBuyUom ?? 1),
    0,
  );
  const cancelMessage = [
    `Cancel ${po.orderNumber}? Admin only — this cannot be undone.`,
    '',
    amountPaid > 0
      ? `• Reverse ${formatCurrency(amountPaid)} in recorded payments (linked expenses and wallet entries).`
      : '• No payments to reverse.',
    receivedUnits > 0
      ? `• Remove leftover stock unit(s) received on this purchase order (returns already out are not treated as sold).`
      : '• No received stock to reverse.',
    '• Void goods receipts and purchase invoices; reverse return refunds/credits.',
    '',
    'Cancel is blocked if any received stock from this order was already sold.',
  ].join('\n');
  const receivedCount = po.items.filter((i) => i.receivedQuantity >= i.quantity).length;
  const selectedReceiveCount = itemsToReceive.length;

  return (
    <Box>
      <PageHeader
        title={po.orderNumber}
        breadcrumbs={[{ label: 'Purchase Orders', path: '/purchase-orders' }, { label: po.orderNumber }]}
        action={
          <PoDetailActions
            po={po}
            userRole={user?.role}
            canManage={canManage}
            canReceive={Boolean(canManage && canReceive)}
            canPay={canPay}
            canReturn={canReturn}
            canCancel={canCancel}
            workflowBusy={workflowBusy || statusMutation.isPending}
            receivePending={receiveMutation.isPending}
            receiveDisabled={itemsToReceive.length === 0}
            placeOrderPending={statusMutation.isPending}
            onBack={() => navigate('/purchase-orders')}
            onEdit={() => navigate(`/purchase-orders/${po.id}/edit`)}
            onPlaceOrder={() => void handlePlaceOrder()}
            onWorkflow={(action) => void handleWorkflow(action)}
            onReceive={() => void handleReceive()}
            onPay={() => openPaymentDialog()}
            onReturn={openReturnDialog}
            onCancel={() => setCancelOpen(true)}
          />
        }
      />

      {(statusError || receiveError) && (
        <Alert severity="error" sx={{ mb: 2 }}>{statusError || receiveError}</Alert>
      )}

      <Paper variant="outlined" sx={{ px: 2, py: 1.5, mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0, flexWrap: 'wrap' }}>
            <Link
              component={RouterLink}
              to={`/suppliers/${po.supplierId}`}
              variant="subtitle1"
              sx={{ fontWeight: 600 }}
            >
              {po.supplierName}
            </Link>
            <Chip label={PO_STATUS_LABELS[po.status]} color={STATUS_COLORS[po.status]} size="small" sx={{ fontWeight: 600 }} />
            <Chip
              label={PO_PAYMENT_STATUS_LABELS[paymentStatus]}
              color={PAYMENT_COLORS[paymentStatus]}
              size="small"
              variant="outlined"
              sx={{ fontWeight: 600 }}
            />
            {po.billNo?.trim() ? (
              <Typography variant="body2" color="text.secondary">
                Bill: <Box component="span" sx={{ fontWeight: 600, color: 'text.primary' }}>{po.billNo}</Box>
              </Typography>
            ) : null}
          </Box>
          <Box sx={{ display: 'flex', gap: 2.5, flexWrap: 'wrap' }}>
            <Box>
              <Typography variant="caption" color="text.secondary">Total</Typography>
              <Typography variant="body2" sx={{ fontWeight: 700 }}>{formatCurrency(po.totalAmount)}</Typography>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">Paid</Typography>
              <Typography variant="body2" sx={{ fontWeight: 700 }}>{formatCurrency(amountPaid)}</Typography>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">Remaining</Typography>
              <Typography variant="body2" sx={{ fontWeight: 700, color: remaining > 0 ? 'warning.main' : 'success.main' }}>
                {formatCurrency(remaining)}
              </Typography>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">Items</Typography>
              <Typography variant="body2" sx={{ fontWeight: 700 }}>
                {receivedCount}/{po.items.length} received
              </Typography>
            </Box>
          </Box>
        </Box>
        <Accordion disableGutters elevation={0} sx={{ mt: 0.5, bgcolor: 'transparent', '&:before': { display: 'none' } }}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ px: 0, minHeight: 36 }}>
            <Typography variant="caption" color="text.secondary">More details</Typography>
          </AccordionSummary>
          <AccordionDetails sx={{ px: 0, pt: 0 }}>
            <Box sx={{ display: 'flex', flexWrap: 'nowrap', gap: 2, overflowX: 'auto', py: 0.5 }}>
              {[
                { label: 'Expected delivery', value: po.expectedDelivery ? formatDate(po.expectedDelivery) : '—' },
                { label: 'Ordered by', value: po.orderedBy ?? '—' },
                { label: 'Received by', value: po.receivedBy ?? '—' },
                { label: 'Updated', value: po.updatedAt ? formatDateTime(po.updatedAt) : '—' },
                { label: 'Created', value: formatDate(po.createdAt) },
                { label: 'Bill no.', value: po.billNo?.trim() || '—' },
                { label: 'Remarks', value: po.remarks?.trim() || '—' },
              ].map((field) => (
                <Box key={field.label} sx={{ flexShrink: 0, minWidth: 120 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                    {field.label}
                  </Typography>
                  <Typography variant="body2" noWrap title={field.value}>
                    {field.value}
                  </Typography>
                </Box>
              ))}
            </Box>
          </AccordionDetails>
        </Accordion>
      </Paper>

      {((po.billImages?.length ?? 0) > 0 || (canManage && po.status !== 'cancelled' && !canReceive)) && (
        <Paper variant="outlined" sx={{ px: 2, py: 1.5, mb: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1, mb: 1, flexWrap: 'wrap' }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>Bill photos</Typography>
            {canManage && po.status !== 'cancelled' && !canReceive && (
              <Button
                size="small"
                variant="outlined"
                component="label"
                startIcon={<PhotoCameraIcon />}
                loading={billUploadBusy || billImagesMutation.isPending}
                disabled={billUploadBusy || billImagesMutation.isPending}
              >
                Add photos
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  hidden
                  onChange={(e) => {
                    void handleBillFilesSelected(e.target.files);
                    e.target.value = '';
                  }}
                />
              </Button>
            )}
          </Box>
          {(po.billImages?.length ?? 0) === 0 ? (
            <Typography variant="caption" color="text.secondary">No bill photos yet.</Typography>
          ) : (
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              {(po.billImages ?? []).map((url) => (
                <Box key={url} sx={{ position: 'relative', width: 72, height: 72 }}>
                  <Box
                    component="a"
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    sx={{ display: 'block', width: 72, height: 72 }}
                  >
                    <Box
                      component="img"
                      src={url}
                      alt="Bill"
                      sx={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 1, border: 1, borderColor: 'divider' }}
                    />
                  </Box>
                  {canManage && po.status !== 'cancelled' && (
                    <IconButton
                      size="small"
                      aria-label="Remove bill photo"
                      onClick={() => void handleRemoveSavedBillImage(url)}
                      sx={{ position: 'absolute', top: -8, right: -8, bgcolor: 'background.paper', boxShadow: 1 }}
                    >
                      <CloseIcon sx={{ fontSize: 14 }} />
                    </IconButton>
                  )}
                </Box>
              ))}
            </Box>
          )}
        </Paper>
      )}

      <PoHistoryTabs
        po={po}
        receipts={receiptsData?.data ?? []}
        invoices={invoicesData?.data ?? []}
        returns={returnsData?.data ?? []}
        canPay={canPay}
        canReturn={canReturn}
        paymentStatus={paymentStatus}
        amountPaid={amountPaid}
        remaining={remaining}
        formatDate={formatDate}
        onPay={() => openPaymentDialog()}
        onReturn={openReturnDialog}
      />

      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 1.5, mb: 1.5 }}>
          <Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>Order Items</Typography>
            {canReceive && (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                {PO_RECEIVE_HINT}
              </Typography>
            )}
          </Box>
          {canReceive && (
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 0.5 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                <TextField
                  size="small"
                  label={PO_LABELS.billNo}
                  value={receiveBillNo}
                  onChange={(e) => setReceiveBillNo(e.target.value)}
                  placeholder="Optional"
                  sx={{ width: 170 }}
                />
                <Button
                  size="small"
                  variant="outlined"
                  component="label"
                  startIcon={<PhotoCameraIcon />}
                  loading={billUploadBusy}
                  disabled={billUploadBusy}
                >
                  Bill photos
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    hidden
                    onChange={(e) => {
                      void handleBillFilesSelected(e.target.files);
                      e.target.value = '';
                    }}
                  />
                </Button>
                <Typography variant="caption" color="text.secondary">
                  {selectedReceiveCount} selected — use Process Goods Receipt in the header
                </Typography>
              </Box>
              {(pendingBillImages.length > 0 || (po.billImages?.length ?? 0) > 0) && (
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', justifyContent: 'flex-end', maxWidth: 420 }}>
                  {pendingBillImages.map((url) => (
                    <Box key={url} sx={{ position: 'relative', width: 56, height: 56 }}>
                      <Box
                        component="img"
                        src={url}
                        alt="Pending bill"
                        sx={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 1, border: 1, borderColor: 'divider' }}
                      />
                      <IconButton
                        size="small"
                        aria-label="Remove pending bill photo"
                        onClick={() => setPendingBillImages((prev) => prev.filter((u) => u !== url))}
                        sx={{ position: 'absolute', top: -8, right: -8, bgcolor: 'background.paper', boxShadow: 1 }}
                      >
                        <CloseIcon sx={{ fontSize: 14 }} />
                      </IconButton>
                    </Box>
                  ))}
                </Box>
              )}
              <Typography variant="caption" color="text.secondary" sx={{ maxWidth: 360, textAlign: 'right' }}>
                {PO_BILL_NO_HINT} {PO_BILL_IMAGES_HINT}
              </Typography>
            </Box>
          )}
        </Box>
        <Divider sx={{ mb: 1.5 }} />

        <TableContainer sx={{ overflowX: 'auto', maxWidth: '100%' }}>
          <Table
            size="small"
            sx={{
              tableLayout: 'fixed',
              minWidth: poDetailTableMinWidth(canReceive),
              '& .MuiTableCell-root': {
                verticalAlign: 'middle',
                py: 0.75,
                px: 0.75,
                fontSize: '0.8125rem',
                overflow: 'hidden',
              },
            }}
          >
            <colgroup>
              {poDetailColWidths(canReceive).map((width, i) => (
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
                <TableCell sx={headerCellSx}>Product</TableCell>
                <TableCell sx={headerCellSx}>{PO_LABELS.buyUom}</TableCell>
                <TableCell align="right" sx={headerCellSx}>{PO_LABELS.unitsPerPack}</TableCell>
                <TableCell sx={headerCellSx}>{PO_LABELS.sellUnit}</TableCell>
                <TableCell align="right" sx={headerCellSx}>{PO_LABELS.orderedQty}</TableCell>
                <TableCell align="right" sx={headerCellSx}>{PO_LABELS.receivedQty}</TableCell>
                <TableCell align="right" sx={headerCellSx}>{PO_LABELS.remaining}</TableCell>
                {canReceive && <TableCell align="right" sx={headerCellSx}>{PO_LABELS.receiveQty}</TableCell>}
                <TableCell align="right" sx={headerCellSx}>{PO_LABELS.totalUnits}</TableCell>
                <TableCell align="right" sx={headerCellSx}>{PO_LABELS.unitCost}</TableCell>
                {canReceive && <TableCell sx={headerCellSx}>{PO_LABELS.expiryOptional}</TableCell>}
                <TableCell sx={headerCellSx}>Status</TableCell>
                <TableCell align="right" sx={headerCellSx}>{PO_LABELS.lineTotal}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {po.items.map((item, index) => {
                const lineRemaining = item.quantity - item.receivedQuantity;
                const receiveSel = getReceiveSelection(item.productId, lineRemaining);
                const lineStatus = item.lineStatus ?? (
                  item.receivedQuantity <= 0 ? 'pending'
                  : item.receivedQuantity >= item.quantity ? 'received'
                  : 'partial'
                );
                const defaultPackQty = lineRemaining > 0 ? lineRemaining : 1;
                const orderUom = item.orderUom ?? 'pcs';
                const units = item.unitsPerBuyUom ?? 1;
                const baseUom = item.baseUom ?? 'pcs';
                const receivedTotalUnits = item.receivedQuantity * units;
                const thisReceiveUnits = receiveSel.selected
                  ? receiveSel.receiveQuantity * units
                  : receivedTotalUnits;

                return (
                  <TableRow key={item.productId} selected={canReceive && receiveSel.selected}>
                    {canReceive && (
                      <TableCell padding="checkbox">
                        <Checkbox
                          size="small"
                          checked={receiveSel.selected}
                          onChange={(e) =>
                            updateReceiveSelection(item.productId, lineRemaining, {
                              selected: e.target.checked,
                              receiveQuantity: receiveSel.receiveQuantity || defaultPackQty,
                              unitsPerBuyUom: receiveSel.unitsPerBuyUom ?? item.unitsPerBuyUom ?? 1,
                            })
                          }
                        />
                      </TableCell>
                    )}
                    <TableCell align="center">
                      <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>
                        {index + 1}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontWeight: 500, lineHeight: 1.3 }} title={item.productName} noWrap>
                        {item.productName}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" noWrap>{orderUom}</Typography>
                    </TableCell>
                    <TableCell align="right">{units}</TableCell>
                    <TableCell>
                      <Typography variant="body2" noWrap>{baseUom}</Typography>
                    </TableCell>
                    <TableCell align="right">{item.quantity}</TableCell>
                    <TableCell align="right">{item.receivedQuantity}</TableCell>
                    <TableCell align="right">{lineRemaining}</TableCell>
                    {canReceive && (
                      <TableCell align="right">
                        <TextField
                          size="small"
                          type="number"
                          value={receiveSel.receiveQuantity}
                          disabled={!receiveSel.selected}
                          onChange={(e) => {
                            const raw = Math.max(1, parseInt(e.target.value, 10) || 1);
                            const capped = lineRemaining > 0 ? Math.min(raw, lineRemaining) : raw;
                            updateReceiveSelection(item.productId, lineRemaining, {
                              receiveQuantity: capped,
                            });
                          }}
                          sx={{ width: '100%', maxWidth: 72 }}
                          slotProps={{ htmlInput: { min: 1, max: Math.max(lineRemaining, 1) } }}
                        />
                      </TableCell>
                    )}
                    <TableCell align="right">
                      {canReceive
                        ? (receiveSel.selected ? thisReceiveUnits : '—')
                        : receivedTotalUnits}
                    </TableCell>
                    <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                      {formatCurrency(item.unitCost)}
                    </TableCell>
                    {canReceive && (
                      <TableCell>
                        {receiveSel.selected ? (
                          <NepaliAwareDatePicker
                            label=""
                            value={receiveSel.expiryDate}
                            onChange={(d) =>
                              updateReceiveSelection(item.productId, lineRemaining, { expiryDate: d })
                            }
                            size="small"
                            calendarSystem="AD"
                          />
                        ) : (
                          <Typography variant="caption" color="text.secondary">—</Typography>
                        )}
                      </TableCell>
                    )}
                    <TableCell>
                      <Chip label={PO_LINE_STATUS_LABELS[lineStatus]} size="small" color={LINE_STATUS_COLORS[lineStatus]} />
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
                      {formatCurrency(item.quantity * item.unitCost)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>

        <Divider sx={{ mt: 2, mb: 1 }} />
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 0.25 }}>
          {(po.discount ?? 0) > 0 || (po.tax ?? 0) > 0 ? (
            <>
              <Typography variant="body2" color="text.secondary">
                Subtotal: {formatCurrency(po.subtotal ?? po.items.reduce((s, i) => s + i.quantity * i.unitCost, 0))}
              </Typography>
              {(po.discount ?? 0) > 0 && (
                <Typography variant="body2" color="text.secondary">
                  Discount: −{formatCurrency(po.discount ?? 0)}
                </Typography>
              )}
              {(po.tax ?? 0) > 0 && (
                <Typography variant="body2" color="text.secondary">
                  Tax: +{formatCurrency(po.tax ?? 0)}
                </Typography>
              )}
            </>
          ) : null}
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            Order Total: {formatCurrency(po.totalAmount)}
          </Typography>
        </Box>
      </Paper>

      <FormModal
        open={paymentOpen}
        title="Pay invoice"
        onClose={() => setPaymentOpen(false)}
        onSubmit={handlePaymentSubmit(handleRecordPayment)}
        submitLabel="Save payment"
        loading={paymentMutation.isPending}
        maxWidth="sm"
      >
        {paymentError && <Alert severity="error" sx={{ mb: 2 }}>{paymentError}</Alert>}
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Remaining balance: {formatCurrency(remaining)}. This creates a linked expense under Purchase Order.
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
                <FormControl fullWidth required error={!!paymentErrors.paymentMethod}>
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
        open={returnOpen}
        title="Return to supplier"
        onClose={() => setReturnOpen(false)}
        onSubmit={() => void handlePostReturn()}
        submitLabel="Post return"
        loading={returnMutation.isPending}
        maxWidth="md"
      >
        <Alert severity="info" sx={{ mb: 2 }}>{PO_RETURN_HINT}</Alert>
        {returnError && <Alert severity="error" sx={{ mb: 2 }}>{returnError}</Alert>}
        {returnableLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
            <CircularProgress size={28} />
          </Box>
        ) : returnableLines.length === 0 ? (
          <Alert severity="warning">
            No leftover stock from this purchase order is available to return
            (it may already have been sold or returned).
          </Alert>
        ) : (
          <>
            <TableContainer sx={{ mb: 2 }}>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: 'action.hover' }}>
                    <TableCell sx={{ fontWeight: 700 }}>Product</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>Available</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>Unit cost</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>Return qty</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {returnableLines.map((line) => (
                    <TableRow key={line.productId}>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>{line.productName}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          Sell UOM: {line.baseUom}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">{line.availableQty}</TableCell>
                      <TableCell align="right">{formatCurrency(line.unitCost)}</TableCell>
                      <TableCell align="right">
                        <TextField
                          size="small"
                          type="number"
                          value={returnQtys[line.productId] ?? ''}
                          onChange={(e) =>
                            setReturnQtys((prev) => ({ ...prev, [line.productId]: e.target.value }))
                          }
                          placeholder="0"
                          slotProps={{
                            htmlInput: { min: 0, max: line.availableQty, style: { textAlign: 'right', width: 88 } },
                          }}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 6 }}>
                <NepaliAwareDatePicker
                  label="Return date"
                  value={returnDate}
                  onChange={setReturnDate}
                  size="small"
                  fullWidth
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  label="Bill no."
                  size="small"
                  fullWidth
                  value={returnBillNo}
                  onChange={(e) => setReturnBillNo(e.target.value)}
                  placeholder="Defaults from PO"
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <FormControl fullWidth size="small">
                  <InputLabel>Settlement</InputLabel>
                  <Select
                    label="Settlement"
                    value={returnSettlement}
                    onChange={(e) => setReturnSettlement(e.target.value as typeof returnSettlement)}
                  >
                    <MenuItem value="refund">Refund (wallet)</MenuItem>
                    <MenuItem value="credit">Supplier credit</MenuItem>
                    <MenuItem value="replacement">Replacement</MenuItem>
                    <MenuItem value="pending">Pending settlement</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <FormControl fullWidth size="small">
                  <InputLabel>Reason</InputLabel>
                  <Select
                    label="Reason"
                    value={returnReason}
                    onChange={(e) => setReturnReason(e.target.value)}
                  >
                    <MenuItem value="damaged">Damaged</MenuItem>
                    <MenuItem value="wrong_item">Wrong item</MenuItem>
                    <MenuItem value="expired">Expired</MenuItem>
                    <MenuItem value="quality">Quality</MenuItem>
                    <MenuItem value="other">Other</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              {returnSettlement === 'refund' && (
                <Grid size={{ xs: 12, sm: 6 }}>
                  <FormControl fullWidth size="small">
                    <InputLabel>Credit wallet</InputLabel>
                    <Select
                      label="Credit wallet"
                      value={returnPaymentMethod}
                      onChange={(e) => setReturnPaymentMethod(e.target.value)}
                    >
                      {PAYMENT_METHODS.map((method) => (
                        <MenuItem key={method.value} value={method.value}>{method.label}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>
              )}
              <Grid size={{ xs: 12 }}>
                <TextField
                  label="Remarks"
                  size="small"
                  fullWidth
                  multiline
                  minRows={2}
                  value={returnRemarks}
                  onChange={(e) => setReturnRemarks(e.target.value)}
                />
              </Grid>
            </Grid>
          </>
        )}
      </FormModal>

      <ConfirmDialog
        open={cancelOpen}
        title="Cancel purchase order"
        message={cancelMessage}
        confirmLabel="Cancel order"
        cancelLabel="Keep order"
        confirmColor="error"
        loading={statusMutation.isPending}
        onConfirm={() => void handleCancelOrder()}
        onCancel={() => setCancelOpen(false)}
      />
    </Box>
  );
}
