import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { QUERY_KEYS, STALE_TIME } from '@/constants';
import { auditLogService } from '@/services';
import type { AuditLogQueryParams } from '@/types';

function filterKey(params?: AuditLogQueryParams): string {
  if (!params) return 'default';
  return JSON.stringify(params);
}

export function useAuditLogs(params?: AuditLogQueryParams) {
  return useQuery({
    queryKey: QUERY_KEYS.auditLogs(filterKey(params)),
    queryFn: () => auditLogService.getAll(params),
    staleTime: STALE_TIME.standard,
    placeholderData: keepPreviousData,
  });
}

export function useAuditLog(id: string) {
  return useQuery({
    queryKey: QUERY_KEYS.auditLog(id),
    queryFn: () => auditLogService.getById(id),
    enabled: !!id,
  });
}
