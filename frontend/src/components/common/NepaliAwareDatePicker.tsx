import { useMemo, useRef, useState } from 'react';
import {
  Box,
  Button,
  FormControl,
  IconButton,
  InputAdornment,
  InputLabel,
  MenuItem,
  Popover,
  Select,
  TextField,
  Tooltip,
  type TextFieldProps,
} from '@mui/material';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import dayjs from 'dayjs';
import { useStoreSettings } from '@/hooks/useSettings';
import {
  adToBs,
  bsToAd,
  bsYearRange,
  BS_MONTHS,
  daysInBsMonth,
  formatDualCalendar,
  parseYmd,
  toYmd,
  type CalendarSystem,
} from '@/utils/nepaliDate';

export interface NepaliAwareDatePickerProps {
  label?: string;
  value: string; // AD YYYY-MM-DD
  onChange: (adDate: string) => void;
  disabled?: boolean;
  size?: TextFieldProps['size'];
  fullWidth?: boolean;
  helperText?: string;
  minDate?: string;
  maxDate?: string;
  /** Override store setting */
  calendarSystem?: CalendarSystem;
  showDualHint?: boolean;
}

function todayAd(): string {
  return dayjs().format('YYYY-MM-DD');
}

function isAdInRange(ad: string, minDate?: string, maxDate?: string): boolean {
  if (!ad) return false;
  if (minDate && ad < minDate) return false;
  if (maxDate && ad > maxDate) return false;
  return true;
}

function BsDatePicker({
  label,
  value,
  onChange,
  disabled,
  size = 'small',
  fullWidth,
  helperText,
  minDate,
  maxDate,
  showDualHint = false,
}: NepaliAwareDatePickerProps) {
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);

  const bsDisplay = value ? adToBs(value) : '';
  const parts = parseYmd(bsDisplay);

  const draft = useMemo(() => {
    if (parts) return parts;
    const todayBs = parseYmd(adToBs(todayAd()));
    return todayBs ?? { year: 2083, month: 1, day: 1 };
  }, [parts]);

  const years = useMemo(() => {
    const base = bsYearRange();
    if (draft.year && !base.includes(draft.year)) {
      return [...base, draft.year].sort((a, b) => a - b);
    }
    return base;
  }, [draft.year]);

  const maxDay = daysInBsMonth(draft.year, draft.month);
  const days = useMemo(
    () => Array.from({ length: maxDay }, (_, i) => i + 1),
    [maxDay],
  );

  const emitBs = (year: number, month: number, day: number) => {
    const clampedDay = Math.min(day, daysInBsMonth(year, month));
    const ad = bsToAd(toYmd(year, month, clampedDay));
    if (!ad) return;
    if (!isAdInRange(ad, minDate, maxDate)) return;
    onChange(ad);
  };

  const openPicker = () => {
    if (!disabled) setOpen(true);
  };

  return (
    <>
      <Tooltip
        title={value ? formatDualCalendar(value, 'BS') : ''}
        disableHoverListener={!value}
      >
        <Box
          ref={anchorRef}
          component="span"
          sx={{ display: fullWidth ? 'block' : 'inline-block' }}
        >
          <TextField
            label={label}
            value={bsDisplay}
            size={size}
            fullWidth={fullWidth}
            disabled={disabled}
            onClick={openPicker}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                openPicker();
              }
            }}
            helperText={
              helperText ||
              (showDualHint && value ? formatDualCalendar(value, 'BS') : undefined)
            }
            sx={{ minWidth: fullWidth ? undefined : 140 }}
            slotProps={{
              input: {
                readOnly: true,
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      size="small"
                      edge="end"
                      disabled={disabled}
                      onClick={(e) => {
                        e.stopPropagation();
                        openPicker();
                      }}
                      aria-label="Open calendar"
                      aria-expanded={open}
                    >
                      <CalendarMonthIcon fontSize="small" />
                    </IconButton>
                  </InputAdornment>
                ),
              },
              htmlInput: {
                readOnly: true,
                style: { cursor: disabled ? undefined : 'pointer' },
              },
            }}
          />
        </Box>
      </Tooltip>

      <Popover
        open={open}
        anchorEl={anchorRef.current}
        onClose={() => setOpen(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        slotProps={{
          paper: { sx: { p: 2, minWidth: 280 } },
        }}
      >
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1.5 }}>
          <FormControl size="small" sx={{ minWidth: 88 }}>
            <InputLabel id="bs-year-label">Year</InputLabel>
            <Select
              labelId="bs-year-label"
              label="Year"
              value={draft.year}
              onChange={(e) => emitBs(Number(e.target.value), draft.month, draft.day)}
            >
              {years.map((y) => (
                <MenuItem key={y} value={y}>
                  {y}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl size="small" sx={{ minWidth: 120, flex: 1 }}>
            <InputLabel id="bs-month-label">Month</InputLabel>
            <Select
              labelId="bs-month-label"
              label="Month"
              value={draft.month}
              onChange={(e) => emitBs(draft.year, Number(e.target.value), draft.day)}
            >
              {BS_MONTHS.map((name, idx) => (
                <MenuItem key={name} value={idx + 1}>
                  {name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl size="small" sx={{ minWidth: 72 }}>
            <InputLabel id="bs-day-label">Day</InputLabel>
            <Select
              labelId="bs-day-label"
              label="Day"
              value={Math.min(draft.day, maxDay)}
              onChange={(e) => emitBs(draft.year, draft.month, Number(e.target.value))}
            >
              {days.map((d) => {
                const ad = bsToAd(toYmd(draft.year, draft.month, d));
                const outOfRange = !ad || !isAdInRange(ad, minDate, maxDate);
                return (
                  <MenuItem key={d} value={d} disabled={outOfRange}>
                    {d}
                  </MenuItem>
                );
              })}
            </Select>
          </FormControl>
        </Box>

        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Button
            size="small"
            onClick={() => {
              const ad = todayAd();
              if (isAdInRange(ad, minDate, maxDate)) onChange(ad);
              setOpen(false);
            }}
          >
            Today
          </Button>
          <Button size="small" variant="contained" onClick={() => setOpen(false)}>
            Done
          </Button>
        </Box>
      </Popover>
    </>
  );
}

function AdDatePicker({
  label,
  value,
  onChange,
  disabled,
  size = 'small',
  fullWidth,
  helperText,
  minDate,
  maxDate,
  showDualHint = false,
}: NepaliAwareDatePickerProps) {
  return (
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <DatePicker
        label={label}
        value={value ? dayjs(value) : null}
        onChange={(d) => {
          if (d?.isValid()) onChange(d.format('YYYY-MM-DD'));
        }}
        disabled={disabled}
        minDate={minDate ? dayjs(minDate) : undefined}
        maxDate={maxDate ? dayjs(maxDate) : undefined}
        slotProps={{
          textField: {
            size,
            fullWidth,
            helperText:
              helperText ||
              (showDualHint && value ? formatDualCalendar(value, 'AD') : undefined),
            sx: { minWidth: fullWidth ? undefined : 140 },
          },
          actionBar: { actions: ['today'] },
        }}
      />
    </LocalizationProvider>
  );
}

export function NepaliAwareDatePicker(props: NepaliAwareDatePickerProps) {
  const { data: settings } = useStoreSettings();
  const calendar = props.calendarSystem ?? settings?.calendarSystem ?? 'BS';

  if (calendar === 'BS') {
    return <BsDatePicker {...props} showDualHint={props.showDualHint ?? false} />;
  }

  return <AdDatePicker {...props} showDualHint={props.showDualHint ?? false} />;
}
