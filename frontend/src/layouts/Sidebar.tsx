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
import { NAV_ITEMS } from '@/constants';
import { AppBrand } from '@/components/common/AppBrand';
import { useUIStore, useAuthStore } from '@/store';
import { useIsMobile } from '@/hooks/useMediaQuery';
import type { UserRole } from '@/types';

const iconMap: Record<string, React.ReactNode> = {
  Dashboard: <DashboardIcon />,
  PointOfSale: <PointOfSaleIcon />,
  ReceiptLong: <ReceiptLongIcon />,
  Inventory2: <Inventory2Icon />,
  Warehouse: <WarehouseIcon />,
  LocalShipping: <LocalShippingIcon />,
  Receipt: <ReceiptIcon />,
  People: <PeopleIcon />,
  Assessment: <AssessmentIcon />,
  Notifications: <NotificationsIcon />,
  Settings: <SettingsIcon />,
  AccountBalance: <AccountBalanceIcon />,
};

const DRAWER_WIDTH = 260;
const DRAWER_COLLAPSED = 72;

export function Sidebar() {
  const theme = useTheme();
  const location = useLocation();
  const isMobile = useIsMobile();
  const { sidebarOpen, sidebarCollapsed, setSidebarOpen } = useUIStore();
  const user = useAuthStore((s) => s.user);
  const userRole = (user?.role ?? 'cashier') as UserRole;

  const visibleNavItems = NAV_ITEMS.filter((item) =>
    (item.roles as readonly string[]).includes(userRole),
  );

  const width = sidebarCollapsed && !isMobile ? DRAWER_COLLAPSED : DRAWER_WIDTH;

  const drawer = (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Toolbar sx={{ px: 2, minHeight: { xs: 64, sm: 64 } }}>
        <AppBrand
          logoSize={44}
          showName={!sidebarCollapsed || isMobile}
          direction="row"
        />
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
                onClick={() => isMobile && setSidebarOpen(false)}
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
                <ListItemIcon
                  sx={{
                    minWidth: sidebarCollapsed && !isMobile ? 0 : 40,
                    color: active ? 'inherit' : 'text.secondary',
                  }}
                >
                  {iconMap[item.icon]}
                </ListItemIcon>
                {(!sidebarCollapsed || isMobile) && (
                  <ListItemText
                    primary={item.label}
                    slotProps={{
                      primary: {
                        sx: { fontSize: '0.875rem', fontWeight: active ? 600 : 500 },
                      },
                    }}
                  />
                )}
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
        {drawer}
      </Drawer>
    );
  }

  return (
    <Drawer
      variant="permanent"
      sx={{
        width,
        flexShrink: 0,
        '& .MuiDrawer-paper': {
          width,
          boxSizing: 'border-box',
          borderRight: `1px solid ${theme.palette.divider}`,
          transition: theme.transitions.create('width'),
          overflowX: 'hidden',
        },
      }}
    >
      {drawer}
    </Drawer>
  );
}

export { DRAWER_WIDTH, DRAWER_COLLAPSED };
