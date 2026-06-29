import { useState } from 'react';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { Box, Button, ButtonGroup } from '@mui/material';
import dayjs, { type Dayjs } from 'dayjs';

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
  const [startOpen, setStartOpen] = useState(false);
  const [endOpen, setEndOpen] = useState(false);

  const handleStartChange = (date: Dayjs | null) => {
    if (date?.isValid()) {
      onChange({ startDate: date.format('YYYY-MM-DD'), endDate });
    }
  };

  const handleEndChange = (date: Dayjs | null) => {
    if (date?.isValid()) {
      onChange({ startDate, endDate: date.format('YYYY-MM-DD') });
    }
  };

  const activePreset = PRESETS.find(
    (p) =>
      p.start().format('YYYY-MM-DD') === startDate &&
      p.end().format('YYYY-MM-DD') === endDate,
  )?.label;

  return (
    <LocalizationProvider dateAdapter={AdapterDayjs}>
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

        <DatePicker
          label="Start Date"
          value={dayjs(startDate)}
          onChange={handleStartChange}
          open={startOpen}
          onOpen={() => setStartOpen(true)}
          onClose={() => setStartOpen(false)}
          slotProps={{
            textField: {
              size: 'small',
              onClick: () => setStartOpen(true),
              sx: { minWidth: 140 },
            },
            actionBar: { actions: ['today'] },
          }}
        />

        <DatePicker
          label="End Date"
          value={dayjs(endDate)}
          onChange={handleEndChange}
          minDate={dayjs(startDate)}
          open={endOpen}
          onOpen={() => setEndOpen(true)}
          onClose={() => setEndOpen(false)}
          slotProps={{
            textField: {
              size: 'small',
              onClick: () => setEndOpen(true),
              sx: { minWidth: 140 },
            },
            actionBar: { actions: ['today'] },
          }}
        />
      </Box>
    </LocalizationProvider>
  );
}
