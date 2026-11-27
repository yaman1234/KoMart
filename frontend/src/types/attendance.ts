export type AttendanceStatus =
  | 'present'
  | 'late'
  | 'half_day'
  | 'absent'
  | 'on_leave'
  | 'holiday'
  | 'day_off';

export type PunchAction = 'clock_in' | 'break_start' | 'break_end' | 'clock_out';

export type BreakType = 'lunch' | 'tea' | 'personal';

export interface BreakItem {
  breakType: BreakType;
  startTime: string;
  endTime?: string;
  durationMinutes: number;
  notes?: string;
}

export interface AttendanceRecord {
  id: string;
  userId: string;
  userName: string;
  userRole: string;
  date: string;
  shiftId?: string;
  shiftName?: string;
  scheduledStart?: string;
  scheduledEnd?: string;
  clockIn?: string;
  clockOut?: string;
  breaks: BreakItem[];
  isOnBreak: boolean;
  currentBreakType?: BreakType;
  totalWorkMinutes: number;
  totalBreakMinutes: number;
  effectiveWorkMinutes: number;
  overtimeMinutes: number;
  lateMinutes: number;
  earlyExitMinutes: number;
  status: AttendanceStatus;
  source: string;
  ipAddress?: string;
  deviceInfo?: string;
  notes?: string;
  isRegularized: boolean;
  regularizationReason?: string;
  regularizedBy?: string;
  regularizedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AttendanceTodayStatus {
  hasClockedIn: boolean;
  hasClockedOut: boolean;
  isOnBreak: boolean;
  currentBreakType?: BreakType;
  activeBreakStart?: string;
  elapsedWorkMinutes: number;
  record?: AttendanceRecord;
  shift?: {
    id: string;
    name: string;
    startTime: string;
    endTime: string;
    gracePeriodMinutes: number;
  };
}

export interface PunchPayload {
  action: PunchAction;
  breakType?: BreakType;
  notes?: string;
  deviceInfo?: string;
}

export interface AttendanceKPIs {
  date: string;
  totalStaff: number;
  presentCount: number;
  onFloorCount: number;
  onBreakCount: number;
  lateCount: number;
  absentCount: number;
  onLeaveCount: number;
}

export interface Shift {
  id: string;
  name: string;
  code: string;
  startTime: string;
  endTime: string;
  gracePeriodMinutes: number;
  halfDayThresholdMinutes: number;
  fullDayThresholdMinutes: number;
  breakAllowanceMinutes: number;
  colorCode: string;
  daysOfWeek: number[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ShiftPayload {
  name: string;
  code: string;
  startTime: string;
  endTime: string;
  gracePeriodMinutes?: number;
  halfDayThresholdMinutes?: number;
  fullDayThresholdMinutes?: number;
  breakAllowanceMinutes?: number;
  colorCode?: string;
  daysOfWeek?: number[];
  isActive?: boolean;
}

export interface ShiftAssignment {
  id: string;
  userId: string;
  userName: string;
  shiftId: string;
  shiftName: string;
  effectiveFrom: string;
  effectiveTo?: string;
  assignedBy: string;
  createdAt: string;
}

export interface ShiftAssignmentPayload {
  userId: string;
  shiftId: string;
  effectiveFrom: string;
  effectiveTo?: string;
}

export type LeaveType = 'casual' | 'sick' | 'annual' | 'unpaid' | 'maternity_paternity';
export type LeaveStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export interface LeaveRequest {
  id: string;
  userId: string;
  userName: string;
  leaveType: LeaveType;
  startDate: string;
  endDate: string;
  daysCount: number;
  isHalfDay: boolean;
  reason: string;
  status: LeaveStatus;
  reviewedBy?: string;
  reviewedByName?: string;
  reviewedAt?: string;
  rejectionReason?: string;
  createdAt: string;
}

export interface LeavePayload {
  leaveType: LeaveType;
  startDate: string;
  endDate: string;
  daysCount?: number;
  isHalfDay?: boolean;
  reason: string;
}

export interface LeaveReviewPayload {
  decision: 'approved' | 'rejected';
  rejectionReason?: string;
}

export interface RegularizePayload {
  clockIn?: string;
  clockOut?: string;
  status?: AttendanceStatus;
  reason: string;
}
