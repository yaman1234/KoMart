import { useMemo, useState, type ReactNode } from 'react';
import {
  Box,
  Button,
  Grid,
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
  LinearProgress,
  CircularProgress,
  Alert,
  MenuItem,
  TextField,
  Checkbox,
  Link,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import EditIcon from '@mui/icons-material/Edit';
import InventoryIcon from '@mui/icons-material/Inventory';
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '@/components/common/PageHeader';
import {
  usePurchaseOrder,
  useUpdatePurchaseOrderStatus,
  useReceivePurchaseOrderItems,
} from '@/hooks/usePurchaseOrders';
import { formatCurrency, formatDate, canManagePurchaseOrders } from '@/utils';
import { getErrorMessage } from '@/services/apiClient';
import { PO_STATUS_LABELS, PO_LINE_STATUS_LABELS } from '@/constants';
import { useAuthStore } from '@/store';
import type { PurchaseOrderLineStatus, PurchaseOrderStatus } from '@/types';

const STATUS_COLORS: Record<PurchaseOrderStatus, 'default' | 'warning' | 'info' | 'success' | 'error'> = {
  draft: 'default', ordered: 'warning', partial: 'info', received: 'success', cancelled: 'error',
};

const LINE_STATUS_COLORS: Record<PurchaseOrderLineStatus, 'default' | 'warning' | 'success'> = {
  pending: 'default',
  partial: 'warning',
  received: 'success',
};

const NEXT_STATUSES: Partial<Record<PurchaseOrderStatus, PurchaseOrderStatus[]>> = {
  draft: ['ordered', 'cancelled'],
  ordered: ['cancelled'],
  partial: ['cancelled'],
};

interface ReceiveSelection {
  selected: boolean;
  receiveQuantity: number;
  expiryDate: string;
}

function SummaryField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.25 }}>
        {label}
      </Typography>
      {children}
    </Box>
  );
}

export function PurchaseOrderDetailPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const user = useAuthStore((s) => s.user);
  const canManage = canManagePurchaseOrders(user?.role);
  const [statusValue, setStatusValue] = useState('');
  const [statusError, setStatusError] = useState('');
  const [receiveError, setReceiveError] = useState('');
  const [receiveSelections, setReceiveSelections] = useState<Record<string, ReceiveSelection>>({});

  const { data: po, isLoading, isError } = usePurchaseOrder(id ?? '');
  const statusMutation = useUpdatePurchaseOrderStatus();
  const receiveMutation = useReceivePurchaseOrderItems();

  const canReceive = po?.status === 'ordered' || po?.status === 'partial';

  const getReceiveSelection = (productId: string, remaining: number): ReceiveSelection =>
    receiveSelections[productId] ?? { selected: false, receiveQuantity: remaining || 1, expiryDate: '' };

  const updateReceiveSelection = (productId: string, remaining: number, patch: Partial<ReceiveSelection>) => {
    setReceiveSelections((prev) => {
      const base = prev[productId] ?? { selected: false, receiveQuantity: remaining || 1, expiryDate: '' };
      return { ...prev, [productId]: { ...base, ...patch } };
    });
  };

  const receivableItems = useMemo(
    () => (po ? po.items.filter((item) => item.quantity - item.receivedQuantity > 0) : []),
    [po],
  );

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
        const base = next[item.productId] ?? { receiveQuantity: remaining, expiryDate: '', selected: false };
        next[item.productId] = {
          ...base,
          selected: checked,
          receiveQuantity: remaining || 1,
        };
      }
      return next;
    });
  };

  const itemsToReceive = useMemo(() => {
    if (!po) return [];
    return po.items
      .filter((item) => {
        const remaining = item.quantity - item.receivedQuantity;
        const sel = getReceiveSelection(item.productId, remaining);
        return remaining > 0 && sel.selected && sel.receiveQuantity > 0 && !!sel.expiryDate;
      })
      .map((item) => ({
        productId: item.productId,
        receiveQuantity: Math.min(
          getReceiveSelection(item.productId, item.quantity - item.receivedQuantity).receiveQuantity,
          item.quantity - item.receivedQuantity,
        ),
        expiryDate: getReceiveSelection(item.productId, item.quantity - item.receivedQuantity).expiryDate,
      }));
  }, [po, receiveSelections]);

  const handleStatusChange = async (status: PurchaseOrderStatus) => {
    if (!po) return;
    setStatusError('');
    setStatusValue(status);
    try {
      await statusMutation.mutateAsync({ id: po.id, status });
      setStatusValue('');
    } catch (err) {
      setStatusError(getErrorMessage(err));
      setStatusValue('');
    }
  };

  const handleReceive = async () => {
    if (!po) return;
    const selectedWithoutExpiry = po.items.filter((item) => {
      const remaining = item.quantity - item.receivedQuantity;
      const sel = getReceiveSelection(item.productId, remaining);
      return remaining > 0 && sel.selected && !sel.expiryDate;
    });
    if (selectedWithoutExpiry.length > 0) {
      setReceiveError('Expiry date is required for each selected item');
      return;
    }
    if (itemsToReceive.length === 0) {
      setReceiveError('Select at least one item with a receive quantity and expiry date');
      return;
    }
    setReceiveError('');
    try {
      await receiveMutation.mutateAsync({ id: po.id, items: itemsToReceive });
      setReceiveSelections({});
    } catch (err) {
      setReceiveError(getErrorMessage(err));
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
            {canManage && po.status === 'draft' && (
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
                onClick={() => void handleReceive()}
                loading={receiveMutation.isPending}
                disabled={itemsToReceive.length === 0}
              >
                Process Receipt
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

      {(statusError || receiveError) && (
        <Alert severity="error" sx={{ mb: 2 }}>{statusError || receiveError}</Alert>
      )}

      <Paper sx={{ px: 2, py: 1.5, mb: 2 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1.5 }}>Order Summary</Typography>
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <SummaryField label="Supplier">
              <Link
                component={RouterLink}
                to={`/suppliers/${po.supplierId}`}
                variant="body2"
                sx={{ fontWeight: 600 }}
                title={po.supplierName}
              >
                {po.supplierName}
              </Link>
            </SummaryField>
          </Grid>
          <Grid size={{ xs: 6, sm: 3, md: 2 }}>
            <SummaryField label="Status">
              <Chip
                label={PO_STATUS_LABELS[po.status]}
                color={STATUS_COLORS[po.status]}
                size="small"
                sx={{ fontWeight: 600 }}
              />
            </SummaryField>
          </Grid>
          <Grid size={{ xs: 6, sm: 3, md: 2 }}>
            <SummaryField label="Total">
              <Typography variant="body2" sx={{ fontWeight: 700, color: 'primary.main' }}>
                {formatCurrency(po.totalAmount)}
              </Typography>
            </SummaryField>
          </Grid>
          <Grid size={{ xs: 6, sm: 3, md: 2 }}>
            <SummaryField label="Expected Delivery">
              <Typography variant="body2">
                {po.expectedDelivery ? formatDate(po.expectedDelivery) : '—'}
              </Typography>
            </SummaryField>
          </Grid>
          <Grid size={{ xs: 6, sm: 3, md: 3 }}>
            <SummaryField label="Items">
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {po.items.length}
                <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 0.5 }}>
                  ({receivedCount} received)
                </Typography>
              </Typography>
            </SummaryField>
          </Grid>
          <Grid size={{ xs: 6, sm: 4, md: 2 }}>
            <SummaryField label="Ordered By">
              <Typography variant="body2">{po.orderedBy ?? '—'}</Typography>
            </SummaryField>
          </Grid>
          <Grid size={{ xs: 6, sm: 4, md: 2 }}>
            <SummaryField label="Received By">
              <Typography variant="body2">{po.receivedBy ?? '—'}</Typography>
            </SummaryField>
          </Grid>
          <Grid size={{ xs: 6, sm: 4, md: 2 }}>
            <SummaryField label="Received Date">
              <Typography variant="body2">
                {po.receivedDate ? formatDate(po.receivedDate) : '—'}
              </Typography>
            </SummaryField>
          </Grid>
          <Grid size={{ xs: 6, sm: 4, md: 2 }}>
            <SummaryField label="Created">
              <Typography variant="body2">{formatDate(po.createdAt)}</Typography>
            </SummaryField>
          </Grid>
          <Grid size={{ xs: 6, sm: 4, md: 2 }}>
            <SummaryField label="Last Updated">
              <Typography variant="body2">{formatDate(po.updatedAt)}</Typography>
            </SummaryField>
          </Grid>
        </Grid>
      </Paper>

      <Paper sx={{ p: 2 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1, mb: 1.5 }}>
          <Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>Order Items</Typography>
            {canReceive && (
              <Typography variant="caption" color="text.secondary">
                Select lines, enter receive qty and expiry, then Process Receipt.
              </Typography>
            )}
          </Box>
          <Typography variant="body2" color="text.secondary">
            {po.items.length} product{po.items.length !== 1 ? 's' : ''}
          </Typography>
        </Box>
        <Divider sx={{ mb: 2 }} />

        <TableContainer sx={{ overflowX: 'auto' }}>
          <Table
            size="small"
            sx={{
              tableLayout: 'fixed',
              minWidth: canReceive ? 960 : 720,
              '& .MuiTableCell-root': { verticalAlign: 'middle', py: 1 },
            }}
          >
            <TableHead>
              <TableRow sx={{ bgcolor: 'action.hover' }}>
                {canReceive && (
                  <TableCell padding="checkbox" sx={{ width: 42 }}>
                    <Checkbox
                      size="small"
                      checked={selectAllState.checked}
                      indeterminate={selectAllState.indeterminate}
                      disabled={receivableItems.length === 0}
                      onChange={(e) => handleSelectAll(e.target.checked)}
                      slotProps={{ input: { 'aria-label': 'Select all receivable items' } }}
                    />
                  </TableCell>
                )}
                <TableCell align="center" sx={{ width: 40, fontWeight: 700 }}>SN</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Product</TableCell>
                <TableCell align="right" sx={{ width: 72, fontWeight: 700 }}>Ordered</TableCell>
                <TableCell align="right" sx={{ width: 72, fontWeight: 700 }}>Received</TableCell>
                {canReceive && (
                  <TableCell align="right" sx={{ width: 88, fontWeight: 700 }}>Receive</TableCell>
                )}
                {canReceive && (
                  <TableCell sx={{ width: 148, fontWeight: 700 }}>Expiry</TableCell>
                )}
                <TableCell sx={{ width: 120, fontWeight: 700 }}>Progress</TableCell>
                <TableCell sx={{ width: 88, fontWeight: 700 }}>Status</TableCell>
                <TableCell align="right" sx={{ width: 88, fontWeight: 700 }}>Unit Cost</TableCell>
                <TableCell align="right" sx={{ width: 96, fontWeight: 700 }}>Line Total</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {po.items.map((item, index) => {
                const remaining = item.quantity - item.receivedQuantity;
                const pct = item.quantity > 0 ? (item.receivedQuantity / item.quantity) * 100 : 0;
                const receiveSel = getReceiveSelection(item.productId, remaining);
                const lineStatus = item.lineStatus ?? (
                  item.receivedQuantity <= 0 ? 'pending'
                  : item.receivedQuantity >= item.quantity ? 'received'
                  : 'partial'
                );

                return (
                  <TableRow key={item.productId} selected={canReceive && receiveSel.selected}>
                    {canReceive && (
                      <TableCell padding="checkbox">
                        <Checkbox
                          size="small"
                          disabled={remaining <= 0}
                          checked={receiveSel.selected && remaining > 0}
                          onChange={(e) =>
                            updateReceiveSelection(item.productId, remaining, {
                              selected: e.target.checked,
                              receiveQuantity: receiveSel.receiveQuantity || remaining,
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
                    <TableCell sx={{ minWidth: 0 }}>
                      <Typography variant="body2" sx={{ fontWeight: 500 }} noWrap title={item.productName}>
                        {item.productName}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">{item.quantity}</TableCell>
                    <TableCell align="right">{item.receivedQuantity}</TableCell>
                    {canReceive && (
                      <TableCell align="right">
                        <TextField
                          size="small"
                          type="number"
                          value={receiveSel.receiveQuantity}
                          disabled={!receiveSel.selected || remaining <= 0}
                          onChange={(e) =>
                            updateReceiveSelection(item.productId, remaining, {
                              receiveQuantity: Math.min(
                                remaining,
                                Math.max(1, parseInt(e.target.value, 10) || 1),
                              ),
                            })
                          }
                          sx={{ width: 72 }}
                          slotProps={{ htmlInput: { min: 1, max: remaining } }}
                        />
                      </TableCell>
                    )}
                    {canReceive && (
                      <TableCell>
                        <TextField
                          size="small"
                          type="date"
                          value={receiveSel.expiryDate}
                          disabled={!receiveSel.selected || remaining <= 0}
                          onChange={(e) =>
                            updateReceiveSelection(item.productId, remaining, {
                              expiryDate: e.target.value,
                            })
                          }
                          error={receiveSel.selected && !receiveSel.expiryDate}
                          sx={{ width: '100%' }}
                          slotProps={{ inputLabel: { shrink: true } }}
                        />
                      </TableCell>
                    )}
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                        <LinearProgress
                          variant="determinate"
                          value={pct}
                          sx={{ flex: 1, height: 6, borderRadius: 1 }}
                          color={pct === 100 ? 'success' : 'primary'}
                        />
                        <Typography variant="caption" sx={{ minWidth: 28, textAlign: 'right' }}>
                          {pct.toFixed(0)}%
                        </Typography>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={PO_LINE_STATUS_LABELS[lineStatus]}
                        size="small"
                        color={LINE_STATUS_COLORS[lineStatus]}
                      />
                    </TableCell>
                    <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                      {formatCurrency(item.unitCost)}
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
        <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            Order Total: {formatCurrency(po.totalAmount)}
          </Typography>
        </Box>
      </Paper>
    </Box>
  );
}
