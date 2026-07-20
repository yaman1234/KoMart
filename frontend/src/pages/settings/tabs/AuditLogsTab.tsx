import { useMemo, useState } from 'react';
import {
  Box,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  FormControl,
  Grid,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  TextField,
  Typography,
} from '@mui/material';
import { DataTable, type Column } from '@/components/tables/DataTable';
import { NepaliAwareDatePicker } from '@/components/common/NepaliAwareDatePicker';
import { useAuditLogs } from '@/hooks/useAuditLogs';
import { AUDIT_MODULE_LABELS } from '@/constants';
import { formatDateTime } from '@/utils';
import type { AuditLog, AuditModule } from '@/types';

const MODULES: AuditModule[] = [
  'auth',
  'products',
  'inventory',
  'sales',
  'purchase_orders',
  'settings',
  'users',
];

function summarizeValues(data: Record<string, unknown>): string {
  const keys = Object.keys(data);
  if (keys.length === 0) return '—';
  const preview = keys.slice(0, 3).map((k) => `${k}: ${String(data[k])}`).join(', ');
  return keys.length > 3 ? `${preview}…` : preview;
}

export function AuditLogsTab() {
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [moduleFilter, setModuleFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selected, setSelected] = useState<AuditLog | null>(null);

  const queryParams = useMemo(
    () => ({
      page: page + 1,
      pageSize,
      module: moduleFilter || undefined,
      action: actionFilter || undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
    }),
    [page, pageSize, moduleFilter, actionFilter, startDate, endDate],
  );

  const { data, isLoading } = useAuditLogs(queryParams);

  const columns: Column<AuditLog>[] = [
    {
      id: 'when',
      label: 'Date',
      minWidth: 160,
      render: (row) => formatDateTime(row.createdAt),
    },
    {
      id: 'user',
      label: 'User',
      minWidth: 140,
      render: (row) => row.userName || row.userEmail || '—',
    },
    {
      id: 'module',
      label: 'Module',
      render: (row) => (
        <Chip
          label={AUDIT_MODULE_LABELS[row.module] ?? row.module}
          size="small"
          variant="outlined"
        />
      ),
    },
    { id: 'action', label: 'Action', render: (row) => row.action },
    {
      id: 'entity',
      label: 'Entity',
      minWidth: 160,
      render: (row) =>
        row.entityType ? `${row.entityType}${row.entityId ? ` #${row.entityId.slice(-6)}` : ''}` : '—',
    },
    {
      id: 'device',
      label: 'Device',
      render: (row) => `${row.browser} / ${row.device}`,
    },
    {
      id: 'ip',
      label: 'IP',
      render: (row) => row.ipAddress || '—',
    },
  ];

  return (
    <Box>
      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <FormControl fullWidth size="small">
              <InputLabel>Module</InputLabel>
              <Select
                label="Module"
                value={moduleFilter}
                onChange={(e) => { setModuleFilter(e.target.value); setPage(0); }}
              >
                <MenuItem value="">All</MenuItem>
                {MODULES.map((m) => (
                  <MenuItem key={m} value={m}>
                    {AUDIT_MODULE_LABELS[m]}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <TextField
              fullWidth
              size="small"
              label="Action"
              value={actionFilter}
              onChange={(e) => { setActionFilter(e.target.value); setPage(0); }}
              placeholder="e.g. login, create"
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <NepaliAwareDatePicker
              label="From"
              value={startDate}
              onChange={(d) => { setStartDate(d); setPage(0); }}
              size="small"
              fullWidth
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
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
        getRowId={(row) => row.id}
        onRowClick={setSelected}
        emptyMessage="No audit logs found"
      />

      <Dialog open={!!selected} onClose={() => setSelected(null)} maxWidth="md" fullWidth>
        <DialogTitle>Audit Log Detail</DialogTitle>
        <DialogContent dividers>
          {selected && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Typography variant="body2">
                <strong>When:</strong> {formatDateTime(selected.createdAt)}
              </Typography>
              <Typography variant="body2">
                <strong>User:</strong> {selected.userName} ({selected.userEmail})
              </Typography>
              <Typography variant="body2">
                <strong>Action:</strong> {AUDIT_MODULE_LABELS[selected.module]} — {selected.action}
              </Typography>
              <Typography variant="body2">
                <strong>Entity:</strong> {selected.entityType} {selected.entityId}
              </Typography>
              <Typography variant="body2">
                <strong>Request ID:</strong> {selected.requestId}
              </Typography>
              <Typography variant="body2">
                <strong>Client:</strong> {selected.browser} on {selected.device} — {selected.ipAddress}
              </Typography>
              <Box>
                <Typography variant="subtitle2" gutterBottom>Previous</Typography>
                <Typography variant="body2" component="pre" sx={{ whiteSpace: 'pre-wrap', m: 0 }}>
                  {summarizeValues(selected.previousValue)}
                </Typography>
                <Typography variant="caption" component="pre" sx={{ whiteSpace: 'pre-wrap', mt: 1 }}>
                  {JSON.stringify(selected.previousValue, null, 2)}
                </Typography>
              </Box>
              <Box>
                <Typography variant="subtitle2" gutterBottom>New</Typography>
                <Typography variant="body2" component="pre" sx={{ whiteSpace: 'pre-wrap', m: 0 }}>
                  {summarizeValues(selected.newValue)}
                </Typography>
                <Typography variant="caption" component="pre" sx={{ whiteSpace: 'pre-wrap', mt: 1 }}>
                  {JSON.stringify(selected.newValue, null, 2)}
                </Typography>
              </Box>
            </Box>
          )}
        </DialogContent>
      </Dialog>
    </Box>
  );
}
