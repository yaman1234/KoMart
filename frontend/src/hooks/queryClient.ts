import { QueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { STALE_TIME } from '@/constants';

function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  if (failureCount >= 1) return false;
  if (axios.isAxiosError(error)) {
    // Timeouts and offline errors — retrying doubles wait (e.g. 30s + 30s) with no benefit.
    if (error.code === 'ECONNABORTED' || !error.response) return false;
  }
  return true;
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: STALE_TIME.standard,
      gcTime: 1000 * 60 * 30,
      retry: shouldRetryQuery,
      refetchOnWindowFocus: false,
    },
  },
});
