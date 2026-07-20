import { Box, Button, ButtonGroup } from '@mui/material';
import dayjs from 'dayjs';
import { NepaliAwareDatePicker } from '@/components/common/NepaliAwareDatePicker';

const PRESETS = [
  {
    label: 'Today',
    start: () => dayjs(),
    end: () => dayjs(),
  },
  {
    label: 'Yesterday',
    start: () => dayjs().subtract(1, 'day'),
    end: () => dayjs().subtract(1, 'day'),
  },
  {
    label: '7D',
    start: () => dayjs().subtract(6, 'day'),
    end: () => dayjs(),
  },
  {
    label: '30D',
    start: () => dayjs().subtract(29, 'day'),
    end: () => dayjs(),
  },
  {
    label: 'Month',
    start: () => dayjs().startOf('month'),
    end: () => dayjs(),
  },
];

interface DateRangePickerProps {
  startDate: string;
  endDate: string;
  onChange: (range: { startDate: string; endDate: string }) => void;
}

export function DateRangePicker({ startDate, endDate, onChange }: DateRangePickerProps) {
  const activePreset = PRESETS.find(
    (p) =>
      p.start().format('YYYY-MM-DD') === startDate &&
      p.end().format('YYYY-MM-DD') === endDate,
  )?.label;

  return (
    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
      <ButtonGroup size="small" variant="outlined" sx={{ flexShrink: 0 }}>
        {PRESETS.map((p) => (
          <Button
            key={p.label}
            variant={activePreset === p.label ? 'contained' : 'outlined'}
            onClick={() =>
              onChange({
                startDate: p.start().format('YYYY-MM-DD'),
                endDate: p.end().format('YYYY-MM-DD'),
              })
            }
          >
            {p.label}
          </Button>
        ))}
      </ButtonGroup>

      <NepaliAwareDatePicker
        label="Start Date"
        value={startDate}
        onChange={(d) => onChange({ startDate: d, endDate })}
        size="small"
        showDualHint={false}
      />
      <NepaliAwareDatePicker
        label="End Date"
        value={endDate}
        onChange={(d) => onChange({ startDate, endDate: d })}
        minDate={startDate}
        size="small"
        showDualHint={false}
      />
    </Box>
  );
}
