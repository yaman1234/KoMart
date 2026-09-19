import { useState, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Box,
  Button,
  Chip,
  Grid,
  Paper,
  Tab,
  Tabs,
  Typography,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  Alert,
  LinearProgress,
  Tooltip,
  IconButton,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/common/PageHeader';
import { StatCard } from '@/components/common/StatCard';
import { DataTable, type Column } from '@/components/tables/DataTable';
import { stockCountService } from '@/services';
import { formatCurrency } from '@/utils';
import { showApiError, showSuccess } from '@/utils/toast';
import { QUERY_KEYS } from '@/constants';
import { useAuthStore } from '@/store';
import type { StockCountItem, StockCountStatus } from '@/types';

const STATUS_LABELS: Record<StockCountStatus, string> = {
  draft: 'Draft', counting: 'Counting', submitted: 'Submitted',
  under_review: 'Under Review', recount_required: 'Recount Required',
  approved: 'Approved', completed: 'Completed', cancelled: 'Cancelled',
};
const STATUS_COLORS: Record<StockCountStatus, 'default' | 'info' | 'warning' | 'success' | 'error' | 'primary'> = {
  draft: 'default', counting: 'info', submitted: 'primary',
  under_review: 'warning', recount_required: 'warning',
  approved: 'success', completed: 'success', cancelled: 'error',
};

const SHORTAGE_REASONS = ['Counting Error', 'Damaged', 'Expired', 'Theft/Loss', 'Unrecorded Sale', 'Internal Consumption', 'Other'];
const EXCESS_REASONS = ['Counting Error', 'Purchase Not Recorded', 'Transfer Not Recorded', 'Return Not Recorded', 'Previous Adjustment Error', 'Other'];

type VarianceFilter = 'all' | 'matched' | 'short' | 'excess' | 'uncounted';

function applyVarianceFilter(item: StockCountItem, filter: VarianceFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'uncounted') return item.physicalQty === null;
  if (item.physicalQty === null) return false;
  const v = item.varianceQty ?? 0;
  if (filter === 'matched') return v === 0;
  if (filter === 'short') return v < 0;
  if (filter === 'excess') return v > 0;
  return true;
}

export function StockCountDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const currentUser = useAuthStore((s) => s.user);
  const isManager = currentUser?.role === 'admin' || currentUser?.role === 'manager';

  const [tab, setTab] = useState(0);
  const [vFilter, setVFilter] = useState<VarianceFilter>('all');
  const [reasonDialog, setReasonDialog] = useState<StockCountItem | null>(null);
  const [reason, setReason] = useState('');
  const [reasonNote, setReasonNote] = useState('');
  const [finalQty, setFinalQty] = useState<string>('');
  const [confirmDialog, setConfirmDialog] = useState<'submit' | 'approve' | 'cancel' | 'recount' | null>(null);
  const [confirmNote, setConfirmNote] = useState('');

  const { data: sc, isLoading } = useQuery({
    queryKey: QUERY_KEYS.stockCount(id!),
    queryFn: () => stockCountService.getById(id!),
    enabled: !!id,
    refetchInterval: (q) => {
      const s = q.state.data?.status;
      return s === 'counting' || s === 'recount_required' ? 10000 : false;
    },
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: QUERY_KEYS.stockCount(id!) });
    void qc.invalidateQueries({ queryKey: QUERY_KEYS.stockCounts });
  };

  const submitMutation = useMutation({
    mutationFn: () => stockCountService.submit(id!),
    onSuccess: () => { showSuccess('Count submitted for review.'); invalidate(); setConfirmDialog(null); },
    onError: (err) => showApiError(err, 'Submit failed.'),
  });
  const approveMutation = useMutation({
    mutationFn: () => stockCountService.approve(id!, confirmNote),
    onSuccess: () => { showSuccess('Count approved. Stock adjustments created.'); invalidate(); setConfirmDialog(null); },
    onError: (err) => showApiError(err, 'Approval failed.'),
  });
  const cancelMutation = useMutation({
    mutationFn: () => stockCountService.cancel(id!, confirmNote),
    onSuccess: () => { showSuccess('Count cancelled.'); invalidate(); setConfirmDialog(null); },
    onError: (err) => showApiError(err, 'Cancel failed.'),
  });
  const recountMutation = useMutation({
    mutationFn: () => stockCountService.requestRecount(id!, confirmNote),
    onSuccess: () => { showSuccess('Recount requested.'); invalidate(); setConfirmDialog(null); },
    onError: (err) => showApiError(err, 'Failed to request recount.'),
  });
  const reasonMutation = useMutation({
    mutationFn: () =>
      stockCountService.setVarianceReason(
        id!,
        reasonDialog!.productId,
        reason,
        reasonNote,
        finalQty !== '' ? Number(finalQty) : undefined,
      ),
    onSuccess: () => { showSuccess('Reason saved.'); invalidate(); setReasonDialog(null); },
    onError: (err) => showApiError(err, 'Failed to save reason.'),
  });

  const filteredItems = useMemo(
    () => (sc?.items ?? []).filter((i) => applyVarianceFilter(i, vFilter)),
    [sc, vFilter],
  );

  const isBlind = sc?.countMode === 'blind';
  const canCount = sc?.status === 'counting' || sc?.status === 'recount_required';
  const canSubmit = sc?.status === 'counting';
  const canApprove = isManager && (sc?.status === 'submitted' || sc?.status === 'under_review');
  const canRecount = isManager && (sc?.status === 'submitted' || sc?.status === 'under_review');
  const canCancel = sc?.status !== 'completed' && sc?.status !== 'cancelled' && !sc?.adjustmentId;

  const showSystemQty = !isBlind || isManager
    || sc?.status === 'submitted' || sc?.status === 'under_review'
    || sc?.status === 'completed' || sc?.status === 'approved';

  const showVariance = isManager || sc?.status !== 'counting';

  const columns: Column<StockCountItem>[] = [
    { id: 'productName', label: 'Product', accessor: 'productName', minWidth: 180 },
    { id: 'sku', label: 'SKU', accessor: 'sku', minWidth: 110 },
    { id: 'category', label: 'Category', accessor: 'category' },
    { id: 'uom', label: 'Unit', accessor: 'uom' },
    ...(showSystemQty
      ? [{
          id: 'snapshotQty',
          label: 'System Qty',
          align: 'right' as const,
          render: (row: StockCountItem) =>
            row.snapshotQty === -1
              ? <Typography variant="body2" sx={{ color: 'text.disabled' }}>Hidden</Typography>
              : row.snapshotQty,
        }]
      : []),
    {
      id: 'physicalQty',
      label: 'Physical Qty',
      align: 'right' as const,
      render: (row: StockCountItem) =>
        row.physicalQty !== null ? (
          <Typography variant="body2" sx={{ fontWeight: 600 }}>{row.physicalQty}</Typography>
        ) : (
          <Typography variant="body2" sx={{ color: 'text.disabled' }}>—</Typography>
        ),
    },
    ...(showVariance
      ? [
          {
            id: 'varianceQty',
            label: 'Variance',
            align: 'right' as const,
            render: (row: StockCountItem) => {
              if (row.varianceQty === null) return '—';
              const v = row.varianceQty;
              const color = v < 0 ? 'error.main' : v > 0 ? 'warning.main' : 'success.main';
              return (
                <Typography variant="body2" sx={{ fontWeight: 600, color }}>
                  {v > 0 ? `+${v}` : v}
                </Typography>
              );
            },
          },
          {
            id: 'varianceValue',
            label: 'Variance Value',
            align: 'right' as const,
            render: (row: StockCountItem) => {
              if (row.varianceValue === null) return '—';
              const v = row.varianceValue;
              const color = v < 0 ? 'error.main' : v > 0 ? 'warning.main' : 'text.secondary';
              return (
                <Typography variant="body2" sx={{ color }}>
                  {v > 0 ? '+' : ''}{formatCurrency(v)}
                </Typography>
              );
            },
          },
        ]
      : []),
    {
      id: 'varianceStatus',
      label: 'Status',
      render: (row: StockCountItem) => {
        if (row.physicalQty === null) return <Chip label="Uncounted" size="small" />;
        const v = row.varianceQty ?? 0;
        if (v === 0) return <Chip label="Matched" size="small" color="success" />;
        if (v < 0) return <Chip label="Short" size="small" color="error" />;
        return <Chip label="Excess" size="small" color="warning" />;
      },
    },
    ...(isManager && (sc?.status === 'submitted' || sc?.status === 'under_review' || sc?.status === 'recount_required')
      ? [{
          id: 'reason',
          label: 'Reason',
          render: (row: StockCountItem) => (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Typography variant="body2">{row.reason || '—'}</Typography>
              {row.varianceQty !== 0 && row.varianceQty !== null && (
                <Tooltip title="Set reason">
                  <IconButton
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation();
                      setReasonDialog(row);
                      setReason(row.reason || '');
                      setReasonNote(row.reasonNote || '');
                      setFinalQty(row.finalQty !== null ? String(row.finalQty) : '');
                    }}
                  >
                    <EditIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              )}
            </Box>
          ),
        }]
      : []),
  ];

  if (isLoading || !sc) return <LinearProgress />;

  const progress = sc.totalProducts > 0 ? (sc.countedProducts / sc.totalProducts) * 100 : 0;

  return (
    <Box>
      <PageHeader
        title={sc.countNumber}
        subtitle={`${STATUS_LABELS[sc.status]} · ${sc.countType === 'full' ? 'Full Count' : sc.countType} · ${sc.countMode === 'blind' ? 'Blind' : 'Assisted'} Mode`}
        action={
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            {canCount && (
              <Button variant="contained" onClick={() => navigate(`/stock-count/${id}/count`)}>
                {sc.status === 'recount_required' ? 'Continue Recount' : 'Continue Counting'}
              </Button>
            )}
            {canSubmit && (
              <Button variant="outlined" color="primary" onClick={() => setConfirmDialog('submit')}>
                Submit
              </Button>
            )}
            {canRecount && (
              <Button variant="outlined" color="warning" onClick={() => setConfirmDialog('recount')}>
                Request Recount
              </Button>
            )}
            {canApprove && (
              <Button variant="contained" color="success" onClick={() => setConfirmDialog('approve')}>
                Approve & Adjust Stock
              </Button>
            )}
            {canCancel && (
              <Button variant="outlined" color="error" onClick={() => setConfirmDialog('cancel')}>
                Cancel
              </Button>
            )}
          </Box>
        }
      />

      <Paper sx={{ p: 2, mb: 3, display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
        <Chip label={STATUS_LABELS[sc.status]} color={STATUS_COLORS[sc.status]} />
        <Box sx={{ flex: 1, minWidth: 200 }}>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            Progress: {sc.countedProducts} / {sc.totalProducts} products
          </Typography>
          <LinearProgress variant="determinate" value={progress} sx={{ height: 8, borderRadius: 4 }} />
        </Box>
        <Typography variant="body2" color="text.secondary">{progress.toFixed(0)}%</Typography>
        {sc.adjustmentId && (
          <Chip label={`Adj: ${sc.adjustmentId}`} size="small" variant="outlined" color="success" />
        )}
      </Paper>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        {[
          { title: 'Total Products', value: sc.totalProducts, filter: 'all' as VarianceFilter },
          { title: 'Counted', value: sc.countedProducts, filter: 'all' as VarianceFilter },
          { title: 'Matched', value: sc.matchedCount, color: 'success.main', filter: 'matched' as VarianceFilter },
          { title: 'Short', value: sc.shortCount, color: 'error.main', filter: 'short' as VarianceFilter },
          { title: 'Excess', value: sc.excessCount, color: 'warning.main', filter: 'excess' as VarianceFilter },
          { title: 'Shortage Value', value: formatCurrency(sc.shortageValue), color: 'error.main' },
          { title: 'Excess Value', value: formatCurrency(sc.excessValue), color: 'warning.main' },
          { title: 'Net Variance', value: formatCurrency(sc.netVarianceValue), color: sc.netVarianceValue < 0 ? 'error.main' : 'warning.main' },
          { title: 'Stock Accuracy', value: `${sc.stockAccuracyPct.toFixed(1)}%`, color: sc.stockAccuracyPct >= 98 ? 'success.main' : sc.stockAccuracyPct >= 95 ? 'warning.main' : 'error.main' },
        ].map((card) => (
          <Grid key={card.title} size={{ xs: 6, sm: 4, md: 3, lg: 'auto' }} sx={{ flex: '1 1 140px' }}>
            <StatCard
              title={card.title}
              value={card.value}
              color={card.color}
              onClick={card.filter ? () => { setVFilter(card.filter!); setTab(0); } : undefined}
              subtitle={card.filter ? 'Click to filter' : undefined}
            />
          </Grid>
        ))}
      </Grid>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label="Items" />
        <Tab label="Audit Trail" />
      </Tabs>

      {tab === 0 && (
        <>
          <Box sx={{ mb: 2, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            {(['all', 'matched', 'short', 'excess', 'uncounted'] as VarianceFilter[]).map((f) => (
              <Chip
                key={f}
                label={f.charAt(0).toUpperCase() + f.slice(1)}
                onClick={() => setVFilter(f)}
                color={vFilter === f ? 'primary' : 'default'}
                variant={vFilter === f ? 'filled' : 'outlined'}
                size="small"
              />
            ))}
          </Box>
          {isBlind && canCount && !isManager && (
            <Alert severity="info" sx={{ mb: 2 }}>
              Blind Count mode — system quantities are hidden until the count is submitted.
            </Alert>
          )}
          <DataTable
            columns={columns}
            rows={filteredItems}
            loading={false}
            getRowId={(r) => r.productId}
          />
        </>
      )}

      {tab === 1 && (
        <Paper variant="outlined" sx={{ p: 2 }}>
          {sc.auditTrail.length === 0 ? (
            <Typography color="text.secondary">No audit entries yet.</Typography>
          ) : (
            [...sc.auditTrail].reverse().map((entry, i) => (
              <Box key={i} sx={{ py: 1, borderBottom: '1px solid', borderColor: 'divider' }}>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {entry.action.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {entry.userName} · {new Date(entry.timestamp).toLocaleString()}
                  {entry.note ? ` · ${entry.note}` : ''}
                </Typography>
              </Box>
            ))
          )}
        </Paper>
      )}

      <Dialog open={!!reasonDialog} onClose={() => setReasonDialog(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Set Variance Reason — {reasonDialog?.productName}</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
          <Typography variant="body2" color="text.secondary">
            System: {reasonDialog?.snapshotQty} · Physical: {reasonDialog?.physicalQty} · Variance: {reasonDialog?.varianceQty}
          </Typography>
          <TextField select label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} fullWidth>
            {((reasonDialog?.varianceQty ?? 0) < 0 ? SHORTAGE_REASONS : EXCESS_REASONS).map((r) => (
              <MenuItem key={r} value={r}>{r}</MenuItem>
            ))}
          </TextField>
          {reason === 'Other' && (
            <TextField
              label="Note (required)"
              value={reasonNote}
              onChange={(e) => setReasonNote(e.target.value)}
              multiline rows={2} fullWidth required
            />
          )}
          <TextField
            label="Override Final Qty (optional)"
            type="number"
            value={finalQty}
            onChange={(e) => setFinalQty(e.target.value)}
            fullWidth
            helperText="Leave blank to keep the counted quantity."
            slotProps={{ htmlInput: { min: 0 } }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReasonDialog(null)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={() => reasonMutation.mutate()}
            loading={reasonMutation.isPending}
            disabled={!reason || (reason === 'Other' && !reasonNote)}
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!confirmDialog} onClose={() => setConfirmDialog(null)} maxWidth="xs" fullWidth>
        <DialogTitle>
          {confirmDialog === 'submit' && 'Submit Count for Review'}
          {confirmDialog === 'approve' && 'Approve & Create Stock Adjustments'}
          {confirmDialog === 'cancel' && 'Cancel Stock Count'}
          {confirmDialog === 'recount' && 'Request Recount'}
        </DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          {confirmDialog === 'approve' && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              This will create stock adjustment transactions for all variance items. This action cannot be undone.
            </Alert>
          )}
          <TextField
            label="Notes (optional)"
            value={confirmNote}
            onChange={(e) => setConfirmNote(e.target.value)}
            multiline rows={2} fullWidth
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDialog(null)}>Cancel</Button>
          <Button
            variant="contained"
            color={confirmDialog === 'cancel' ? 'error' : confirmDialog === 'approve' ? 'success' : 'primary'}
            loading={submitMutation.isPending || approveMutation.isPending || cancelMutation.isPending || recountMutation.isPending}
            onClick={() => {
              if (confirmDialog === 'submit') submitMutation.mutate();
              else if (confirmDialog === 'approve') approveMutation.mutate();
              else if (confirmDialog === 'cancel') cancelMutation.mutate();
              else if (confirmDialog === 'recount') recountMutation.mutate();
            }}
          >
            Confirm
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
