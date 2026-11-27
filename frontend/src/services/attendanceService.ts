import { apiClient } from './apiClient';
import type {
  AttendanceRecord,
  AttendanceTodayStatus,
  PunchPayload,
  AttendanceKPIs,
  Shift,
  ShiftPayload,
  ShiftAssignment,
  ShiftAssignmentPayload,
  LeaveRequest,
  LeavePayload,
  LeaveReviewPayload,
  RegularizePayload,
} from '@/types';

export const attendanceService = {
  // Punch & Today Status
  async getTodayStatus(): Promise<AttendanceTodayStatus> {
    const res = await apiClient.get<AttendanceTodayStatus>('/attendance/today');
    return res.data;
  },

  async punch(payload: PunchPayload): Promise<AttendanceRecord> {
    const res = await apiClient.post<AttendanceRecord>('/attendance/punch', payload);
    return res.data;
  },

  async getMyHistory(month?: string, limit = 31): Promise<AttendanceRecord[]> {
    const res = await apiClient.get<AttendanceRecord[]>('/attendance/my-history', {
      params: { month, limit },
    });
    return res.data;
  },

  // Manager Roster & Records
  async getLiveRoster(date?: string): Promise<AttendanceRecord[]> {
    const res = await apiClient.get<AttendanceRecord[]>('/attendance/live-roster', {
      params: { date },
    });
    return res.data;
  },

  async getSummary(date?: string): Promise<AttendanceKPIs> {
    const res = await apiClient.get<AttendanceKPIs>('/attendance/summary', {
      params: { date },
    });
    return res.data;
  },

  async listRecords(params?: { date?: string; userId?: string; status?: string; limit?: number }): Promise<AttendanceRecord[]> {
    const res = await apiClient.get<AttendanceRecord[]>('/attendance/records', {
      params,
    });
    return res.data;
  },

  async regularizeRecord(recordId: string, payload: RegularizePayload): Promise<AttendanceRecord> {
    const res = await apiClient.patch<AttendanceRecord>(`/attendance/records/${recordId}`, payload);
    return res.data;
  },

  // Shifts
  async listShifts(includeInactive = false): Promise<Shift[]> {
    const res = await apiClient.get<Shift[]>('/shifts', {
      params: { include_inactive: includeInactive },
    });
    return res.data;
  },

  async createShift(payload: ShiftPayload): Promise<Shift> {
    const res = await apiClient.post<Shift>('/shifts', payload);
    return res.data;
  },

  async updateShift(shiftId: string, payload: Partial<ShiftPayload>): Promise<Shift> {
    const res = await apiClient.patch<Shift>(`/shifts/${shiftId}`, payload);
    return res.data;
  },

  async deactivateShift(shiftId: string): Promise<{ message: string }> {
    const res = await apiClient.delete<{ message: string }>(`/shifts/${shiftId}`);
    return res.data;
  },

  async listShiftAssignments(userId?: string): Promise<ShiftAssignment[]> {
    const res = await apiClient.get<ShiftAssignment[]>('/shifts/assignments', {
      params: { user_id: userId },
    });
    return res.data;
  },

  async assignShift(payload: ShiftAssignmentPayload): Promise<ShiftAssignment> {
    const res = await apiClient.post<ShiftAssignment>('/shifts/assignments', payload);
    return res.data;
  },

  // Leaves
  async listLeaves(params?: { status?: string; userId?: string }): Promise<LeaveRequest[]> {
    const res = await apiClient.get<LeaveRequest[]>('/leaves', { params });
    return res.data;
  },

  async requestLeave(payload: LeavePayload): Promise<LeaveRequest> {
    const res = await apiClient.post<LeaveRequest>('/leaves', payload);
    return res.data;
  },

  async reviewLeave(leaveId: string, payload: LeaveReviewPayload): Promise<LeaveRequest> {
    const res = await apiClient.patch<LeaveRequest>(`/leaves/${leaveId}/review`, payload);
    return res.data;
  },

  async cancelLeave(leaveId: string): Promise<{ message: string }> {
    const res = await apiClient.delete<{ message: string }>(`/leaves/${leaveId}`);
    return res.data;
  },
};
