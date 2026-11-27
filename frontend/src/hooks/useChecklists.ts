import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { QUERY_KEYS, STALE_TIME } from '@/constants';
import { checklistService } from '@/services';
import type {
  ChecklistItemToggleRequest,
  ChecklistVerifyRequest,
  ChecklistTemplateCreateRequest,
  ChecklistTemplateUpdateRequest,
} from '@/types';

export function useMyTodayChecklists(enabled = true) {
  return useQuery({
    queryKey: QUERY_KEYS.checklistsMyToday,
    queryFn: () => checklistService.getMyTodayChecklists(),
    enabled,
    staleTime: STALE_TIME.realtime,
    refetchInterval: 60000,
  });
}

export function useToggleChecklistItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      checklistId,
      itemId,
      data,
    }: {
      checklistId: string;
      itemId: string;
      data: ChecklistItemToggleRequest;
    }) => checklistService.toggleChecklistItem(checklistId, itemId, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.checklistsMyToday });
      void queryClient.invalidateQueries({ queryKey: ['checklists', 'overview'] });
    },
  });
}

export function useChecklistsOverview(date?: string, enabled = true) {
  return useQuery({
    queryKey: QUERY_KEYS.checklistsOverview(date),
    queryFn: () => checklistService.getOverview(date),
    enabled,
    staleTime: STALE_TIME.standard,
  });
}

export function useVerifyChecklist() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      checklistId,
      data,
    }: {
      checklistId: string;
      data: ChecklistVerifyRequest;
    }) => checklistService.verifyChecklist(checklistId, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['checklists', 'overview'] });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.checklistsMyToday });
    },
  });
}

export function useCreateDailyChecklist() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Parameters<typeof checklistService.createDailyChecklist>[0]) =>
      checklistService.createDailyChecklist(data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['checklists', 'overview'] });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.checklistsMyToday });
    },
  });
}

export function useChecklistTemplates(includeInactive = false) {
  return useQuery({
    queryKey: QUERY_KEYS.checklistTemplates(includeInactive),
    queryFn: () => checklistService.listTemplates(includeInactive),
    staleTime: STALE_TIME.static,
  });
}

export function useCreateChecklistTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: ChecklistTemplateCreateRequest) =>
      checklistService.createTemplate(data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['checklists', 'templates'] });
    },
  });
}

export function useUpdateChecklistTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      templateId,
      data,
    }: {
      templateId: string;
      data: ChecklistTemplateUpdateRequest;
    }) => checklistService.updateTemplate(templateId, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['checklists', 'templates'] });
    },
  });
}

export function useDeactivateChecklistTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (templateId: string) => checklistService.deactivateTemplate(templateId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['checklists', 'templates'] });
    },
  });
}

export function useGenerateDailyChecklists() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (date?: string) => checklistService.generateDaily(date),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['checklists', 'overview'] });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.checklistsMyToday });
    },
  });
}
