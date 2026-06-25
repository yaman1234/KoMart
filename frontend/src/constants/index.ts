export const APP_NAME = 'KoMart';

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api/v1';

export const DEFAULT_PAGE_SIZE = 10;

export const PAGE_SIZES = [10, 25, 50, 100];

export const CURRENCY = 'NPR';

export const CURRENCY_SYMBOL = 'Rs.';

export const TAX_RATE = 13;

export const LOYALTY_POINTS_PER_100 = 1;

export const NAV_ITEMS = [
  { label: 'Dashboard', path: '/dashboard', icon: 'Dashboard' },
  { label: 'POS', path: '/pos', icon: 'PointOfSale' },
  { label: 'Sales', path: '/sales', icon: 'ReceiptLong' },
  { label: 'Products', path: '/products', icon: 'Inventory2' },
  { label: 'Inventory', path: '/inventory', icon: 'Warehouse' },
  { label: 'Suppliers', path: '/suppliers', icon: 'LocalShipping' },
  { label: 'Purchase Orders', path: '/purchase-orders', icon: 'Receipt' },
  { label: 'Customers', path: '/customers', icon: 'People' },
  { label: 'Reports', path: '/reports', icon: 'Assessment' },
  { label: 'Notifications', path: '/notifications', icon: 'Notifications' },
  { label: 'Settings', path: '/settings', icon: 'Settings' },
] as const;

export const UOM_OPTIONS = [
  { value: 'pcs',    label: 'Pieces (pcs)' },
  { value: 'pack',   label: 'Pack' },
  { value: 'box',    label: 'Box' },
  { value: 'bag',    label: 'Bag' },
  { value: 'bottle', label: 'Bottle' },
  { value: 'can',    label: 'Can' },
  { value: 'cup',    label: 'Cup' },
  { value: 'dozen',  label: 'Dozen' },
  { value: 'kg',     label: 'Kilogram (kg)' },
  { value: 'g',      label: 'Gram (g)' },
  { value: 'L',      label: 'Liter (L)' },
  { value: 'ml',     label: 'Milliliter (ml)' },
] as const;

export const PRODUCT_CATEGORIES = [
  'Snacks',
  'Instant Noodles',
  'Beverages',
  'Sauces & Condiments',
  'Frozen Foods',
  'Rice & Grains',
  'Confectionery',
  'Health & Wellness',
] as const;

export const COUNTRIES = [
  'South Korea',
  'Japan',
  'China',
  'Thailand',
  'Vietnam',
  'Taiwan',
  'Nepal',
  'Other',
] as const;

export const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
  { value: 'esewa', label: 'eSewa' },
  { value: 'khalti', label: 'Khalti' },
] as const;

export const PO_STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  ordered: 'Ordered',
  partial: 'Partially Received',
  received: 'Received',
  cancelled: 'Cancelled',
};

export const PO_LINE_STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  partial: 'Partially Received',
  received: 'Received',
};

export const MEMBERSHIP_TIER_LABELS: Record<string, string> = {
  bronze: 'Bronze',
  silver: 'Silver',
  gold: 'Gold',
  platinum: 'Platinum',
};

export const DASHBOARD_WIDGETS = [
  { id: 'todaySales', label: 'Today\'s Sales', defaultW: 3, defaultH: 2 },
  { id: 'weeklySales', label: 'Weekly Sales', defaultW: 3, defaultH: 2 },
  { id: 'monthlySales', label: 'Monthly Sales', defaultW: 3, defaultH: 2 },
  { id: 'totalProducts', label: 'Total Products', defaultW: 3, defaultH: 2 },
  { id: 'lowStock', label: 'Low Stock', defaultW: 3, defaultH: 2 },
  { id: 'expiring', label: 'Expiring Products', defaultW: 3, defaultH: 2 },
  { id: 'inventoryValue', label: 'Inventory Value', defaultW: 3, defaultH: 2 },
  { id: 'customerCount', label: 'Customer Count', defaultW: 3, defaultH: 2 },
  { id: 'revenueChart', label: 'Revenue Trend', defaultW: 8, defaultH: 4 },
  { id: 'topProducts', label: 'Top Selling Products', defaultW: 4, defaultH: 4 },
  { id: 'recentTransactions', label: 'Recent Transactions', defaultW: 12, defaultH: 4 },
  { id: 'quickActions', label: 'Quick Actions', defaultW: 4, defaultH: 3 },
] as const;

export const DEFAULT_DASHBOARD_LAYOUT = DASHBOARD_WIDGETS.map((w, i) => ({
  i: w.id,
  x: (i % 4) * 3,
  y: Math.floor(i / 4) * 2,
  w: w.defaultW,
  h: w.defaultH,
}));

export const QUERY_KEYS = {
  dashboard: ['dashboard'] as const,
  dashboardStats: (range?: string) => ['dashboard', 'stats', range] as const,
  products: ['products'] as const,
  product: (id: string) => ['products', id] as const,
  inventory: ['inventory'] as const,
  suppliers: ['suppliers'] as const,
  supplier: (id: string) => ['suppliers', id] as const,
  purchaseOrders: ['purchaseOrders'] as const,
  purchaseOrder: (id: string) => ['purchaseOrders', id] as const,
  transactions: ['transactions'] as const,
  transaction: (id: string) => ['transactions', id] as const,
  customers: ['customers'] as const,
  customer: (id: string) => ['customers', id] as const,
  notifications: ['notifications'] as const,
  reports: (type: string) => ['reports', type] as const,
  settings: ['settings'] as const,
};
