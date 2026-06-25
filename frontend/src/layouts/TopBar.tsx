import {
  AppBar,
  Toolbar,
  IconButton,
  Typography,
  Box,
  Avatar,
  Menu,
  MenuItem,
  Badge,
  Tooltip,
  useTheme,
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import MenuOpenIcon from '@mui/icons-material/MenuOpen';
import Brightness4Icon from '@mui/icons-material/Brightness4';
import Brightness7Icon from '@mui/icons-material/Brightness7';
import NotificationsIcon from '@mui/icons-material/Notifications';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore, useThemeStore, useUIStore } from '@/store';
import { useNotifications } from '@/hooks/useDashboard';
import { NotificationPanel } from '@/components/common/NotificationPanel';
import { getInitials } from '@/utils';
import { useIsMobile } from '@/hooks/useMediaQuery';

interface TopBarProps {
  title?: string;
}

export function TopBar({ title }: TopBarProps) {
  const theme = useTheme();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { user, logout } = useAuthStore();
  const { mode, toggleMode } = useThemeStore();
  const {
    toggleSidebar,
    sidebarCollapsed,
    toggleSidebarCollapsed,
    notificationPanelOpen,
    setNotificationPanelOpen,
  } = useUIStore();
  const { data: notifications = [] } = useNotifications();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <>
      <AppBar
        position="sticky"
        elevation={0}
        sx={{
          bgcolor: 'background.paper',
          color: 'text.primary',
          borderBottom: `1px solid ${theme.palette.divider}`,
        }}
      >
        <Toolbar sx={{ gap: 1 }}>
          {isMobile ? (
            <IconButton edge="start" onClick={toggleSidebar}>
              <MenuIcon />
            </IconButton>
          ) : (
            <IconButton onClick={toggleSidebarCollapsed}>
              {sidebarCollapsed ? <MenuIcon /> : <MenuOpenIcon />}
            </IconButton>
          )}

          {title && (
            <Typography variant="h6" sx={{ fontWeight: 600, flex: 1 }}>
              {title}
            </Typography>
          )}

          <Box sx={{ flex: 1 }} />

          <Tooltip title="Toggle theme">
            <IconButton onClick={toggleMode}>
              {mode === 'dark' ? <Brightness7Icon /> : <Brightness4Icon />}
            </IconButton>
          </Tooltip>

          <Tooltip title="Notifications">
            <IconButton onClick={() => setNotificationPanelOpen(true)}>
              <Badge badgeContent={unreadCount} color="error">
                <NotificationsIcon />
              </Badge>
            </IconButton>
          </Tooltip>

          <IconButton onClick={(e) => setAnchorEl(e.currentTarget)}>
            <Avatar sx={{ width: 32, height: 32, bgcolor: 'primary.main', fontSize: '0.875rem' }}>
              {user ? getInitials(user.name) : '?'}
            </Avatar>
          </IconButton>

          <Menu
            anchorEl={anchorEl}
            open={Boolean(anchorEl)}
            onClose={() => setAnchorEl(null)}
            transformOrigin={{ horizontal: 'right', vertical: 'top' }}
            anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
          >
            <MenuItem disabled>
              <Box>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {user?.name}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {user?.email}
                </Typography>
              </Box>
            </MenuItem>
            <MenuItem onClick={() => { setAnchorEl(null); navigate('/settings'); }}>
              Settings
            </MenuItem>
            <MenuItem onClick={handleLogout}>Logout</MenuItem>
          </Menu>
        </Toolbar>
      </AppBar>

      <NotificationPanel
        open={notificationPanelOpen}
        onClose={() => setNotificationPanelOpen(false)}
        notifications={notifications}
        onNavigate={(link) => {
          setNotificationPanelOpen(false);
          navigate(link);
        }}
      />
    </>
  );
}
