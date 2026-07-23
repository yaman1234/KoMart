import { useCallback, useState } from 'react';
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
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import AddBoxIcon from '@mui/icons-material/AddBox';
import TuneIcon from '@mui/icons-material/Tune';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { Link as RouterLink, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/common/PageHeader';
import { StatCard } from '@/components/common/StatCard';
import { DataTable, type Column } from '@/components/tables/DataTable';
import { ReceiveStockDialog } from '@/components/inventory/ReceiveStockDialog';
import { AdjustStockDialog } from '@/components/inventory/AdjustStockDialog';
import {
  useInventoryItem,
  useAdjustStock,
  useReceiveBatch,
} from '@/hooks/useInventory';
import { useSuppliers } from '@/hooks/useSuppliers';
import { MovementLedgerTab } from './MovementLedgerTab';
import { useAuthStore } from '@/store';
import { formatCurrency, formatExpiryDate } from '@/utils';
import { formatStockQty } from '@/utils/uomDisplay';
import { showApiError, showSuccess } from '@/utils/toast';
import type { InventoryBatch } from '@/types';
import { useFormatDate } from '@/hooks/useFormatDate';
import { DROPDOWN_PAGE_SIZE } from '@/constants';

type DetailTab = 'batches' | 'ledger';

function parseDetailTab(raw: string | null): DetailTab {
  return raw === 'ledger' ? 'ledger' : 'batches';
}

export function InventoryDetailPage() {
  const { productId } = useParams<{ productId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const currentUser = useAuthStore((s) => s.user);
  const canManage = currentUser?.role === 'admin' || currentUser?.role === 'manager';
  const formatDate = useFormatDate();

  const tab = parseDetailTab(searchParams.get('tab'));
  const setTab = useCallback((next: DetailTab) => {
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev);
      if (next === 'batches') params.delete('tab');
      else params.set('tab', next);
      return params;
    }, { replace: true });
  }, [setSearchParams]);

  const { data: item, isLoading, isError } = useInventoryItem(productId ?? '');
  const { data: suppliersData } = useSuppliers({ pageSize: DROPDOWN_PAGE_SIZE });
  const suppliers = suppliersData?.data ?? [];

  const adjustMutation = useAdjustStock();
  const receiveMutation = useReceiveBatch();

  const [receiveOpen, setReceiveOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);

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
      render: (row) => (row.expiryDate ? formatExpiryDate(row.expiryDate) : '—'),
    },
    {
      id: 'received',
      label: 'Received',
      render: (row) => formatDate(row.receivedAt),
    },
  ];

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
              <Button
                size="small"
                variant="contained"
                color="success"
                startIcon={<AddBoxIcon />}
                onClick={() => setReceiveOpen(true)}
              >
                Add stock
              </Button>
            )}
            {canManage && (
              <Button
                size="small"
                variant="outlined"
                startIcon={<TuneIcon />}
                onClick={() => setAdjustOpen(true)}
              >
                Correct stock
              </Button>
            )}
            <Button size="small" startIcon={<ArrowBackIcon />} onClick={() => navigate('/inventory')}>
              Back
            </Button>
          </Box>
        }
      />

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 6, sm: 3 }}>
          <StatCard
            title="Current Stock"
            value={formatStockQty(item.stock, item.uom ?? '')}
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
            value={item.nearestExpiry ? formatExpiryDate(item.nearestExpiry) : '—'}
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

      <ReceiveStockDialog
        open={receiveOpen}
        item={item}
        suppliers={suppliers}
        loading={receiveMutation.isPending}
        onClose={() => setReceiveOpen(false)}
        onSubmit={(payload) => {
          receiveMutation.mutate(payload, {
            onSuccess: () => {
              showSuccess('Stock received.');
              setReceiveOpen(false);
            },
            onError: (err) => showApiError(err, 'Inventory receive failed.'),
          });
        }}
      />

      <AdjustStockDialog
        open={adjustOpen}
        item={item}
        createdBy={currentUser?.name ?? 'User'}
        loading={adjustMutation.isPending}
        onClose={() => setAdjustOpen(false)}
        onSubmit={(payload) => {
          adjustMutation.mutate(payload, {
            onSuccess: () => {
              showSuccess('Stock corrected.');
              setAdjustOpen(false);
            },
            onError: (err) => showApiError(err, 'Inventory update failed.'),
          });
        }}
      />
    </Box>
  );
}
