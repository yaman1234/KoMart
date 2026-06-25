import { useState } from 'react';
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
  IconButton,
} from '@mui/material';
import TuneIcon from '@mui/icons-material/Tune';
import AddBoxIcon from '@mui/icons-material/AddBox';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { PageHeader } from '@/components/common/PageHeader';
import { SearchBar } from '@/components/common/SearchBar';
import { StatCard } from '@/components/common/StatCard';
import { DataTable, type Column } from '@/components/tables/DataTable';
import { useInventory, useInventoryStats, useAdjustStock, useReceiveBatch } from '@/hooks/useInventory';
import { useSuppliers } from '@/hooks/useSuppliers';
import { formatDate, formatCurrency } from '@/utils';
import { useAuthStore } from '@/store';
import { PRODUCT_CATEGORIES } from '@/constants';
import type { InventoryItem, StockAdjustmentType } from '@/types';
import type { InventoryQueryParams } from '@/services';

type StockFilter = 'all' | 'low' | 'out' | 'expiring';

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
  const currentUser = useAuthStore((s) => s.user);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<StockFilter>('all');
  const [supplierId, setSupplierId] = useState('');
  const [category, setCategory] = useState('');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [expandedItem, setExpandedItem] = useState<InventoryItem | null>(null);

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
  const { data: suppliersData } = useSuppliers({ pageSize: 100 });
  const adjustMutation = useAdjustStock();
  const receiveMutation = useReceiveBatch();

  const suppliers = suppliersData?.data ?? [];

  const items = data?.data ?? [];

  const columns: Column<InventoryItem>[] = [
    {
      id: 'expand',
      label: '',
      render: (row) => (
        <IconButton
          size="small"
          onClick={(e) => {
            e.stopPropagation();
            setExpandedItem(row);
          }}
        >
          <ExpandMoreIcon fontSize="small" />
        </IconButton>
      ),
    },
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
          <Button
            size="small"
            variant="contained"
            color="success"
            startIcon={<AddBoxIcon />}
            onClick={(e) => { e.stopPropagation(); openReceive(row); }}
          >
            Receive
          </Button>
          <Button
            size="small"
            variant="outlined"
            startIcon={<TuneIcon />}
            onClick={(e) => { e.stopPropagation(); openAdjust(row); }}
          >
            Adjust
          </Button>
        </Box>
      ),
    },
  ];

  const openReceive = (item: InventoryItem) => {
    setReceiveTarget(item);
    setRcvBatch(`BATCH-${Date.now()}`);
    setRcvQty('');
    setRcvExpiry('');
    setRcvError('');
  };

  const handleReceive = () => {
    const qty = parseInt(rcvQty, 10);
    if (isNaN(qty) || qty < 1) { setRcvError('Enter a quantity ≥ 1'); return; }
    if (!rcvBatch.trim()) { setRcvError('Batch number is required'); return; }
    if (!receiveTarget) return;
    receiveMutation.mutate(
      {
        productId: receiveTarget.id,
        batchNumber: rcvBatch,
        quantity: qty,
        expiryDate: rcvExpiry || undefined,
      },
      { onSuccess: () => setReceiveTarget(null) },
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
      { onSuccess: () => setAdjustTarget(null) },
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
        getRowId={(r) => r.id}
      />

      <Dialog open={!!expandedItem} onClose={() => setExpandedItem(null)} maxWidth="md" fullWidth>
        <DialogTitle>Batches — {expandedItem?.name}</DialogTitle>
        <DialogContent>
          {!expandedItem?.batches.length && (
            <Typography color="text.secondary">No batches recorded.</Typography>
          )}
          {expandedItem && expandedItem.batches.length > 0 && (
            <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse', mt: 1 }}>
              <Box component="thead">
                <Box component="tr" sx={{ borderBottom: 1, borderColor: 'divider' }}>
                  {['Batch No.', 'Qty', 'Expiry', 'Received'].map((h) => (
                    <Box component="th" key={h} sx={{ textAlign: 'left', py: 1, pr: 2, fontWeight: 600 }}>
                      {h}
                    </Box>
                  ))}
                </Box>
              </Box>
              <Box component="tbody">
                {expandedItem.batches.map((batch) => (
                  <Box
                    component="tr"
                    key={batch.id}
                    sx={{ borderBottom: 1, borderColor: 'divider', opacity: batch.quantity === 0 ? 0.5 : 1 }}
                  >
                    <Box component="td" sx={{ py: 1, pr: 2 }}>{batch.batchNumber}</Box>
                    <Box component="td" sx={{ py: 1, pr: 2 }}>{batch.quantity}</Box>
                    <Box component="td" sx={{ py: 1, pr: 2 }}>
                      {batch.expiryDate ? formatDate(batch.expiryDate) : '—'}
                    </Box>
                    <Box component="td" sx={{ py: 1 }}>{formatDate(batch.receivedAt)}</Box>
                  </Box>
                ))}
              </Box>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setExpandedItem(null)}>Close</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!receiveTarget} onClose={() => setReceiveTarget(null)} maxWidth="xs" fullWidth>
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
            label="Quantity Received"
            value={rcvQty}
            onChange={(e) => { setRcvQty(e.target.value); setRcvError(''); }}
            type="number"
            fullWidth
            margin="normal"
            required
            slotProps={{ htmlInput: { min: 1 } }}
          />
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
