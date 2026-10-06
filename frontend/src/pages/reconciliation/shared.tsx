import { Box, Typography, useTheme } from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { Chip } from '@mui/material';
import { formatCurrency } from '@/utils';

export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function shiftDate(date: string, days: number): string {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function LineRow({
  label,
  value,
  bold,
  minus,
  subtotal,
}: {
  label: string;
  value: number | null | undefined;
  bold?: boolean;
  minus?: boolean;
  subtotal?: number;
}) {
  const display = value == null || !Number.isFinite(value) ? '—' : formatCurrency(value);
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.75 }}>
      <Typography variant="body2" color={minus ? 'error.main' : 'text.secondary'}>
        {label}
      </Typography>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <Typography variant="body2" sx={{ fontWeight: bold ? 700 : 400, minWidth: 80, textAlign: 'right' }}>
          {display}
        </Typography>
        {subtotal !== undefined
          ? <Typography variant="body2" sx={{ fontWeight: 700, minWidth: 90, textAlign: 'right', color: minus ? 'error.main' : 'success.main' }}>{formatCurrency(subtotal)}</Typography>
          : <Box sx={{ minWidth: 90 }} />}
      </Box>
    </Box>
  );
}

// Placeholder export so CashReconciliationPanel import doesn't break
export function ColHeader() {
  return null;
}

export function StatusChip({ difference }: { difference: number }) {
  const reconciled = Math.abs(difference) < 0.01;
  return (
    <Chip
      icon={reconciled ? <CheckCircleIcon /> : <WarningAmberIcon />}
      label={reconciled ? 'Reconciled' : 'Difference'}
      color={reconciled ? 'success' : 'warning'}
      size="small"
    />
  );
}

export function SectionHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        px: 2,
        py: 1.25,
        background: isDark
          ? 'linear-gradient(90deg, #1D3557 0%, #2A3F5F 100%)'
          : 'linear-gradient(90deg, #1D3557 0%, #457B9D 100%)',
        borderRadius: '10px 10px 0 0',
      }}
    >
      <Typography variant="subtitle1" sx={{ fontWeight: 700, color: '#fff' }}>
        {title}
      </Typography>
      {action}
    </Box>
  );
}
