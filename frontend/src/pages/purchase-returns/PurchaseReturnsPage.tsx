import { useState } from 'react';
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import { useNavigate } from 'react-router-dom';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { PageHeader } from '@/components/common/PageHeader';
import { SearchBar } from '@/components/common/SearchBar';
import { DataTable, type Column } from '@/components/tables/DataTable';
import { useAllPurchaseReturns, useClosePurchaseReturn } from '@/hooks/usePurchaseReturns';
import { getErrorMessage } from '@/services/apiClient';
import { formatCurrency } from '@/utils';
import { showError, showSuccess } from '@/utils/toast';
import type { PurchaseReturn, PurchaseReturnMode, PurchaseReturnSettlement, PurchaseReturnStatus } from '@/types';
import { CreatePurchaseReturnDialog } from './CreatePurchaseReturnDialog';

const MODE_LABELS: Record<PurchaseReturnMode, string> = {
  po_linked: 'PO-linked',
  supplier: 'Supplier',
};

const SETTLEMENT_LABELS: Record<PurchaseReturnSettlement, string> = {
  refund: 'Refund',
  reduce_payable: 'Reduce payable',
  stock_only: 'Stock only',
};

const STATUS_LABELS: Record<string, string> = {
  requested: 'Requested',
  closed: 'Closed',
  confirmed: 'Closed',
};

export function PurchaseReturnsPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [returnMode, setReturnMode] = useState<PurchaseReturnMode | ''>('');
  const [settlementType, setSettlementType] = useState<PurchaseReturnSettlement | ''>('');
  const [statusFilter, setStatusFilter] = useState<PurchaseReturnStatus | ''>('');
  const [createOpen, setCreateOpen] = useState(false);
  const [detail, setDetail] = useState<PurchaseReturn | null>(null);
  const [closeTarget, setCloseTarget] = useState<PurchaseReturn | null>(null);
  const closeMutation = useClosePurchaseReturn();

  const resetFilters = () => {
    setSearch('');
    setReturnMode('');
    setSettlementType('');
    setStatusFilter('');
    setPage(0);
  };

  const { data, isLoading } = useAllPurchaseReturns({
    search: search || undefined,
    returnMode: returnMode || undefined,
    settlementType: settlementType || undefined,
    status: statusFilter || undefined,
    page: page + 1,
    pageSize: 25,
  });
  const rows = data?.data ?? [];
  const total = data?.total ?? 0;

  const confirmClose = async () => {
    if (!closeTarget) return;
    try {
      await closeMutation.mutateAsync(closeTarget.id);
      showSuccess(`Payment received. ${closeTarget.returnNumber} is closed.`);
      setCloseTarget(null);
      setDetail((current) =>
        current?.id === closeTarget.id ? { ...current, status: 'closed' } : current,
      );
    } catch (err) {
      showError(getErrorMessage(err));
    }
  };

  const columns: Column<PurchaseReturn>[] = [
    {
      id: 'sn',
      label: 'SN',
      align: 'center',
      minWidth: 48,
      render: (row) => rows.findIndex((r) => r.id === row.id) + 1 + page * 25,
    },
    { id: 'returnNumber', label: 'Return #', minWidth: 120, accessor: 'returnNumber' },
    { id: 'returnDate', label: 'Date', minWidth: 110, accessor: 'returnDate' },
    {
      id: 'status',
      label: 'Status',
      render: (row) => (
        <Chip
          size="small"
          label={STATUS_LABELS[row.status] ?? row.status}
          color={row.status === 'requested' ? 'warning' : 'success'}
          variant="outlined"
        />
      ),
    },
    {
      id: 'mode',
      label: 'Mode',
      render: (row) => (
        <Chip
          size="small"
          label={MODE_LABELS[row.returnMode] ?? row.returnMode}
          color={row.returnMode === 'po_linked' ? 'primary' : 'default'}
          variant="outlined"
        />
      ),
    },
    { id: 'supplier', label: 'Supplier', accessor: 'supplierName', minWidth: 140 },
    {
      id: 'po',
      label: 'PO #',
      render: (row) => row.orderNumber || '—',
    },
    {
      id: 'settlement',
      label: 'Settlement',
      render: (row) => SETTLEMENT_LABELS[row.settlementType] ?? row.settlementType,
    },
    {
      id: 'reason',
      label: 'Reason',
      render: (row) => row.reason.replace(/_/g, ' '),
    },
    {
      id: 'total',
      label: 'Total',
      align: 'right',
      render: (row) => formatCurrency(row.totalAmount),
    },
    { id: 'createdBy', label: 'By', accessor: 'createdBy' },
    {
      id: 'action',
      label: '',
      render: (row) =>
        row.status === 'requested' && row.settlementType === 'refund' ? (
          <Button
            size="small"
            variant="outlined"
            onClick={(e) => {
              e.stopPropagation();
              setCloseTarget(row);
            }}
          >
            Payment received
          </Button>
        ) : null,
    },
  ];

  return (
    <Box>
      <PageHeader
        title="Purchase Returns"
        breadcrumbs={[{ label: 'Purchase Returns' }]}
        action={
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreateOpen(true)}>
            Create return
          </Button>
        }
      />

      <Paper sx={{ p: 2, mb: 2 }}>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, alignItems: 'center' }}>
          <SearchBar
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(0);
            }}
            placeholder="Search return #, supplier, PO…"
          />
          <TextField
            select
            size="small"
            label="Status"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as PurchaseReturnStatus | '');
              setPage(0);
            }}
            sx={{ minWidth: 140 }}
          >
            <MenuItem value="">All</MenuItem>
            <MenuItem value="requested">Requested</MenuItem>
            <MenuItem value="closed">Closed</MenuItem>
          </TextField>
          <TextField
            select
            size="small"
            label="Mode"
            value={returnMode}
            onChange={(e) => {
              setReturnMode(e.target.value as PurchaseReturnMode | '');
              setPage(0);
            }}
            sx={{ minWidth: 140 }}
          >
            <MenuItem value="">All</MenuItem>
            <MenuItem value="po_linked">PO-linked</MenuItem>
            <MenuItem value="supplier">Supplier</MenuItem>
          </TextField>
          <TextField
            select
            size="small"
            label="Settlement"
            value={settlementType}
            onChange={(e) => {
              setSettlementType(e.target.value as PurchaseReturnSettlement | '');
              setPage(0);
            }}
            sx={{ minWidth: 160 }}
          >
            <MenuItem value="">All</MenuItem>
            <MenuItem value="refund">Refund</MenuItem>
            <MenuItem value="reduce_payable">Reduce payable</MenuItem>
            <MenuItem value="stock_only">Stock only</MenuItem>
          </TextField>
          <Button startIcon={<RestartAltIcon />} onClick={resetFilters}>
            Reset
          </Button>
        </Box>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
          {total} return{total === 1 ? '' : 's'}
        </Typography>
      </Paper>

      <DataTable
        columns={columns}
        rows={rows}
        loading={isLoading}
        getRowId={(r) => r.id}
        page={page}
        onPageChange={setPage}
        total={total}
        pageSize={25}
        onRowClick={setDetail}
        emptyMessage="No purchase returns yet"
      />

      <CreatePurchaseReturnDialog open={createOpen} onClose={() => setCreateOpen(false)} />

      <Dialog open={Boolean(detail)} onClose={() => setDetail(null)} maxWidth="sm" fullWidth>
        <DialogTitle>{detail?.returnNumber}</DialogTitle>
        <DialogContent dividers>
          {detail && (
            <>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                {STATUS_LABELS[detail.status] ?? detail.status} · {SETTLEMENT_LABELS[detail.settlementType]} ·{' '}
                {detail.supplierName}
                {detail.orderNumber ? ` · ${detail.orderNumber}` : ''}
              </Typography>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Product</TableCell>
                    <TableCell align="right">Qty</TableCell>
                    <TableCell align="right">Line total</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {detail.items.map((item) => (
                    <TableRow key={item.productId}>
                      <TableCell>{item.productName}</TableCell>
                      <TableCell align="right">{item.returnQty}</TableCell>
                      <TableCell align="right">{formatCurrency(item.lineTotal)}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow>
                    <TableCell colSpan={2} align="right">
                      <Typography variant="subtitle2">Total</Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="subtitle2">{formatCurrency(detail.totalAmount)}</Typography>
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </>
          )}
        </DialogContent>
        <DialogActions>
          {detail?.purchaseOrderId ? (
            <Button onClick={() => navigate(`/purchase-orders/${detail.purchaseOrderId}`)}>Open PO</Button>
          ) : detail?.supplierId ? (
            <Button onClick={() => navigate(`/suppliers/${detail.supplierId}`)}>Open supplier</Button>
          ) : null}
          {detail?.status === 'requested' && detail.settlementType === 'refund' && (
            <Button variant="contained" onClick={() => setCloseTarget(detail)}>
              Payment received
            </Button>
          )}
          <Button onClick={() => setDetail(null)}>Close</Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={Boolean(closeTarget)}
        title="Confirm payment received"
        message={
          closeTarget
            ? `Record ${formatCurrency(closeTarget.totalAmount)} as received and close ${closeTarget.returnNumber}? Stock already left inventory when this return was requested.`
            : ''
        }
        confirmLabel="Close return"
        loading={closeMutation.isPending}
        onConfirm={() => void confirmClose()}
        onCancel={() => setCloseTarget(null)}
      />
    </Box>
  );
}
