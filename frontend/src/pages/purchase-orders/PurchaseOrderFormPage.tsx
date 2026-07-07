import { useEffect, useRef, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  Grid,
  Paper,
  TextField,
  Typography,
  MenuItem,
  Alert,
  CircularProgress,
} from '@mui/material';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SaveIcon from '@mui/icons-material/Save';
import dayjs from 'dayjs';
import { useNavigate, useParams } from 'react-router-dom';
import { DROPDOWN_PAGE_SIZE } from '@/constants';
import { PageHeader } from '@/components/common/PageHeader';
import { useSuppliers } from '@/hooks/useSuppliers';
import { useProductCatalog } from '@/hooks/useProductCatalog';
import { useAssignableUsers } from '@/hooks/useAssignableUsers';
import {
  useCreatePurchaseOrder,
  usePurchaseOrder,
  useUpdatePurchaseOrder,
} from '@/hooks/usePurchaseOrders';
import { formatCurrency, canManagePurchaseOrders } from '@/utils';
import { canEditPurchaseOrder } from '@/utils/canEditPurchaseOrder';
import { getErrorMessage } from '@/services/apiClient';
import { showSuccess } from '@/utils/toast';
import { useAuthStore } from '@/store';
import type { Product, PurchaseOrderItem, PurchaseOrderStatus } from '@/types';
import { PoLineItemsGrid } from '@/pages/purchase-orders/components/PoLineItemsGrid';
import { emptyPoLineItem, type PoLineItem } from '@/pages/purchase-orders/poFormTypes';

function parseQuantity(input: string): number {
  const n = parseInt(input, 10);
  return Number.isNaN(n) || n < 1 ? 1 : n;
}

function productFromPoItem(item: PurchaseOrderItem, catalogProducts: Product[]): Product {
  const fromCatalog = catalogProducts.find((p) => p.id === item.productId);
  if (fromCatalog) return fromCatalog;
  return {
    id: item.productId,
    name: item.productName,
    sku: '',
    barcode: '',
    brand: '',
    countryOfOrigin: '',
    category: '',
    supplierId: '',
    supplierName: '',
    description: '',
    buyUom: item.orderUom ?? 'pcs',
    uom: item.baseUom ?? 'pcs',
    unitsPerBuyUom: item.unitsPerBuyUom ?? 1,
    costPrice: item.unitCost,
    sellingPrice: item.unitCost,
    images: [],
    stock: 0,
    lowStockThreshold: 0,
    createdAt: '',
    updatedAt: '',
  };
}

function poItemToLine(item: PurchaseOrderItem, id: number, catalogProducts: Product[]): PoLineItem {
  const product = productFromPoItem(item, catalogProducts);
  return {
    id,
    skuInput: product.sku || product.name,
    product,
    productNameFallback: product.name,
    quantityInput: String(item.quantity),
    buyUom: item.orderUom ?? product.buyUom ?? product.uom ?? 'pcs',
    unitsPerBuyUom: item.unitsPerBuyUom ?? product.unitsPerBuyUom ?? 1,
    unitCost: item.unitCost,
    receivedQuantity: item.receivedQuantity,
  };
}

const tomorrow = () => dayjs().add(1, 'day').startOf('day');

export function PurchaseOrderFormPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);
  const currentUser = useAuthStore((s) => s.user);
  const canManage = canManagePurchaseOrders(currentUser?.role);
  const nextLineId = useRef(0);

  const [supplierId, setSupplierId] = useState('');
  const [expectedDelivery, setExpectedDelivery] = useState('');
  const [orderedBy, setOrderedBy] = useState('');
  const [deliveryPickerOpen, setDeliveryPickerOpen] = useState(false);
  const [lines, setLines] = useState<PoLineItem[]>(() => [emptyPoLineItem(0)]);
  const [error, setError] = useState('');
  const [pasteWarning, setPasteWarning] = useState('');
  const [formLoaded, setFormLoaded] = useState(false);

  const { data: existingPo, isLoading: poLoading, isError: poError } = usePurchaseOrder(id ?? '');
  const { data: suppliersData } = useSuppliers({ pageSize: DROPDOWN_PAGE_SIZE });
  const { index: catalogIndex, products: catalogProducts, isLoading: catalogLoading } = useProductCatalog();
  const { data: assignableUsers = [] } = useAssignableUsers();
  const createMutation = useCreatePurchaseOrder();
  const updateMutation = useUpdatePurchaseOrder();

  const suppliers = suppliersData?.data ?? [];
  const isPending = createMutation.isPending || updateMutation.isPending;
  const isPlacedEdit = isEdit && existingPo && existingPo.status !== 'draft';

  useEffect(() => {
    if (!canManage) {
      navigate('/purchase-orders', { replace: true });
    }
  }, [canManage, navigate]);

  useEffect(() => {
    if (!currentUser && !orderedBy) return;
    if (!isEdit && currentUser && !orderedBy) {
      setOrderedBy(currentUser.name);
    }
  }, [currentUser, isEdit, orderedBy]);

  useEffect(() => {
    if (!isEdit || !existingPo || formLoaded || catalogLoading) return;
    if (!canEditPurchaseOrder(existingPo)) return;

    setSupplierId(existingPo.supplierId);
    setExpectedDelivery(existingPo.expectedDelivery ?? '');
    setOrderedBy(existingPo.orderedBy ?? currentUser?.name ?? '');

    if (existingPo.items.length > 0) {
      const loaded = existingPo.items.map((item) => {
        nextLineId.current += 1;
        return poItemToLine(item, nextLineId.current, catalogProducts);
      });
      nextLineId.current += 1;
      setLines([...loaded, emptyPoLineItem(nextLineId.current)]);
    } else {
      nextLineId.current += 1;
      setLines([emptyPoLineItem(nextLineId.current)]);
    }
    setFormLoaded(true);
  }, [isEdit, existingPo, formLoaded, catalogLoading, catalogProducts, currentUser?.name]);

  const validLines = lines.filter(
    (l) => l.product && parseQuantity(l.quantityInput) > 0 && l.unitCost > 0 && !l.resolveError,
  );
  const unresolvedLines = lines.filter((l) => l.skuInput.trim() && (!l.product || l.resolveError));
  const totalAmount = validLines.reduce(
    (s, l) => s + parseQuantity(l.quantityInput) * l.unitCost,
    0,
  );
  const lineCount = validLines.length;

  const receivedByProduct = new Map(
    (existingPo?.items ?? []).map((i) => [i.productId, i.receivedQuantity]),
  );

  const buildPayload = (status: PurchaseOrderStatus) => {
    const supplier = suppliers.find((s) => s.id === supplierId);
    return {
      supplierId,
      supplierName: supplier?.name ?? '',
      status,
      totalAmount,
      expectedDelivery: expectedDelivery || undefined,
      orderedBy: orderedBy || undefined,
      items: validLines.map((l) => ({
        productId: l.product!.id,
        productName: l.product!.name,
        quantity: parseQuantity(l.quantityInput),
        unitCost: l.unitCost,
        receivedQuantity: receivedByProduct.get(l.product!.id) ?? l.receivedQuantity ?? 0,
        orderUom: l.buyUom,
        baseUom: l.product!.uom ?? 'pcs',
        unitsPerBuyUom: l.unitsPerBuyUom,
      })),
    };
  };

  const validateBeforeSave = (status: 'draft' | 'ordered'): boolean => {
    setError('');
    setPasteWarning('');
    if (!supplierId) {
      setError('Select a supplier');
      return false;
    }
    if (unresolvedLines.length > 0) {
      setError('Resolve all SKU errors before saving');
      setPasteWarning(
        `Unresolved: ${unresolvedLines.map((l) => l.skuInput).join(', ')}`,
      );
      return false;
    }
    if (expectedDelivery) {
      const delivery = dayjs(expectedDelivery).startOf('day');
      if (!delivery.isAfter(dayjs().startOf('day'))) {
        setError('Expected delivery must be after today');
        return false;
      }
    } else if (status === 'ordered') {
      setError('Expected delivery date is required when placing an order');
      return false;
    }
    if (validLines.length === 0) {
      setError('Add at least one valid line with SKU, quantity, and unit cost');
      return false;
    }
    if (!orderedBy.trim()) {
      setError('Select who ordered this purchase');
      return false;
    }
    return true;
  };

  const handleSubmit = async (status: PurchaseOrderStatus) => {
    const draftOrOrdered = status === 'draft' || status === 'ordered';
    if (draftOrOrdered && !validateBeforeSave(status)) return;
    if (!draftOrOrdered && !validateBeforeSave('draft')) return;

    const payload = buildPayload(status);
    try {
      if (isEdit && id) {
        const po = await updateMutation.mutateAsync({ id, data: payload });
        showSuccess('Purchase Order updated.');
        navigate(`/purchase-orders/${po.id}`);
      } else {
        const po = await createMutation.mutateAsync(payload);
        showSuccess('Purchase Order created.');
        navigate(`/purchase-orders/${po.id}`);
      }
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const handleSaveChanges = () => {
    if (!existingPo) return;
    void handleSubmit(existingPo.status);
  };

  if (!canManage) return null;

  if (isEdit && poLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (isEdit && (poError || !existingPo)) {
    return <Alert severity="error">Purchase order not found.</Alert>;
  }

  if (isEdit && existingPo && !canEditPurchaseOrder(existingPo)) {
    return (
      <Alert severity="warning" sx={{ mb: 2 }}>
        This purchase order cannot be edited.{' '}
        <Button size="small" onClick={() => navigate(`/purchase-orders/${existingPo.id}`)}>
          View order
        </Button>
      </Alert>
    );
  }

  const pageTitle = isEdit ? `Edit ${existingPo?.orderNumber ?? 'Purchase Order'}` : 'Create Purchase Order';
  const orderedByOptions = [
    ...new Set([
      ...assignableUsers.map((u) => u.name),
      ...(currentUser?.name ? [currentUser.name] : []),
      ...(orderedBy ? [orderedBy] : []),
    ]),
  ];

  return (
    <Box>
      <PageHeader
        title={pageTitle}
        breadcrumbs={[
          { label: 'Purchase Orders', path: '/purchase-orders' },
          { label: isEdit ? (existingPo?.orderNumber ?? 'Edit') : 'New' },
        ]}
        action={
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <Button
              startIcon={<ArrowBackIcon />}
              onClick={() => navigate(isEdit ? `/purchase-orders/${id}` : '/purchase-orders')}
            >
              Cancel
            </Button>
            {!isPlacedEdit && (
              <>
                <Button variant="outlined" onClick={() => void handleSubmit('draft')} loading={isPending}>
                  Save as Draft
                </Button>
                <Button
                  variant="contained"
                  startIcon={<SaveIcon />}
                  onClick={() => void handleSubmit('ordered')}
                  loading={isPending}
                >
                  Place Order
                </Button>
              </>
            )}
            {isPlacedEdit && (
              <Button
                variant="contained"
                startIcon={<SaveIcon />}
                onClick={handleSaveChanges}
                loading={isPending}
              >
                Save Changes
              </Button>
            )}
          </Box>
        }
      />

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <LocalizationProvider dateAdapter={AdapterDayjs}>
        <Paper sx={{ px: 2, py: 2, mb: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 1.5, mb: 2 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>Order details</Typography>
            <Chip
              label={`${lineCount} item${lineCount !== 1 ? 's' : ''} · ${formatCurrency(totalAmount)}`}
              color="primary"
              variant="outlined"
              sx={{ fontWeight: 600 }}
            />
          </Box>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                select
                label="Supplier"
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
                fullWidth
                size="small"
                required
              >
                {suppliers.map((s) => (
                  <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <DatePicker
                label="Expected Delivery"
                value={expectedDelivery ? dayjs(expectedDelivery) : null}
                minDate={tomorrow()}
                open={deliveryPickerOpen}
                onOpen={() => setDeliveryPickerOpen(true)}
                onClose={() => setDeliveryPickerOpen(false)}
                onChange={(date) =>
                  setExpectedDelivery(date ? date.format('YYYY-MM-DD') : '')
                }
                slotProps={{
                  textField: {
                    fullWidth: true,
                    size: 'small',
                    required: !isPlacedEdit,
                    onClick: () => setDeliveryPickerOpen(true),
                  },
                  openPickerButton: { 'aria-label': 'Open calendar' },
                }}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <TextField
                select
                label="Ordered By"
                value={orderedBy}
                onChange={(e) => setOrderedBy(e.target.value)}
                fullWidth
                size="small"
                required
              >
                {orderedByOptions.map((name) => (
                  <MenuItem key={name} value={name}>{name}</MenuItem>
                ))}
              </TextField>
            </Grid>
          </Grid>
        </Paper>
      </LocalizationProvider>

      <Box sx={{ mb: 1.5 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>Order Items</Typography>
        {catalogLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress size={28} />
          </Box>
        ) : (
          <PoLineItemsGrid
            lines={lines}
            onChange={setLines}
            catalogIndex={catalogIndex}
            pasteWarning={pasteWarning}
            onPasteWarning={setPasteWarning}
          />
        )}
      </Box>

      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 1 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
          Order Total: {formatCurrency(totalAmount)}
        </Typography>
      </Box>
    </Box>
  );
}
