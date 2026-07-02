import { useMemo, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  CircularProgress,
  Alert,
} from '@mui/material';
import DoneAllIcon from '@mui/icons-material/DoneAll';
import RefreshIcon from '@mui/icons-material/Refresh';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/common/PageHeader';
import { NotificationList } from '@/components/common/NotificationList';
import {
  useNotifications,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
  useSyncNotifications,
} from '@/hooks/useNotifications';
import { NOTIFICATION_TYPE_LABELS } from '@/utils/notificationUtils';
import type { AppNotification, NotificationType } from '@/types';

type ReadFilter = 'all' | 'unread';

const TYPE_OPTIONS: { value: '' | NotificationType; label: string }[] = [
  { value: '', label: 'All types' },
  ...Object.entries(NOTIFICATION_TYPE_LABELS).map(([value, label]) => ({
    value: value as NotificationType,
    label,
  })),
];

export function NotificationsPage() {
  const navigate = useNavigate();
  const [readFilter, setReadFilter] = useState<ReadFilter>('all');
  const [typeFilter, setTypeFilter] = useState<'' | NotificationType>('');

  const { data: notifications = [], isLoading, isError, refetch, isFetching } = useNotifications({
    unreadOnly: readFilter === 'unread',
    type: typeFilter,
  });

  const markReadMutation = useMarkNotificationRead();
  const markAllMutation = useMarkAllNotificationsRead();
  const syncMutation = useSyncNotifications();

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications],
  );

  const handleSelect = (notification: AppNotification) => {
    if (!notification.read) {
      markReadMutation.mutate(notification.id);
    }
    if (notification.link) {
      navigate(notification.link);
    }
  };

  return (
    <Box>
      <PageHeader
        title="Notifications"
        subtitle={`${notifications.length} alert${notifications.length === 1 ? '' : 's'}${unreadCount > 0 ? ` · ${unreadCount} unread` : ''}`}
        action={
          <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
            <Button
              variant="outlined"
              startIcon={<RefreshIcon />}
              onClick={() => syncMutation.mutate()}
              loading={syncMutation.isPending || isFetching}
            >
              Refresh
            </Button>
            <Button
              variant="outlined"
              startIcon={<DoneAllIcon />}
              disabled={unreadCount === 0}
              loading={markAllMutation.isPending}
              onClick={() => markAllMutation.mutate()}
            >
              Mark all read
            </Button>
          </Stack>
        }
      />

      <Paper sx={{ p: 2, mb: 2 }}>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={2}
          sx={{ alignItems: { xs: 'stretch', sm: 'center' } }}
        >
          <ToggleButtonGroup
            exclusive
            size="small"
            value={readFilter}
            onChange={(_, value: ReadFilter | null) => value && setReadFilter(value)}
          >
            <ToggleButton value="all">All</ToggleButton>
            <ToggleButton value="unread">Unread</ToggleButton>
          </ToggleButtonGroup>

          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel>Type</InputLabel>
            <Select
              label="Type"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as '' | NotificationType)}
            >
              {TYPE_OPTIONS.map((opt) => (
                <MenuItem key={opt.value || 'all'} value={opt.value}>
                  {opt.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <Box sx={{ flex: 1 }} />

          <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
            {Object.entries(NOTIFICATION_TYPE_LABELS).map(([type, label]) => {
              const count = notifications.filter((n) => n.type === type).length;
              if (count === 0) return null;
              return (
                <Chip
                  key={type}
                  size="small"
                  label={`${label}: ${count}`}
                  variant={typeFilter === type ? 'filled' : 'outlined'}
                  onClick={() =>
                    setTypeFilter((current) => (current === type ? '' : (type as NotificationType)))
                  }
                />
              );
            })}
          </Stack>
        </Stack>
      </Paper>

      {isError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          Failed to load notifications.{' '}
          <Button size="small" onClick={() => refetch()}>Retry</Button>
        </Alert>
      )}

      <Paper sx={{ overflow: 'hidden' }}>
        {isLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
            <CircularProgress />
          </Box>
        ) : (
          <NotificationList
            notifications={notifications}
            onSelect={handleSelect}
            emptyMessage={
              readFilter === 'unread'
                ? 'No unread notifications.'
                : typeFilter
                  ? `No ${NOTIFICATION_TYPE_LABELS[typeFilter].toLowerCase()} alerts right now.`
                  : "You're all caught up!"
            }
          />
        )}
      </Paper>
    </Box>
  );
}
