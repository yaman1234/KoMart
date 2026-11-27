import { useState } from 'react';
import {
  Box,
  Typography,
  Tabs,
  Tab,
  Paper,
  Grid,
  Card,
  CardContent,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableContainer,
  Chip,
  Button,
  IconButton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  FormControlLabel,
  Checkbox,
  CircularProgress,
  Alert,
} from '@mui/material';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import EventAvailableIcon from '@mui/icons-material/EventAvailable';
import ScheduleIcon from '@mui/icons-material/Schedule';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import * as XLSX from 'xlsx';

import { useAuthStore } from '@/store';
import {
  useAttendanceLiveRoster,
  useAttendanceSummary,
  useAttendanceMyHistory,
  useRegularizeAttendance,
  useShifts,
  useCreateShift,
  useUpdateShift,
  useDeleteShift,
  useShiftAssignments,
  useAssignShift,
  useLeaves,
  useRequestLeave,
  useReviewLeave,
  useCancelLeave,
} from '@/hooks/useAttendance';
import { useUsers } from '@/hooks/useUsers';
import { showSuccess, showError, showWarning } from '@/utils/toast';
import { formatNepalTime, toNepalDateTimeInputString, nepalDateTimeInputToUtcIso } from '@/utils';
import type {
  AttendanceRecord,
  AttendanceStatus,
  LeaveType,
  Shift,
} from '@/types';

function formatDuration(minutes: number): string {
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hrs}h ${mins}m`;
}

function formatTime(isoString?: string): string {
  return formatNepalTime(isoString);
}

function getStatusChip(status: AttendanceStatus) {
  switch (status) {
    case 'present':
      return <Chip label="Present" color="success" size="small" variant="filled" />;
    case 'late':
      return <Chip label="Late" color="warning" size="small" variant="filled" />;
    case 'half_day':
      return <Chip label="Half Day" color="warning" size="small" variant="outlined" />;
    case 'on_leave':
      return <Chip label="On Leave" color="info" size="small" variant="filled" />;
    case 'absent':
      return <Chip label="Absent" color="error" size="small" variant="outlined" />;
    default:
      return <Chip label={status} size="small" />;
  }
}

export function AttendancePage() {
  const user = useAuthStore((s) => s.user);
  const isManagerOrAdmin = user?.role === 'admin' || user?.role === 'manager';

  const [activeTab, setActiveTab] = useState(isManagerOrAdmin ? 0 : 1);

  // Queries
  const { data: roster = [], isLoading: rosterLoading } = useAttendanceLiveRoster(undefined, isManagerOrAdmin);
  const { data: summary } = useAttendanceSummary(undefined, isManagerOrAdmin);
  const { data: myHistory = [], isLoading: historyLoading } = useAttendanceMyHistory();
  const { data: shifts = [] } = useShifts();
  const { data: assignments = [] } = useShiftAssignments();
  const { data: leaves = [], isLoading: leavesLoading } = useLeaves();
  const { data: users = [] } = useUsers();

  // Mutations
  const regularizeMutation = useRegularizeAttendance();
  const requestLeaveMutation = useRequestLeave();
  const reviewLeaveMutation = useReviewLeave();
  const cancelLeaveMutation = useCancelLeave();
  const createShiftMutation = useCreateShift();
  const updateShiftMutation = useUpdateShift();
  const deleteShiftMutation = useDeleteShift();
  const assignShiftMutation = useAssignShift();

  const [editingShift, setEditingShift] = useState<Shift | null>(null);

  // Regularize Dialog State
  const [selectedRecord, setSelectedRecord] = useState<AttendanceRecord | null>(null);
  const [regClockIn, setRegClockIn] = useState('');
  const [regClockOut, setRegClockOut] = useState('');
  const [regStatus, setRegStatus] = useState<AttendanceStatus>('present');
  const [regReason, setRegReason] = useState('');

  // Leave Dialog State
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);
  const [leaveType, setLeaveType] = useState<LeaveType>('casual');
  const [leaveStart, setLeaveStart] = useState('');
  const [leaveEnd, setLeaveEnd] = useState('');
  const [leaveHalfDay, setLeaveHalfDay] = useState(false);
  const [leaveReason, setLeaveReason] = useState('');

  // Shift Dialog State
  const [shiftDialogOpen, setShiftDialogOpen] = useState(false);
  const [shiftName, setShiftName] = useState('');
  const [shiftCode, setShiftCode] = useState('');
  const [shiftStart, setShiftStart] = useState('08:00');
  const [shiftEnd, setShiftEnd] = useState('16:00');
  const [shiftGrace, setShiftGrace] = useState(15);
  const [shiftColor, setShiftColor] = useState('#2563EB');

  // Assign Shift State
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [assignUser, setAssignUser] = useState('');
  const [assignShiftId, setAssignShiftId] = useState('');
  const [assignEffectiveFrom, setAssignEffectiveFrom] = useState(
    new Date().toISOString().split('T')[0],
  );

  const handleOpenRegularize = (record: AttendanceRecord) => {
    setSelectedRecord(record);
    setRegClockIn(record.clockIn ? toNepalDateTimeInputString(record.clockIn) : '');
    setRegClockOut(record.clockOut ? toNepalDateTimeInputString(record.clockOut) : '');
    setRegStatus(record.status);
    setRegReason('');
  };

  const handleSaveRegularization = async () => {
    if (!selectedRecord || !regReason.trim()) {
      showError('Please provide a reason for attendance regularization.');
      return;
    }
    try {
      await regularizeMutation.mutateAsync({
        recordId: selectedRecord.id,
        payload: {
          clockIn: regClockIn ? nepalDateTimeInputToUtcIso(regClockIn) : undefined,
          clockOut: regClockOut ? nepalDateTimeInputToUtcIso(regClockOut) : undefined,
          status: regStatus,
          reason: regReason.trim(),
        },
      });
      showSuccess('Attendance record regularized successfully.');
      setSelectedRecord(null);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        'Failed to regularize record';
      showError(msg);
    }
  };

  const handleApplyLeave = async () => {
    if (!leaveStart || !leaveEnd || !leaveReason.trim()) {
      showError('Please fill all required leave details.');
      return;
    }
    try {
      await requestLeaveMutation.mutateAsync({
        leaveType,
        startDate: leaveStart,
        endDate: leaveEnd,
        isHalfDay: leaveHalfDay,
        reason: leaveReason.trim(),
      });
      showSuccess('Leave request submitted for manager review.');
      setLeaveDialogOpen(false);
      setLeaveReason('');
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        'Failed to submit leave request';
      showError(msg);
    }
  };

  const handleReviewLeave = async (leaveId: string, decision: 'approved' | 'rejected') => {
    try {
      await reviewLeaveMutation.mutateAsync({
        leaveId,
        payload: { decision },
      });
      showSuccess(`Leave request ${decision}.`);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        'Failed to review leave';
      showError(msg);
    }
  };

  const handleCancelLeave = async (leaveId: string) => {
    try {
      await cancelLeaveMutation.mutateAsync(leaveId);
      showSuccess('Leave request cancelled.');
    } catch (err: unknown) {
      showError('Failed to cancel leave request.');
    }
  };

  const handleOpenCreateShift = () => {
    setEditingShift(null);
    setShiftName('');
    setShiftCode('');
    setShiftStart('08:00');
    setShiftEnd('16:00');
    setShiftGrace(15);
    setShiftColor('#2563EB');
    setShiftDialogOpen(true);
  };

  const handleOpenEditShift = (s: Shift) => {
    setEditingShift(s);
    setShiftName(s.name);
    setShiftCode(s.code);
    setShiftStart(s.startTime);
    setShiftEnd(s.endTime);
    setShiftGrace(s.gracePeriodMinutes);
    setShiftColor(s.colorCode || '#2563EB');
    setShiftDialogOpen(true);
  };

  const handleDeleteShift = async (s: Shift) => {
    if (window.confirm(`Are you sure you want to delete shift "${s.name}" (${s.code})?`)) {
      try {
        await deleteShiftMutation.mutateAsync(s.id);
        showSuccess(`Shift "${s.name}" deleted successfully.`);
      } catch (err: unknown) {
        const msg =
          (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
          'Failed to delete shift';
        showError(msg);
      }
    }
  };

  const handleSaveShift = async () => {
    if (!shiftName.trim() || (!editingShift && !shiftCode.trim())) {
      showError('Please fill in all required shift fields.');
      return;
    }
    try {
      if (editingShift) {
        await updateShiftMutation.mutateAsync({
          shiftId: editingShift.id,
          payload: {
            name: shiftName.trim(),
            startTime: shiftStart,
            endTime: shiftEnd,
            gracePeriodMinutes: Number(shiftGrace),
            colorCode: shiftColor,
          },
        });
        showSuccess(`Shift "${shiftName}" updated successfully.`);
      } else {
        await createShiftMutation.mutateAsync({
          name: shiftName.trim(),
          code: shiftCode.trim().toUpperCase(),
          startTime: shiftStart,
          endTime: shiftEnd,
          gracePeriodMinutes: Number(shiftGrace),
          colorCode: shiftColor,
        });
        showSuccess(`Shift "${shiftName}" created successfully.`);
      }
      setShiftDialogOpen(false);
      setEditingShift(null);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        (editingShift ? 'Failed to update shift' : 'Failed to create shift');
      showError(msg);
    }
  };

  const handleAssignShift = async () => {
    if (!assignUser || !assignShiftId || !assignEffectiveFrom) {
      showError('Please select staff member, shift, and effective date.');
      return;
    }
    try {
      await assignShiftMutation.mutateAsync({
        userId: assignUser,
        shiftId: assignShiftId,
        effectiveFrom: assignEffectiveFrom,
      });
      showSuccess('Shift assigned to staff successfully.');
      setAssignDialogOpen(false);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        'Failed to assign shift';
      showError(msg);
    }
  };

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            Staff Attendance & Workforce
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Live store presence, shift scheduling, and leave management
          </Typography>
        </Box>
      </Box>

      {/* Tabs */}
      <Paper sx={{ mb: 3, borderRadius: 2 }}>
        <Tabs
          value={activeTab}
          onChange={(_, val) => setActiveTab(val)}
          variant="scrollable"
          scrollButtons="auto"
          sx={{ borderBottom: 1, borderColor: 'divider' }}
        >
          {isManagerOrAdmin && <Tab icon={<AccessTimeIcon />} iconPosition="start" label="Live Floor Roster" />}
          <Tab icon={<CalendarMonthIcon />} iconPosition="start" label="My Timesheet" />
          <Tab icon={<EventAvailableIcon />} iconPosition="start" label="Leave Management" />
          {isManagerOrAdmin && <Tab icon={<ScheduleIcon />} iconPosition="start" label="Shifts & Rostering" />}
        </Tabs>
      </Paper>

      {/* Tab 0: Live Floor Roster (Manager/Admin) */}
      {isManagerOrAdmin && activeTab === 0 && (
        <Box>
          {/* KPI Cards */}
          {summary && (
            <Grid container spacing={2} sx={{ mb: 3 }}>
              <Grid size={{ xs: 6, sm: 4, md: 2 }}>
                <Card sx={{ bgcolor: 'background.paper', borderRadius: 2 }}>
                  <CardContent sx={{ py: 1.5, px: 2, '&:last-child': { pb: 1.5 } }}>
                    <Typography variant="caption" color="text.secondary">
                      Total Staff
                    </Typography>
                    <Typography variant="h6" sx={{ fontWeight: 700 }}>
                      {summary.totalStaff}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
              <Grid size={{ xs: 6, sm: 4, md: 2 }}>
                <Card sx={{ bgcolor: '#F0FDF4', borderRadius: 2 }}>
                  <CardContent sx={{ py: 1.5, px: 2, '&:last-child': { pb: 1.5 } }}>
                    <Typography variant="caption" sx={{ color: '#15803D' }}>
                      Present Today
                    </Typography>
                    <Typography variant="h6" sx={{ fontWeight: 700, color: '#15803D' }}>
                      {summary.presentCount}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
              <Grid size={{ xs: 6, sm: 4, md: 2 }}>
                <Card sx={{ bgcolor: '#EFF6FF', borderRadius: 2 }}>
                  <CardContent sx={{ py: 1.5, px: 2, '&:last-child': { pb: 1.5 } }}>
                    <Typography variant="caption" sx={{ color: '#1D4ED8' }}>
                      On Floor Now
                    </Typography>
                    <Typography variant="h6" sx={{ fontWeight: 700, color: '#1D4ED8' }}>
                      {summary.onFloorCount}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
              <Grid size={{ xs: 6, sm: 4, md: 2 }}>
                <Card sx={{ bgcolor: '#FFF7ED', borderRadius: 2 }}>
                  <CardContent sx={{ py: 1.5, px: 2, '&:last-child': { pb: 1.5 } }}>
                    <Typography variant="caption" sx={{ color: '#C2410C' }}>
                      On Break
                    </Typography>
                    <Typography variant="h6" sx={{ fontWeight: 700, color: '#C2410C' }}>
                      {summary.onBreakCount}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
              <Grid size={{ xs: 6, sm: 4, md: 2 }}>
                <Card sx={{ bgcolor: '#FEF3C7', borderRadius: 2 }}>
                  <CardContent sx={{ py: 1.5, px: 2, '&:last-child': { pb: 1.5 } }}>
                    <Typography variant="caption" sx={{ color: '#B45309' }}>
                      Late Arrivals
                    </Typography>
                    <Typography variant="h6" sx={{ fontWeight: 700, color: '#B45309' }}>
                      {summary.lateCount}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
              <Grid size={{ xs: 6, sm: 4, md: 2 }}>
                <Card sx={{ bgcolor: '#F1F5F9', borderRadius: 2 }}>
                  <CardContent sx={{ py: 1.5, px: 2, '&:last-child': { pb: 1.5 } }}>
                    <Typography variant="caption" color="text.secondary">
                      On Leave
                    </Typography>
                    <Typography variant="h6" sx={{ fontWeight: 700 }}>
                      {summary.onLeaveCount}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
          )}

          {/* Roster Table */}
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5, mt: 2 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
              Store Floor Attendance ({roster.length} Staff)
            </Typography>
            <Button
              variant="outlined"
              size="small"
              startIcon={<FileDownloadIcon />}
              onClick={() => {
                if (roster.length === 0) {
                  showWarning('No roster records to export.');
                  return;
                }
                const rows = roster.map((r) => ({
                  Employee: r.userName,
                  Role: r.userRole.toUpperCase(),
                  Date: r.date,
                  Status: r.status.toUpperCase(),
                  'Clock In': r.clockIn ? formatTime(r.clockIn) : '-',
                  'Clock Out': r.clockOut ? formatTime(r.clockOut) : '-',
                  'Late (mins)': r.lateMinutes || 0,
                  'Break (mins)': r.totalBreakMinutes || 0,
                  'Work Time': r.effectiveWorkMinutes > 0 ? formatDuration(r.effectiveWorkMinutes) : '-',
                  'IP Address': r.ipAddress || '-',
                }));
                const ws = XLSX.utils.json_to_sheet(rows);
                const wb = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(wb, ws, 'Floor Roster');
                XLSX.writeFile(wb, `KoMart_Floor_Roster_${new Date().toISOString().slice(0, 10)}.xlsx`);
                showSuccess('Floor roster exported to Excel successfully!');
              }}
            >
              Export Excel
            </Button>
          </Box>
          <TableContainer component={Paper} sx={{ borderRadius: 2 }}>
            <Table size="small">
              <TableHead sx={{ bgcolor: 'action.hover' }}>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600 }}>Employee</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Role</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Shift</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Clock In (Nepal Time)</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Clock Out (Nepal Time)</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Work Duration</TableCell>
                  <TableCell sx={{ fontWeight: 600 }} align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rosterLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} align="center" sx={{ py: 4 }}>
                      <CircularProgress size={24} />
                    </TableCell>
                  </TableRow>
                ) : roster.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                      No attendance records for today yet. Staff will appear here once clocked in.
                    </TableCell>
                  </TableRow>
                ) : (
                  roster.map((r) => (
                    <TableRow key={r.id} hover>
                      <TableCell sx={{ fontWeight: 600 }}>{r.userName}</TableCell>
                      <TableCell>
                        <Chip label={r.userRole} size="small" variant="outlined" />
                      </TableCell>
                      <TableCell>{r.shiftName || 'Standard'}</TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Typography variant="body2">{formatTime(r.clockIn)}</Typography>
                          {r.lateMinutes > 0 && (
                            <Tooltip title={`Late by ${r.lateMinutes} mins`}>
                              <Chip
                                icon={<WarningAmberIcon fontSize="small" />}
                                label={`+${r.lateMinutes}m`}
                                color="warning"
                                size="small"
                                sx={{ height: 20 }}
                              />
                            </Tooltip>
                          )}
                        </Box>
                      </TableCell>
                      <TableCell>
                        {r.isOnBreak ? (
                          <Chip
                            label={`On ${r.currentBreakType || 'Tea'} Break`}
                            color="warning"
                            size="small"
                          />
                        ) : (
                          getStatusChip(r.status)
                        )}
                      </TableCell>
                      <TableCell>{formatTime(r.clockOut)}</TableCell>
                      <TableCell>
                        {r.effectiveWorkMinutes > 0 ? formatDuration(r.effectiveWorkMinutes) : '—'}
                      </TableCell>
                      <TableCell align="right">
                        <Tooltip title="Regularize / Edit Punch">
                          <IconButton size="small" onClick={() => handleOpenRegularize(r)}>
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      )}

      {/* Tab 1: My Timesheet */}
      {activeTab === (isManagerOrAdmin ? 1 : 0) && (
        <Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
              Monthly Timesheet Records
            </Typography>
            <Button
              variant="outlined"
              size="small"
              startIcon={<FileDownloadIcon />}
              onClick={() => {
                if (myHistory.length === 0) {
                  showWarning('No timesheet records to export.');
                  return;
                }
                const rows = myHistory.map((h) => ({
                  Date: h.date,
                  Shift: h.shiftName || 'Standard',
                  'Clock In': h.clockIn ? formatTime(h.clockIn) : '-',
                  'Clock Out': h.clockOut ? formatTime(h.clockOut) : '-',
                  'Break Duration (mins)': h.totalBreakMinutes || 0,
                  'Net Work Time': h.effectiveWorkMinutes > 0 ? formatDuration(h.effectiveWorkMinutes) : '-',
                  'Work Minutes': h.effectiveWorkMinutes || 0,
                  Status: h.status.toUpperCase(),
                  'Notes / Remarks': h.notes || '',
                }));
                const ws = XLSX.utils.json_to_sheet(rows);
                const wb = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(wb, ws, 'My Timesheet');
                XLSX.writeFile(wb, `KoMart_Timesheet_${new Date().toISOString().slice(0, 10)}.xlsx`);
                showSuccess('Timesheet exported to Excel successfully!');
              }}
            >
              Export Timesheet (Excel)
            </Button>
          </Box>
          <TableContainer component={Paper} sx={{ borderRadius: 2 }}>
            <Table size="small">
              <TableHead sx={{ bgcolor: 'action.hover' }}>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600 }}>Date</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Shift</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Clock In (Nepal Time)</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Clock Out (Nepal Time)</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Total Break</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Net Work Time</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Notes</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {historyLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} align="center" sx={{ py: 4 }}>
                      <CircularProgress size={24} />
                    </TableCell>
                  </TableRow>
                ) : myHistory.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                      No punch history recorded yet. Use the TopBar widget to clock in!
                    </TableCell>
                  </TableRow>
                ) : (
                  myHistory.map((h) => (
                    <TableRow key={h.id} hover>
                      <TableCell sx={{ fontWeight: 600 }}>{h.date}</TableCell>
                      <TableCell>{h.shiftName || 'Standard'}</TableCell>
                      <TableCell>{formatTime(h.clockIn)}</TableCell>
                      <TableCell>{formatTime(h.clockOut)}</TableCell>
                      <TableCell>{h.totalBreakMinutes > 0 ? `${h.totalBreakMinutes}m` : '—'}</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>
                        {h.effectiveWorkMinutes > 0 ? formatDuration(h.effectiveWorkMinutes) : '—'}
                      </TableCell>
                      <TableCell>{getStatusChip(h.status)}</TableCell>
                      <TableCell sx={{ color: 'text.secondary', maxWidth: 200, textOverflow: 'ellipsis' }}>
                        {h.notes || '—'}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      )}

      {/* Tab 2: Leave Management */}
      {activeTab === (isManagerOrAdmin ? 2 : 1) && (
        <Box>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => setLeaveDialogOpen(true)}
              size="small"
            >
              Request Leave
            </Button>
          </Box>

          <TableContainer component={Paper} sx={{ borderRadius: 2 }}>
            <Table size="small">
              <TableHead sx={{ bgcolor: 'action.hover' }}>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600 }}>Employee</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Type</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Start Date</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>End Date</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Days</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Reason</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                  <TableCell sx={{ fontWeight: 600 }} align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {leavesLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} align="center" sx={{ py: 4 }}>
                      <CircularProgress size={24} />
                    </TableCell>
                  </TableRow>
                ) : leaves.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                      No leave applications found.
                    </TableCell>
                  </TableRow>
                ) : (
                  leaves.map((l) => (
                    <TableRow key={l.id} hover>
                      <TableCell sx={{ fontWeight: 600 }}>{l.userName}</TableCell>
                      <TableCell>
                        <Chip label={l.leaveType.toUpperCase()} size="small" variant="outlined" />
                      </TableCell>
                      <TableCell>{l.startDate}</TableCell>
                      <TableCell>{l.endDate}</TableCell>
                      <TableCell>{l.daysCount} {l.isHalfDay ? '(Half)' : ''}</TableCell>
                      <TableCell sx={{ maxWidth: 220, textOverflow: 'ellipsis' }}>{l.reason}</TableCell>
                      <TableCell>
                        <Chip
                          label={l.status.toUpperCase()}
                          size="small"
                          color={
                            l.status === 'approved'
                              ? 'success'
                              : l.status === 'rejected'
                              ? 'error'
                              : l.status === 'pending'
                              ? 'warning'
                              : 'default'
                          }
                        />
                      </TableCell>
                      <TableCell align="right">
                        {isManagerOrAdmin && l.status === 'pending' && (
                          <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
                            <Tooltip title="Approve Leave">
                              <IconButton
                                size="small"
                                color="success"
                                onClick={() => handleReviewLeave(l.id, 'approved')}
                              >
                                <CheckCircleIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Reject Leave">
                              <IconButton
                                size="small"
                                color="error"
                                onClick={() => handleReviewLeave(l.id, 'rejected')}
                              >
                                <CancelIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </Box>
                        )}
                        {!isManagerOrAdmin && l.status === 'pending' && (
                          <Button size="small" color="error" onClick={() => handleCancelLeave(l.id)}>
                            Cancel
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      )}

      {/* Tab 3: Shifts & Rostering (Manager/Admin) */}
      {isManagerOrAdmin && activeTab === 3 && (
        <Box>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1.5, mb: 2 }}>
            <Button
              variant="outlined"
              startIcon={<PersonAddIcon />}
              onClick={() => setAssignDialogOpen(true)}
              size="small"
            >
              Assign Staff Shift
            </Button>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={handleOpenCreateShift}
              size="small"
            >
              Create Shift
            </Button>
          </Box>

          <Grid container spacing={3}>
            {/* Active Shifts Table */}
            <Grid size={{ xs: 12, md: 7 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
                Store Shift Definitions
              </Typography>
              <TableContainer component={Paper} sx={{ borderRadius: 2 }}>
                <Table size="small">
                  <TableHead sx={{ bgcolor: 'action.hover' }}>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 600 }}>Shift Name</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Code</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Hours</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Grace</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Half-Day Threshold</TableCell>
                      <TableCell sx={{ fontWeight: 600 }} align="right">Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {shifts.map((s) => (
                      <TableRow key={s.id} hover>
                        <TableCell sx={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: s.colorCode }} />
                          {s.name}
                        </TableCell>
                        <TableCell>
                          <Chip label={s.code} size="small" variant="outlined" />
                        </TableCell>
                        <TableCell>{s.startTime} – {s.endTime}</TableCell>
                        <TableCell>{s.gracePeriodMinutes}m</TableCell>
                        <TableCell>{s.halfDayThresholdMinutes / 60} hrs</TableCell>
                        <TableCell align="right">
                          <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
                            <Tooltip title="Edit Shift">
                              <IconButton size="small" onClick={() => handleOpenEditShift(s)}>
                                <EditIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Delete Shift">
                              <IconButton
                                size="small"
                                color="error"
                                onClick={() => handleDeleteShift(s)}
                                disabled={deleteShiftMutation.isPending}
                              >
                                <DeleteIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </Box>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Grid>

            {/* Shift Assignments Table */}
            <Grid size={{ xs: 12, md: 5 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
                Roster Assignments
              </Typography>
              <TableContainer component={Paper} sx={{ borderRadius: 2 }}>
                <Table size="small">
                  <TableHead sx={{ bgcolor: 'action.hover' }}>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 600 }}>Staff</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Assigned Shift</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>From</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {assignments.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={3} align="center" sx={{ py: 3, color: 'text.secondary' }}>
                          No explicit assignments. Staff default to store schedule.
                        </TableCell>
                      </TableRow>
                    ) : (
                      assignments.map((a) => (
                        <TableRow key={a.id} hover>
                          <TableCell sx={{ fontWeight: 600 }}>{a.userName}</TableCell>
                          <TableCell>{a.shiftName}</TableCell>
                          <TableCell>{a.effectiveFrom}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </Grid>
          </Grid>
        </Box>
      )}

      {/* Regularize Record Dialog */}
      <Dialog open={Boolean(selectedRecord)} onClose={() => setSelectedRecord(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 600 }}>Regularize Attendance</DialogTitle>
        <DialogContent>
          {selectedRecord && (
            <Box sx={{ pt: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Alert severity="info" sx={{ py: 0.5 }}>
                Employee: <strong>{selectedRecord.userName}</strong> ({selectedRecord.date})
              </Alert>
              <TextField
                label="Clock In Time (Nepal Time)"
                type="datetime-local"
                fullWidth
                size="small"
                value={regClockIn}
                onChange={(e) => setRegClockIn(e.target.value)}
                slotProps={{ inputLabel: { shrink: true } }}
                helperText="Store wall-clock time (Asia/Kathmandu, UTC+05:45)"
              />
              <TextField
                label="Clock Out Time (Nepal Time)"
                type="datetime-local"
                fullWidth
                size="small"
                value={regClockOut}
                onChange={(e) => setRegClockOut(e.target.value)}
                slotProps={{ inputLabel: { shrink: true } }}
                helperText="Store wall-clock time (Asia/Kathmandu, UTC+05:45)"
              />
              <TextField
                label="Status Override"
                select
                fullWidth
                size="small"
                value={regStatus}
                onChange={(e) => setRegStatus(e.target.value as AttendanceStatus)}
              >
                <MenuItem value="present">Present</MenuItem>
                <MenuItem value="late">Late</MenuItem>
                <MenuItem value="half_day">Half Day</MenuItem>
                <MenuItem value="absent">Absent</MenuItem>
                <MenuItem value="on_leave">On Leave</MenuItem>
              </TextField>
              <TextField
                label="Reason for Adjustment *"
                placeholder="e.g. Verified with till closing sheet"
                fullWidth
                multiline
                rows={2}
                size="small"
                value={regReason}
                onChange={(e) => setRegReason(e.target.value)}
                required
              />
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setSelectedRecord(null)} color="inherit">
            Cancel
          </Button>
          <Button
            variant="contained"
            color="primary"
            onClick={handleSaveRegularization}
            disabled={regularizeMutation.isPending}
          >
            Save Adjustments
          </Button>
        </DialogActions>
      </Dialog>

      {/* Request Leave Dialog */}
      <Dialog open={leaveDialogOpen} onClose={() => setLeaveDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 600 }}>Submit Leave Request</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              label="Leave Type"
              select
              fullWidth
              size="small"
              value={leaveType}
              onChange={(e) => setLeaveType(e.target.value as LeaveType)}
            >
              <MenuItem value="casual">Casual Leave</MenuItem>
              <MenuItem value="sick">Sick Leave</MenuItem>
              <MenuItem value="annual">Annual Leave</MenuItem>
              <MenuItem value="unpaid">Unpaid Leave</MenuItem>
            </TextField>
            <TextField
              label="Start Date *"
              type="date"
              fullWidth
              size="small"
              value={leaveStart}
              onChange={(e) => setLeaveStart(e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <TextField
              label="End Date *"
              type="date"
              fullWidth
              size="small"
              value={leaveEnd}
              onChange={(e) => setLeaveEnd(e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={leaveHalfDay}
                  onChange={(e) => setLeaveHalfDay(e.target.checked)}
                />
              }
              label="Half-Day Leave"
            />
            <TextField
              label="Reason *"
              fullWidth
              multiline
              rows={2}
              size="small"
              value={leaveReason}
              onChange={(e) => setLeaveReason(e.target.value)}
              required
            />
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setLeaveDialogOpen(false)} color="inherit">
            Cancel
          </Button>
          <Button
            variant="contained"
            color="primary"
            onClick={handleApplyLeave}
            disabled={requestLeaveMutation.isPending}
          >
            Submit Request
          </Button>
        </DialogActions>
      </Dialog>

      {/* Create / Edit Shift Dialog */}
      <Dialog open={shiftDialogOpen} onClose={() => setShiftDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 600 }}>
          {editingShift ? `Edit Shift — ${editingShift.name}` : 'Create New Shift'}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              label="Shift Name *"
              placeholder="e.g. Mid-Day Cashier"
              fullWidth
              size="small"
              value={shiftName}
              onChange={(e) => setShiftName(e.target.value)}
            />
            <TextField
              label="Shift Code *"
              placeholder="e.g. MID"
              fullWidth
              size="small"
              value={shiftCode}
              onChange={(e) => setShiftCode(e.target.value)}
              disabled={Boolean(editingShift)}
              helperText={editingShift ? 'Code cannot be changed once created' : undefined}
            />
            <TextField
              label="Start Time (HH:MM) *"
              type="time"
              fullWidth
              size="small"
              value={shiftStart}
              onChange={(e) => setShiftStart(e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <TextField
              label="End Time (HH:MM) *"
              type="time"
              fullWidth
              size="small"
              value={shiftEnd}
              onChange={(e) => setShiftEnd(e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <TextField
              label="Grace Period (Minutes)"
              type="number"
              fullWidth
              size="small"
              value={shiftGrace}
              onChange={(e) => setShiftGrace(Number(e.target.value))}
            />
            <TextField
              label="Color Code"
              fullWidth
              size="small"
              value={shiftColor}
              onChange={(e) => setShiftColor(e.target.value)}
            />
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setShiftDialogOpen(false)} color="inherit">
            Cancel
          </Button>
          <Button
            variant="contained"
            color="primary"
            onClick={handleSaveShift}
            disabled={createShiftMutation.isPending || updateShiftMutation.isPending}
          >
            {editingShift ? 'Save Changes' : 'Create Shift'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Assign Shift Dialog */}
      <Dialog open={assignDialogOpen} onClose={() => setAssignDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 600 }}>Assign Shift to Staff</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              label="Staff Member *"
              select
              fullWidth
              size="small"
              value={assignUser}
              onChange={(e) => setAssignUser(e.target.value)}
            >
              {users.map((u) => (
                <MenuItem key={u.id} value={u.id}>
                  {u.name} ({u.role})
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label="Select Shift *"
              select
              fullWidth
              size="small"
              value={assignShiftId}
              onChange={(e) => setAssignShiftId(e.target.value)}
            >
              {shifts.map((s) => (
                <MenuItem key={s.id} value={s.id}>
                  {s.name} ({s.startTime} – {s.endTime})
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label="Effective From *"
              type="date"
              fullWidth
              size="small"
              value={assignEffectiveFrom}
              onChange={(e) => setAssignEffectiveFrom(e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
            />
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setAssignDialogOpen(false)} color="inherit">
            Cancel
          </Button>
          <Button
            variant="contained"
            color="primary"
            onClick={handleAssignShift}
            disabled={assignShiftMutation.isPending}
          >
            Assign Shift
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
