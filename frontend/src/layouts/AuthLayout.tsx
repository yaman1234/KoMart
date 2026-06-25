import { Box, Paper, Typography } from '@mui/material';
import { Outlet } from 'react-router-dom';
import { APP_NAME } from '@/constants';

export function AuthLayout() {
  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: 'background.default',
        p: 2,
      }}
    >
      <Paper
        elevation={0}
        sx={{
          width: '100%',
          maxWidth: 420,
          p: 4,
          borderRadius: 3,
          border: 1,
          borderColor: 'divider',
        }}
      >
        <Box sx={{ textAlign: 'center', mb: 4 }}>
          <Box
            sx={{
              width: 56,
              height: 56,
              borderRadius: 2,
              bgcolor: 'primary.main',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'primary.contrastText',
              fontWeight: 700,
              fontSize: '1.5rem',
              mb: 2,
            }}
          >
            K
          </Box>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            {APP_NAME}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Korean & Asian Snacks Retail Management
          </Typography>
        </Box>
        <Outlet />
      </Paper>
    </Box>
  );
}
