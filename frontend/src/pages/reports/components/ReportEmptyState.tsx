import { Box, Button, Typography } from '@mui/material';

interface ReportEmptyStateProps {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function ReportEmptyState({ message, actionLabel, onAction }: ReportEmptyStateProps) {
  return (
    <Box
      sx={{
        py: 4,
        px: 2,
        textAlign: 'center',
        border: '1px dashed',
        borderColor: 'divider',
        borderRadius: 2.5,
        bgcolor: 'action.hover',
      }}
    >
      <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500 }}>
        {message}
      </Typography>
      {actionLabel && onAction && (
        <Button size="small" onClick={onAction} sx={{ mt: 1.5, textTransform: 'none', fontWeight: 700 }}>
          {actionLabel}
        </Button>
      )}
    </Box>
  );
}
