import {
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Box,
  Toolbar,
  Divider,
  useTheme,
  Typography,
} from '@mui/material';
import { NavLink, useLocation } from 'react-router-dom';
import DashboardIcon from '@mui/icons-material/Dashboard';
import PointOfSaleIcon from '@mui/icons-material/PointOfSale';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import WarehouseIcon from '@mui/icons-material/Warehouse';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import ReceiptIcon from '@mui/icons-material/Receipt';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import PeopleIcon from '@mui/icons-material/People';
import AssessmentIcon from '@mui/icons-material/Assessment';
import NotificationsIcon from '@mui/icons-material/Notifications';
import SettingsIcon from '@mui/icons-material/Settings';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import { NAV_ITEMS } from '@/constants';
import { AppBrand } from '@/components/common/AppBrand';
import { useUIStore, useAuthStore } from '@/store';
import { useIsMobile } from '@/hooks/useMediaQuery';
import type { UserRole } from '@/types';

const iconMap: Record<string, React.ReactNode> = {
  Dashboard: <DashboardIcon fontSize="small" />,
  PointOfSale: <PointOfSaleIcon fontSize="small" />,
  ReceiptLong: <ReceiptLongIcon fontSize="small" />,
  Inventory2: <Inventory2Icon fontSize="small" />,
  Warehouse: <WarehouseIcon fontSize="small" />,
  LocalShipping: <LocalShippingIcon fontSize="small" />,
  Receipt: <ReceiptIcon fontSize="small" />,
  People: <PeopleIcon fontSize="small" />,
  Assessment: <AssessmentIcon fontSize="small" />,
  Notifications: <NotificationsIcon fontSize="small" />,
  Settings: <SettingsIcon fontSize="small" />,
  AccountBalance: <AccountBalanceIcon fontSize="small" />,
  AccountBalanceWallet: <AccountBalanceWalletIcon fontSize="small" />,
};

/** Mobile temporary drawer width */
const DRAWER_WIDTH = 260;
/** Desktop permanent rail (icon + label) */
const DRAWER_RAIL = 96;
/** Kept for POS cart collapsed width */
const DRAWER_COLLAPSED = 72;

export function Sidebar() {
  const theme = useTheme();
  const location = useLocation();
  const isMobile = useIsMobile();
  const { sidebarOpen, setSidebarOpen } = useUIStore();
  const user = useAuthStore((s) => s.user);
  const userRole = (user?.role ?? 'cashier') as UserRole;

  const visibleNavItems = NAV_ITEMS.filter((item) =>
    (item.roles as readonly string[]).includes(userRole),
  );

  const mobileDrawer = (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Toolbar sx={{ px: 2, minHeight: { xs: 64, sm: 64 } }}>
        <AppBrand logoSize={44} showName direction="row" />
      </Toolbar>
      <Divider />
      <List sx={{ flex: 1, px: 1, py: 2 }}>
        {visibleNavItems.map((item) => {
          const active = location.pathname.startsWith(item.path);
          return (
            <ListItem key={item.path} disablePadding sx={{ mb: 0.5 }}>
              <ListItemButton
                component={NavLink}
                to={item.path}
                selected={active}
                onClick={() => setSidebarOpen(false)}
                sx={{
                  borderRadius: 2,
                  minHeight: 44,
                  '&.Mui-selected': {
                    bgcolor: 'primary.main',
                    color: 'primary.contrastText',
                    '& .MuiListItemIcon-root': { color: 'primary.contrastText' },
                    '&:hover': { bgcolor: 'primary.dark' },
                  },
                }}
              >
                <ListItemIcon sx={{ minWidth: 40, color: active ? 'inherit' : 'text.secondary' }}>
                  {iconMap[item.icon]}
                </ListItemIcon>
                <ListItemText
                  primary={item.label}
                  slotProps={{
                    primary: {
                      sx: { fontSize: '0.875rem', fontWeight: active ? 600 : 500 },
                    },
                  }}
                />
              </ListItemButton>
            </ListItem>
          );
        })}
      </List>
    </Box>
  );

  const railDrawer = (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <Toolbar
        sx={{
          px: 0.5,
          minHeight: { xs: 64, sm: 64 },
          justifyContent: 'center',
        }}
      >
        <AppBrand logoSize={36} showName={false} direction="column" />
      </Toolbar>
      <Divider />
      <List sx={{ flex: 1, px: 0.5, py: 1, overflowY: 'auto', overflowX: 'hidden' }}>
        {visibleNavItems.map((item) => {
          const active = location.pathname.startsWith(item.path);
          return (
            <ListItem key={item.path} disablePadding sx={{ mb: 0.5, display: 'block' }}>
              <ListItemButton
                component={NavLink}
                to={item.path}
                selected={active}
                sx={{
                  borderRadius: 2,
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  px: 0.5,
                  py: 1,
                  minHeight: 56,
                  gap: 0.25,
                  '&.Mui-selected': {
                    bgcolor: 'primary.main',
                    color: 'primary.contrastText',
                    '& .MuiListItemIcon-root': { color: 'primary.contrastText' },
                    '&:hover': { bgcolor: 'primary.dark' },
                  },
                }}
              >
                <ListItemIcon
                  sx={{
                    minWidth: 0,
                    color: active ? 'inherit' : 'text.secondary',
                    justifyContent: 'center',
                  }}
                >
                  {iconMap[item.icon]}
                </ListItemIcon>
                <Typography
                  variant="caption"
                  sx={{
                    fontSize: '0.65rem',
                    fontWeight: active ? 600 : 500,
                    lineHeight: 1.15,
                    textAlign: 'center',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                    width: '100%',
                    px: 0.25,
                  }}
                >
                  {item.label}
                </Typography>
              </ListItemButton>
            </ListItem>
          );
        })}
      </List>
    </Box>
  );

  if (isMobile) {
    return (
      <Drawer
        variant="temporary"
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        ModalProps={{ keepMounted: true }}
        sx={{ '& .MuiDrawer-paper': { width: DRAWER_WIDTH } }}
      >
        {mobileDrawer}
      </Drawer>
    );
  }

  return (
    <Drawer
      variant="permanent"
      sx={{
        width: DRAWER_RAIL,
        flexShrink: 0,
        '& .MuiDrawer-paper': {
          width: DRAWER_RAIL,
          boxSizing: 'border-box',
          borderRight: `1px solid ${theme.palette.divider}`,
          overflowX: 'hidden',
        },
      }}
    >
      {railDrawer}
    </Drawer>
  );
}

export { DRAWER_WIDTH, DRAWER_RAIL, DRAWER_COLLAPSED };
