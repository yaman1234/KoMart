import { useEffect, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  MenuItem,
  Paper,
  TextField,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { NepaliAwareDatePicker } from '@/components/common/NepaliAwareDatePicker';
import { PageHeader } from '@/components/common/PageHeader';
import { StatCard } from '@/components/common/StatCard';
import { SearchBar } from '@/components/common/SearchBar';
import { DataTable, type Column } from '@/components/tables/DataTable';
import {
  useAllPurchaseReturns,
  useClosePurchaseReturn,
  usePurchaseReturnSummary,
  useWriteOffPurchaseReturn,
} from '@/hooks/usePurchaseReturns';
import { purchaseReturnService } from '@/services';
import { getErrorMessage } from '@/services/apiClient';
import { formatCurrency } from '@/utils';
import { showError, showSuccess } from '@/utils/toast';
import type { PurchaseReturn, PurchaseReturnMode, PurchaseReturnSettlement, PurchaseReturnStatus } from '@/types';
import { CreatePurchaseReturnDialog } from './CreatePurchaseReturnDialog';
import { PurchaseReturnDetailDialog } from './PurchaseReturnDetailDialog';

const todayIso = () => new Date().toISOString().slice(0, 10);

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

const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'bank', label: 'Bank' },
  { value: 'esewa', label: 'eSewa' },
] as const;

export function PurchaseReturnsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState(() => searchParams.get('search') || '');
  const [page, setPage] = useState(0);
  const [returnMode, setReturnMode] = useState<PurchaseReturnMode | ''>('');
  const [settlementType, setSettlementType] = useState<PurchaseReturnSettlement | ''>('');
  const [statusFilter, setStatusFilter] = useState<PurchaseReturnStatus | ''>(
    () => (searchParams.get('status') as PurchaseReturnStatus | '') || '',
  );
  const [createOpen, setCreateOpen] = useState(false);
  const [detail, setDetail] = useState<PurchaseReturn | null>(null);
  const [closeTarget, setCloseTarget] = useState<PurchaseReturn | null>(null);
  const [closePaymentMethod, setClosePaymentMethod] = useState('cash');
  const [receiveMode, setReceiveMode] = useState<'full' | 'partial' | 'write_off'>('full');
  const [receiveAmount, setReceiveAmount] = useState('');
  const [receiveRemarks, setReceiveRemarks] = useState('');
  const [receivedDate, setReceivedDate] = useState(todayIso());
  const closeMutation = useClosePurchaseReturn();
  const writeOffMutation = useWriteOffPurchaseReturn();

  const remainingOnClose = closeTarget
    ? Math.max(
        0,
        closeTarget.amountOutstanding ??
          closeTarget.totalAmount -
            (closeTarget.amountReceived ?? 0) -
            (closeTarget.writeOffAmount ?? 0),
      )
    : 0;

  useEffect(() => {
    if (!closeTarget) return;
    const method = (closeTarget.paymentMethod || 'cash').toLowerCase();
    setClosePaymentMethod(
      PAYMENT_METHODS.some((m) => m.value === method) ? method : 'cash',
    );
    setReceiveMode('full');
    setReceiveAmount('');
    setReceiveRemarks('');
    setReceivedDate(todayIso());
  }, [closeTarget]);

  const openDetail = async (row: PurchaseReturn) => {
    setDetail(row);
    try {
      const full = await purchaseReturnService.getById(row.id);
      setDetail(full);
    } catch {
      /* keep list row */
    }
  };

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
    pageSize: 10,
  });
  const { data: summary, isLoading: summaryLoading } = usePurchaseReturnSummary();
  const rows = data?.data ?? [];
  const total = data?.total ?? 0;

  const applyOpenReceivableFilters = () => {
    setStatusFilter('requested');
    setSettlementType('refund');
    setPage(0);
  };

  const confirmClose = async () => {
    if (!closeTarget) return;
    if (receiveMode === 'write_off') {
      if (!receiveRemarks.trim()) {
        showError('Write-off needs a reason note.');
        return;
      }
      try {
        const result = await writeOffMutation.mutateAsync({
          id: closeTarget.id,
          reason: receiveRemarks.trim(),
        });
        showSuccess(`${closeTarget.returnNumber} closed. Remaining receivable written off.`);
        setCloseTarget(null);
        setDetail(result);
      } catch (err) {
        showError(getErrorMessage(err));
      }
      return;
    }

    const payment =
      receiveMode === 'full' ? remainingOnClose : Number(receiveAmount);
    if (!Number.isFinite(payment) || payment <= 0) {
      showError('Enter a payment amount greater than 0.');
      return;
    }
    if (payment > remainingOnClose + 0.001) {
      showError(`Amount cannot exceed remaining ${formatCurrency(remainingOnClose)}.`);
      return;
    }
    try {
      const result = await closeMutation.mutateAsync({
        id: closeTarget.id,
        paymentMethod: closePaymentMethod,
        amountReceived: payment,
        remarks: receiveRemarks.trim() || undefined,
        receivedDate,
      });
      const closed = result.status === 'closed';
      showSuccess(
        closed
          ? `Full refund received. ${closeTarget.returnNumber} closed.`
          : `Partial refund recorded. ${formatCurrency(result.amountOutstanding ?? 0)} still receivable.`,
      );
      setCloseTarget(null);
      setDetail(result);
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
      render: (row) => rows.findIndex((r) => r.id === row.id) + 1 + page * 10,
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
    {
      id: 'receivable',
      label: 'Receivable',
      align: 'right',
      render: (row) => {
        const due =
          row.amountOutstanding ??
          (row.status === 'requested' && row.settlementType === 'refund'
            ? row.totalAmount - (row.amountReceived ?? 0)
            : 0);
        return due > 0 ? formatCurrency(due) : '—';
      },
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
            Record payment
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

      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <StatCard
            title="Open receivable"
            value={formatCurrency(summary?.outstandingReceivable ?? 0)}
            subtitle="Requested refunds"
            loading={summaryLoading}
            gradient={['#fff8e1', '#fde68a']}
            color="#92400e"
            onClick={applyOpenReceivableFilters}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <StatCard
            title="Today refunds received"
            value={formatCurrency(summary?.refundsReceivedToday ?? 0)}
            subtitle="Cash in from returns"
            loading={summaryLoading}
            gradient={['#eff6ff', '#bfdbfe']}
            color="#1d4ed8"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <StatCard
            title="Month refunds received"
            value={formatCurrency(summary?.refundsReceivedMonth ?? 0)}
            subtitle="This calendar month"
            loading={summaryLoading}
            gradient={['#eff6ff', '#dbeafe']}
            color="#2563eb"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <StatCard
            title="Open requests"
            value={summary?.openRequestedCount ?? 0}
            subtitle="Refund returns awaiting payment"
            loading={summaryLoading}
            gradient={['#fef3c7', '#fde68a']}
            color="#b45309"
            onClick={applyOpenReceivableFilters}
          />
        </Grid>
      </Grid>

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
        pageSize={10}
        onRowClick={(row) => void openDetail(row)}
        emptyMessage="No purchase returns yet"
      />

      <CreatePurchaseReturnDialog open={createOpen} onClose={() => setCreateOpen(false)} />

      <PurchaseReturnDetailDialog
        detail={detail}
        onClose={() => setDetail(null)}
        onRecordPayment={(row) => setCloseTarget(row)}
        onOpenAccounts={(row) =>
          navigate(`/accounts?entryType=purchase_return&referenceId=${row.id}`)
        }
        onOpenPo={(row) => navigate(`/purchase-orders/${row.purchaseOrderId}`)}
        onOpenSupplier={(row) => navigate(`/suppliers/${row.supplierId}`)}
      />

      <Dialog
        open={Boolean(closeTarget)}
        onClose={() => setCloseTarget(null)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Record supplier refund</DialogTitle>
        <DialogContent>
          {closeTarget && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
              <Typography variant="body2" color="text.secondary">
                {closeTarget.returnNumber} · {closeTarget.supplierName || 'Supplier'}
                {closeTarget.orderNumber ? ` · ${closeTarget.orderNumber}` : ''}
              </Typography>
              <Typography variant="body2">
                Return total {formatCurrency(closeTarget.totalAmount)}
                {(closeTarget.amountReceived ?? 0) > 0
                  ? ` · already received ${formatCurrency(closeTarget.amountReceived ?? 0)}`
                  : ''}
                {' · '}
                still due {formatCurrency(remainingOnClose)}. Stock already left inventory.
              </Typography>
              <TextField
                select
                fullWidth
                size="small"
                label="What happened"
                value={receiveMode}
                onChange={(e) => {
                  const next = e.target.value as 'full' | 'partial' | 'write_off';
                  setReceiveMode(next);
                  if (next === 'partial' && !receiveAmount) {
                    setReceiveAmount(String(remainingOnClose));
                  }
                }}
              >
                <MenuItem value="full">
                  Supplier paid full remaining ({formatCurrency(remainingOnClose)})
                </MenuItem>
                <MenuItem value="partial">Supplier paid part now — rest still due</MenuItem>
                <MenuItem value="write_off">Supplier will not pay rest — write off</MenuItem>
              </TextField>
              {receiveMode === 'partial' && (
                <TextField
                  fullWidth
                  size="small"
                  type="number"
                  label="Amount received now"
                  value={receiveAmount}
                  onChange={(e) => setReceiveAmount(e.target.value)}
                  helperText={`Max ${formatCurrency(remainingOnClose)}`}
                  slotProps={{ htmlInput: { min: 0.01, max: remainingOnClose, step: 0.01 } }}
                />
              )}
              {receiveMode !== 'write_off' && (
                <>
                  <NepaliAwareDatePicker
                    label="Money received on"
                    value={receivedDate}
                    onChange={(v) => setReceivedDate(v || todayIso())}
                    fullWidth
                    size="small"
                  />
                  <TextField
                    select
                    fullWidth
                    size="small"
                    label="Payment type"
                    value={closePaymentMethod}
                    onChange={(e) => setClosePaymentMethod(e.target.value)}
                  >
                    {PAYMENT_METHODS.map((m) => (
                      <MenuItem key={m.value} value={m.value}>
                        {m.label}
                      </MenuItem>
                    ))}
                  </TextField>
                </>
              )}
              <TextField
                fullWidth
                size="small"
                label={receiveMode === 'write_off' ? 'Write-off reason' : 'Note (optional)'}
                placeholder={
                  receiveMode === 'write_off'
                    ? 'e.g. supplier refused remaining amount'
                    : 'e.g. paid at shop counter / bank deposit'
                }
                value={receiveRemarks}
                onChange={(e) => setReceiveRemarks(e.target.value)}
                required={receiveMode === 'write_off'}
              />
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setCloseTarget(null)}
            disabled={closeMutation.isPending || writeOffMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            color={receiveMode === 'write_off' ? 'warning' : 'primary'}
            onClick={() => void confirmClose()}
            disabled={closeMutation.isPending || writeOffMutation.isPending}
          >
            {receiveMode === 'full'
              ? 'Close return'
              : receiveMode === 'partial'
                ? 'Record partial'
                : 'Write off remaining'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
