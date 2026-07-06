import { useEffect, useRef, useState } from 'react';
import {
  Box,
  Button,
  Grid,
  Paper,
  TextField,
  Typography,
  Divider,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  IconButton,
  Autocomplete,
  Alert,
  TableContainer,
  CircularProgress,
} from '@mui/material';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SaveIcon from '@mui/icons-material/Save';
import dayjs from 'dayjs';
import { useNavigate, useParams } from 'react-router-dom';
import { DROPDOWN_PAGE_SIZE } from '@/constants';
import { PageHeader } from '@/components/common/PageHeader';
import { useSuppliers } from '@/hooks/useSuppliers';
import { useProducts } from '@/hooks/useProducts';
import {
  useCreatePurchaseOrder,
  usePurchaseOrder,
  useUpdatePurchaseOrder,
} from '@/hooks/usePurchaseOrders';
import { formatCurrency, canManagePurchaseOrders } from '@/utils';
import { getErrorMessage } from '@/services/apiClient';
import { showSuccess } from '@/utils/toast';
import { useAuthStore } from '@/store';
import type { Product, PurchaseOrderItem } from '@/types';

interface LineItem {
  id: number;
  product: Product | null;
  quantityInput: string;
  unitCost: number;
}

function parseQuantity(input: string): number {
  const n = parseInt(input, 10);
  return Number.isNaN(n) || n < 1 ? 1 : n;
}

function productFromPoItem(item: PurchaseOrderItem): Product {
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
    uom: 'pcs',
    costPrice: item.unitCost,
    sellingPrice: item.unitCost,
    images: [],
    stock: 0,
    lowStockThreshold: 0,
    createdAt: '',
    updatedAt: '',
  };
}

function productOptions(
  products: Product[],
  selected: Product | null,
  usedProductIds: Set<string>,
  preferredSupplierId?: string,
): Product[] {
  const available = products.filter(
    (p) => !usedProductIds.has(p.id) || p.id === selected?.id,
  );
  if (preferredSupplierId) {
    available.sort((a, b) => {
      const aPref = a.supplierId === preferredSupplierId ? 0 : 1;
      const bPref = b.supplierId === preferredSupplierId ? 0 : 1;
      return aPref - bPref || a.name.localeCompare(b.name);
    });
  }
  if (!selected || available.some((p) => p.id === selected.id)) return available;
  return [selected, ...available];
}

function emptyLine(id: number): LineItem {
  return { id, product: null, quantityInput: '1', unitCost: 0 };
}

const tomorrow = () => dayjs().add(1, 'day').startOf('day');

const PO_PRODUCT_PAGE_SIZE = 200;

export function PurchaseOrderFormPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);
  const currentUser = useAuthStore((s) => s.user);
  const canManage = canManagePurchaseOrders(currentUser?.role);
  const nextLineId = useRef(0);
  const [supplierId, setSupplierId] = useState('');
  const [expectedDelivery, setExpectedDelivery] = useState('');
  const [deliveryPickerOpen, setDeliveryPickerOpen] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [lines, setLines] = useState<LineItem[]>(() => [emptyLine(0)]);
  const [error, setError] = useState('');
  const [formLoaded, setFormLoaded] = useState(false);

  const { data: existingPo, isLoading: poLoading, isError: poError } = usePurchaseOrder(id ?? '');
  const { data: suppliersData } = useSuppliers({ pageSize: DROPDOWN_PAGE_SIZE });
  const { data: productsData, isLoading: productsLoading } = useProducts(
    { search: productSearch, pageSize: PRODUCT_SEARCH_PAGE_SIZE },
    { enabled: !!supplierId },
  );
  const createMutation = useCreatePurchaseOrder();
  const updateMutation = useUpdatePurchaseOrder();

  const suppliers = suppliersData?.data ?? [];
  const products = productsData?.data ?? [];
  const isPending = createMutation.isPending || updateMutation.isPending;

  useEffect(() => {
    if (!canManage) {
      navigate('/purchase-orders', { replace: true });
    }
  }, [canManage, navigate]);

  useEffect(() => {
    if (!isEdit || !existingPo || formLoaded) return;
    if (existingPo.status !== 'draft') return;
    setSupplierId(existingPo.supplierId);
    setExpectedDelivery(existingPo.expectedDelivery ?? '');
    setLines(
      existingPo.items.length > 0
        ? [
            ...existingPo.items.map((item) => {
              nextLineId.current += 1;
              return {
                id: nextLineId.current,
                product: productFromPoItem(item),
                quantityInput: String(item.quantity),
                unitCost: item.unitCost,
              };
            }),
            emptyLine(++nextLineId.current),
          ]
        : [emptyLine(++nextLineId.current)],
    );
    setFormLoaded(true);
  }, [isEdit, existingPo, formLoaded]);

  const totalAmount = lines.reduce(
    (s, l) => s + (l.product ? parseQuantity(l.quantityInput) * l.unitCost : 0),
    0,
  );
  const lineCount = lines.filter((l) => l.product).length;

  const addLine = () => {
    nextLineId.current += 1;
    setLines((prev) => [...prev, emptyLine(nextLineId.current)]);
  };

  const removeLine = (i: number) => {
    setLines((prev) => {
      const next = prev.filter((_, idx) => idx !== i);
      return next.length === 0 ? [emptyLine(++nextLineId.current)] : next;
    });
  };

  const updateLine = (i: number, patch: Partial<Omit<LineItem, 'id'>>) => {
    setLines((prev) =>
      prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)),
    );
  };

  const selectProduct = (i: number, product: Product | null) => {
    setLines((prev) => {
      const next = prev.map((l, idx) =>
        idx === i
          ? {
              ...l,
              product,
              ...(product ? { unitCost: product.costPrice } : {}),
            }
          : l,
      );
      if (product && i === prev.length - 1) {
        nextLineId.current += 1;
        return [...next, emptyLine(nextLineId.current)];
      }
      return next;
    });
  };

  const normalizeQuantity = (i: number) => {
    setLines((prev) =>
      prev.map((l, idx) =>
        idx === i ? { ...l, quantityInput: String(parseQuantity(l.quantityInput)) } : l,
      ),
    );
  };

  const usedProductIds = (excludeIndex: number) =>
    new Set(
      lines
        .map((l, idx) => (idx !== excludeIndex && l.product ? l.product.id : null))
        .filter((pid): pid is string => !!pid),
    );

  const buildPayload = (status: 'draft' | 'ordered') => {
    const validLines = lines.filter(
      (l) => l.product && parseQuantity(l.quantityInput) > 0 && l.unitCost > 0,
    );
    const supplier = suppliers.find((s) => s.id === supplierId);
    return {
      supplierId,
      supplierName: supplier?.name ?? '',
      status,
      totalAmount,
      expectedDelivery: expectedDelivery || undefined,
      items: validLines.map((l) => ({
        productId: l.product!.id,
        productName: l.product!.name,
        quantity: parseQuantity(l.quantityInput),
        unitCost: l.unitCost,
        receivedQuantity: 0,
      })),
    };
  };

  const handleSubmit = async (status: 'draft' | 'ordered') => {
    setError('');
    if (!supplierId) {
      setError('Select a supplier');
      return;
    }
    if (expectedDelivery) {
      const delivery = dayjs(expectedDelivery).startOf('day');
      if (!delivery.isAfter(dayjs().startOf('day'))) {
        setError('Expected delivery must be after today');
        return;
      }
    } else if (status === 'ordered') {
      setError('Expected delivery date is required when placing an order');
      return;
    }
    const payload = buildPayload(status);
    if (payload.items.length === 0) {
      setError('Add at least one product line with valid quantity and unit cost');
      return;
    }
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

  if (!canManage) {
    return null;
  }

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

  if (isEdit && existingPo && existingPo.status !== 'draft') {
    return (
      <Alert severity="warning" sx={{ mb: 2 }}>
        Only draft purchase orders can be edited.{' '}
        <Button size="small" onClick={() => navigate(`/purchase-orders/${existingPo.id}`)}>
          View order
        </Button>
      </Alert>
    );
  }

  const pageTitle = isEdit ? `Edit ${existingPo?.orderNumber ?? 'Purchase Order'}` : 'Create Purchase Order';

  return (
    <Box>
      <PageHeader
        title={pageTitle}
        breadcrumbs={[
          { label: 'Purchase Orders', path: '/purchase-orders' },
          { label: isEdit ? (existingPo?.orderNumber ?? 'Edit') : 'New' },
        ]}
        action={
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button
              startIcon={<ArrowBackIcon />}
              onClick={() => navigate(isEdit ? `/purchase-orders/${id}` : '/purchase-orders')}
            >
              Cancel
            </Button>
            <Button variant="outlined" onClick={() => handleSubmit('draft')} loading={isPending}>
              Save as Draft
            </Button>
            <Button
              variant="contained"
              startIcon={<SaveIcon />}
              onClick={() => handleSubmit('ordered')}
              loading={isPending}
            >
              Place Order
            </Button>
          </Box>
        }
      />

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <LocalizationProvider dateAdapter={AdapterDayjs}>
      <Paper sx={{ px: 2, py: 1.5, mb: 2 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1.5 }}>Order Summary</Typography>
        <Grid container spacing={2} sx={{ alignItems: 'flex-start' }}>
          <Grid size={{ xs: 12, sm: 6, md: 4 }}>
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
                  required: true,
                  onClick: () => setDeliveryPickerOpen(true),
                },
                openPickerButton: { 'aria-label': 'Open calendar' },
              }}
            />
          </Grid>
          {currentUser && (
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <TextField
                label="Ordered By"
                value={currentUser.name}
                fullWidth
                size="small"
                disabled
              />
            </Grid>
          )}
          <Grid size={{ xs: 12, sm: 6, md: 2 }}>
            <Box
              sx={{
                px: 1.5,
                py: 1,
                borderRadius: 1,
                bgcolor: 'action.hover',
                minHeight: 40,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
              }}
            >
              <Typography variant="caption" color="text.secondary">Items · Total</Typography>
              <Typography variant="body2" sx={{ fontWeight: 700 }}>
                {lineCount} · {formatCurrency(totalAmount)}
              </Typography>
            </Box>
          </Grid>
        </Grid>
      </Paper>
      </LocalizationProvider>

      <Paper sx={{ p: 2 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1, mb: 1.5 }}>
          <Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>Order Items</Typography>
            <Typography variant="caption" color="text.secondary">
              {supplierId
                ? 'Search products to add — items linked to this supplier appear first'
                : 'Select a supplier first to add products'}
            </Typography>
          </Box>
          <Button startIcon={<AddIcon />} onClick={addLine} size="small" variant="outlined">
            Add Item
          </Button>
        </Box>
        <Divider sx={{ mb: 2 }} />

        <TableContainer sx={{ overflowX: 'auto' }}>
          <Table
            size="small"
            sx={{
              tableLayout: 'fixed',
              minWidth: 640,
              '& .MuiTableCell-root': { verticalAlign: 'middle', py: 1 },
            }}
          >
            <TableHead>
              <TableRow sx={{ bgcolor: 'action.hover' }}>
                <TableCell align="center" sx={{ width: 48, fontWeight: 700 }}>SN</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Product</TableCell>
                <TableCell align="right" sx={{ width: 88, fontWeight: 700 }}>Qty</TableCell>
                <TableCell align="right" sx={{ width: 120, fontWeight: 700 }}>Unit Cost</TableCell>
                <TableCell align="right" sx={{ width: 100, fontWeight: 700 }}>Total</TableCell>
                <TableCell sx={{ width: 48 }} />
              </TableRow>
            </TableHead>
            <TableBody>
              {lines.map((line, i) => (
                <TableRow key={line.id}>
                  <TableCell align="center">
                    <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>
                      {i + 1}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Autocomplete
                      size="small"
                      disabled={!supplierId}
                      loading={productsLoading}
                      openOnFocus
                      options={productOptions(products, line.product, usedProductIds(i), supplierId)}
                      getOptionLabel={(p) => `${p.name}${p.sku ? ` (${p.sku})` : ''}`}
                      isOptionEqualToValue={(a, b) => a.id === b.id}
                      filterOptions={(x) => x}
                      noOptionsText={
                        productsLoading
                          ? 'Loading products…'
                          : productSearch
                            ? 'No products match your search'
                            : 'Type to search products'
                      }
                      value={line.product}
                      onInputChange={(_, value, reason) => {
                        if (reason === 'input') setProductSearch(value);
                        if (reason === 'clear') setProductSearch('');
                      }}
                      onChange={(_, v) => selectProduct(i, v)}
                      renderInput={(params) => (
                        <TextField
                          {...params}
                          placeholder="Search product..."
                        />
                      )}
                    />
                  </TableCell>
                  <TableCell align="right">
                    <TextField
                      size="small"
                      type="number"
                      value={line.quantityInput}
                      disabled={!line.product}
                      onChange={(e) => updateLine(i, { quantityInput: e.target.value })}
                      onBlur={() => normalizeQuantity(i)}
                      sx={{ width: 80 }}
                      slotProps={{ htmlInput: { min: 1 } }}
                    />
                  </TableCell>
                  <TableCell align="right">
                    <TextField
                      size="small"
                      type="number"
                      value={line.unitCost}
                      disabled={!line.product}
                      onChange={(e) =>
                        updateLine(i, { unitCost: parseFloat(e.target.value) || 0 })
                      }
                      sx={{ width: 110 }}
                      slotProps={{ htmlInput: { min: 0, step: 0.01 } }}
                    />
                  </TableCell>
                  <TableCell align="right">
                    <Typography variant="body2" sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
                      {line.product
                        ? formatCurrency(parseQuantity(line.quantityInput) * line.unitCost)
                        : '—'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <IconButton
                      size="small"
                      color="error"
                      onClick={() => removeLine(i)}
                      disabled={lines.length === 1 && !line.product}
                      aria-label="Remove line"
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>

        <Box sx={{ mt: 1.5 }}>
          <Button startIcon={<AddIcon />} onClick={addLine} size="small">
            Add Another Item
          </Button>
        </Box>
        <Divider sx={{ my: 1.5 }} />
        <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            Order Total: {formatCurrency(totalAmount)}
          </Typography>
        </Box>
      </Paper>
    </Box>
  );
}
