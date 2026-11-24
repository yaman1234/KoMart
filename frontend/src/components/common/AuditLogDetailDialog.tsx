import {
  Box,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import PersonOutlinedIcon from '@mui/icons-material/PersonOutlined';
import DevicesIcon from '@mui/icons-material/Devices';
import FingerprintIcon from '@mui/icons-material/Fingerprint';
import { AUDIT_ACTION_LABELS, AUDIT_MODULE_LABELS } from '@/constants';
import { formatAuditAction, formatAuditField, formatDateTime } from '@/utils';
import type { AuditLog } from '@/types';

interface Props {
  log: AuditLog | null;
  onClose: () => void;
  /** Show entity row — useful in global audit log where entity context isn't implicit */
  showEntity?: boolean;
}

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

const fieldLabel = (k: string) =>
  k.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

const cellValue = (v: unknown): string | null => {
  if (v === undefined || v === null || v === '') return null;
  return formatAuditField('', v);
};

export function AuditLogDetailDialog({ log, onClose, showEntity = false }: Props) {
  if (!log) return null;

  const allKeys = Array.from(
    new Set([...Object.keys(log.previousValue), ...Object.keys(log.newValue)]),
  );
  const changedKeys = allKeys.filter(
    (k) => JSON.stringify(log.previousValue[k]) !== JSON.stringify(log.newValue[k]),
  );
  const unchangedKeys = allKeys.filter((k) => !changedKeys.includes(k));

  const metaItems = [
    {
      icon: <AccessTimeIcon sx={{ fontSize: 14 }} />,
      label: 'When',
      value: formatDateTime(log.createdAt),
    },
    {
      icon: <PersonOutlinedIcon sx={{ fontSize: 14 }} />,
      label: 'By',
      value: `${log.userName} · ${log.userEmail}`,
    },
    {
      icon: <DevicesIcon sx={{ fontSize: 14 }} />,
      label: 'Client',
      value: `${log.browser} / ${log.device}${log.ipAddress ? ` · ${log.ipAddress}` : ''}`,
    },
    ...(log.requestId
      ? [{ icon: <FingerprintIcon sx={{ fontSize: 14 }} />, label: 'Request ID', value: log.requestId }]
      : []),
    ...(showEntity
      ? [{ icon: null, label: 'Entity', value: entityLabel(log) }]
      : []),
  ];

  return (
    <Dialog open={!!log} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ pb: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <Chip
            label={AUDIT_ACTION_LABELS[log.action] ?? formatAuditAction(log.action)}
            size="small"
            sx={{
              background: 'linear-gradient(135deg, #7c3aed 0%, #4f46e5 60%, #3b82f6 100%)',
              color: '#fff',
              fontWeight: 700,
              fontSize: '0.75rem',
            }}
          />
          <Chip
            label={AUDIT_MODULE_LABELS[log.module] ?? log.module}
            size="small"
            variant="outlined"
            color="primary"
          />
        </Box>
      </DialogTitle>

      <DialogContent dividers sx={{ p: 0 }}>
        {/* Meta strip */}
        <Box sx={{ display: 'flex', flexWrap: 'wrap', borderBottom: 1, borderColor: 'divider' }}>
          {metaItems.map((m) => (
            <Box
              key={m.label}
              sx={{
                flex: '1 1 160px',
                px: 2.5,
                py: 1.5,
                borderRight: 1,
                borderColor: 'divider',
                '&:last-child': { borderRight: 0 },
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.25, color: 'text.secondary' }}>
                {m.icon}
                <Typography variant="caption" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                  {m.label}
                </Typography>
              </Box>
              <Typography variant="body2" sx={{ fontWeight: 500, wordBreak: 'break-all' }}>
                {m.value}
              </Typography>
            </Box>
          ))}
        </Box>

        {/* Diff table */}
        {allKeys.length === 0 ? (
          <Box sx={{ px: 2.5, py: 4, textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary">No field changes recorded.</Typography>
          </Box>
        ) : (
          <>
            {changedKeys.length > 0 && (
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: 'action.hover' }}>
                    <TableCell sx={{ width: '28%', fontWeight: 700, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: 0.4, color: 'text.secondary' }}>
                      Field
                    </TableCell>
                    <TableCell sx={{ width: '36%', fontWeight: 700, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: 0.4, color: 'error.main' }}>
                      Before
                    </TableCell>
                    <TableCell sx={{ width: '36%', fontWeight: 700, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: 0.4, color: 'success.main' }}>
                      After
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {changedKeys.map((k) => {
                    const prev = cellValue(log.previousValue[k]);
                    const next = cellValue(log.newValue[k]);
                    return (
                      <TableRow key={k} sx={{ '&:last-child td': { borderBottom: 0 } }}>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>
                            {fieldLabel(k)}
                          </Typography>
                        </TableCell>
                        <TableCell
                          sx={{
                            bgcolor: prev ? 'rgba(239,68,68,0.06)' : undefined,
                            borderLeft: '3px solid',
                            borderLeftColor: prev ? 'error.light' : 'transparent',
                          }}
                        >
                          <Typography
                            variant="body2"
                            sx={{
                              color: prev ? 'error.dark' : 'text.disabled',
                              textDecoration: prev ? 'line-through' : 'none',
                              wordBreak: 'break-word',
                              opacity: prev ? 1 : 0.5,
                            }}
                          >
                            {prev ?? '—'}
                          </Typography>
                        </TableCell>
                        <TableCell
                          sx={{
                            bgcolor: next ? 'rgba(34,197,94,0.06)' : undefined,
                            borderLeft: '3px solid',
                            borderLeftColor: next ? 'success.light' : 'transparent',
                          }}
                        >
                          <Typography
                            variant="body2"
                            sx={{
                              color: next ? 'success.dark' : 'text.disabled',
                              fontWeight: next ? 600 : 400,
                              wordBreak: 'break-word',
                            }}
                          >
                            {next ?? '—'}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}

            {unchangedKeys.length > 0 && (
              <>
                <Divider>
                  <Typography variant="caption" color="text.disabled" sx={{ px: 1 }}>
                    Unchanged
                  </Typography>
                </Divider>
                <Table size="small">
                  <TableBody>
                    {unchangedKeys.map((k) => (
                      <TableRow key={k} sx={{ opacity: 0.5, '&:last-child td': { borderBottom: 0 } }}>
                        <TableCell sx={{ width: '28%' }}>
                          <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.secondary' }}>
                            {fieldLabel(k)}
                          </Typography>
                        </TableCell>
                        <TableCell colSpan={2}>
                          <Typography variant="body2" color="text.secondary">
                            {cellValue(log.newValue[k] ?? log.previousValue[k]) ?? '—'}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
