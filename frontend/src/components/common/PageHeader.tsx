import { Box, Typography, Breadcrumbs, Link } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  breadcrumbs?: { label: string; path?: string }[];
  action?: ReactNode;
}

export function PageHeader({ title, subtitle, breadcrumbs, action }: PageHeaderProps) {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: { xs: 'column', sm: 'row' },
        alignItems: { sm: 'center' },
        justifyContent: 'space-between',
        gap: 2,
        mb: 3,
      }}
    >
      <Box>
        {breadcrumbs && breadcrumbs.length > 0 && (
          <Breadcrumbs sx={{ mb: 1 }}>
            {breadcrumbs.map((crumb, i) =>
              crumb.path ? (
                <Link
                  key={i}
                  component={RouterLink}
                  to={crumb.path}
                  underline="hover"
                  color="inherit"
                  variant="body2"
                >
                  {crumb.label}
                </Link>
              ) : (
                <Typography key={i} variant="body2" color="text.secondary">
                  {crumb.label}
                </Typography>
              ),
            )}
          </Breadcrumbs>
        )}
        <Typography variant="h4" sx={{ fontWeight: 700 }}>
          {title}
        </Typography>
        {subtitle && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {subtitle}
          </Typography>
        )}
      </Box>
      {action && <Box sx={{ flexShrink: 0 }}>{action}</Box>}
    </Box>
  );
}
