import { useMemo, useState } from 'react';
import {
  Alert,
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
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { DataTable, type Column } from '@/components/tables/DataTable';
import { StatCard } from '@/components/common/StatCard';
import { NepaliAwareDatePicker } from '@/components/common/NepaliAwareDatePicker';
import { useAlignLedger, useInventoryIntegrity, useInventoryMovements, useMovementSummary } from '@/hooks/useInventory';
import { formatAmount, formatDateTime, isAdmin } from '@/utils';
import { useAuthStore } from '@/store';
import { showApiError, showSuccess } from '@/utils/toast';
import type { InventoryMovement, InventoryMovementQueryParams } from '@/types';

interface AlignPreview {
  productId: string;
  onHand: number | null;
  book: number | null;
  lastAfter: number | null;
}

function formatFigure(value: number | null | undefined): string {
  return value == null ? '—' : String(value);
}
import dayjs from 'dayjs';

const MOVEMENT_TYPES: { value: InventoryMovementQueryParams['movementType']; label: string }[] = [
  { value: '', label: 'All Types' },
  { value: 'sale', label: 'Sale' },
  { value: 'void', label: 'Sale void' },
  { value: 'receive', label: 'Stock In' },
  { value: 'purchase_order', label: 'PO Receive' },
  { value: 'purchase_return', label: 'Purchase Return' },
  { value: 'adjustment', label: 'Adjustment' },
  { value: 'damaged', label: 'Damaged / Expired' },
  { value: 'correction', label: 'Correction' },
  { value: 'internal_use', label: 'Store Use / Expense' },
];

interface MovementLedgerTabProps {
  productId?: string;
  hideProductColumn?: boolean;
  onHandStock?: number;
}

export function MovementLedgerTab({ productId, hideProductColumn, onHandStock }: MovementLedgerTabProps) {
  const navigate = useNavigate();
  const currentUser = useAuthStore((s) => s.user);
  const canAlign = isAdmin(currentUser?.role);
  const alignMutation = useAlignLedger();
  const { data: integrity } = useInventoryIntegrity(!productId);
  const [alignReason, setAlignReason] = useState('');
  const [alignPreview, setAlignPreview] = useState<AlignPreview | null>(null);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState('');
  const [direction, setDirection] = useState<'' | 'in' | 'out'>('');
  const [movementType, setMovementType] = useState<InventoryMovementQueryParams['movementType']>('');
  const [startDate, setStartDate] = useState(dayjs().subtract(3, 'month').format('YYYY-MM-DD'));
  const [endDate, setEndDate] = useState(dayjs().format('YYYY-MM-DD'));

  const filterParams = useMemo(
    (): InventoryMovementQueryParams => ({
      page: page + 1,
      pageSize,
      productId: productId || undefined,
      search: productId ? undefined : search || undefined,
      direction: direction || undefined,
      movementType: movementType || undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
    }),
    [page, pageSize, productId, search, direction, movementType, startDate, endDate],
  );

  const summaryParams = useMemo(
    () => {
      const { page: _p, pageSize: _s, ...rest } = filterParams;
      return rest;
    },
    [filterParams],
  );

  const { data, isLoading } = useInventoryMovements(filterParams);
  const { data: summary } = useMovementSummary(summaryParams);
  const onHand = onHandStock ?? summary?.onHand ?? null;
  const ledgerClose = summary?.closingStock ?? null;
  const lastAfter = summary?.lastAfter ?? null;
  const book =
    summary?.variance != null && onHand != null ? onHand - summary.variance : ledgerClose;
  const figuresDisagree =
    (onHand != null && book != null && onHand !== book)
    || (lastAfter != null && book != null && lastAfter !== book)
    || (lastAfter != null && onHand != null && lastAfter !== onHand)
    || (ledgerClose != null && lastAfter != null && ledgerClose !== lastAfter);
  const outOfSyncCount = summary?.outOfSyncCount ?? integrity?.outOfSyncCount ?? 0;

  const openAlign = (preview: AlignPreview) => {
    setAlignPreview(preview);
    setAlignReason('');
  };

  const columns: Column<InventoryMovement>[] = [
    {
      id: 'when',
      label: 'Date',
      minWidth: 160,
      render: (row) => formatDateTime(row.createdAt),
    },
    ...(!hideProductColumn
      ? [{
          id: 'product',
          label: 'Product',
          minWidth: 160,
          render: (row: InventoryMovement) => (
            <Box>
              <Typography variant="body2" sx={{ fontWeight: 500 }}>{row.productName}</Typography>
              <Typography variant="caption" color="text.secondary">{row.productSku}</Typography>
            </Box>
          ),
        }]
      : []),
    {
      id: 'movement',
      label: 'Movement',
      render: (row) => (
        <Chip label={row.movementLabel} size="small" variant="outlined" />
      ),
    },
    {
      id: 'direction',
      label: 'Dir',
      render: (row) => (
        <Chip
          label={row.quantity > 0 ? 'IN' : row.quantity < 0 ? 'OUT' : 'ADJ'}
          size="small"
          color={row.quantity > 0 ? 'success' : row.quantity < 0 ? 'error' : 'default'}
        />
      ),
    },
    {
      id: 'qty',
      label: 'Qty',
      align: 'right',
      render: (row) => (
        <Typography
          component="span"
          sx={{ fontWeight: 700, color: row.quantity >= 0 ? 'success.main' : 'error.main' }}
        >
          {row.quantity >= 0 ? `+${row.quantity}` : row.quantity}
        </Typography>
      ),
    },
    {
      id: 'cost',
      label: 'Cost',
      align: 'right',
      render: (row) => (
        row.extendedCost
          ? formatAmount(row.extendedCost)
          : row.unitCost
            ? formatAmount(row.unitCost)
            : '—'
      ),
    },
    { id: 'before', label: 'Before', align: 'right', render: (row) => row.stockBefore },
    { id: 'after', label: 'After', align: 'right', render: (row) => row.stockAfter },
    {
      id: 'reference',
      label: 'Reference',
      minWidth: 140,
      render: (row) => {
        if (row.referenceType === 'sale' && row.referenceId) {
          return (
            <Button
              onClick={() => window.open(`/sales/${row.referenceId}`, '_blank')}
              size="small"
              variant="text"
              sx={{ textTransform: 'none', p: 0, minWidth: 0, cursor: 'pointer' }}
            >
              {row.transactionNumber || row.referenceLabel}
            </Button>
          );
        }
        if (row.referenceType === 'purchase_order' && row.referenceId) {
          return (
            <Button
              onClick={() => window.open(`/purchase-orders/${row.referenceId}`, '_blank')}
              size="small"
              variant="text"
              sx={{ textTransform: 'none', p: 0, minWidth: 0, cursor: 'pointer' }}
            >
              {row.referenceLabel || 'PO'}
            </Button>
          );
        }
        if (row.referenceType === 'purchase_return' && row.referenceId) {
          const label = row.referenceLabel || 'Return';
          return (
            <Button
              onClick={() =>
                window.open(
                  `/purchase-returns?search=${encodeURIComponent(label)}`,
                  '_blank',
                )
              }
              size="small"
              variant="text"
              sx={{ textTransform: 'none', p: 0, minWidth: 0, cursor: 'pointer' }}
            >
              {label}
            </Button>
          );
        }
        if (row.referenceType === 'expense' && row.referenceId) {
          const label = row.referenceLabel || 'Expense';
          return (
            <Button
              onClick={() =>
                window.open(
                  `/expenses?search=${encodeURIComponent(label)}`,
                  '_blank',
                )
              }
              size="small"
              variant="text"
              sx={{ textTransform: 'none', p: 0, minWidth: 0, cursor: 'pointer', fontWeight: 600 }}
            >
              {label}
            </Button>
          );
        }
        return row.referenceLabel || '—';
      },
    },
    { id: 'by', label: 'By', render: (row) => row.createdBy },
    { id: 'reason', label: 'Reason', minWidth: 140, render: (row) => row.reason },
  ];

  return (
    <Box>
      <Grid container spacing={2} sx={{ mb: 2 }}>
        {productId ? (
          <>
            <Grid size={{ xs: 6, sm: 3 }}>
              <StatCard
                title="Opening"
                value={summary?.openingStock ?? '—'}
                gradient={['#f0f9ff', '#bae6fd']}
                color="#0369a1"
                subtitle="From the ledger, not leftover batches"
              />
            </Grid>
            <Grid size={{ xs: 6, sm: 3 }}>
              <StatCard
                title="In"
                value={summary?.periodIn ?? summary?.totalIn ?? '—'}
                gradient={['#d4f5e9', '#a8e6cf']}
                color="#1b7a4e"
                subtitle="In the selected dates"
              />
            </Grid>
            <Grid size={{ xs: 6, sm: 3 }}>
              <StatCard
                title="Out"
                value={summary?.periodOut ?? summary?.totalOut ?? '—'}
                gradient={['#fff1f2', '#fecdd3']}
                color="#be123c"
                subtitle="In the selected dates"
              />
            </Grid>
            <Grid size={{ xs: 6, sm: 3 }}>
              <StatCard
                title="Ledger close"
                value={ledgerClose ?? '—'}
                gradient={['#fef9c3', '#fde68a']}
                color="#92400e"
                subtitle={
                  lastAfter != null && ledgerClose != null && lastAfter !== ledgerClose
                    ? `Opening + In − Out · last After ${lastAfter}`
                    : 'Opening + In − Out'
                }
              />
            </Grid>
          </>
        ) : (
          <>
            <Grid size={{ xs: 6, sm: 3 }}>
              <StatCard title="Movements" value={summary?.movementCount ?? '—'} gradient={['#f0f9ff', '#bae6fd']} color="#0369a1" />
            </Grid>
            <Grid size={{ xs: 6, sm: 3 }}>
              <StatCard title="Total In" value={summary?.totalIn ?? '—'} gradient={['#d4f5e9', '#a8e6cf']} color="#1b7a4e" />
            </Grid>
            <Grid size={{ xs: 6, sm: 3 }}>
              <StatCard title="Total Out" value={summary?.totalOut ?? '—'} gradient={['#fff1f2', '#fecdd3']} color="#be123c" />
            </Grid>
            <Grid size={{ xs: 6, sm: 3 }}>
              <StatCard
                title="SKUs out of sync"
                value={outOfSyncCount}
                gradient={outOfSyncCount > 0 ? ['#fff1f2', '#fecdd3'] : ['#d4f5e9', '#a8e6cf']}
                color={outOfSyncCount > 0 ? '#be123c' : '#1b7a4e'}
                subtitle="Current, book, or last After disagree"
              />
            </Grid>
          </>
        )}
      </Grid>
      {productId && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Ledger close = Opening + In − Out for the selected dates. Current Stock is the batch total.
        </Typography>
      )}
      {productId && figuresDisagree && (
        <Alert
          severity="error"
          sx={{ mb: 2 }}
          action={
            canAlign ? (
              <Button
                color="inherit"
                size="small"
                variant="outlined"
                onClick={() => openAlign({ productId, onHand, book, lastAfter })}
              >
                Align ledger to {onHand ?? 'stock'}
              </Button>
            ) : undefined
          }
        >
          Current stock {formatFigure(onHand)}, ledger book {formatFigure(book)}, last After {formatFigure(lastAfter)}.
          {ledgerClose != null && book != null && ledgerClose !== book
            ? ` This date range closes at ${ledgerClose}.`
            : ''}
          {' '}
          Align writes one diary line and does not change Current stock.
        </Alert>
      )}
      {!productId && outOfSyncCount > 0 && (
        <Box sx={{ mb: 2 }}>
          <Alert severity="error" sx={{ mb: 1 }}>
            {outOfSyncCount} SKU{outOfSyncCount === 1 ? '' : 's'} where Current stock, ledger book,
            or last After do not agree. Align writes one diary line and does not change shelf quantity.
            {!canAlign && ' An admin has to apply it.'}
          </Alert>
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Product</TableCell>
                  <TableCell align="right">Current</TableCell>
                  <TableCell align="right">Book</TableCell>
                  <TableCell align="right">Last After</TableCell>
                  {canAlign && <TableCell align="right" />}
                </TableRow>
              </TableHead>
              <TableBody>
                {(integrity?.data ?? []).map((row) => {
                  const label = [row.productName, row.productSku].filter(Boolean).join(' · ')
                    || row.productId
                    || 'Unknown product';
                  return (
                    <TableRow key={row.productId} hover>
                      <TableCell>
                        <Button
                          size="small"
                          variant="text"
                          sx={{ textTransform: 'none', minWidth: 0, p: 0, fontWeight: 600 }}
                          onClick={() => navigate(`/inventory/${row.productId}?tab=ledger`)}
                        >
                          {label}
                        </Button>
                      </TableCell>
                      <TableCell align="right">{row.onHand}</TableCell>
                      <TableCell align="right">{row.ledgerClose}</TableCell>
                      <TableCell align="right">{formatFigure(row.lastAfter)}</TableCell>
                      {canAlign && (
                        <TableCell align="right">
                          <Button
                            size="small"
                            variant="outlined"
                            onClick={() => openAlign({
                              productId: row.productId,
                              onHand: row.onHand,
                              book: row.ledgerClose,
                              lastAfter: row.lastAfter ?? null,
                            })}
                          >
                            Align
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
          {outOfSyncCount > (integrity?.data?.length ?? 0) && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
              Showing {integrity?.data?.length ?? 0} of {outOfSyncCount}.
            </Typography>
          )}
        </Box>
      )}

      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Grid container spacing={2} sx={{ alignItems: 'center' }}>
          {!productId && (
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <TextField
                fullWidth
                size="small"
                label="Search product"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(0); }}
                placeholder="Name or SKU"
              />
            </Grid>
          )}
          <Grid size={{ xs: 6, sm: 4, md: 2 }}>
            <TextField
              select
              fullWidth
              size="small"
              label="Direction"
              value={direction}
              onChange={(e) => { setDirection(e.target.value as '' | 'in' | 'out'); setPage(0); }}
            >
              <MenuItem value="">All</MenuItem>
              <MenuItem value="in">Stock In</MenuItem>
              <MenuItem value="out">Stock Out</MenuItem>
            </TextField>
          </Grid>
          <Grid size={{ xs: 6, sm: 4, md: 2 }}>
            <TextField
              select
              fullWidth
              size="small"
              label="Type"
              value={movementType ?? ''}
              onChange={(e) => {
                setMovementType(e.target.value as InventoryMovementQueryParams['movementType']);
                setPage(0);
              }}
            >
              {MOVEMENT_TYPES.map((t) => (
                <MenuItem key={t.value ?? 'all'} value={t.value ?? ''}>{t.label}</MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid size={{ xs: 6, sm: 4, md: 2 }}>
            <NepaliAwareDatePicker
              label="From"
              value={startDate}
              onChange={(d) => { setStartDate(d); setPage(0); }}
              size="small"
              fullWidth
            />
          </Grid>
          <Grid size={{ xs: 6, sm: 4, md: 2 }}>
            <NepaliAwareDatePicker
              label="To"
              value={endDate}
              onChange={(d) => { setEndDate(d); setPage(0); }}
              size="small"
              fullWidth
            />
          </Grid>
        </Grid>
      </Paper>

      <DataTable
        columns={columns}
        rows={data?.data ?? []}
        loading={isLoading}
        page={page}
        pageSize={pageSize}
        total={data?.total}
        onPageChange={setPage}
        onPageSizeChange={(size) => { setPageSize(size); setPage(0); }}
        getRowId={(r) => r.id}
        onRowClick={(row) => {
          if (!productId) {
            navigate(`/inventory/${row.productId}`);
          }
        }}
        emptyMessage="No inventory movements in this period"
      />

      <Dialog
        open={alignPreview != null}
        onClose={() => setAlignPreview(null)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Align ledger to Current Stock</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 1 }}>
            Current stock {formatFigure(alignPreview?.onHand)}
            {' · '}
            ledger book {formatFigure(alignPreview?.book)}
            {' · '}
            last After {formatFigure(alignPreview?.lastAfter)}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            After align, all three read {formatFigure(alignPreview?.onHand)}. Shelf quantity stays{' '}
            {formatFigure(alignPreview?.onHand)}. A reason is stored on the diary line and in the audit log.
          </Typography>
          <TextField
            label="Reason"
            value={alignReason}
            onChange={(e) => setAlignReason(e.target.value)}
            fullWidth
            required
            multiline
            rows={2}
            autoFocus
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setAlignPreview(null)}>Cancel</Button>
          <Button
            variant="contained"
            disabled={!alignReason.trim() || !alignPreview}
            loading={alignMutation.isPending}
            onClick={() => {
              if (!alignPreview || !alignReason.trim()) return;
              alignMutation.mutate(
                { productId: alignPreview.productId, reason: alignReason.trim() },
                {
                  onSuccess: () => {
                    showSuccess('Ledger aligned to Current Stock.');
                    setAlignPreview(null);
                    setAlignReason('');
                  },
                  onError: (err) => showApiError(err, 'Could not align ledger.'),
                },
              );
            }}
          >
            Align ledger
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
