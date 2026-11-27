import { apiClient } from './apiClient';
import type {
  ChecklistTemplate,
  DailyChecklist,
  ChecklistItemToggleRequest,
  ChecklistVerifyRequest,
  ChecklistTemplateCreateRequest,
  ChecklistTemplateUpdateRequest,
} from '../types/checklist';

export const checklistService = {
  getMyTodayChecklists: async (): Promise<DailyChecklist[]> => {
    const res = await apiClient.get<DailyChecklist[]>('/checklists/my-today');
    return res.data;
  },

  toggleChecklistItem: async (
    checklistId: string,
    itemId: string,
    data: ChecklistItemToggleRequest
  ): Promise<DailyChecklist> => {
    const res = await apiClient.patch<DailyChecklist>(`/checklists/${checklistId}/items/${itemId}`, data);
    return res.data;
  },

  getOverview: async (date?: string): Promise<DailyChecklist[]> => {
    const params = date ? { date } : undefined;
    const res = await apiClient.get<DailyChecklist[]>('/checklists/overview', { params });
    return res.data;
  },

  createDailyChecklist: async (data: {
    title: string;
    description?: string;
    category: string;
    targetRole: string;
    assignedToUserId?: string;
    shiftId?: string;
    items: {
      id: string;
      title: string;
      description?: string;
      isMandatory: boolean;
      order: number;
      numericUnit?: string;
    }[];
  }): Promise<DailyChecklist> => {
    const res = await apiClient.post<DailyChecklist>('/checklists', data);
    return res.data;
  },

  verifyChecklist: async (
    checklistId: string,
    data: ChecklistVerifyRequest
  ): Promise<DailyChecklist> => {
    const res = await apiClient.post<DailyChecklist>(`/checklists/${checklistId}/verify`, data);
    return res.data;
  },

  listTemplates: async (includeInactive = false): Promise<ChecklistTemplate[]> => {
    const res = await apiClient.get<ChecklistTemplate[]>('/checklists/templates', {
      params: { include_inactive: includeInactive },
    });
    return res.data;
  },

  createTemplate: async (data: ChecklistTemplateCreateRequest): Promise<ChecklistTemplate> => {
    const res = await apiClient.post<ChecklistTemplate>('/checklists/templates', data);
    return res.data;
  },

  updateTemplate: async (
    templateId: string,
    data: ChecklistTemplateUpdateRequest
  ): Promise<ChecklistTemplate> => {
    const res = await apiClient.patch<ChecklistTemplate>(`/checklists/templates/${templateId}`, data);
    return res.data;
  },

  deleteDailyChecklist: async (checklistId: string): Promise<{ message: string }> => {
    const res = await apiClient.delete<{ message: string }>(`/checklists/${checklistId}`);
    return res.data;
  },

  deactivateTemplate: async (templateId: string): Promise<{ message: string }> => {
    const res = await apiClient.delete<{ message: string }>(`/checklists/templates/${templateId}`);
    return res.data;
  },

  generateDaily: async (date?: string): Promise<DailyChecklist[]> => {
    const params = date ? { date } : undefined;
    const res = await apiClient.post<DailyChecklist[]>('/checklists/generate-daily', null, { params });
    return res.data;
  },
};
