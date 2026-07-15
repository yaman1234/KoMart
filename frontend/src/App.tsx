import { RouterProvider } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider, CssBaseline, Alert, Box } from '@mui/material';
import { Analytics } from '@vercel/analytics/react';
import { queryClient } from '@/hooks/queryClient';
import { useThemeStore } from '@/store';
import { createAppTheme } from '@/theme';
import { router } from '@/routes';
import { GlobalLoader } from '@/components/common/GlobalLoader';
import { ToastProvider } from '@/components/common/ToastProvider';
import { isMockEnabled } from '@/config/mock';

export function App() {
  const mode = useThemeStore((s) => s.mode);
  const theme = createAppTheme(mode);
  const mockMode = isMockEnabled();

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {mockMode && (
          <Box sx={{ position: 'sticky', top: 0, zIndex: (t) => t.zIndex.snackbar + 1 }}>
            <Alert severity="warning" sx={{ borderRadius: 0 }}>
              Mock mode — data is in-memory only and not saved to the server.
            </Alert>
          </Box>
        )}
        <GlobalLoader />
        <ToastProvider />
        <RouterProvider router={router} />
        <Analytics />
      </ThemeProvider>
    </QueryClientProvider>
  );
}
