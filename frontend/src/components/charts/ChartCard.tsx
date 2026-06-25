import { Card, CardContent, CardHeader, Box, Skeleton } from '@mui/material';
import type { ReactNode } from 'react';

interface ChartCardProps {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  loading?: boolean;
  height?: number | string;
}

export function ChartCard({
  title,
  action,
  children,
  loading,
  height = 300,
}: ChartCardProps) {
  return (
    <Card sx={{ height: '100%' }}>
      <CardHeader
        title={title}
        action={action}
        slotProps={{ title: { variant: 'h6', sx: { fontWeight: 600 } } }}
        sx={{ pb: 0 }}
      />
      <CardContent>
        {loading ? (
          <Skeleton variant="rectangular" height={height} sx={{ borderRadius: 1 }} />
        ) : (
          <Box sx={{ width: '100%', height }}>{children}</Box>
        )}
      </CardContent>
    </Card>
  );
}
