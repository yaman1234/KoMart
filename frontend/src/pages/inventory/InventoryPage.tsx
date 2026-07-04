import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import {
  Box,
  Button,
  Grid,
  Chip,
  Tabs,
  Tab,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  Typography,
  Alert,
} from '@mui/material';
import TuneIcon from '@mui/icons-material/Tune';
import AddBoxIcon from '@mui/icons-material/AddBox';
import { PageHeader } from '@/components/common/PageHeader';
import { SearchBar } from '@/components/common/SearchBar';
import { StatCard } from '@/components/common/StatCard';
import { DataTable, type Column } from '@/components/tables/DataTable';
import { useInventory, useInventoryStats, useAdjustStock, useReceiveBatch } from '@/hooks/useInventory';
import { useSuppliers } from '@/hooks/useSuppliers';
import { formatDate, formatCurrency, uomLabel } from '@/utils';
import { useAuthStore } from '@/store';
import { PRODUCT_CATEGORIES, DROPDOWN_PAGE_SIZE } from '@/constants';
import type { InventoryItem, StockAdjustmentType } from '@/types';
import type { InventoryQueryParams } from '@/services';
import { showApiError, showSuccess } from '@/utils/toast';
import { MovementLedgerTab } from './MovementLedgerTab';

type StockFilter = 'all' | 'low' | 'out' | 'expiring';
type PageView = 'stock' | 'ledger';

const ADJUSTMENT_TYPES: { value: StockAdjustmentType; label: string }[] = [
  { value: 'adjustment', label: 'Stock Adjustment' },
  { value: 'damaged', label: 'Damaged / Expired' },
  { value: 'correction', label: 'Manual Correction' },
];

function nearestActiveBatch(item: InventoryItem) {
  return item.batches.find((b) => b.quantity > 0);
}

function expiryChipColor(date?: string): 'error' | 'warning' | 'default' {
  if (!date) return 'default';
  const days = (new Date(date).getTime() - Date.now()) / 86400000;
  if (days < 0) return 'error';
  if (days <= 30) return 'warning';
  return 'default';
}

export function InventoryPage() {
  const navigate = useNavigate();
  const currentUser = useAuthStore((s) => s.user);
  const canManage = currentUser?.role === 'admin' || currentUser?.role === 'manager';
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<StockFilter>('all');
  const [supplierId, setSupplierId] = useState('');
  const [category, setCategory] = useState('');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [pageView, setPageView] = useState<PageView>('stock');

  const [adjustTarget, setAdjustTarget] = useState<InventoryItem | null>(null);
  const [adjBatchId, setAdjBatchId] = useState('');
  const [adjQty, setAdjQty] = useState('');
  const [adjType, setAdjType] = useState<StockAdjustmentType>('adjustment');
  const [adjReason, setAdjReason] = useState('');
  const [adjError, setAdjError] = useState('');

  const [receiveTarget, setReceiveTarget] = useState<InventoryItem | null>(null);
  const [rcvBatch, setRcvBatch] = useState('');
  const [rcvQty, setRcvQty] = useState('');
  const [rcvExpiry, setRcvExpiry] = useState('');
  const [rcvCostPrice, setRcvCostPrice] = useState('');
  const [rcvSellingPrice, setRcvSellingPrice] = useState('');
  const [rcvSupplierId, setRcvSupplierId] = useState('');
  const [rcvError, setRcvError] = useState('');

  const inventoryParams: InventoryQueryParams = {
    search,
    filter,
    page: page + 1,
    pageSize,
    ...(supplierId ? { supplierId } : {}),
    ...(category ? { category } : {}),
  };

  const { data, isLoading } = useInventory(inventoryParams);
  const { data: stats } = useInventoryStats();
  const { data: suppliersData } = useSuppliers({ pageSize: DROPDOWN_PAGE_SIZE });
  const adjustMutation = useAdjustStock();
  const receiveMutation = useReceiveBatch();

  const suppliers = suppliersData?.data ?? [];

  const items = data?.data ?? [];

  const columns: Column<InventoryItem>[] = [
    { id: 'name', label: 'Product', minWidth: 180, accessor: 'name' },
    { id: 'sku', label: 'SKU', minWidth: 120, accessor: 'sku' },
    { id: 'category', label: 'Category', accessor: 'category' },
    {
      id: 'supplier',
      label: 'Supplier',
      minWidth: 140,
      render: (row) => row.supplierName || '—',
    },
    {
      id: 'stock',
      label: 'Stock',
      align: 'right',
      render: (row) => (
        <Chip
          label={row.stock === 0 ? 'Out' : row.stock}
          color={row.stock === 0 ? 'error' : row.stock <= row.lowStockThreshold ? 'warning' : 'success'}
          size="small"
        />
      ),
    },
    {
      id: 'batches',
      label: 'Batches',
      align: 'right',
      render: (row) => row.batchCount ?? row.batches.filter((b) => b.quantity > 0).length,
    },
    {
      id: 'expiry',
      label: 'Nearest Expiry',
      render: (row) => {
        const date = row.nearestExpiry ?? nearestActiveBatch(row)?.expiryDate;
        if (!date) return '—';
        return (
          <Chip
            label={formatDate(date)}
            color={expiryChipColor(date)}
            size="small"
            variant="outlined"
          />
        );
      },
    },
    {
      id: 'value',
      label: 'Value',
      align: 'right',
      render: (row) => formatCurrency(row.stock * row.costPrice),
    },
    {
      id: 'actions',
      label: '',
      render: (row) => (
        <Box sx={{ display: 'flex', gap: 1 }}>
          {canManage && (
            <Button
              size="small"
              variant="contained"
              color="success"
              startIcon={<AddBoxIcon />}
              onClick={(e) => { e.stopPropagation(); openReceive(row); }}
            >
              Receive
            </Button>
          )}
          {canManage && (
            <Button
              size="small"
              variant="outlined"
              startIcon={<TuneIcon />}
              onClick={(e) => { e.stopPropagation(); openAdjust(row); }}
            >
              Adjust
            </Button>
          )}
        </Box>
      ),
    },
  ];

  const openReceive = (item: InventoryItem) => {
    setReceiveTarget(item);
    setRcvBatch(dayjs().format('YYYY-MM-DD'));
    setRcvQty('');
    setRcvExpiry('');
    setRcvCostPrice(String(item.costPrice));
    setRcvSellingPrice(String(item.sellingPrice));
    setRcvSupplierId(item.supplierId);
    setRcvError('');
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
    if (!receiveTarget) return;
    receiveMutation.mutate(
      {
        productId: receiveTarget.id,
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
          setReceiveTarget(null);
        },
        onError: (err) => showApiError(err, 'Inventory receive failed.'),
      },
    );
  };

  const openAdjust = (item: InventoryItem) => {
    setAdjustTarget(item);
    const firstBatch = item.batches.find((b) => b.quantity > 0);
    setAdjBatchId(firstBatch?.id ?? '');
    setAdjQty('');
    setAdjType('adjustment');
    setAdjReason('');
    setAdjError('');
  };

  const handleAdjust = () => {
    const qty = parseInt(adjQty, 10);
    if (isNaN(qty) || qty === 0) { setAdjError('Enter a non-zero quantity'); return; }
    if (!adjReason.trim()) { setAdjError('Reason is required'); return; }
    if (!adjustTarget) return;
    adjustMutation.mutate(
      {
        productId: adjustTarget.id,
        batchId: adjBatchId || undefined,
        type: adjType,
        quantity: qty,
        reason: adjReason,
        createdBy: currentUser?.name ?? 'User',
      },
      {
        onSuccess: () => {
          showSuccess('Inventory adjusted.');
          setAdjustTarget(null);
        },
        onError: (err) => showApiError(err, 'Inventory update failed.'),
      },
    );
  };

  const activeBatches = (item: InventoryItem) => item.batches.filter((b) => b.quantity > 0);

  return (
    <Box>
      <PageHeader title="Inventory" subtitle="Stock is tracked per batch; product stock is synced automatically" />

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 6, sm: 3 }}>
          <StatCard title="Total SKUs" value={stats?.totalSkus ?? '—'} />
        </Grid>
        <Grid size={{ xs: 6, sm: 3 }}>
          <StatCard title="Low Stock" value={stats?.lowStock ?? '—'} color="warning.main" />
        </Grid>
        <Grid size={{ xs: 6, sm: 3 }}>
          <StatCard title="Out of Stock" value={stats?.outOfStock ?? '—'} color="error.main" />
        </Grid>
        <Grid size={{ xs: 6, sm: 3 }}>
          <StatCard
            title="Inventory Value"
            value={stats ? formatCurrency(stats.inventoryValue) : '—'}
          />
        </Grid>
      </Grid>

      <Tabs
        value={pageView}
        onChange={(_, v: PageView) => setPageView(v)}
        sx={{ mb: 2 }}
      >
        <Tab value="stock" label="Stock Levels" />
        <Tab value="ledger" label="Movement Ledger" />
      </Tabs>

      {pageView === 'stock' && (
      <>
      <Box sx={{ mb: 2, display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
        <Box sx={{ flex: 1, minWidth: 200 }}>
          <SearchBar
            value={search}
            onChange={(v) => { setSearch(v); setPage(0); }}
            placeholder="Search products..."
          />
        </Box>
        <TextField
          select
          label="Supplier"
          value={supplierId}
          onChange={(e) => { setSupplierId(e.target.value); setPage(0); }}
          size="small"
          sx={{ minWidth: 200 }}
        >
          <MenuItem value="">All Suppliers</MenuItem>
          {suppliers.map((s) => (
            <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>
          ))}
        </TextField>
        <TextField
          select
          label="Category"
          value={category}
          onChange={(e) => { setCategory(e.target.value); setPage(0); }}
          size="small"
          sx={{ minWidth: 180 }}
        >
          <MenuItem value="">All Categories</MenuItem>
          {PRODUCT_CATEGORIES.map((c) => (
            <MenuItem key={c} value={c}>{c}</MenuItem>
          ))}
        </TextField>
        <Tabs
          value={filter}
          onChange={(_, v: StockFilter) => { setFilter(v); setPage(0); }}
          sx={{ flexShrink: 0 }}
        >
          <Tab value="all" label="All" />
          <Tab value="low" label={`Low (${stats?.lowStock ?? 0})`} />
          <Tab value="out" label={`Out (${stats?.outOfStock ?? 0})`} />
          <Tab value="expiring" label={`Expiring (${stats?.expiring ?? 0})`} />
        </Tabs>
      </Box>

      <DataTable
        columns={columns}
        rows={items}
        loading={isLoading}
        page={page}
        pageSize={pageSize}
        total={data?.total}
        onPageChange={setPage}
        onPageSizeChange={(size) => { setPageSize(size); setPage(0); }}
        onRowClick={(row) => navigate(`/inventory/${row.id}`)}
        getRowId={(r) => r.id}
      />
      </>
      )}

      {pageView === 'ledger' && <MovementLedgerTab />}

      <Dialog open={!!receiveTarget} onClose={() => setReceiveTarget(null)} maxWidth="sm" fullWidth>
        <DialogTitle>
          Receive Stock — {receiveTarget?.name}
          <Typography variant="body2" color="text.secondary">
            Current stock: {receiveTarget?.stock}
          </Typography>
        </DialogTitle>
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
            helperText={rcvSupplierId ? undefined : 'Select the planned supplier for this product'}
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
              helperText="Quantity is in sell units"
            />
            <TextField
              label="UOM"
              value={receiveTarget?.uom ?? 'pcs'}
              select
              sx={{ minWidth: 140, flexShrink: 0 }}
              slotProps={{ input: { readOnly: true } }}
            >
              <MenuItem value={receiveTarget?.uom ?? 'pcs'}>
                {uomLabel(receiveTarget?.uom ?? 'pcs')}
              </MenuItem>
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
          <Button onClick={() => setReceiveTarget(null)}>Cancel</Button>
          <Button
            variant="contained"
            color="success"
            onClick={handleReceive}
            loading={receiveMutation.isPending}
          >
            Confirm Receipt
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!adjustTarget} onClose={() => setAdjustTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle>
          Stock Adjustment — {adjustTarget?.name}
          <Typography variant="body2" color="text.secondary">
            Current stock: {adjustTarget?.stock}
          </Typography>
        </DialogTitle>
        <DialogContent>
          {adjError && <Alert severity="error" sx={{ mb: 2 }}>{adjError}</Alert>}
          <TextField
            select
            label="Type"
            value={adjType}
            onChange={(e) => setAdjType(e.target.value as StockAdjustmentType)}
            fullWidth
            margin="normal"
          >
            {ADJUSTMENT_TYPES.map((t) => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
          </TextField>
          {adjustTarget && activeBatches(adjustTarget).length > 0 && (
            <TextField
              select
              label="Batch (optional)"
              value={adjBatchId}
              onChange={(e) => setAdjBatchId(e.target.value)}
              fullWidth
              margin="normal"
              helperText="Leave blank to apply FEFO across batches when reducing stock"
            >
              <MenuItem value="">Auto (FEFO)</MenuItem>
              {activeBatches(adjustTarget).map((b) => (
                <MenuItem key={b.id} value={b.id}>
                  {b.batchNumber} ({b.quantity} units)
                </MenuItem>
              ))}
            </TextField>
          )}
          <TextField
            label="Quantity (use negative to reduce)"
            value={adjQty}
            onChange={(e) => { setAdjQty(e.target.value); setAdjError(''); }}
            type="number"
            fullWidth
            margin="normal"
            helperText={adjQty ? `New stock: ${(adjustTarget?.stock ?? 0) + (parseInt(adjQty, 10) || 0)}` : ''}
          />
          <TextField
            label="Reason"
            value={adjReason}
            onChange={(e) => setAdjReason(e.target.value)}
            fullWidth
            margin="normal"
            multiline
            rows={2}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setAdjustTarget(null)}>Cancel</Button>
          <Button variant="contained" onClick={handleAdjust} loading={adjustMutation.isPending}>
            Apply Adjustment
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
