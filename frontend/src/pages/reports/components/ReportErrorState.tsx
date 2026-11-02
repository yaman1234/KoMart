import { Alert, AlertTitle, Box, Button } from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';

interface ReportErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
}

export function ReportErrorState({
  title = 'Could not load this report',
  message = 'Check your connection and try again. Previous figures are hidden until data loads successfully.',
  onRetry,
}: ReportErrorStateProps) {
  return (
    <Alert
      severity="error"
      action={
        onRetry ? (
          <Button color="inherit" size="small" startIcon={<RefreshIcon />} onClick={onRetry} sx={{ fontWeight: 700 }}>
            Retry
          </Button>
        ) : undefined
      }
      sx={{ borderRadius: 2.5 }}
    >
      <AlertTitle sx={{ fontWeight: 700 }}>{title}</AlertTitle>
      <Box component="span" sx={{ display: 'block', fontSize: '0.875rem' }}>
        {message}
      </Box>
    </Alert>
  );
}
