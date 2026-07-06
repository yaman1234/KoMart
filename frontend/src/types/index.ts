export type ThemeMode = 'light' | 'dark';

export type UserRole = 'admin' | 'manager' | 'cashier';

export interface Category {
  id: string;
  name: string;
  description: string;
  isActive: boolean;
  createdAt: string;
}

export interface Uom {
  id: string;
  code: string;
  label: string;
  description: string;
  isActive: boolean;
  createdAt: string;
}

export interface UserListItem {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
}

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

export type ProductStatus = 'active' | 'discontinued' | 'seasonal';

export type DiscountRuleType =
  | 'product_percent'
  | 'product_flat'
  | 'category_percent'
  | 'category_flat'
  | 'cart_percent'
  | 'cart_flat';

export interface DiscountRule {
  id: string;
  name: string;
  code: string;
  ruleType: DiscountRuleType;
  value: number;
  productIds: string[];
  category: string;
  minCartTotal: number;
  maxDiscount: number;
  startsAt?: string;
  endsAt?: string;
  isActive: boolean;
  priority: number;
  createdAt: string;
  updatedAt: string;
}

export interface AppliedPromotion {
  ruleId: string;
  name: string;
  amount: number;
}

export interface EvaluateDiscountResult {
  lineItems: Array<{
    productId: string;
    perUnitDiscount: number;
    lineDiscount: number;
  }>;
  lineDiscountTotal: number;
  cartDiscount: number;
  promotionDiscountTotal: number;
  appliedPromotions: AppliedPromotion[];
}

export interface CatalogStoreInfo {
  storeName: string;
  address: string;
  phone: string;
  email: string;
  logoUrl: string;
}

export interface CatalogOffer {
  id: string;
  name: string;
  ruleType: DiscountRuleType;
  value: number;
  productIds: string[];
  category: string;
  code?: string;
  startsAt?: string;
  endsAt?: string;
}

export interface CatalogProduct {
  id: string;
  name: string;
  sku: string;
  barcode: string;
  brand: string;
  countryOfOrigin: string;
  category: string;
  description: string;
  uom: string;
  sellingPrice: number;
  images: string[];
  nutritionInfo?: string;
  allergenInfo?: string;
  status?: ProductStatus;
  tags?: string[];
  inStock?: boolean;
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
  buyUom?: string;
  uom: string;
  unitsPerBuyUom?: number;
  sellMode?: 'unit' | 'piece' | 'both';
  costPrice: number;
  sellingPrice: number;
  images: string[];
  nutritionInfo?: string;
  allergenInfo?: string;
  stock: number;
  lowStockThreshold: number;
  status?: ProductStatus;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface InventoryBatch {
  id: string;
  productId: string;
  batchNumber: string;
  quantity: number;
  unitCost?: number;
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

export type StockAdjustmentType = 'adjustment' | 'damaged' | 'correction' | 'sale' | 'receive';

export interface StockAdjustment {
  id: string;
  productId: string;
  productName?: string;
  batchId?: string;
  transactionId?: string;
  type: StockAdjustmentType;
  quantity: number;
  stockBefore?: number;
  stockAfter?: number;
  source?: 'manual' | 'sale';
  reason: string;
  createdBy: string;
  createdAt: string;
}

export type MovementDirection = 'in' | 'out';

export type MovementReferenceType =
  | 'sale'
  | 'receive'
  | 'purchase_order'
  | 'adjustment'
  | 'damaged'
  | 'correction';

export interface InventoryMovement {
  id: string;
  productId: string;
  productName: string;
  productSku: string;
  batchId?: string;
  transactionId?: string;
  referenceType: MovementReferenceType | string;
  referenceId: string;
  referenceLabel: string;
  transactionNumber?: string;
  type: StockAdjustmentType;
  direction: MovementDirection;
  movementLabel: string;
  quantity: number;
  stockBefore: number;
  stockAfter: number;
  unitCost?: number;
  extendedCost?: number;
  unitSellingPrice?: number;
  extendedRevenue?: number;
  reason: string;
  createdBy: string;
  createdAt: string;
}

export interface MovementSummary {
  movementCount: number;
  totalIn: number;
  totalOut: number;
}

export interface InventoryMovementQueryParams {
  page?: number;
  pageSize?: number;
  productId?: string;
  search?: string;
  direction?: '' | 'in' | 'out';
  movementType?: '' | MovementReferenceType;
  startDate?: string;
  endDate?: string;
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
  expiryDate: string;
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
  category?: string;
  listPrice?: number;
  unitCost?: number;
  batchAllocations?: Array<{ batchId: string; quantity: number; unitCost: number }>;
}

export type TransactionStatus = 'completed' | 'voided';

export interface Transaction {
  id: string;
  transactionNumber: string;
  customerId?: string;
  customerName?: string;
  items: CartItem[];
  subtotal: number;
  discount: number;
  promotionDiscount?: number;
  manualDiscount?: number;
  appliedPromotions?: AppliedPromotion[];
  couponCode?: string;
  tax: number;
  loyaltyPointsRedeemed: number;
  total: number;
  totalCost?: number;
  paymentMethod: PaymentMethod;
  status?: TransactionStatus;
  voidReason?: string;
  notes?: string;
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
  monthlyExpenses: number;
  netRevenue: number;
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
  logoUrl: string;
  pan: string;
  vatNumber: string;
  currency: string;
  taxRate: number;
  taxInclusive: boolean;
  receiptHeader: string;
  receiptFooter: string;
  autoPrint: boolean;
  defaultPaymentMethod: PaymentMethod;
  defaultLowStockThreshold: number;
  expiryWarningDays: number;
  autoSku: boolean;
  barcodeFormat: string;
  loyaltyPointsPerCurrency: number;
  loyaltyRedeemRate: number;
  transactionPrefix: string;
  purchaseOrderPrefix: string;
  dateFormat: string;
  timeFormat: '12h' | '24h';
}

export interface ReceiptBranding {
  storeName: string;
  address?: string;
  phone?: string;
  receiptHeader?: string;
  receiptFooter?: string;
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

export interface SalesSummary {
  totalRevenue: number;
  transactionCount: number;
  avgBasket: number;
  totalUnitsSold: number;
  totalDiscount: number;
}

export interface SalesByPaymentMethod {
  paymentMethod: string;
  revenue: number;
  count: number;
}

export interface SalesByCategory {
  category: string;
  revenue: number;
  count: number;
}

export interface InventoryCategoryBreakdown {
  category: string;
  skuCount: number;
  totalStock: number;
  stockValue: number;
}

export interface InventoryReportSummary {
  totalSkus: number;
  lowStock: number;
  outOfStock: number;
  expiring: number;
  inventoryValue: number;
  byCategory: InventoryCategoryBreakdown[];
}

export interface ExpiringProductRow {
  productId: string;
  productName: string;
  sku: string;
  category: string;
  batchNumber: string;
  quantity: number;
  expiryDate: string;
  daysUntilExpiry: number;
}

export interface LowStockProductRow {
  productId: string;
  productName: string;
  sku: string;
  category: string;
  stock: number;
  lowStockThreshold: number;
  status: 'low' | 'out';
  productStatus?: ProductStatus;
}

export interface ProfitDataPoint {
  date: string;
  revenue: number;
  cogs: number;
  grossProfit: number;
}

export interface ProfitSummary {
  totalRevenue: number;
  totalCogs: number;
  grossProfit: number;
  grossMarginPct: number;
  totalDiscount: number;
  daily: ProfitDataPoint[];
}

export interface MarginByCategory {
  category: string;
  revenue: number;
  cogs: number;
  grossProfit: number;
  grossMarginPct: number;
}

export interface PurchasingBySupplier {
  supplierId: string;
  supplierName: string;
  totalAmount: number;
  orderCount: number;
}

export interface PurchaseOrderStatusCount {
  status: string;
  count: number;
}

export interface PurchaseOrdersSummary {
  totalOrders: number;
  totalAmount: number;
  byStatus: PurchaseOrderStatusCount[];
}

export interface TopCustomer {
  customerId: string;
  customerName: string;
  transactionCount: number;
  totalSpent: number;
}

export interface LoyaltySummary {
  pointsRedeemed: number;
  activeMembers: number;
  newCustomers: number;
  totalMembers: number;
}

export interface SalesByHour {
  hour: number;
  label: string;
  revenue: number;
  transactionCount: number;
}

export interface SalesByDayOfWeek {
  day: number;
  label: string;
  revenue: number;
  transactionCount: number;
}

export interface SalesByCashier {
  cashier: string;
  revenue: number;
  transactionCount: number;
}

export interface DeadStockProduct {
  productId: string;
  productName: string;
  sku: string;
  category: string;
  stock: number;
  stockValue: number;
  daysWithoutSale: number;
  productStatus?: ProductStatus;
}

export interface ListQueryParams {
  page?: number;
  pageSize?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  [key: string]: string | number | boolean | undefined;
}

export type ExpenseCategory =
  | 'setup_investment'
  | 'rent'
  | 'utilities'
  | 'salaries'
  | 'marketing'
  | 'supplies'
  | 'maintenance'
  | 'equipment'
  | 'other';

export interface Expense {
  id: string;
  title: string;
  description?: string;
  amount: number;
  category: ExpenseCategory;
  date: string;
  paidTo?: string;
  paymentMethod?: string;
  isSetupCost: boolean;
  createdAt: string;
  updatedAt: string;
}

export type ExpenseWritePayload = Omit<Expense, 'id' | 'createdAt' | 'updatedAt'>;

export interface ExpenseByCategory {
  category: string;
  amount: number;
  count: number;
}

export interface ExpenseDataPoint {
  date: string;
  amount: number;
}

export interface ExpenseSummary {
  totalExpenses: number;
  setupInvestment: number;
  byCategory: ExpenseByCategory[];
  daily: ExpenseDataPoint[];
}

export interface ExpenseStats {
  totalExpenses: number;
  thisMonth: number;
  setupInvestment: number;
}

export type AuditModule =
  | 'auth'
  | 'products'
  | 'inventory'
  | 'sales'
  | 'purchase_orders'
  | 'settings'
  | 'users';

export interface AuditLog {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  module: AuditModule;
  action: string;
  entityType: string;
  entityId: string;
  previousValue: Record<string, unknown>;
  newValue: Record<string, unknown>;
  ipAddress: string;
  userAgent: string;
  browser: string;
  device: string;
  requestId: string;
  createdAt: string;
}

export interface AuditLogQueryParams {
  page?: number;
  pageSize?: number;
  module?: string;
  action?: string;
  userId?: string;
  entityType?: string;
  entityId?: string;
  startDate?: string;
  endDate?: string;
}
