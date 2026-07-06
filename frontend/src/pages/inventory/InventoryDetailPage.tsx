import { useState } from 'react';
import dayjs from 'dayjs';
import {
  Box,
  Button,
  Grid,
  Paper,
  Tab,
  Tabs,
  Typography,
  Alert,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  FormControl,
  FormControlLabel,
  Radio,
  RadioGroup,
  Collapse,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import AddBoxIcon from '@mui/icons-material/AddBox';
import TuneIcon from '@mui/icons-material/Tune';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '@/components/common/PageHeader';
import { StatCard } from '@/components/common/StatCard';
import { DataTable, type Column } from '@/components/tables/DataTable';
import {
  useInventoryItem,
  useAdjustStock,
  useReceiveBatch,
} from '@/hooks/useInventory';
import { useSuppliers } from '@/hooks/useSuppliers';
import { useUomOptions } from '@/hooks/useUoms';
import { MovementLedgerTab } from './MovementLedgerTab';
import { useAuthStore } from '@/store';
import { formatCurrency, formatDate, uomLabel } from '@/utils';
import { showApiError, showSuccess } from '@/utils/toast';
import type { InventoryBatch, StockAdjustmentType } from '@/types';

const ADJUSTMENT_TYPES: { value: StockAdjustmentType; label: string }[] = [
  { value: 'adjustment', label: 'Stock Adjustment' },
  { value: 'damaged', label: 'Damaged / Expired' },
  { value: 'correction', label: 'Manual Correction' },
];

type DetailTab = 'batches' | 'ledger';

export function InventoryDetailPage() {
  const { productId } = useParams<{ productId: string }>();
  const navigate = useNavigate();
  const currentUser = useAuthStore((s) => s.user);
  const canManage = currentUser?.role === 'admin' || currentUser?.role === 'manager';

  const [tab, setTab] = useState<DetailTab>('batches');

  const { data: item, isLoading, isError } = useInventoryItem(productId ?? '');
  const { data: suppliersData } = useSuppliers({ pageSize: 50 });
  const suppliers = suppliersData?.data ?? [];
  const uomOptions = useUomOptions();

  const adjustMutation = useAdjustStock();
  const receiveMutation = useReceiveBatch();

  const [receiveOpen, setReceiveOpen] = useState(false);
  const [rcvBatch, setRcvBatch] = useState('');
  const [rcvQty, setRcvQty] = useState('');
  const [rcvExpiry, setRcvExpiry] = useState('');
  const [rcvCostPrice, setRcvCostPrice] = useState('');
  const [rcvSellingPrice, setRcvSellingPrice] = useState('');
  const [rcvSupplierId, setRcvSupplierId] = useState('');
  const [rcvUom, setRcvUom] = useState('pcs');
  const [rcvError, setRcvError] = useState('');

  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjBatchId, setAdjBatchId] = useState('');
  const [adjQty, setAdjQty] = useState('');
  const [adjType, setAdjType] = useState<StockAdjustmentType>('adjustment');
  const [adjReason, setAdjReason] = useState('');
  const [adjError, setAdjError] = useState('');
  const [adjMode, setAdjMode] = useState<'delta' | 'target'>('target');
  const [adjAdvancedOpen, setAdjAdvancedOpen] = useState(false);

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (isError || !item) {
    return <Alert severity="error">Inventory item not found.</Alert>;
  }

  const activeBatches = item.batches.filter((b) => b.quantity > 0);
  const stockColor =
    item.stock === 0 ? 'error' : item.stock <= item.lowStockThreshold ? 'warning' : 'success';

  const batchColumns: Column<InventoryBatch>[] = [
    { id: 'batch', label: 'Batch No.', accessor: 'batchNumber' },
    { id: 'qty', label: 'Quantity', align: 'right', accessor: 'quantity' },
    {
      id: 'expiry',
      label: 'Expiry',
      render: (row) => (row.expiryDate ? formatDate(row.expiryDate) : '—'),
    },
    {
      id: 'received',
      label: 'Received',
      render: (row) => formatDate(row.receivedAt),
    },
  ];

  const openReceive = () => {
    setRcvBatch(dayjs().format('YYYY-MM-DD'));
    setRcvQty('');
    setRcvExpiry('');
    setRcvCostPrice(String(item.costPrice));
    setRcvSellingPrice(String(item.sellingPrice));
    setRcvSupplierId(item.supplierId);
    setRcvUom(item.uom ?? 'pcs');
    setRcvError('');
    setReceiveOpen(true);
  };

  const handleReceive = () => {
    const qty = parseInt(rcvQty, 10);
    const unitCost = parseFloat(rcvCostPrice);
    const sellingPrice = parseFloat(rcvSellingPrice);
    if (isNaN(qty) || qty < 1) { setRcvError('Enter a quantity ≥ 1'); return; }
    if (!rcvBatch.trim()) { setRcvError('Batch number is required'); return; }
    if (!rcvSupplierId) { setRcvError('Select a supplier'); return; }
    if (isNaN(unitCost) || unitCost < 0) { setRcvError('Enter a valid cost price'); return; }
    if (isNaN(sellingPrice) || sellingPrice < 0) { setRcvError('Enter a valid selling price'); return; }
    receiveMutation.mutate(
      {
        productId: item.id,
        batchNumber: rcvBatch,
        quantity: qty,
        expiryDate: rcvExpiry || undefined,
        unitCost,
        sellingPrice,
        supplierId: rcvSupplierId,
      },
      {
        onSuccess: () => {
          showSuccess('Inventory received.');
          setReceiveOpen(false);
        },
        onError: (err) => showApiError(err, 'Inventory receive failed.'),
      },
    );
  };

  const openAdjust = () => {
    const firstBatch = activeBatches[0];
    setAdjBatchId(firstBatch?.id ?? '');
    setAdjQty('');
    setAdjType('adjustment');
    setAdjReason('');
    setAdjError('');
    setAdjMode('target');
    setAdjAdvancedOpen(false);
    setAdjustOpen(true);
  };

  const handleAdjust = () => {
    let qty: number;
    if (adjMode === 'target') {
      const target = parseInt(adjQty, 10);
      if (isNaN(target) || target < 0) { setAdjError('Enter a valid target stock (≥ 0)'); return; }
      qty = target - item.stock;
      if (qty === 0) { setAdjError('Target matches current stock'); return; }
    } else {
      qty = parseInt(adjQty, 10);
    }
    if (isNaN(qty) || qty === 0) { setAdjError('Enter a non-zero quantity'); return; }
    if (!adjReason.trim()) { setAdjError('Reason is required'); return; }
    adjustMutation.mutate(
      {
        productId: item.id,
        batchId: adjBatchId || undefined,
        type: adjType,
        quantity: qty,
        reason: adjReason,
        createdBy: currentUser?.name ?? 'User',
      },
      {
        onSuccess: () => {
          showSuccess('Inventory adjusted.');
          setAdjustOpen(false);
        },
        onError: (err) => showApiError(err, 'Inventory update failed.'),
      },
    );
  };

  return (
    <Box>
      <PageHeader
        title={item.name}
        subtitle={`${item.sku} · ${item.category}`}
        breadcrumbs={[
          { label: 'Inventory', path: '/inventory' },
          { label: item.name },
        ]}
        action={
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <Button
              component={RouterLink}
              to={`/products/${item.id}`}
              variant="outlined"
              startIcon={<OpenInNewIcon />}
            >
              Product
            </Button>
            {canManage && (
              <Button variant="contained" color="success" startIcon={<AddBoxIcon />} onClick={openReceive}>
                Receive
              </Button>
            )}
            {canManage && (
              <Button variant="outlined" startIcon={<TuneIcon />} onClick={openAdjust}>
                Adjust
              </Button>
            )}
            <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/inventory')}>
              Back
            </Button>
          </Box>
        }
      />

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 6, sm: 3 }}>
          <StatCard
            title="Current Stock"
            value={item.stock}
            color={stockColor === 'success' ? undefined : `${stockColor}.main`}
            subtitle={item.stock === 0 ? 'Out of stock' : item.stock <= item.lowStockThreshold ? 'Low stock' : undefined}
          />
        </Grid>
        <Grid size={{ xs: 6, sm: 3 }}>
          <StatCard title="Active Batches" value={item.batchCount ?? activeBatches.length} />
        </Grid>
        <Grid size={{ xs: 6, sm: 3 }}>
          <StatCard
            title="Stock Value"
            value={formatCurrency(item.stock * item.costPrice)}
          />
        </Grid>
        <Grid size={{ xs: 6, sm: 3 }}>
          <StatCard
            title="Nearest Expiry"
            value={item.nearestExpiry ? formatDate(item.nearestExpiry) : '—'}
          />
        </Grid>
      </Grid>

      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, sm: 4 }}>
            <Typography variant="body2" color="text.secondary">Supplier</Typography>
            <Typography>{item.supplierName || '—'}</Typography>
          </Grid>
          <Grid size={{ xs: 12, sm: 4 }}>
            <Typography variant="body2" color="text.secondary">Low Stock Threshold</Typography>
            <Typography>{item.lowStockThreshold}</Typography>
          </Grid>
          <Grid size={{ xs: 12, sm: 4 }}>
            <Typography variant="body2" color="text.secondary">Cost / Sell Price</Typography>
            <Typography>
              {formatCurrency(item.costPrice)} / {formatCurrency(item.sellingPrice)}
            </Typography>
          </Grid>
        </Grid>
      </Paper>

      <Tabs value={tab} onChange={(_, v: DetailTab) => setTab(v)} sx={{ mb: 2 }}>
        <Tab value="batches" label={`Batches (${item.batches.length})`} />
        <Tab value="ledger" label="Movement Ledger" />
      </Tabs>

      {tab === 'batches' && (
        <DataTable
          columns={batchColumns}
          rows={item.batches}
          getRowId={(r) => r.id}
          emptyMessage="No batches recorded"
        />
      )}

      {tab === 'ledger' && productId && (
        <MovementLedgerTab productId={productId} hideProductColumn />
      )}

      <Dialog open={receiveOpen} onClose={() => setReceiveOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Receive Stock — {item.name}</DialogTitle>
        <DialogContent>
          {rcvError && <Alert severity="error" sx={{ mb: 2 }}>{rcvError}</Alert>}
          <TextField
            label="Batch Number"
            value={rcvBatch}
            onChange={(e) => { setRcvBatch(e.target.value); setRcvError(''); }}
            fullWidth
            margin="normal"
            required
          />
          <TextField
            select
            label="Supplier"
            value={rcvSupplierId}
            onChange={(e) => { setRcvSupplierId(e.target.value); setRcvError(''); }}
            fullWidth
            margin="normal"
            required
          >
            {suppliers.map((s) => (
              <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>
            ))}
          </TextField>
          <TextField
            label="Cost Price"
            value={rcvCostPrice}
            onChange={(e) => { setRcvCostPrice(e.target.value); setRcvError(''); }}
            type="number"
            fullWidth
            margin="normal"
            required
            slotProps={{ htmlInput: { min: 0, step: 0.01 } }}
          />
          <TextField
            label="Selling Price"
            value={rcvSellingPrice}
            onChange={(e) => { setRcvSellingPrice(e.target.value); setRcvError(''); }}
            type="number"
            fullWidth
            margin="normal"
            required
            slotProps={{ htmlInput: { min: 0, step: 0.01 } }}
          />
          <Box sx={{ display: 'flex', gap: 2, mt: 2, mb: 1 }}>
            <TextField
              label="Quantity Received"
              value={rcvQty}
              onChange={(e) => { setRcvQty(e.target.value); setRcvError(''); }}
              type="number"
              required
              fullWidth
              slotProps={{ htmlInput: { min: 1 } }}
              helperText={`Quantity in ${uomLabel(rcvUom, uomOptions)}`}
            />
            <TextField
              label="UOM"
              value={rcvUom}
              select
              onChange={(e) => { setRcvUom(e.target.value); setRcvError(''); }}
              sx={{ minWidth: 140, flexShrink: 0 }}
            >
              {uomOptions.map((u) => (
                <MenuItem key={u.value} value={u.value}>{u.label}</MenuItem>
              ))}
            </TextField>
          </Box>
          <TextField
            label="Expiry Date"
            value={rcvExpiry}
            onChange={(e) => setRcvExpiry(e.target.value)}
            type="date"
            fullWidth
            margin="normal"
            slotProps={{ inputLabel: { shrink: true } }}
            helperText="Leave blank if product has no expiry"
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setReceiveOpen(false)}>Cancel</Button>
          <Button variant="contained" color="success" onClick={handleReceive} loading={receiveMutation.isPending}>
            Confirm Receipt
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={adjustOpen} onClose={() => setAdjustOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>
          Adjust Stock — {item.name}
          <Typography variant="body2" color="text.secondary">
            Current stock: {item.stock}
          </Typography>
        </DialogTitle>
        <DialogContent>
          {adjError && <Alert severity="error" sx={{ mb: 2 }}>{adjError}</Alert>}
          <FormControl component="fieldset" sx={{ mt: 1, mb: 1 }}>
            <RadioGroup
              row
              value={adjMode}
              onChange={(e) => { setAdjMode(e.target.value as 'delta' | 'target'); setAdjQty(''); setAdjError(''); }}
            >
              <FormControlLabel value="target" control={<Radio size="small" />} label="Set target stock" />
              <FormControlLabel value="delta" control={<Radio size="small" />} label="Adjust by +/- delta" />
            </RadioGroup>
          </FormControl>
          <TextField select label="Type" value={adjType} onChange={(e) => setAdjType(e.target.value as StockAdjustmentType)} fullWidth margin="normal">
            {ADJUSTMENT_TYPES.map((t) => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
          </TextField>
          <Button size="small" onClick={() => setAdjAdvancedOpen((o) => !o)} sx={{ mb: 1 }}>
            {adjAdvancedOpen ? 'Hide' : 'Show'} advanced batch options
          </Button>
          <Collapse in={adjAdvancedOpen}>
          {activeBatches.length > 0 && (
            <TextField select label="Batch (optional)" value={adjBatchId} onChange={(e) => setAdjBatchId(e.target.value)} fullWidth margin="normal">
              <MenuItem value="">Auto (FEFO)</MenuItem>
              {activeBatches.map((b) => (
                <MenuItem key={b.id} value={b.id}>{b.batchNumber} ({b.quantity} units)</MenuItem>
              ))}
            </TextField>
          )}
          </Collapse>
          <TextField
            label={adjMode === 'target' ? 'Target stock' : 'Quantity (negative to reduce)'}
            value={adjQty}
            onChange={(e) => setAdjQty(e.target.value)}
            type="number"
            fullWidth
            margin="normal"
            helperText={
              adjQty
                ? adjMode === 'target'
                  ? (() => {
                      const target = parseInt(adjQty, 10);
                      if (isNaN(target)) return '';
                      const delta = target - item.stock;
                      return delta === 0 ? 'No change needed' : `Will adjust by ${delta > 0 ? '+' : ''}${delta}`;
                    })()
                  : `New stock: ${item.stock + (parseInt(adjQty, 10) || 0)}`
                : ''
            }
          />
          <TextField label="Reason" value={adjReason} onChange={(e) => setAdjReason(e.target.value)} fullWidth margin="normal" multiline rows={2} />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setAdjustOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleAdjust} loading={adjustMutation.isPending}>
            Apply Adjustment
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
