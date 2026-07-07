import { useMemo, useState } from 'react';
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
  TextField,
  Checkbox,
  Link,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Grid,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import EditIcon from '@mui/icons-material/Edit';
import InventoryIcon from '@mui/icons-material/Inventory';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '@/components/common/PageHeader';
import {
  usePurchaseOrder,
  useUpdatePurchaseOrderStatus,
  useReceivePurchaseOrderItems,
} from '@/hooks/usePurchaseOrders';
import { formatCurrency, formatDate, canManagePurchaseOrders } from '@/utils';
import { canEditPurchaseOrder } from '@/utils/canEditPurchaseOrder';
import { getErrorMessage } from '@/services/apiClient';
import { showSuccess } from '@/utils/toast';
import { PO_STATUS_LABELS, PO_LINE_STATUS_LABELS } from '@/constants';
import { useAuthStore } from '@/store';
import type { PurchaseOrderLineStatus, PurchaseOrderReceiveItem, PurchaseOrderStatus } from '@/types';
import {
  PO_DETAIL_FLAT_COLUMNS,
  poDetailFlatColWidths,
  poDetailTableMinWidth,
} from '@/pages/purchase-orders/poLineTableColumns';
import { PO_LABELS, PO_RECEIVE_HINT } from '@/pages/purchase-orders/poTerminology';

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
  unitsPerBuyUom?: number;
}

const headerCellSx = { fontWeight: 700, whiteSpace: 'nowrap', py: 1.25 };

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

  const handleStatusChange = async (status: PurchaseOrderStatus) => {
    if (!po) return;
    setStatusError('');
    setStatusValue(status);
    try {
      await statusMutation.mutateAsync({ id: po.id, status });
      showSuccess('Purchase Order updated.');
      setStatusValue('');
    } catch (err) {
      setStatusError(getErrorMessage(err));
      setStatusValue('');
    }
  };

  const handleReceive = async () => {
    if (!po) return;
    if (itemsToReceive.length === 0) {
      setReceiveError('Select at least one item with a pack qty');
      return;
    }
    setReceiveError('');
    try {
      await receiveMutation.mutateAsync({ id: po.id, items: itemsToReceive });
      showSuccess('Purchase Order received.');
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

      <Paper sx={{ px: 2, py: 2, mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2, mb: 2 }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
              Supplier
            </Typography>
            <Link
              component={RouterLink}
              to={`/suppliers/${po.supplierId}`}
              variant="subtitle1"
              sx={{ fontWeight: 600 }}
              title={po.supplierName}
            >
              {po.supplierName}
            </Link>
          </Box>
          <Chip label={PO_STATUS_LABELS[po.status]} color={STATUS_COLORS[po.status]} size="small" sx={{ fontWeight: 600, mt: 0.5 }} />
          <Box sx={{ textAlign: { xs: 'left', sm: 'right' } }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>Order total</Typography>
            <Typography variant="h6" sx={{ fontWeight: 700, color: 'primary.main' }}>
              {formatCurrency(po.totalAmount)}
            </Typography>
          </Box>
        </Box>
        <Grid container spacing={2}>
          <Grid size={{ xs: 6, md: 3 }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.25 }}>Expected delivery</Typography>
            <Typography variant="body2">{po.expectedDelivery ? formatDate(po.expectedDelivery) : '—'}</Typography>
          </Grid>
          <Grid size={{ xs: 6, md: 3 }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.25 }}>Items</Typography>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {po.items.length}
              <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 0.5 }}>
                · {receivedCount} received
              </Typography>
            </Typography>
          </Grid>
          <Grid size={{ xs: 6, md: 3 }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.25 }}>Ordered by</Typography>
            <Typography variant="body2">{po.orderedBy ?? '—'}</Typography>
          </Grid>
          <Grid size={{ xs: 6, md: 3 }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.25 }}>Received by</Typography>
            <Typography variant="body2">{po.receivedBy ?? '—'}</Typography>
          </Grid>
        </Grid>
        <Accordion disableGutters elevation={0} sx={{ mt: 1.5, bgcolor: 'transparent', '&:before': { display: 'none' } }}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ px: 0, minHeight: 40 }}>
            <Typography variant="body2" color="text.secondary">More details</Typography>
          </AccordionSummary>
          <AccordionDetails sx={{ px: 0, pt: 0 }}>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 4 }}>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.25 }}>Received date</Typography>
                <Typography variant="body2">{po.receivedDate ? formatDate(po.receivedDate) : '—'}</Typography>
              </Grid>
              <Grid size={{ xs: 12, sm: 4 }}>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.25 }}>Created</Typography>
                <Typography variant="body2">{formatDate(po.createdAt)}</Typography>
              </Grid>
              <Grid size={{ xs: 12, sm: 4 }}>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.25 }}>Last updated</Typography>
                <Typography variant="body2">{formatDate(po.updatedAt)}</Typography>
              </Grid>
            </Grid>
          </AccordionDetails>
        </Accordion>
      </Paper>

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
                <TableCell sx={headerCellSx}>Product</TableCell>
                <TableCell align="right" sx={headerCellSx}>{PO_LABELS.ordered}</TableCell>
                <TableCell align="right" sx={headerCellSx}>{PO_LABELS.received}</TableCell>
                {canReceive && <TableCell align="right" sx={headerCellSx}>{PO_LABELS.packQty}</TableCell>}
                <TableCell align="right" sx={headerCellSx}>{PO_LABELS.unitsPerPack}</TableCell>
                <TableCell align="right" sx={headerCellSx}>{PO_LABELS.totalUnits}</TableCell>
                {canReceive && <TableCell sx={headerCellSx}>{PO_LABELS.expiryOptional}</TableCell>}
                <TableCell sx={headerCellSx}>Status</TableCell>
                <TableCell align="right" sx={headerCellSx}>{PO_LABELS.unitCost}</TableCell>
                <TableCell align="right" sx={headerCellSx}>{PO_LABELS.lineTotal}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {po.items.map((item, index) => {
                const remaining = item.quantity - item.receivedQuantity;
                const receiveSel = getReceiveSelection(item.productId, remaining);
                const orderUom = item.orderUom ?? 'pcs';
                const unitsPerBuy = receiveSel.unitsPerBuyUom ?? item.unitsPerBuyUom ?? 1;
                const orderedTotalUnits = item.quantity * (item.unitsPerBuyUom ?? 1);
                const receiveTotalUnits = receiveSel.selected
                  ? receiveSel.receiveQuantity * unitsPerBuy
                  : 0;
                const lineStatus = item.lineStatus ?? (
                  item.receivedQuantity <= 0 ? 'pending'
                  : item.receivedQuantity >= item.quantity ? 'received'
                  : 'partial'
                );
                const defaultPackQty = remaining > 0 ? remaining : 1;

                return (
                  <TableRow key={item.productId} selected={canReceive && receiveSel.selected}>
                    {canReceive && (
                      <TableCell padding="checkbox">
                        <Checkbox
                          size="small"
                          checked={receiveSel.selected}
                          onChange={(e) =>
                            updateReceiveSelection(item.productId, remaining, {
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
                    <TableCell sx={{ minWidth: PO_DETAIL_FLAT_COLUMNS.product }}>
                      <Typography variant="body2" sx={{ fontWeight: 500 }} title={item.productName}>
                        {item.productName}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                        {item.quantity} {orderUom} · {orderedTotalUnits} {PO_LABELS.totalUnits.toLowerCase()}
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
                          disabled={!receiveSel.selected}
                          onChange={(e) =>
                            updateReceiveSelection(item.productId, remaining, {
                              receiveQuantity: Math.max(1, parseInt(e.target.value, 10) || 1),
                            })
                          }
                          sx={{ width: '100%', minWidth: 72 }}
                          slotProps={{ htmlInput: { min: 1 } }}
                        />
                      </TableCell>
                    )}
                    <TableCell align="right">
                      {canReceive ? (
                        <TextField
                          size="small"
                          type="number"
                          value={unitsPerBuy}
                          disabled={!receiveSel.selected}
                          onChange={(e) =>
                            updateReceiveSelection(item.productId, remaining, {
                              unitsPerBuyUom: Math.max(1, parseInt(e.target.value, 10) || 1),
                            })
                          }
                          sx={{ width: '100%', minWidth: 72 }}
                          slotProps={{ htmlInput: { min: 1 } }}
                        />
                      ) : (
                        item.unitsPerBuyUom ?? 1
                      )}
                    </TableCell>
                    <TableCell align="right">
                      {canReceive ? (receiveSel.selected ? receiveTotalUnits : '—') : orderedTotalUnits}
                    </TableCell>
                    {canReceive && (
                      <TableCell>
                        <TextField
                          size="small"
                          type="date"
                          label="Expiry"
                          value={receiveSel.expiryDate}
                          disabled={!receiveSel.selected}
                          onChange={(e) =>
                            updateReceiveSelection(item.productId, remaining, { expiryDate: e.target.value })
                          }
                          sx={{ width: '100%', minWidth: 120 }}
                          slotProps={{
                            inputLabel: { shrink: true },
                            htmlInput: { 'aria-label': 'Expiry date optional' },
                          }}
                          helperText={receiveSel.selected ? 'Optional' : undefined}
                        />
                      </TableCell>
                    )}
                    <TableCell>
                      <Chip label={PO_LINE_STATUS_LABELS[lineStatus]} size="small" color={LINE_STATUS_COLORS[lineStatus]} />
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
