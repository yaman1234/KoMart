export type ThemeMode = 'light' | 'dark';

export type UserRole = 'admin' | 'manager' | 'cashier' | 'staff';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  avatar?: string;
  createdAt: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface Product {
  id: string;
  name: string;
  sku: string;
  barcode: string;
  brand: string;
  countryOfOrigin: string;
  category: string;
  supplierId: string;
  supplierName: string;
  description: string;
  uom: string;
  costPrice: number;
  sellingPrice: number;
  images: string[];
  nutritionInfo?: string;
  allergenInfo?: string;
  stock: number;
  lowStockThreshold: number;
  createdAt: string;
  updatedAt: string;
}

export interface InventoryBatch {
  id: string;
  productId: string;
  batchNumber: string;
  quantity: number;
  expiryDate?: string;
  purchaseOrderId?: string;
  receivedAt: string;
}

export interface InventoryItem extends Product {
  batches: InventoryBatch[];
  batchCount: number;
  nearestExpiry?: string;
}

export interface InventoryStats {
  totalSkus: number;
  lowStock: number;
  outOfStock: number;
  expiring: number;
  inventoryValue: number;
}

export type StockAdjustmentType = 'adjustment' | 'damaged' | 'correction' | 'sale';

export interface StockAdjustment {
  id: string;
  productId: string;
  batchId?: string;
  type: StockAdjustmentType;
  quantity: number;
  reason: string;
  createdBy: string;
  createdAt: string;
}

export interface Supplier {
  id: string;
  name: string;
  country: string;
  contactPerson: string;
  phone: string;
  email?: string;
  address: string;
  createdAt: string;
}

export type PurchaseOrderStatus =
  | 'draft'
  | 'ordered'
  | 'partial'
  | 'received'
  | 'cancelled';

export type PurchaseOrderLineStatus = 'pending' | 'partial' | 'received';

export interface PurchaseOrderItem {
  productId: string;
  productName: string;
  quantity: number;
  unitCost: number;
  receivedQuantity: number;
  lineStatus?: PurchaseOrderLineStatus;
}

/** Payload for create/update — lineStatus is computed by the API on read */
export type PurchaseOrderWritePayload = Omit<
  PurchaseOrder,
  'id' | 'orderNumber' | 'createdAt' | 'updatedAt' | 'items'
> & {
  items: Omit<PurchaseOrderItem, 'lineStatus'>[];
};

export interface PurchaseOrder {
  id: string;
  orderNumber: string;
  supplierId: string;
  supplierName: string;
  status: PurchaseOrderStatus;
  items: PurchaseOrderItem[];
  totalAmount: number;
  expectedDelivery?: string;
  orderedBy?: string;
  receivedBy?: string;
  receivedDate?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PurchaseOrderReceiveItem {
  productId: string;
  receiveQuantity: number;
}

export type MembershipTier = 'bronze' | 'silver' | 'gold' | 'platinum';

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email: string;
  birthday?: string;
  loyaltyPoints: number;
  membershipTier: MembershipTier;
  totalSpent: number;
  createdAt: string;
}

export type PaymentMethod = 'cash' | 'card' | 'esewa' | 'khalti';

export interface CartItem {
  productId: string;
  name: string;
  sku: string;
  image?: string;
  price: number;
  quantity: number;
  discount: number;
}

export interface Transaction {
  id: string;
  transactionNumber: string;
  customerId?: string;
  customerName?: string;
  items: CartItem[];
  subtotal: number;
  discount: number;
  tax: number;
  loyaltyPointsRedeemed: number;
  total: number;
  paymentMethod: PaymentMethod;
  createdAt: string;
  createdBy: string;
}

export type NotificationType =
  | 'low_stock'
  | 'expiry'
  | 'purchase_reminder'
  | 'system';

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
  link?: string;
}

export interface DashboardStats {
  todaySales: number;
  weeklySales: number;
  monthlySales: number;
  totalProducts: number;
  lowStockProducts: number;
  expiringProducts: number;
  inventoryValue: number;
  customerCount: number;
}

export interface RevenueDataPoint {
  date: string;
  revenue: number;
}

export interface TopProduct {
  productId: string;
  name: string;
  quantitySold: number;
  revenue: number;
}

export interface StoreSettings {
  storeName: string;
  address: string;
  phone: string;
  email: string;
  currency: string;
  taxRate: number;
  taxInclusive: boolean;
  loyaltyPointsPerCurrency: number;
}

export interface UserPreferences {
  language: string;
  theme: ThemeMode;
  sidebarCollapsed: boolean;
  dashboardLayout?: DashboardWidgetLayout[];
}

export interface DashboardWidgetLayout {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ApiError {
  message: string;
  code?: string;
  details?: Record<string, string[]>;
}

export interface DateRange {
  startDate: string;
  endDate: string;
}

export interface ListQueryParams {
  page?: number;
  pageSize?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  [key: string]: string | number | undefined;
}
