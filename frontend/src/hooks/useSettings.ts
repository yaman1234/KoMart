import { useQuery } from '@tanstack/react-query';
import { QUERY_KEYS, STALE_TIME } from '@/constants';
import { settingsService } from '@/services';

export function useStoreSettings() {
  return useQuery({
    queryKey: QUERY_KEYS.settings,
    queryFn: settingsService.get,
    staleTime: STALE_TIME.static,
  });
}
