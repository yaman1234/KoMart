import { Chip, Tooltip } from '@mui/material';

export type AsOfKind = 'period' | 'closing' | 'live';

const CONFIG: Record<
  AsOfKind,
  { label: string; color: string; bg: string; border: string; tip: string }
> = {
  period: {
    label: 'Period',
    color: '#0369A1',
    bg: 'rgba(3, 105, 161, 0.06)',
    border: 'rgba(3, 105, 161, 0.25)',
    tip: 'Figures cover the selected date range (accrual activity).',
  },
  closing: {
    label: 'Closing',
    color: '#0F766E',
    bg: 'rgba(15, 118, 110, 0.06)',
    border: 'rgba(15, 118, 110, 0.25)',
    tip: 'Balances as of the selected end date (period closing snapshot).',
  },
  live: {
    label: 'Live today',
    color: '#B45309',
    bg: 'rgba(180, 83, 9, 0.07)',
    border: 'rgba(180, 83, 9, 0.28)',
    tip: 'Current balances — not filtered by the report date range.',
  },
};

interface AsOfChipProps {
  kind: AsOfKind;
  size?: 'small' | 'medium';
}

export function AsOfChip({ kind, size = 'small' }: AsOfChipProps) {
  const cfg = CONFIG[kind];
  return (
    <Tooltip title={cfg.tip} arrow>
      <Chip
        size={size}
        label={cfg.label}
        variant="outlined"
        sx={{
          height: size === 'small' ? 24 : 28,
          fontWeight: 700,
          fontSize: '0.72rem',
          color: cfg.color,
          bgcolor: cfg.bg,
          borderColor: cfg.border,
        }}
      />
    </Tooltip>
  );
}
