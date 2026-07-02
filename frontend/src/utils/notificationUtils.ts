import InventoryIcon from '@mui/icons-material/Inventory';
import WarningIcon from '@mui/icons-material/Warning';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import InfoIcon from '@mui/icons-material/Info';
import type { SvgIconComponent } from '@mui/icons-material';
import type { NotificationType } from '@/types';

export const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  low_stock: 'Low Stock',
  expiry: 'Expiry',
  purchase_reminder: 'Purchase Orders',
  system: 'System',
};

export const NOTIFICATION_TYPE_COLORS: Record<
  NotificationType,
  'default' | 'primary' | 'warning' | 'error' | 'info' | 'success'
> = {
  low_stock: 'warning',
  expiry: 'error',
  purchase_reminder: 'info',
  system: 'default',
};

export const notificationIconMap: Record<NotificationType, SvgIconComponent> = {
  low_stock: InventoryIcon,
  expiry: WarningIcon,
  purchase_reminder: ShoppingCartIcon,
  system: InfoIcon,
};
