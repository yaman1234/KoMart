import type { ReactNode } from 'react';
import { Box, Button, Paper, Typography } from '@mui/material';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';

interface ReportSectionProps {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  deepLinkLabel?: string;
  onDeepLink?: () => void;
  headerExtra?: ReactNode;
  children: ReactNode;
}

export function ReportSection({
  title,
  subtitle,
  icon,
  deepLinkLabel,
  onDeepLink,
  headerExtra,
  children,
}: ReportSectionProps) {
  return (
    <Paper
      elevation={0}
      sx={{
        p: { xs: 2, sm: 2.5 },
        borderRadius: 3,
        border: '1px solid',
        borderColor: 'divider',
      }}
    >
      <Box
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 1.5,
          mb: subtitle || children ? 2 : 0,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.2, minWidth: 0 }}>
          {icon}
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 800, lineHeight: 1.3 }}>
              {title}
            </Typography>
            {subtitle && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.35, maxWidth: 560 }}>
                {subtitle}
              </Typography>
            )}
          </Box>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          {headerExtra}
          {deepLinkLabel && onDeepLink && (
            <Button
              size="small"
              endIcon={<ArrowForwardIcon sx={{ fontSize: 16 }} />}
              onClick={onDeepLink}
              sx={{ textTransform: 'none', fontWeight: 600, fontSize: 12 }}
            >
              {deepLinkLabel}
            </Button>
          )}
        </Box>
      </Box>
      {children}
    </Paper>
  );
}
