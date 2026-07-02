import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { QUERY_KEYS, STALE_TIME } from '@/constants';
import { notificationService } from '@/services';
import type { NotificationType } from '@/types';

export interface NotificationFilters {
  unreadOnly?: boolean;
  type?: NotificationType | '';
  sync?: boolean;
}

export function useNotifications(filters: NotificationFilters = {}) {
  const { unreadOnly = false, type = '', sync = true } = filters;
  return useQuery({
    queryKey: [...QUERY_KEYS.notifications, { unreadOnly, type, sync }],
    queryFn: () =>
      notificationService.getAll({
        unreadOnly,
        type: type || undefined,
        sync,
      }),
    staleTime: STALE_TIME.realtime,
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => notificationService.markRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.notifications });
    },
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => notificationService.markAllRead(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.notifications });
    },
  });
}

export function useSyncNotifications() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => notificationService.sync(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.notifications });
    },
  });
}
