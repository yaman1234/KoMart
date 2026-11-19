import { useEffect, useMemo, useState } from 'react';
import { useListState, stringParam, pageParam, pageSizeParam } from '@/hooks/useListState';
import {
  Box,
  Chip,
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
import { AuditLogDetailDialog } from '@/components/common/AuditLogDetailDialog';
import { useAuditLogs } from '@/hooks/useAuditLogs';
import { AUDIT_ACTION_LABELS, AUDIT_MODULE_LABELS } from '@/constants';
import { formatAuditAction, formatDateTime, summarizeAuditValues } from '@/utils';
import type { AuditLog, AuditModule } from '@/types';

const MODULES: AuditModule[] = [
  'auth',
  'products',
  'inventory',
  'sales',
  'purchase_orders',
  'settings',
  'users',
  'expenses',
  'accounts',
];

function entityLabel(row: AuditLog): string {
  if (!row.entityType) return '—';
  const labels: Record<string, string> = {
    day_close: 'Day close',
    cash_custody: 'Staff custody',
    wallet_transfer: 'Transfer',
    wallet_adjustment: 'Adjustment',
    store_settings: 'Store settings',
  };
  const type = labels[row.entityType] ?? row.entityType.replace(/_/g, ' ');
  return row.entityId ? `${type} · …${row.entityId.slice(-6)}` : type;
}

export function AuditLogsTab() {
  const { filters, setFilter, setFilters, clampPage } = useListState({
    routePrefix: '/settings/audit',
    schema: {
      page: pageParam(0),
      pageSize: pageSizeParam(25),
      module: stringParam(''),
      action: stringParam(''),
      startDate: stringParam(''),
      endDate: stringParam(''),
    },
  });
  const { page, pageSize, module: moduleFilter, action: actionFilter, startDate, endDate } = filters;
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

  useEffect(() => {
    clampPage(data?.total);
  }, [clampPage, data?.total]);

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
    {
      id: 'action',
      label: 'Action',
      minWidth: 180,
      render: (row) => AUDIT_ACTION_LABELS[row.action] ?? formatAuditAction(row.action),
    },
    {
      id: 'entity',
      label: 'Entity',
      minWidth: 160,
      render: (row) => entityLabel(row),
    },
    {
      id: 'summary',
      label: 'Summary',
      minWidth: 220,
      render: (row) => (
        <Typography variant="body2" color="text.secondary" noWrap title={summarizeAuditValues(row.newValue)}>
          {summarizeAuditValues(row.newValue) || '—'}
        </Typography>
      ),
    },
    {
      id: 'device',
      label: 'Device',
      render: (row) => `${row.browser} / ${row.device}`,
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
                onChange={(e) => { setFilter('module', e.target.value); }}
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
              onChange={(e) => { setFilter('action', e.target.value); }}
              placeholder="e.g. wallet_transfer, day_close"
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <NepaliAwareDatePicker
              label="From"
              value={startDate}
              onChange={(d) => { setFilter('startDate', d); }}
              size="small"
              fullWidth
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <NepaliAwareDatePicker
              label="To"
              value={endDate}
              onChange={(d) => { setFilter('endDate', d); }}
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
        onPageChange={(p) => setFilter('page', p)}
        onPageSizeChange={(size) => { setFilters({ pageSize: size, page: 0 }); }}
        getRowId={(row) => row.id}
        onRowClick={setSelected}
        emptyMessage="No audit logs found"
      />

      <AuditLogDetailDialog log={selected} onClose={() => setSelected(null)} showEntity />
    </Box>
  );
}
