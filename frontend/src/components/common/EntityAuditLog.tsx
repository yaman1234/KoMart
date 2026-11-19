import { useState } from 'react';
import { Box, Chip, Paper, Typography } from '@mui/material';
import HistoryIcon from '@mui/icons-material/History';
import { DataTable, type Column } from '@/components/tables/DataTable';
import { AuditLogDetailDialog } from '@/components/common/AuditLogDetailDialog';
import { useAuditLogs } from '@/hooks/useAuditLogs';
import { AUDIT_ACTION_LABELS, AUDIT_MODULE_LABELS } from '@/constants';
import { formatAuditAction, formatDateTime, summarizeAuditValues } from '@/utils';
import type { AuditLog, AuditModule } from '@/types';

interface Props {
  entityId: string;
  module: AuditModule;
}

export function EntityAuditLog({ entityId, module }: Props) {
  const [selected, setSelected] = useState<AuditLog | null>(null);
  const [page, setPage] = useState(0);
  const pageSize = 10;

  const { data, isLoading } = useAuditLogs({
    entityId,
    module,
    page: page + 1,
    pageSize,
  });

  const columns: Column<AuditLog>[] = [
    {
      id: 'when',
      label: 'Date',
      minWidth: 150,
      render: (row) => formatDateTime(row.createdAt),
    },
    {
      id: 'user',
      label: 'User',
      minWidth: 120,
      render: (row) => row.userName || row.userEmail || '—',
    },
    {
      id: 'action',
      label: 'Action',
      minWidth: 160,
      render: (row) => AUDIT_ACTION_LABELS[row.action] ?? formatAuditAction(row.action),
    },
    {
      id: 'summary',
      label: 'Summary',
      minWidth: 200,
      render: (row) => (
        <Typography variant="body2" color="text.secondary" noWrap title={summarizeAuditValues(row.newValue)}>
          {summarizeAuditValues(row.newValue) || '—'}
        </Typography>
      ),
    },
  ];

  if (!isLoading && (data?.total ?? 0) === 0) return null;

  return (
    <Paper variant="outlined" sx={{ mt: 3 }}>
      <Box
        sx={{
          px: 2,
          py: 1.5,
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          background: 'linear-gradient(135deg, #7c3aed 0%, #4f46e5 60%, #3b82f6 100%)',
          borderRadius: '4px 4px 0 0',
        }}
      >
        <HistoryIcon fontSize="small" sx={{ color: 'rgba(255,255,255,0.85)' }} />
        <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#fff', letterSpacing: 0.3 }}>
          Activity Log
        </Typography>
        <Chip
          label={AUDIT_MODULE_LABELS[module] ?? module}
          size="small"
          sx={{
            height: 20,
            fontSize: '0.7rem',
            bgcolor: 'rgba(255,255,255,0.18)',
            color: '#fff',
            border: '1px solid rgba(255,255,255,0.35)',
            fontWeight: 600,
          }}
        />
      </Box>

      <DataTable
        columns={columns}
        rows={data?.data ?? []}
        loading={isLoading}
        page={page}
        pageSize={pageSize}
        total={data?.total}
        onPageChange={setPage}
        getRowId={(row) => row.id}
        onRowClick={setSelected}
        emptyMessage="No activity recorded yet"
      />

      <AuditLogDetailDialog log={selected} onClose={() => setSelected(null)} />
    </Paper>
  );
}
