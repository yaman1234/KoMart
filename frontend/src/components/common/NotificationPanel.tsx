import {
  Drawer,
  Box,
  Typography,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  ListItemIcon,
  Chip,
  IconButton,
  Divider,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import InventoryIcon from '@mui/icons-material/Inventory';
import WarningIcon from '@mui/icons-material/Warning';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import InfoIcon from '@mui/icons-material/Info';
import { formatDateTime } from '@/utils';
import type { AppNotification } from '@/types';

const iconMap = {
  low_stock: InventoryIcon,
  expiry: WarningIcon,
  purchase_reminder: ShoppingCartIcon,
  system: InfoIcon,
};

interface NotificationPanelProps {
  open: boolean;
  onClose: () => void;
  notifications: AppNotification[];
  onNavigate?: (link: string) => void;
}

export function NotificationPanel({
  open,
  onClose,
  notifications,
  onNavigate,
}: NotificationPanelProps) {
  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <Drawer anchor="right" open={open} onClose={onClose}>
      <Box sx={{ width: 360, maxWidth: '100vw' }}>
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
        <Divider />
        <List disablePadding>
          {notifications.length === 0 ? (
            <ListItem>
              <ListItemText
                primary="No notifications"
                secondary="You're all caught up!"
              />
            </ListItem>
          ) : (
            notifications.map((notif) => {
              const Icon = iconMap[notif.type];
              return (
                <ListItem key={notif.id} disablePadding>
                  <ListItemButton
                    onClick={() => notif.link && onNavigate?.(notif.link)}
                    sx={{ opacity: notif.read ? 0.7 : 1 }}
                  >
                    <ListItemIcon sx={{ minWidth: 40 }}>
                      <Icon color={notif.read ? 'disabled' : 'primary'} fontSize="small" />
                    </ListItemIcon>
                    <ListItemText
                      primary={notif.title}
                      secondary={
                        <>
                          {notif.message}
                          <Typography variant="caption" sx={{ display: 'block' }} color="text.disabled">
                            {formatDateTime(notif.createdAt)}
                          </Typography>
                        </>
                      }
                      slotProps={{
                        primary: { sx: { fontWeight: notif.read ? 400 : 600 } },
                      }}
                    />
                  </ListItemButton>
                </ListItem>
              );
            })
          )}
        </List>
      </Box>
    </Drawer>
  );
}
