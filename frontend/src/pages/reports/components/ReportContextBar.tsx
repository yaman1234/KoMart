import { Box, Chip, Paper, Stack, Typography } from '@mui/material';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import { DateRangePicker } from '@/components/common/DateRangePicker';
import { AsOfChip } from '@/pages/reports/components/AsOfChip';

interface ReportContextBarProps {
  startDate: string;
  endDate: string;
  onDateRangeChange: (range: { startDate: string; endDate: string }) => void;
  bsDateString?: string;
}

export function ReportContextBar({
  startDate,
  endDate,
  onDateRangeChange,
  bsDateString,
}: ReportContextBarProps) {
  return (
    <Paper
      elevation={0}
      sx={{
        p: 2,
        borderRadius: 2.5,
        border: '1px solid',
        borderColor: 'divider',
        position: 'sticky',
        top: 0,
        zIndex: 8,
        bgcolor: 'background.paper',
        backdropFilter: 'blur(8px)',
      }}
    >
      <Box
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 2,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
          <DateRangePicker startDate={startDate} endDate={endDate} onChange={onDateRangeChange} />
          {bsDateString && (
            <Chip
              icon={<CalendarMonthIcon sx={{ color: '#0284C7' }} />}
              label={`Nepal BS: ${bsDateString}`}
              variant="outlined"
              sx={{
                borderColor: 'rgba(2, 132, 199, 0.3)',
                bgcolor: 'rgba(2, 132, 199, 0.05)',
                fontWeight: 700,
                color: '#0284C7',
                fontSize: '0.8rem',
              }}
            />
          )}
        </Box>

        <Stack spacing={0.75} sx={{ alignItems: { xs: 'flex-start', sm: 'flex-end' } }}>
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
            How to read figures
          </Typography>
          <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: 'wrap' }}>
            <AsOfChip kind="period" />
            <AsOfChip kind="closing" />
            <AsOfChip kind="live" />
          </Stack>
        </Stack>
      </Box>
    </Paper>
  );
}
