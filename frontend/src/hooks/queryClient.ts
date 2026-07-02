import { QueryClient } from '@tanstack/react-query';
import { STALE_TIME } from '@/constants';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: STALE_TIME.standard,
      gcTime: 1000 * 60 * 30,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});
