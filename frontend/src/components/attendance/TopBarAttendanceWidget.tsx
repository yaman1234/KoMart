import { useState } from 'react';
import {
  Box,
  Button,
  Chip,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Typography,
  CircularProgress,
  Divider,
  Alert,
  Tooltip,
} from '@mui/material';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import FreeBreakfastIcon from '@mui/icons-material/FreeBreakfast';
import RestaurantIcon from '@mui/icons-material/Restaurant';
import LogoutIcon from '@mui/icons-material/Logout';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';

import { useAttendanceToday, usePunchAttendance } from '@/hooks/useAttendance';
import { useMyTodayChecklists } from '@/hooks/useChecklists';
import { useStoreSettings } from '@/hooks/useSettings';
import { showSuccess, showError } from '@/utils/toast';
import { formatNepalTime } from '@/utils';
import type { BreakType, PunchAction } from '@/types';

function formatMins(totalMinutes: number): string {
  const hrs = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  return `${String(hrs).padStart(2, '0')}h ${String(mins).padStart(2, '0')}m`;
}

export function TopBarAttendanceWidget() {
  const { data: storeSettings } = useStoreSettings();
  const { data: today, isLoading } = useAttendanceToday();
  const { data: checklists = [] } = useMyTodayChecklists();
  const punchMutation = usePunchAttendance();

  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<PunchAction | null>(null);
  const [pendingBreakType, setPendingBreakType] = useState<BreakType | undefined>(undefined);
  const [notes, setNotes] = useState('');

  if (storeSettings?.attendanceConfig?.attendanceEnabled === false || isLoading || !today) {
    return null;
  }

  const handleOpenAction = (action: PunchAction, breakType?: BreakType) => {
    setMenuAnchor(null);
    setPendingAction(action);
    setPendingBreakType(breakType);
    setNotes('');
    setDialogOpen(true);
  };

  const handleConfirmPunch = async () => {
    if (!pendingAction) return;

    try {
      await punchMutation.mutateAsync({
        action: pendingAction,
        breakType: pendingBreakType,
        notes: notes.trim() || undefined,
      });

      if (pendingAction === 'clock_in') {
        showSuccess('Clocked in successfully! Have a great shift.');
      } else if (pendingAction === 'break_start') {
        showSuccess(`Started ${pendingBreakType || 'tea'} break.`);
      } else if (pendingAction === 'break_end') {
        showSuccess('Break ended. Welcome back!');
      } else if (pendingAction === 'clock_out') {
        showSuccess('Clocked out successfully. Take care!');
      }

      setDialogOpen(false);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        'Punch action failed';
      showError(msg);
    }
  };

  // State 1: Not clocked in yet today
  if (!today.hasClockedIn) {
    return (
      <>
        <Button
          size="small"
          variant="outlined"
          color="primary"
          startIcon={<AccessTimeIcon />}
          onClick={() => handleOpenAction('clock_in')}
          disabled={punchMutation.isPending}
          sx={{ textTransform: 'none', fontWeight: 600, borderRadius: 2 }}
        >
          Clock In
        </Button>

        <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="xs" fullWidth>
          <DialogTitle sx={{ fontWeight: 600 }}>Clock In for Today</DialogTitle>
          <DialogContent>
            <Box sx={{ mb: 2, p: 1.5, bgcolor: 'action.hover', border: '1px solid', borderColor: 'divider', borderRadius: 1.5 }}>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                Clock In Time: {formatNepalTime(new Date().toISOString())}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Punches are recorded in store standard time
              </Typography>
            </Box>
            {today.shift && (
              <Box sx={{ mb: 2, p: 1.5, bgcolor: 'action.hover', borderRadius: 1.5 }}>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  Assigned Shift: {today.shift.name}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Hours: {today.shift.startTime} – {today.shift.endTime} (Grace: {today.shift.gracePeriodMinutes} mins)
                </Typography>
              </Box>
            )}
            <TextField
              label="Optional Note / Register No."
              placeholder="e.g. Counter 1 opening"
              fullWidth
              size="small"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              sx={{ mt: 1 }}
            />
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button onClick={() => setDialogOpen(false)} color="inherit">
              Cancel
            </Button>
            <Button
              variant="contained"
              color="primary"
              onClick={handleConfirmPunch}
              disabled={punchMutation.isPending}
              startIcon={punchMutation.isPending ? <CircularProgress size={16} /> : <PlayArrowIcon />}
            >
              Confirm Clock In
            </Button>
          </DialogActions>
        </Dialog>
      </>
    );
  }

  // State 2: Already clocked out for the day
  if (today.hasClockedOut) {
    const inTime = formatNepalTime(today.record?.clockIn);
    const outTime = formatNepalTime(today.record?.clockOut);
    return (
      <Tooltip title={`Clock In: ${inTime} · Clock Out: ${outTime}`}>
        <Chip
          icon={<CheckCircleIcon color="success" />}
          label={`In: ${inTime} · Out: ${outTime} (${formatMins(today.record?.effectiveWorkMinutes || 0)})`}
          variant="outlined"
          size="small"
          sx={{ fontWeight: 600, color: 'text.secondary', cursor: 'help' }}
        />
      </Tooltip>
    );
  }

  // State 3: Currently on break
  if (today.isOnBreak) {
    const breakStart = formatNepalTime(today.activeBreakStart || today.record?.breaks?.slice(-1)[0]?.startTime);
    return (
      <>
        <Tooltip title={`Break started at ${breakStart}`}>
          <Chip
            icon={<FreeBreakfastIcon sx={{ color: '#EA580C !important' }} />}
            label={`On ${today.currentBreakType || 'Tea'} Break (${breakStart})`}
            color="warning"
            variant="filled"
            size="small"
            onClick={() => handleOpenAction('break_end')}
            sx={{
              fontWeight: 600,
              cursor: 'pointer',
              bgcolor: '#FFF7ED',
              color: '#C2410C',
              borderColor: '#FDBA74',
              '&:hover': { bgcolor: '#FFEDD5' },
            }}
          />
        </Tooltip>

        <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="xs" fullWidth>
          <DialogTitle sx={{ fontWeight: 600 }}>Resume Work</DialogTitle>
          <DialogContent>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Are you ready to end your {today.currentBreakType || 'tea'} break and resume your shift?
            </Typography>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button onClick={() => setDialogOpen(false)} color="inherit">
              Cancel
            </Button>
            <Button
              variant="contained"
              color="primary"
              onClick={handleConfirmPunch}
              disabled={punchMutation.isPending}
            >
              End Break & Resume
            </Button>
          </DialogActions>
        </Dialog>
      </>
    );
  }

  // State 4: Actively working / clocked in
  const inTime = formatNepalTime(today.record?.clockIn);
  return (
    <>
      <Tooltip title={`Clocked in at ${inTime}`}>
        <Chip
          icon={<AccessTimeIcon sx={{ color: '#16A34A !important' }} />}
          label={`In: ${inTime} · Working (${formatMins(today.elapsedWorkMinutes)})`}
          color="success"
          variant="outlined"
          size="small"
          onClick={(e) => setMenuAnchor(e.currentTarget)}
          sx={{
            fontWeight: 600,
            cursor: 'pointer',
            borderColor: '#86EFAC',
            bgcolor: '#F0FDF4',
            color: '#15803D',
            '&:hover': { bgcolor: '#DCFCE7' },
          }}
        />
      </Tooltip>

      <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={() => setMenuAnchor(null)}>
        <MenuItem onClick={() => handleOpenAction('break_start', 'tea')}>
          <ListItemIcon>
            <FreeBreakfastIcon fontSize="small" sx={{ color: '#EA580C' }} />
          </ListItemIcon>
          <ListItemText primary="Start Tea Break" secondary="Max 15 mins" />
        </MenuItem>
        <MenuItem onClick={() => handleOpenAction('break_start', 'lunch')}>
          <ListItemIcon>
            <RestaurantIcon fontSize="small" sx={{ color: '#2563EB' }} />
          </ListItemIcon>
          <ListItemText primary="Start Lunch Break" secondary="Max 45 mins" />
        </MenuItem>
        <Divider />
        <MenuItem onClick={() => handleOpenAction('clock_out')} sx={{ color: 'error.main' }}>
          <ListItemIcon>
            <LogoutIcon fontSize="small" color="error" />
          </ListItemIcon>
          <ListItemText primary="Clock Out" secondary="End of shift" />
        </MenuItem>
      </Menu>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 600 }}>
          {pendingAction === 'clock_out'
            ? 'Clock Out'
            : `Start ${pendingBreakType === 'lunch' ? 'Lunch' : 'Tea'} Break`}
        </DialogTitle>
        <DialogContent>
          {pendingAction === 'clock_out' && (() => {
            let pendingMandatory = 0;
            checklists.forEach((c) => {
              c.items.forEach((item) => {
                if (!item.isCompleted && item.isMandatory) {
                  pendingMandatory++;
                }
              });
            });
            if (pendingMandatory > 0) {
              return (
                <Alert severity="warning" sx={{ mb: 2 }}>
                  <strong>Checklist Notice:</strong> You have {pendingMandatory} uncompleted mandatory checklist {pendingMandatory === 1 ? 'task' : 'tasks'} today. Please complete your tasks or verify with your supervisor.
                </Alert>
              );
            }
            return null;
          })()}
          {pendingAction === 'clock_out' && (
            <Box sx={{ mb: 2, p: 1.5, bgcolor: 'action.hover', border: '1px solid', borderColor: 'divider', borderRadius: 1.5 }}>
              <Typography variant="body2">
                Clock In: <strong>{formatNepalTime(today.record?.clockIn)}</strong>
              </Typography>
              <Typography variant="body2" sx={{ mt: 0.5, fontWeight: 600, color: 'error.main' }}>
                Clock Out Time: <strong>{formatNepalTime(new Date().toISOString())}</strong>
              </Typography>
            </Box>
          )}
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {pendingAction === 'clock_out'
              ? 'Are you sure you want to clock out for the day? Make sure your till is balanced and handed over.'
              : `Confirm starting your ${pendingBreakType || 'tea'} break.`}
          </Typography>
          <TextField
            label="Optional Note"
            placeholder={pendingAction === 'clock_out' ? 'e.g. Register handed to Duty Manager' : ''}
            fullWidth
            size="small"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDialogOpen(false)} color="inherit">
            Cancel
          </Button>
          <Button
            variant="contained"
            color={pendingAction === 'clock_out' ? 'error' : 'primary'}
            onClick={handleConfirmPunch}
            disabled={punchMutation.isPending}
            startIcon={punchMutation.isPending ? <CircularProgress size={16} /> : undefined}
          >
            {pendingAction === 'clock_out' ? 'Confirm Clock Out' : 'Start Break'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
