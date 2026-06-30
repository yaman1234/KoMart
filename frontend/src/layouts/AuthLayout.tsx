import { Box, Paper } from '@mui/material';
import { Outlet } from 'react-router-dom';
import { AppBrand } from '@/components/common/AppBrand';

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
        <Box sx={{ mb: 4 }}>
          <AppBrand
            logoSize={112}
            direction="column"
            subtitle="Korean & Asian Snacks Retail Management"
          />
        </Box>
        <Outlet />
      </Paper>
    </Box>
  );
}
