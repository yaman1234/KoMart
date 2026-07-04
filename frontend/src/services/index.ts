import { apiClient, publicClient } from './apiClient';
import { mockApi } from './mock/mockApi';
import { isMockEnabled } from '@/config/mock';
import { useAuthStore } from '@/store';
import type {
  CatalogProduct,
  CatalogStoreInfo,
  CatalogOffer,
  LoginCredentials,
  ListQueryParams,
  PaginatedResponse,
  Product,
  ProductStatus,
  InventoryItem,
  InventoryStats,
  InventoryBatch,
  Supplier,
  PurchaseOrder,
  PurchaseOrderStatus,
  PurchaseOrderReceiveItem,
  PurchaseOrderWritePayload,
  Customer,
  Transaction,
  PaymentMethod,
  AppNotification,
  NotificationType,
  DashboardStats,
  RevenueDataPoint,
  TopProduct,
  StoreSettings,
  User,
  DateRange,
  StockAdjustment,
  SalesSummary,
  SalesByPaymentMethod,
  SalesByCategory,
  InventoryReportSummary,
  ExpiringProductRow,
  LowStockProductRow,
  ProfitSummary,
  MarginByCategory,
  PurchasingBySupplier,
  PurchaseOrdersSummary,
  TopCustomer,
  LoyaltySummary,
  SalesByHour,
  SalesByDayOfWeek,
  SalesByCashier,
  DeadStockProduct,
  Expense,
  ExpenseWritePayload,
  ExpenseSummary,
  Category,
  UserListItem,
  UserRole,
  AuditLog,
  AuditLogQueryParams,
  InventoryMovement,
  MovementSummary,
  InventoryMovementQueryParams,
  DiscountRule,
  EvaluateDiscountResult,
} from '@/types';

const useMock = () => isMockEnabled();

function withRange(range?: DateRange): Record<string, string> | undefined {
  if (!range) return undefined;
  return { startDate: range.startDate, endDate: range.endDate };
}

function ensureArray<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data;
  if (data == null) return [];
  return [data as T];
}

export const catalogService = {
  getAll: async (params?: ListQueryParams): Promise<PaginatedResponse<CatalogProduct>> => {
    const { data } = await publicClient.get('/catalog', { params });
    return data;
  },
  getById: async (id: string): Promise<CatalogProduct> => {
    const { data } = await publicClient.get(`/catalog/${id}`);
    return data;
  },
  getStoreInfo: async (): Promise<CatalogStoreInfo> => {
    const { data } = await publicClient.get('/catalog/store-info');
    return data;
  },
  getOffers: async (): Promise<CatalogOffer[]> => {
    const { data } = await publicClient.get('/catalog/offers');
    return data;
  },
  getTags: async (): Promise<string[]> => {
    const { data } = await publicClient.get('/catalog/tags');
    return data;
  },
};

export const authService = {
  login: async (credentials: LoginCredentials) => {
    if (useMock()) return mockApi.login(credentials);
    const { data } = await apiClient.post<{
      user: User;
      accessToken: string;
      refreshToken: string;
      expiresIn: number;
    }>('/auth/login', credentials);
    return data;
  },
  refresh: async (refreshToken: string) => {
    if (useMock()) return mockApi.refresh(refreshToken);
    const { data } = await apiClient.post<{
      accessToken: string;
      refreshToken: string;
      expiresIn: number;
      user: User;
    }>('/auth/refresh', { refreshToken });
    return data;
  },
  logout: async (options?: { refreshToken?: string | null; allDevices?: boolean }) => {
    if (useMock()) return;
    const refreshToken = options?.refreshToken ?? useAuthStore.getState().refreshToken;
    try {
      await apiClient.post('/auth/logout', {
        refreshToken: refreshToken ?? undefined,
        allDevices: options?.allDevices ?? false,
      });
    } catch {
      // Best-effort revoke; clear local session regardless
    }
  },
};

export const dashboardService = {
  getStats: async (range?: DateRange): Promise<DashboardStats> => {
    if (useMock()) return mockApi.getDashboardStats(range);
    const { data } = await apiClient.get('/dashboard/stats', { params: range });
    return data;
  },
  getRevenueData: async (range?: DateRange): Promise<RevenueDataPoint[]> => {
    if (useMock()) return mockApi.getRevenueData(range);
    const { data } = await apiClient.get('/dashboard/revenue', { params: range });
    return data;
  },
  getTopProducts: async (range?: DateRange): Promise<TopProduct[]> => {
    if (useMock()) return mockApi.getTopProducts();
    const { data } = await apiClient.get('/dashboard/top-products', { params: withRange(range) });
    return data;
  },
  getRecentTransactions: async (): Promise<Transaction[]> => {
    if (useMock()) return mockApi.getRecentTransactions();
    const { data } = await apiClient.get('/dashboard/recent-transactions');
    return data;
  },
  getSalesByCategory: async (range?: DateRange) => {
    if (useMock()) return mockApi.getReportsSalesByCategory(range);
    const { data } = await apiClient.get('/dashboard/sales-by-category', { params: withRange(range) });
    return data;
  },
};

export const productService = {
  getAll: async (params?: ListQueryParams): Promise<PaginatedResponse<Product>> => {
    if (useMock()) return mockApi.getProducts(params);
    const { data } = await apiClient.get('/products', { params });
    return data;
  },
  getById: async (id: string): Promise<Product> => {
    if (useMock()) return mockApi.getProduct(id);
    const { data } = await apiClient.get(`/products/${id}`);
    return data;
  },
  create: async (payload: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>): Promise<Product> => {
    if (useMock()) return mockApi.createProduct(payload);
    const { data } = await apiClient.post('/products', payload);
    return data;
  },
  update: async (id: string, payload: Partial<Product>): Promise<Product> => {
    if (useMock()) return mockApi.updateProduct(id, payload);
    const { data } = await apiClient.patch(`/products/${id}`, payload);
    return data;
  },
  delete: async (id: string): Promise<void> => {
    if (useMock()) return mockApi.deleteProduct(id);
    await apiClient.delete(`/products/${id}`);
  },
};

export interface ReceiveBatchPayload {
  productId: string;
  batchNumber: string;
  quantity: number;
  expiryDate?: string;   // ISO date string e.g. "2026-12-31"
  unitCost?: number;
  sellingPrice?: number;
  supplierId?: string;
}

export interface InventoryQueryParams extends ListQueryParams {
  filter?: 'all' | 'low' | 'out' | 'expiring';
  supplierId?: string;
  category?: string;
}

function buildInventoryParams(params?: InventoryQueryParams): Record<string, string | number> {
  if (!params) return { page: 1, pageSize: 25, filter: 'all' };
  const out: Record<string, string | number> = {
    page: params.page ?? 1,
    pageSize: params.pageSize ?? 25,
    filter: params.filter ?? 'all',
  };
  if (params.search) out.search = params.search;
  if (params.supplierId) out.supplierId = params.supplierId;
  if (params.category) out.category = params.category;
  return out;
}

export interface InventoryHistoryParams {
  page?: number;
  pageSize?: number;
  productId?: string;
  source?: '' | 'manual' | 'sale';
}

export const inventoryService = {
  getAll: async (params?: InventoryQueryParams): Promise<PaginatedResponse<InventoryItem>> => {
    const query = buildInventoryParams(params);
    if (useMock()) return mockApi.getInventory(query);
    const { data } = await apiClient.get('/inventory', { params: query });
    return data;
  },
  getStats: async (): Promise<InventoryStats> => {
    if (useMock()) return mockApi.getInventoryStats();
    const { data } = await apiClient.get('/inventory/stats');
    return data;
  },
  receiveBatch: async (payload: ReceiveBatchPayload): Promise<InventoryBatch> => {
    if (useMock()) return Promise.resolve({} as InventoryBatch);
    const { data } = await apiClient.post('/inventory/batches', payload);
    return data as InventoryBatch;
  },
  adjustStock: async (adjustment: Omit<StockAdjustment, 'id' | 'createdAt'>): Promise<void> => {
    if (useMock()) return mockApi.adjustStock(adjustment);
    await apiClient.post('/inventory/adjust', adjustment);
  },
  getHistory: async (params?: InventoryHistoryParams) => {
    if (useMock()) return mockApi.getInventoryHistory(params);
    const { data } = await apiClient.get('/inventory/history', { params });
    return data as PaginatedResponse<StockAdjustment>;
  },
  getItem: async (productId: string): Promise<InventoryItem> => {
    const { data } = await apiClient.get(`/inventory/items/${productId}`);
    return data as InventoryItem;
  },
  getMovements: async (params?: InventoryMovementQueryParams): Promise<PaginatedResponse<InventoryMovement>> => {
    const { data } = await apiClient.get('/inventory/movements', { params });
    return data as PaginatedResponse<InventoryMovement>;
  },
  getMovementSummary: async (params?: Omit<InventoryMovementQueryParams, 'page' | 'pageSize'>): Promise<MovementSummary> => {
    const { data } = await apiClient.get('/inventory/movements/summary', { params });
    return data as MovementSummary;
  },
};

export const supplierService = {
  getAll: async (params?: ListQueryParams): Promise<PaginatedResponse<Supplier>> => {
    if (useMock()) return mockApi.getSuppliers(params);
    const { data } = await apiClient.get('/suppliers', { params });
    return data;
  },
  getById: async (id: string): Promise<Supplier> => {
    if (useMock()) return mockApi.getSupplier(id);
    const { data } = await apiClient.get(`/suppliers/${id}`);
    return data;
  },
  create: async (payload: Omit<Supplier, 'id' | 'createdAt'>): Promise<Supplier> => {
    if (useMock()) return mockApi.createSupplier(payload);
    const { data } = await apiClient.post('/suppliers', payload);
    return data;
  },
  update: async (id: string, payload: Partial<Supplier>): Promise<Supplier> => {
    if (useMock()) return mockApi.updateSupplier(id, payload);
    const { data } = await apiClient.patch(`/suppliers/${id}`, payload);
    return data;
  },
};

export const purchaseOrderService = {
  getAll: async (params?: ListQueryParams): Promise<PaginatedResponse<PurchaseOrder>> => {
    if (useMock()) return mockApi.getPurchaseOrders(params);
    const { data } = await apiClient.get('/purchase-orders', { params });
    return data;
  },
  getById: async (id: string): Promise<PurchaseOrder> => {
    if (useMock()) return mockApi.getPurchaseOrder(id);
    const { data } = await apiClient.get(`/purchase-orders/${id}`);
    return data;
  },
  create: async (payload: PurchaseOrderWritePayload): Promise<PurchaseOrder> => {
    if (useMock()) return mockApi.createPurchaseOrder(payload);
    const { data } = await apiClient.post('/purchase-orders', payload);
    return data;
  },
  update: async (id: string, payload: PurchaseOrderWritePayload): Promise<PurchaseOrder> => {
    if (useMock()) return mockApi.updatePurchaseOrder(id, payload);
    const { data } = await apiClient.patch(`/purchase-orders/${id}`, payload);
    return data;
  },
  updateStatus: async (id: string, status: PurchaseOrderStatus): Promise<PurchaseOrder> => {
    if (useMock()) return mockApi.updatePurchaseOrderStatus(id, status);
    const { data } = await apiClient.patch(`/purchase-orders/${id}/status`, { status });
    return data;
  },
  receiveItems: async (id: string, items: PurchaseOrderReceiveItem[]): Promise<PurchaseOrder> => {
    if (useMock()) return mockApi.receivePurchaseOrderItems(id, items);
    const { data } = await apiClient.post(`/purchase-orders/${id}/receive`, { items });
    return data;
  },
};

export const customerService = {
  getAll: async (params?: ListQueryParams): Promise<PaginatedResponse<Customer>> => {
    if (useMock()) return mockApi.getCustomers(params);
    const { data } = await apiClient.get('/customers', { params });
    return data;
  },
  lookup: async (q = '', limit = 15): Promise<Customer[]> => {
    if (useMock()) return mockApi.lookupCustomers(q, limit);
    const { data } = await apiClient.get('/customers/lookup', { params: { q, limit } });
    return data;
  },
  getById: async (id: string): Promise<Customer> => {
    if (useMock()) return mockApi.getCustomer(id);
    const { data } = await apiClient.get(`/customers/${id}`);
    return data;
  },
  getTransactions: async (id: string): Promise<Transaction[]> => {
    if (useMock()) return mockApi.getCustomerTransactions(id);
    const { data } = await apiClient.get(`/customers/${id}/transactions`);
    return data;
  },
  create: async (
    payload: Omit<Customer, 'id' | 'createdAt' | 'loyaltyPoints' | 'membershipTier' | 'totalSpent'>,
  ): Promise<Customer> => {
    if (useMock()) return mockApi.createCustomer(payload);
    const { data } = await apiClient.post('/customers', payload);
    return data;
  },
  update: async (id: string, payload: Partial<Customer>): Promise<Customer> => {
    if (useMock()) return mockApi.updateCustomer(id, payload);
    const { data } = await apiClient.patch(`/customers/${id}`, payload);
    return data;
  },
};

export const transactionService = {
  getAll: async (params?: ListQueryParams): Promise<PaginatedResponse<Transaction>> => {
    if (useMock()) return mockApi.getTransactions(params);
    const { data } = await apiClient.get('/transactions', { params });
    return data;
  },
  getById: async (id: string): Promise<Transaction> => {
    if (useMock()) return mockApi.getTransaction(id);
    const { data } = await apiClient.get(`/transactions/${id}`);
    return data;
  },
  create: async (
    payload: Omit<Transaction, 'id' | 'transactionNumber' | 'createdAt'>,
  ): Promise<Transaction> => {
    if (useMock()) return mockApi.createTransaction(payload);
    const { data } = await apiClient.post('/transactions', payload);
    return data;
  },
  update: async (
    id: string,
    payload: {
      customerId?: string | null;
      customerName?: string;
      paymentMethod?: PaymentMethod;
      discount?: number;
      loyaltyPointsRedeemed?: number;
    },
  ): Promise<Transaction> => {
    if (useMock()) {
      const { customerId, ...rest } = payload;
      return mockApi.updateTransaction(id, {
        ...rest,
        ...(customerId !== undefined && { customerId: customerId ?? undefined }),
      });
    }
    const { data } = await apiClient.patch(`/transactions/${id}`, payload);
    return data as Transaction;
  },
};

export const notificationService = {
  getAll: async (params?: {
    unreadOnly?: boolean;
    type?: NotificationType;
    sync?: boolean;
  }): Promise<AppNotification[]> => {
    if (useMock()) return mockApi.getNotifications(params);
    const { data } = await apiClient.get('/notifications', {
      params: {
        unreadOnly: params?.unreadOnly || undefined,
        type: params?.type,
        sync: params?.sync,
      },
    });
    return data;
  },
  markRead: async (id: string): Promise<void> => {
    if (useMock()) return mockApi.markNotificationRead(id);
    await apiClient.patch(`/notifications/${id}/read`);
  },
  markAllRead: async (): Promise<void> => {
    if (useMock()) return mockApi.markAllNotificationsRead();
    await apiClient.patch('/notifications/read-all');
  },
  sync: async (): Promise<void> => {
    if (useMock()) return mockApi.syncNotifications();
    await apiClient.post('/notifications/sync');
  },
};

export const settingsService = {
  get: async (): Promise<StoreSettings> => {
    if (useMock()) return mockApi.getSettings();
    const { data } = await apiClient.get('/settings');
    return data;
  },
  update: async (payload: Partial<StoreSettings>): Promise<void> => {
    if (useMock()) return;
    await apiClient.patch('/settings', payload);
  },
};

export const reportsService = {
  getSalesSummary: async (range?: DateRange): Promise<SalesSummary> => {
    if (useMock()) return mockApi.getSalesSummary(range);
    const { data } = await apiClient.get('/reports/sales-summary', { params: withRange(range) });
    return data;
  },
  getSalesByPaymentMethod: async (range?: DateRange): Promise<SalesByPaymentMethod[]> => {
    if (useMock()) return mockApi.getSalesByPaymentMethod(range);
    const { data } = await apiClient.get('/reports/sales-by-payment-method', { params: withRange(range) });
    return ensureArray(data);
  },
  getRevenue: async (range?: DateRange): Promise<RevenueDataPoint[]> => {
    if (useMock()) return mockApi.getReportsRevenue(range);
    const { data } = await apiClient.get('/reports/revenue', { params: withRange(range) });
    return ensureArray(data);
  },
  getTopProducts: async (range?: DateRange, limit = 10): Promise<TopProduct[]> => {
    if (useMock()) return mockApi.getReportsTopProducts(range);
    const { data } = await apiClient.get('/reports/top-products', { params: { ...withRange(range), limit } });
    return ensureArray(data);
  },
  getSalesByCategory: async (range?: DateRange): Promise<SalesByCategory[]> => {
    if (useMock()) return mockApi.getReportsSalesByCategory(range);
    const { data } = await apiClient.get('/reports/sales-by-category', { params: withRange(range) });
    return ensureArray(data);
  },
  getInventorySummary: async (): Promise<InventoryReportSummary> => {
    if (useMock()) return mockApi.getInventoryReportSummary();
    const { data } = await apiClient.get('/reports/inventory-summary');
    return data;
  },
  getExpiringProducts: async (
    page = 1,
    pageSize = 25,
    withinDays = 30,
  ): Promise<PaginatedResponse<ExpiringProductRow>> => {
    if (useMock()) return mockApi.getExpiringProducts();
    const { data } = await apiClient.get('/reports/expiring-products', {
      params: { page, pageSize, withinDays },
    });
    return data;
  },
  getLowStock: async (
    page = 1,
    pageSize = 25,
    stockFilter: 'low' | 'out' | 'both' = 'both',
    productStatus?: ProductStatus,
  ): Promise<PaginatedResponse<LowStockProductRow>> => {
    if (useMock()) return mockApi.getLowStockReport();
    const { data } = await apiClient.get('/reports/low-stock', {
      params: { page, pageSize, stockFilter, productStatus },
    });
    return data;
  },
  getProfitSummary: async (range?: DateRange): Promise<ProfitSummary> => {
    if (useMock()) return mockApi.getProfitSummary(range);
    const { data } = await apiClient.get('/reports/profit-summary', { params: withRange(range) });
    return data;
  },
  getMarginByCategory: async (range?: DateRange): Promise<MarginByCategory[]> => {
    if (useMock()) return mockApi.getMarginByCategory(range);
    const { data } = await apiClient.get('/reports/margin-by-category', { params: withRange(range) });
    return ensureArray(data);
  },
  getPurchasingBySupplier: async (range?: DateRange): Promise<PurchasingBySupplier[]> => {
    if (useMock()) return mockApi.getPurchasingBySupplier(range);
    const { data } = await apiClient.get('/reports/purchasing-by-supplier', { params: withRange(range) });
    return ensureArray(data);
  },
  getPurchaseOrdersSummary: async (range?: DateRange): Promise<PurchaseOrdersSummary> => {
    if (useMock()) return mockApi.getPurchaseOrdersSummary(range);
    const { data } = await apiClient.get('/reports/purchase-orders-summary', { params: withRange(range) });
    return data;
  },
  getTopCustomers: async (range?: DateRange, limit = 10): Promise<TopCustomer[]> => {
    if (useMock()) return mockApi.getTopCustomers(range);
    const { data } = await apiClient.get('/reports/top-customers', { params: { ...withRange(range), limit } });
    return ensureArray(data);
  },
  getLoyaltySummary: async (range?: DateRange): Promise<LoyaltySummary> => {
    if (useMock()) return mockApi.getLoyaltySummary(range);
    const { data } = await apiClient.get('/reports/loyalty-summary', { params: withRange(range) });
    return data;
  },
  getSalesByHour: async (range?: DateRange): Promise<SalesByHour[]> => {
    if (useMock()) return mockApi.getSalesByHour(range);
    const { data } = await apiClient.get('/reports/sales-by-hour', { params: withRange(range) });
    return ensureArray(data);
  },
  getSalesByDayOfWeek: async (range?: DateRange): Promise<SalesByDayOfWeek[]> => {
    if (useMock()) return mockApi.getSalesByDayOfWeek(range);
    const { data } = await apiClient.get('/reports/sales-by-day-of-week', { params: withRange(range) });
    return ensureArray(data);
  },
  getSalesByCashier: async (range?: DateRange): Promise<SalesByCashier[]> => {
    if (useMock()) return mockApi.getSalesByCashier(range);
    const { data } = await apiClient.get('/reports/sales-by-cashier', { params: withRange(range) });
    return ensureArray(data);
  },
  getDeadStock: async (days = 30, productStatus?: ProductStatus): Promise<DeadStockProduct[]> => {
    if (useMock()) return mockApi.getDeadStock();
    const { data } = await apiClient.get('/reports/dead-stock', {
      params: { days, productStatus },
    });
    return ensureArray(data);
  },
  getExpenseSummary: async (range?: DateRange): Promise<ExpenseSummary> => {
    if (useMock()) return mockApi.getExpenseSummary(range);
    const { data } = await apiClient.get('/reports/expense-summary', { params: withRange(range) });
    return data;
  },
};

export const categoryService = {
  getAll: async (includeInactive = false): Promise<Category[]> => {
    const { data } = await apiClient.get('/categories', {
      params: includeInactive ? { include_inactive: true } : undefined,
    });
    return data as Category[];
  },
  create: async (payload: { name: string; description?: string }): Promise<Category> => {
    const { data } = await apiClient.post('/categories', payload);
    return data as Category;
  },
  update: async (id: string, payload: { name?: string; description?: string; isActive?: boolean }): Promise<Category> => {
    const { data } = await apiClient.patch(`/categories/${id}`, payload);
    return data as Category;
  },
  remove: async (id: string): Promise<void> => {
    await apiClient.delete(`/categories/${id}`);
  },
};

export const usersService = {
  getAll: async (): Promise<UserListItem[]> => {
    const { data } = await apiClient.get('/users');
    return data as UserListItem[];
  },
  getMe: async (): Promise<UserListItem> => {
    const { data } = await apiClient.get('/users/me');
    return data as UserListItem;
  },
  getById: async (id: string): Promise<UserListItem> => {
    const { data } = await apiClient.get(`/users/${id}`);
    return data as UserListItem;
  },
  create: async (payload: { name: string; email: string; password: string; role: UserRole }): Promise<UserListItem> => {
    const { data } = await apiClient.post('/users', payload);
    return data as UserListItem;
  },
  update: async (id: string, payload: { name?: string; email?: string; password?: string; role?: UserRole; isActive?: boolean }): Promise<UserListItem> => {
    const { data } = await apiClient.patch(`/users/${id}`, payload);
    return data as UserListItem;
  },
  deactivate: async (id: string): Promise<void> => {
    await apiClient.delete(`/users/${id}`);
  },
  updateMe: async (payload: { name?: string; password?: string }): Promise<UserListItem> => {
    const { data } = await apiClient.patch('/users/me', payload);
    return data as UserListItem;
  },
};

export const discountService = {
  getAll: async (activeOnly = true): Promise<DiscountRule[]> => {
    if (useMock()) return mockApi.getDiscounts(activeOnly);
    const { data } = await apiClient.get('/discounts', { params: { activeOnly } });
    return data as DiscountRule[];
  },
  create: async (payload: Omit<DiscountRule, 'id' | 'createdAt' | 'updatedAt' | 'isActive'> & { isActive?: boolean }): Promise<DiscountRule> => {
    if (useMock()) return mockApi.createDiscount(payload);
    const { data } = await apiClient.post('/discounts', payload);
    return data as DiscountRule;
  },
  update: async (id: string, payload: Partial<DiscountRule>): Promise<DiscountRule> => {
    if (useMock()) return mockApi.updateDiscount(id, payload);
    const { data } = await apiClient.patch(`/discounts/${id}`, payload);
    return data as DiscountRule;
  },
  delete: async (id: string): Promise<void> => {
    if (useMock()) return mockApi.deleteDiscount(id);
    await apiClient.delete(`/discounts/${id}`);
  },
  evaluate: async (payload: {
    items: Array<{ productId: string; price: number; quantity: number; category?: string }>;
    couponCode?: string;
  }): Promise<EvaluateDiscountResult> => {
    if (useMock()) return mockApi.evaluateDiscount(payload);
    const { data } = await apiClient.post('/discounts/evaluate', payload);
    return data as EvaluateDiscountResult;
  },
};

export const auditLogService = {
  getAll: async (params?: AuditLogQueryParams): Promise<PaginatedResponse<AuditLog>> => {
    if (useMock()) return mockApi.getAuditLogs(params);
    const { data } = await apiClient.get('/audit-logs', { params });
    return data as PaginatedResponse<AuditLog>;
  },
  getById: async (id: string): Promise<AuditLog> => {
    if (useMock()) return mockApi.getAuditLog(id);
    const { data } = await apiClient.get(`/audit-logs/${id}`);
    return data as AuditLog;
  },
};

export const expenseService = {
  getAll: async (params?: ListQueryParams): Promise<PaginatedResponse<Expense>> => {
    if (useMock()) return mockApi.getExpenses(params);
    const { data } = await apiClient.get('/expenses', { params });
    return data;
  },
  getById: async (id: string): Promise<Expense> => {
    if (useMock()) return mockApi.getExpense(id);
    const { data } = await apiClient.get(`/expenses/${id}`);
    return data;
  },
  create: async (payload: ExpenseWritePayload): Promise<Expense> => {
    if (useMock()) return mockApi.createExpense(payload);
    const { data } = await apiClient.post('/expenses', payload);
    return data;
  },
  update: async (id: string, payload: Partial<ExpenseWritePayload>): Promise<Expense> => {
    if (useMock()) return mockApi.updateExpense(id, payload);
    const { data } = await apiClient.patch(`/expenses/${id}`, payload);
    return data;
  },
  delete: async (id: string): Promise<void> => {
    if (useMock()) return mockApi.deleteExpense(id);
    await apiClient.delete(`/expenses/${id}`);
  },
};
