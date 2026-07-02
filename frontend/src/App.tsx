import { RouterProvider } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider, CssBaseline } from '@mui/material';
import { queryClient } from '@/hooks/queryClient';
import { useThemeStore } from '@/store';
import { createAppTheme } from '@/theme';
import { router } from '@/routes';
import { GlobalLoader } from '@/components/common/GlobalLoader';

export function App() {
  const mode = useThemeStore((s) => s.mode);
  const theme = createAppTheme(mode);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <GlobalLoader />
        <RouterProvider router={router} />
      </ThemeProvider>
    </QueryClientProvider>
  );
}
