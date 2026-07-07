import { useQuery } from '@tanstack/react-query';
import { QUERY_KEYS, STALE_TIME } from '@/constants';
import { usersService } from '@/services';

export function useAssignableUsers() {
  return useQuery({
    queryKey: [...QUERY_KEYS.users, 'assignable'],
    queryFn: () => usersService.getAssignable(),
    staleTime: STALE_TIME.static,
  });
}
