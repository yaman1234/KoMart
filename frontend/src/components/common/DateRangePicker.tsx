import { Box, Button, ButtonGroup } from '@mui/material';
import { NepaliAwareDatePicker } from '@/components/common/NepaliAwareDatePicker';
import { addCalendarDays, storeMonthStartIso, storeTodayIso } from '@/utils/storeDate';

const PRESETS = [
  {
    label: 'Today',
    start: () => storeTodayIso(),
    end: () => storeTodayIso(),
  },
  {
    label: 'Yesterday',
    start: () => addCalendarDays(storeTodayIso(), -1),
    end: () => addCalendarDays(storeTodayIso(), -1),
  },
  {
    label: '7D',
    start: () => addCalendarDays(storeTodayIso(), -6),
    end: () => storeTodayIso(),
  },
  {
    label: '30D',
    start: () => addCalendarDays(storeTodayIso(), -29),
    end: () => storeTodayIso(),
  },
  {
    label: 'Month',
    start: () => storeMonthStartIso(),
    end: () => storeTodayIso(),
  },
];

interface DateRangePickerProps {
  startDate: string;
  endDate: string;
  onChange: (range: { startDate: string; endDate: string }) => void;
}

export function DateRangePicker({ startDate, endDate, onChange }: DateRangePickerProps) {
  const activePreset = PRESETS.find(
    (p) => p.start() === startDate && p.end() === endDate,
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
                startDate: p.start(),
                endDate: p.end(),
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
