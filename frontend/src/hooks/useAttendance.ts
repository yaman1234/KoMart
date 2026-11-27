import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { QUERY_KEYS, STALE_TIME } from '@/constants';
import { attendanceService } from '@/services';
import type {
  PunchPayload,
  ShiftPayload,
  ShiftAssignmentPayload,
  ShiftAssignmentUpdatePayload,
  LeavePayload,
  LeaveReviewPayload,
  RegularizePayload,
} from '@/types';

export function useAttendanceToday(enabled = true) {
  return useQuery({
    queryKey: QUERY_KEYS.attendanceToday,
    queryFn: () => attendanceService.getTodayStatus(),
    enabled,
    staleTime: STALE_TIME.realtime,
    refetchInterval: 30000,
  });
}

export function usePunchAttendance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: PunchPayload) => attendanceService.punch(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.attendanceToday });
      void queryClient.invalidateQueries({ queryKey: ['attendance', 'roster'] });
      void queryClient.invalidateQueries({ queryKey: ['attendance', 'summary'] });
      void queryClient.invalidateQueries({ queryKey: ['attendance', 'history'] });
      void queryClient.invalidateQueries({ queryKey: ['attendance', 'records'] });
    },
  });
}

export function useAttendanceMyHistory(month?: string, limit = 31) {
  return useQuery({
    queryKey: QUERY_KEYS.attendanceHistory(month),
    queryFn: () => attendanceService.getMyHistory(month, limit),
    staleTime: STALE_TIME.standard,
  });
}

export function useAttendanceLiveRoster(date?: string, enabled = true) {
  return useQuery({
    queryKey: QUERY_KEYS.attendanceRoster(date),
    queryFn: () => attendanceService.getLiveRoster(date),
    enabled,
    staleTime: STALE_TIME.realtime,
    refetchInterval: 30000,
  });
}

export function useAttendanceSummary(date?: string, enabled = true) {
  return useQuery({
    queryKey: QUERY_KEYS.attendanceSummary(date),
    queryFn: () => attendanceService.getSummary(date),
    enabled,
    staleTime: STALE_TIME.realtime,
  });
}

export function useAttendanceRecords(
  params?: { date?: string; userId?: string; status?: string; limit?: number },
  enabled = true,
) {
  return useQuery({
    queryKey: QUERY_KEYS.attendanceRecords(JSON.stringify(params ?? {})),
    queryFn: () => attendanceService.listRecords(params),
    enabled,
    staleTime: STALE_TIME.standard,
  });
}

export function useRegularizeAttendance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ recordId, payload }: { recordId: string; payload: RegularizePayload }) =>
      attendanceService.regularizeRecord(recordId, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['attendance'] });
    },
  });
}

export function useShifts(includeInactive = false) {
  return useQuery({
    queryKey: [...QUERY_KEYS.shifts, includeInactive],
    queryFn: () => attendanceService.listShifts(includeInactive),
    staleTime: STALE_TIME.standard,
  });
}

export function useCreateShift() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: ShiftPayload) => attendanceService.createShift(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.shifts });
    },
  });
}

export function useUpdateShift() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ shiftId, payload }: { shiftId: string; payload: Partial<ShiftPayload> }) =>
      attendanceService.updateShift(shiftId, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.shifts });
    },
  });
}

export function useDeleteShift() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (shiftId: string) => attendanceService.deactivateShift(shiftId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.shifts });
    },
  });
}

export function useShiftAssignments(userId?: string) {
  return useQuery({
    queryKey: QUERY_KEYS.shiftAssignments(userId),
    queryFn: () => attendanceService.listShiftAssignments(userId),
    staleTime: STALE_TIME.standard,
  });
}

export function useAssignShift() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: ShiftAssignmentPayload) => attendanceService.assignShift(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['shifts', 'assignments'] });
    },
  });
}

export function useUpdateShiftAssignment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      assignmentId,
      payload,
    }: {
      assignmentId: string;
      payload: ShiftAssignmentUpdatePayload;
    }) => attendanceService.updateShiftAssignment(assignmentId, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['shifts', 'assignments'] });
    },
  });
}

export function useDeleteShiftAssignment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (assignmentId: string) => attendanceService.deleteShiftAssignment(assignmentId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['shifts', 'assignments'] });
    },
  });
}

export function useLeaves(params?: { status?: string; userId?: string }) {
  return useQuery({
    queryKey: QUERY_KEYS.leaves(JSON.stringify(params ?? {})),
    queryFn: () => attendanceService.listLeaves(params),
    staleTime: STALE_TIME.standard,
  });
}

export function useRequestLeave() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: LeavePayload) => attendanceService.requestLeave(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['leaves'] });
    },
  });
}

export function useReviewLeave() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ leaveId, payload }: { leaveId: string; payload: LeaveReviewPayload }) =>
      attendanceService.reviewLeave(leaveId, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['leaves'] });
      void queryClient.invalidateQueries({ queryKey: ['attendance'] });
    },
  });
}

export function useCancelLeave() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (leaveId: string) => attendanceService.cancelLeave(leaveId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['leaves'] });
    },
  });
}
