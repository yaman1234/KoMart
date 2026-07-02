import {
  Box,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  ListItemIcon,
  Typography,
  Chip,
} from '@mui/material';
import { formatDateTime } from '@/utils';
import {
  NOTIFICATION_TYPE_COLORS,
  notificationIconMap,
} from '@/utils/notificationUtils';
import type { AppNotification } from '@/types';

interface NotificationListProps {
  notifications: AppNotification[];
  onSelect?: (notification: AppNotification) => void;
  emptyMessage?: string;
  dense?: boolean;
}

export function NotificationList({
  notifications,
  onSelect,
  emptyMessage = "You're all caught up!",
  dense = false,
}: NotificationListProps) {
  if (notifications.length === 0) {
    return (
      <Box sx={{ py: dense ? 3 : 6, textAlign: 'center', px: 2 }}>
        <Typography variant="body2" color="text.secondary">
          No notifications
        </Typography>
        <Typography variant="caption" color="text.disabled">
          {emptyMessage}
        </Typography>
      </Box>
    );
  }

  return (
    <List disablePadding>
      {notifications.map((notif) => {
        const Icon = notificationIconMap[notif.type];
        return (
          <ListItem key={notif.id} disablePadding divider>
            <ListItemButton
              onClick={() => onSelect?.(notif)}
              sx={{
                py: dense ? 1.25 : 1.75,
                opacity: notif.read ? 0.72 : 1,
                alignItems: 'flex-start',
              }}
            >
              <ListItemIcon sx={{ minWidth: 40, mt: 0.25 }}>
                <Icon
                  color={notif.read ? 'disabled' : 'primary'}
                  fontSize="small"
                />
              </ListItemIcon>
              <ListItemText
                primary={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                    <Typography
                      component="span"
                      variant="body2"
                      sx={{ fontWeight: notif.read ? 500 : 700 }}
                    >
                      {notif.title}
                    </Typography>
                    {!notif.read && (
                      <Chip label="New" size="small" color="primary" sx={{ height: 20 }} />
                    )}
                  </Box>
                }
                secondary={
                  <>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
                      {notif.message}
                    </Typography>
                    <Typography variant="caption" sx={{ display: 'block', mt: 0.5 }} color="text.disabled">
                      {formatDateTime(notif.createdAt)}
                    </Typography>
                  </>
                }
              />
              <Chip
                label={notif.type.replace('_', ' ')}
                size="small"
                color={NOTIFICATION_TYPE_COLORS[notif.type]}
                variant="outlined"
                sx={{ ml: 1, display: { xs: 'none', sm: 'flex' } }}
              />
            </ListItemButton>
          </ListItem>
        );
      })}
    </List>
  );
}
