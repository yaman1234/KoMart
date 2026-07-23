import {
  Box,
  Card,
  CardActionArea,
  CardContent,
  Typography,
  Skeleton,
  type SxProps,
  type Theme,
} from '@mui/material';
import type { ReactNode } from 'react';

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: ReactNode;
  trend?: { value: number; label: string };
  color?: string;
  loading?: boolean;
  sx?: SxProps<Theme>;
  onClick?: () => void;
}

export function StatCard({
  title,
  value,
  subtitle,
  icon,
  trend,
  color,
  loading,
  sx,
  onClick,
}: StatCardProps) {
  if (loading) {
    return (
      <Card sx={sx}>
        <CardContent>
          <Skeleton width="60%" />
          <Skeleton width="40%" height={40} />
        </CardContent>
      </Card>
    );
  }

  const content = (
    <CardContent>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Box>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            {title}
          </Typography>
          <Typography variant="h4" sx={{ fontWeight: 700 }} color={color}>
            {value}
          </Typography>
          {subtitle && (
            <Typography variant="caption" color="text.secondary">
              {subtitle}
            </Typography>
          )}
          {trend && (
            <Typography
              variant="caption"
              color={trend.value >= 0 ? 'success.main' : 'error.main'}
              sx={{ display: 'block', mt: 0.5 }}
            >
              {trend.value >= 0 ? '+' : ''}
              {trend.value}% {trend.label}
            </Typography>
          )}
        </Box>
        {icon && (
          <Box
            sx={{
              p: 1,
              borderRadius: 2,
              bgcolor: 'action.hover',
              color: color ?? 'primary.main',
              display: 'flex',
            }}
          >
            {icon}
          </Box>
        )}
      </Box>
    </CardContent>
  );

  return (
    <Card
      sx={{
        height: '100%',
        ...(onClick
          ? {
              transition: 'box-shadow 0.15s ease, transform 0.15s ease',
              '&:hover': { boxShadow: 3 },
            }
          : null),
        ...sx,
      }}
    >
      {onClick ? (
        <CardActionArea onClick={onClick} sx={{ height: '100%', alignItems: 'stretch' }}>
          {content}
        </CardActionArea>
      ) : (
        content
      )}
    </Card>
  );
}
