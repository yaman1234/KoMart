import { apiClient } from './apiClient';
import { mockApi } from './mock/mockApi';
import type {
  LoginCredentials,
  ListQueryParams,
  PaginatedResponse,
  Product,
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
  AppNotification,
  DashboardStats,
  RevenueDataPoint,
  TopProduct,
  StoreSettings,
  User,
  DateRange,
  StockAdjustment,
} from '@/types';
import type { mockSalesByCategory } from './mock/mockData';

type SalesByCategory = typeof mockSalesByCategory;

const useMock = () => mockApi.isMockEnabled;

export const authService = {
  login: async (credentials: LoginCredentials) => {
    if (useMock()) return mockApi.login(credentials);
    const { data } = await apiClient.post<{ user: User; accessToken: string }>(
      '/auth/login',
      credentials,
    );
    return data;
  },
  forgotPassword: async (email: string) => {
    if (useMock()) return mockApi.forgotPassword(email);
    await apiClient.post('/auth/forgot-password', { email });
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
  getTopProducts: async (): Promise<TopProduct[]> => {
    if (useMock()) return mockApi.getTopProducts();
    const { data } = await apiClient.get('/dashboard/top-products');
    return data;
  },
  getRecentTransactions: async (): Promise<Transaction[]> => {
    if (useMock()) return mockApi.getRecentTransactions();
    const { data } = await apiClient.get('/dashboard/recent-transactions');
    return data;
  },
  getSalesByCategory: async (): Promise<SalesByCategory> => {
    if (useMock()) return mockApi.getSalesByCategory();
    const { data } = await apiClient.get('/dashboard/sales-by-category');
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
};

export const notificationService = {
  getAll: async (): Promise<AppNotification[]> => {
    if (useMock()) return mockApi.getNotifications();
    const { data } = await apiClient.get('/notifications');
    return data;
  },
};

export const settingsService = {
  get: async (): Promise<StoreSettings> => {
    if (useMock()) return mockApi.getSettings();
    const { data } = await apiClient.get('/settings');
    return data;
  },
};
