import {
  Drawer,
  Box,
  Typography,
  Chip,
  IconButton,
  Divider,
  Button,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import DoneAllIcon from '@mui/icons-material/DoneAll';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { NotificationList } from '@/components/common/NotificationList';
import type { AppNotification } from '@/types';

interface NotificationPanelProps {
  open: boolean;
  onClose: () => void;
  notifications: AppNotification[];
  onNavigate?: (link: string) => void;
  onMarkRead?: (id: string) => void;
  onMarkAllRead?: () => void;
  markingAll?: boolean;
}

export function NotificationPanel({
  open,
  onClose,
  notifications,
  onNavigate,
  onMarkRead,
  onMarkAllRead,
  markingAll = false,
}: NotificationPanelProps) {
  const unreadCount = notifications.filter((n) => !n.read).length;
  const preview = notifications.slice(0, 12);

  const handleSelect = (notification: AppNotification) => {
    if (!notification.read) {
      onMarkRead?.(notification.id);
    }
    if (notification.link) {
      onNavigate?.(notification.link);
    }
  };

  return (
    <Drawer anchor="right" open={open} onClose={onClose}>
      <Box sx={{ width: 380, maxWidth: '100vw', display: 'flex', flexDirection: 'column', height: '100%' }}>
        <Box sx={{ p: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="h6" sx={{ fontWeight: 600 }}>
              Notifications
            </Typography>
            {unreadCount > 0 && (
              <Chip label={unreadCount} size="small" color="primary" />
            )}
          </Box>
          <IconButton size="small" onClick={onClose}>
            <CloseIcon />
          </IconButton>
        </Box>

        {unreadCount > 0 && onMarkAllRead && (
          <Box sx={{ px: 2, pb: 1 }}>
            <Button
              size="small"
              startIcon={<DoneAllIcon />}
              onClick={onMarkAllRead}
              loading={markingAll}
            >
              Mark all read
            </Button>
          </Box>
        )}

        <Divider />

        <Box sx={{ flex: 1, overflow: 'auto' }}>
          <NotificationList
            notifications={preview}
            onSelect={handleSelect}
            dense
            emptyMessage="No alerts right now."
          />
        </Box>

        {notifications.length > preview.length && (
          <>
            <Divider />
            <Box sx={{ p: 2 }}>
              <Button
                fullWidth
                variant="outlined"
                endIcon={<OpenInNewIcon />}
                onClick={() => {
                  onClose();
                  onNavigate?.('/notifications');
                }}
              >
                View all ({notifications.length})
              </Button>
            </Box>
          </>
        )}

        {notifications.length > 0 && notifications.length <= preview.length && (
          <>
            <Divider />
            <Box sx={{ p: 2 }}>
              <Button
                fullWidth
                variant="text"
                endIcon={<OpenInNewIcon />}
                onClick={() => {
                  onClose();
                  onNavigate?.('/notifications');
                }}
              >
                Open notification center
              </Button>
            </Box>
          </>
        )}
      </Box>
    </Drawer>
  );
}
