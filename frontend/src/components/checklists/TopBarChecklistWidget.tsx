import { useState, useMemo } from 'react';
import {
  Box,
  Drawer,
  IconButton,
  Typography,
  Chip,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Checkbox,
  LinearProgress,
  Button,
  Divider,
  TextField,
  Tooltip,
  Paper,
} from '@mui/material';
import AssignmentTurnedInIcon from '@mui/icons-material/AssignmentTurnedIn';
import CloseIcon from '@mui/icons-material/Close';
import LaunchIcon from '@mui/icons-material/Launch';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { useNavigate } from 'react-router-dom';

import { useMyTodayChecklists, useToggleChecklistItem } from '@/hooks/useChecklists';
import { showError, showSuccess } from '@/utils/toast';
import type { DailyChecklist, DailyChecklistItem } from '@/types';

export function TopBarChecklistWidget() {
  const navigate = useNavigate();
  const { data: checklists = [], isLoading } = useMyTodayChecklists();
  const toggleMutation = useToggleChecklistItem();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingItemValues, setEditingItemValues] = useState<
    Record<string, { numericInput?: number; notes?: string }>
  >({});

  const { totalItems, completedItems, pendingMandatory } = useMemo(() => {
    let total = 0;
    let completed = 0;
    let mandatoryPending = 0;

    const list = Array.isArray(checklists) ? checklists : [];
    list.forEach((c) => {
      (c?.items || []).forEach((item) => {
        total++;
        if (item.isCompleted) {
          completed++;
        } else if (item.isMandatory) {
          mandatoryPending++;
        }
      });
    });

    return {
      totalItems: total,
      completedItems: completed,
      pendingMandatory: mandatoryPending,
    };
  }, [checklists]);

  if (isLoading || checklists.length === 0) {
    return null;
  }

  const completionPct = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;
  const isAllComplete = totalItems > 0 && completedItems === totalItems;

  const handleToggle = async (
    checklist: DailyChecklist,
    item: DailyChecklistItem,
    checked: boolean
  ) => {
    const editState = editingItemValues[item.id] || {};
    try {
      await toggleMutation.mutateAsync({
        checklistId: checklist.id,
        itemId: item.id,
        data: {
          isCompleted: checked,
          numericInput: editState.numericInput ?? item.numericInput,
          notes: editState.notes ?? item.notes,
        },
      });
      if (checked) {
        showSuccess(`Marked "${item.title}" complete`);
      }
    } catch {
      showError('Failed to update checklist item');
    }
  };

  const handleNumericChange = (itemId: string, value: string) => {
    const num = value === '' ? undefined : Number(value);
    setEditingItemValues((prev) => ({
      ...prev,
      [itemId]: { ...prev[itemId], numericInput: num },
    }));
  };

  const handleNotesChange = (itemId: string, notes: string) => {
    setEditingItemValues((prev) => ({
      ...prev,
      [itemId]: { ...prev[itemId], notes },
    }));
  };

  return (
    <>
      <Tooltip title="Today's Operational Checklist">
        <Chip
          icon={<AssignmentTurnedInIcon sx={{ fontSize: '1rem !important' }} />}
          label={`${completedItems}/${totalItems} Tasks`}
          onClick={() => setDrawerOpen(true)}
          color={isAllComplete ? 'success' : pendingMandatory > 0 ? 'warning' : 'default'}
          variant={isAllComplete ? 'filled' : 'outlined'}
          size="small"
          clickable
          sx={{
            fontWeight: 600,
            cursor: 'pointer',
            height: 32,
            px: 0.5,
          }}
        />
      </Tooltip>

      <Drawer
        anchor="right"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        slotProps={{
          paper: {
            sx: { width: { xs: '100%', sm: 420 }, p: 0, display: 'flex', flexDirection: 'column' },
          },
        }}
      >
        {/* Header */}
        <Box
          sx={{
            p: 2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: 1,
            borderColor: 'divider',
            bgcolor: 'background.paper',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <AssignmentTurnedInIcon color="primary" />
            <Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                Daily Operations Checklist
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {completedItems} of {totalItems} completed ({completionPct}%)
              </Typography>
            </Box>
          </Box>
          <IconButton size="small" onClick={() => setDrawerOpen(false)}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>

        {/* Progress Bar */}
        <Box sx={{ px: 2, pt: 1.5, pb: 1, bgcolor: 'background.default' }}>
          <LinearProgress
            variant="determinate"
            value={completionPct}
            color={isAllComplete ? 'success' : pendingMandatory > 0 ? 'warning' : 'primary'}
            sx={{ height: 8, borderRadius: 4 }}
          />
          {pendingMandatory > 0 && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.75 }}>
              <WarningAmberIcon sx={{ fontSize: 15, color: 'warning.main' }} />
              <Typography variant="caption" color="warning.main" sx={{ fontWeight: 500 }}>
                {pendingMandatory} mandatory {pendingMandatory === 1 ? 'task' : 'tasks'} pending
              </Typography>
            </Box>
          )}
        </Box>

        {/* Checklist Content */}
        <Box sx={{ flex: 1, overflowY: 'auto', p: 2 }}>
          {checklists.map((checklist) => (
            <Paper
              key={checklist.id}
              variant="outlined"
              sx={{ mb: 2, p: 1.5, borderRadius: 2 }}
            >
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  mb: 1,
                }}
              >
                <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                  {checklist.title}
                </Typography>
                <Chip
                  size="small"
                  label={`${checklist.completedItemsCount}/${checklist.totalItemsCount}`}
                  color={checklist.status === 'completed' ? 'success' : 'default'}
                  sx={{ height: 20, fontSize: '0.7rem' }}
                />
              </Box>

              {checklist.description && (
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                  {checklist.description}
                </Typography>
              )}

              <List dense disablePadding>
                {checklist.items.map((item) => {
                  const editState = editingItemValues[item.id] || {};
                  const currentNumeric = editState.numericInput ?? item.numericInput;
                  const currentNotes = editState.notes ?? item.notes;

                  return (
                    <ListItem
                      key={item.id}
                      disablePadding
                      sx={{
                        flexDirection: 'column',
                        alignItems: 'stretch',
                        py: 0.75,
                        borderBottom: '1px dashed',
                        borderColor: 'divider',
                        '&:last-child': { borderBottom: 'none' },
                      }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'flex-start' }}>
                        <ListItemIcon sx={{ minWidth: 32, mt: -0.5 }}>
                          <Checkbox
                            edge="start"
                            size="small"
                            checked={item.isCompleted}
                            disabled={toggleMutation.isPending}
                            onChange={(e) => handleToggle(checklist, item, e.target.checked)}
                          />
                        </ListItemIcon>
                        <ListItemText
                          primary={
                            <Typography
                              variant="body2"
                              sx={{
                                textDecoration: item.isCompleted ? 'line-through' : 'none',
                                color: item.isCompleted ? 'text.secondary' : 'text.primary',
                                fontWeight: item.isMandatory ? 600 : 400,
                              }}
                            >
                              {item.title}
                              {item.isMandatory && (
                                <Box component="span" sx={{ color: 'error.main', ml: 0.5 }}>
                                  *
                                </Box>
                              )}
                            </Typography>
                          }
                          secondary={
                            item.description ? (
                              <Typography variant="caption" color="text.secondary">
                                {item.description}
                              </Typography>
                            ) : null
                          }
                        />
                      </Box>

                      {/* Numeric or Notes Input if enabled */}
                      {(item.numericUnit || item.notes !== undefined || !item.isCompleted) && (
                        <Box sx={{ pl: 4, pt: 0.5, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                          {item.numericUnit && (
                            <TextField
                              size="small"
                              type="number"
                              label={`Value (${item.numericUnit})`}
                              value={currentNumeric ?? ''}
                              onChange={(e) => handleNumericChange(item.id, e.target.value)}
                              onBlur={() => {
                                if (item.isCompleted) {
                                  void handleToggle(checklist, item, true);
                                }
                              }}
                              sx={{ width: 130 }}
                              slotProps={{
                                input: { sx: { fontSize: '0.8rem', height: 32 } },
                                inputLabel: { shrink: true, sx: { fontSize: '0.75rem' } },
                              }}
                            />
                          )}
                          <TextField
                            size="small"
                            placeholder="Optional remark / note..."
                            value={currentNotes ?? ''}
                            onChange={(e) => handleNotesChange(item.id, e.target.value)}
                            onBlur={() => {
                              if (item.isCompleted) {
                                void handleToggle(checklist, item, true);
                              }
                            }}
                            sx={{ flex: 1, minWidth: 150 }}
                            slotProps={{
                              input: { sx: { fontSize: '0.8rem', height: 32 } },
                              inputLabel: { shrink: true, sx: { fontSize: '0.75rem' } },
                            }}
                          />
                        </Box>
                      )}

                      {item.completedByName && item.isCompleted && (
                        <Box sx={{ pl: 4, pt: 0.25 }}>
                          <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
                            Done by {item.completedByName}
                          </Typography>
                        </Box>
                      )}
                    </ListItem>
                  );
                })}
              </List>
            </Paper>
          ))}
        </Box>

        {/* Footer */}
        <Divider />
        <Box sx={{ p: 2, display: 'flex', gap: 1 }}>
          <Button
            fullWidth
            variant="outlined"
            startIcon={<LaunchIcon />}
            onClick={() => {
              setDrawerOpen(false);
              navigate('/checklists');
            }}
          >
            Manage Checklists
          </Button>
        </Box>
      </Drawer>
    </>
  );
}
