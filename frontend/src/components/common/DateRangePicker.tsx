import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { Box } from '@mui/material';
import dayjs, { type Dayjs } from 'dayjs';

interface DateRangePickerProps {
  startDate: string;
  endDate: string;
  onChange: (range: { startDate: string; endDate: string }) => void;
}

export function DateRangePicker({ startDate, endDate, onChange }: DateRangePickerProps) {
  const handleStartChange = (date: Dayjs | null) => {
    if (date) {
      onChange({ startDate: date.format('YYYY-MM-DD'), endDate });
    }
  };

  const handleEndChange = (date: Dayjs | null) => {
    if (date) {
      onChange({ startDate, endDate: date.format('YYYY-MM-DD') });
    }
  };

  return (
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        <DatePicker
          label="Start Date"
          value={dayjs(startDate)}
          onChange={handleStartChange}
          slotProps={{ textField: { size: 'small' } }}
        />
        <DatePicker
          label="End Date"
          value={dayjs(endDate)}
          onChange={handleEndChange}
          minDate={dayjs(startDate)}
          slotProps={{ textField: { size: 'small' } }}
        />
      </Box>
    </LocalizationProvider>
  );
}
