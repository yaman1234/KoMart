import { Box, Typography, Breadcrumbs, Link } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import type { ReactNode } from 'react';

interface PageHeaderProps {
  /** Kept for call-site compatibility; not rendered (TopBar shows page title). */
  title?: string;
  /** Kept for call-site compatibility; not rendered. */
  subtitle?: string;
  breadcrumbs?: { label: string; path?: string }[];
  action?: ReactNode;
}

export function PageHeader({ breadcrumbs, action }: PageHeaderProps) {
  const hasBreadcrumbs = Boolean(breadcrumbs && breadcrumbs.length > 0);
  if (!hasBreadcrumbs && !action) {
    return null;
  }

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: { xs: 'column', sm: 'row' },
        alignItems: { sm: 'center' },
        justifyContent: 'space-between',
        gap: 1.5,
        mb: action || hasBreadcrumbs ? 2 : 0,
      }}
    >
      <Box>
        {hasBreadcrumbs && (
          <Breadcrumbs>
            {breadcrumbs!.map((crumb, i) =>
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
      </Box>
      {action && <Box sx={{ flexShrink: 0 }}>{action}</Box>}
    </Box>
  );
}
