import { delay, generateId } from '@/utils';
import type {
  LoginCredentials,
  ListQueryParams,
  PaginatedResponse,
  Product,
  InventoryItem,
  InventoryStats,
  Supplier,
  PurchaseOrder,
  PurchaseOrderStatus,
  PurchaseOrderReceiveItem,
  PurchaseOrderLineStatus,
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
import {
  mockUser,
  mockProducts,
  mockInventory,
  mockSuppliers,
  mockPurchaseOrders,
  mockCustomers,
  mockTransactions,
  mockNotifications,
  mockDashboardStats,
  mockRevenueData,
  mockTopProducts,
  mockSalesByCategory,
  mockStoreSettings,
} from './mockData';

const USE_MOCK = import.meta.env.VITE_USE_MOCK !== 'false';

// Mutable in-memory store
let products = [...mockProducts];
let inventory = [...mockInventory];
let suppliers = [...mockSuppliers];
let purchaseOrders = [...mockPurchaseOrders];
let customers = [...mockCustomers];
let transactions = [...mockTransactions];
const notifications = [...mockNotifications];

function paginate<T>(items: T[], params: ListQueryParams): PaginatedResponse<T> {
  const page = params.page ?? 1;
  const pageSize = params.pageSize ?? 10;
  let filtered = [...items];

  if (params.search) {
    const q = params.search.toLowerCase();
    filtered = filtered.filter((item) =>
      JSON.stringify(item).toLowerCase().includes(q),
    );
  }

  if (params.category) {
    filtered = filtered.filter(
      (item) => (item as Record<string, unknown>)['category'] === params.category,
    );
  }

  if (params.supplierId) {
    filtered = filtered.filter(
      (item) => (item as Record<string, unknown>)['supplierId'] === params.supplierId,
    );
  }

  const stockFilter = params.filter as string | undefined;
  if (stockFilter === 'low') {
    filtered = filtered.filter((item) => {
      const row = item as InventoryItem;
      return row.stock > 0 && row.stock <= row.lowStockThreshold;
    });
  } else if (stockFilter === 'out') {
    filtered = filtered.filter((item) => (item as InventoryItem).stock === 0);
  }

  if (params.sortBy) {
    const key = params.sortBy as keyof T;
    const order = params.sortOrder === 'desc' ? -1 : 1;
    filtered.sort((a, b) => {
      const av = a[key];
      const bv = b[key];
      if (av == null || bv == null) return 0;
      if (av < bv) return -1 * order;
      if (av > bv) return 1 * order;
      return 0;
    });
  }

  const total = filtered.length;
  const start = (page - 1) * pageSize;
  const data = filtered.slice(start, start + pageSize);
  return { data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
}

export const mockApi = {
  isMockEnabled: USE_MOCK,

  async login(credentials: LoginCredentials): Promise<{ user: User; accessToken: string }> {
    await delay(600);
    if (credentials.email === 'admin@komart.com' && credentials.password === 'password') {
      return { user: mockUser, accessToken: 'mock-jwt-token' };
    }
    throw new Error('Invalid email or password');
  },

  async forgotPassword(_email: string): Promise<void> {
    await delay(600);
  },

  async getDashboardStats(_range?: DateRange): Promise<DashboardStats> {
    await delay(400);
    return { ...mockDashboardStats, totalProducts: products.length };
  },

  async getRevenueData(_range?: DateRange): Promise<RevenueDataPoint[]> {
    await delay(400);
    return mockRevenueData;
  },

  async getTopProducts(): Promise<TopProduct[]> {
    await delay(300);
    return mockTopProducts;
  },

  async getRecentTransactions(): Promise<Transaction[]> {
    await delay(300);
    return transactions.slice(0, 10);
  },

  async getSalesByCategory(): Promise<typeof mockSalesByCategory> {
    await delay(300);
    return mockSalesByCategory;
  },

  // ── Products ──────────────────────────────────────────────────────────────
  async getProducts(params: ListQueryParams = {}): Promise<PaginatedResponse<Product>> {
    await delay(400);
    return paginate(products, params);
  },

  async getProduct(id: string): Promise<Product> {
    await delay(300);
    const product = products.find((p) => p.id === id);
    if (!product) throw new Error('Product not found');
    return product;
  },

  async createProduct(
    data: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<Product> {
    await delay(600);
    const supplier = data.supplierId
      ? suppliers.find((s) => s.id === data.supplierId)
      : undefined;
    const product: Product = {
      ...data,
      supplierName: supplier?.name ?? data.supplierName ?? '',
      id: `prod-${generateId().slice(0, 8)}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    products = [product, ...products];
    inventory = [{ ...product, batches: [], batchCount: 0 }, ...inventory];
    return product;
  },

  async updateProduct(id: string, data: Partial<Product>): Promise<Product> {
    await delay(500);
    const idx = products.findIndex((p) => p.id === id);
    if (idx === -1) throw new Error('Product not found');
    const supplier = data.supplierId
      ? suppliers.find((s) => s.id === data.supplierId)
      : undefined;
    products[idx] = {
      ...products[idx],
      ...data,
      ...(supplier ? { supplierName: supplier.name } : {}),
      updatedAt: new Date().toISOString(),
    };
    return products[idx];
  },

  async deleteProduct(id: string): Promise<void> {
    await delay(400);
    products = products.filter((p) => p.id !== id);
    inventory = inventory.filter((i) => i.id !== id);
  },

  // ── Inventory ─────────────────────────────────────────────────────────────
  async getInventory(params: ListQueryParams = {}): Promise<PaginatedResponse<InventoryItem>> {
    await delay(400);
    return paginate(inventory, params);
  },

  async getInventoryStats(): Promise<InventoryStats> {
    await delay(300);
    const lowStock = inventory.filter((i) => i.stock > 0 && i.stock <= i.lowStockThreshold).length;
    const outOfStock = inventory.filter((i) => i.stock === 0).length;
    return {
      totalSkus: inventory.length,
      lowStock,
      outOfStock,
      expiring: 0,
      inventoryValue: inventory.reduce((s, i) => s + i.stock * i.costPrice, 0),
    };
  },

  async adjustStock(adjustment: Omit<StockAdjustment, 'id' | 'createdAt'>): Promise<void> {
    await delay(500);
    const prodIdx = products.findIndex((p) => p.id === adjustment.productId);
    if (prodIdx !== -1) {
      products[prodIdx] = {
        ...products[prodIdx],
        stock: Math.max(0, products[prodIdx].stock + adjustment.quantity),
      };
    }
    const invIdx = inventory.findIndex((i) => i.id === adjustment.productId);
    if (invIdx !== -1) {
      inventory[invIdx] = {
        ...inventory[invIdx],
        stock: Math.max(0, inventory[invIdx].stock + adjustment.quantity),
      };
    }
  },

  // ── Suppliers ─────────────────────────────────────────────────────────────
  async getSuppliers(params: ListQueryParams = {}): Promise<PaginatedResponse<Supplier>> {
    await delay(400);
    let filtered = [...suppliers];
    if (params.search) {
      const q = params.search.toLowerCase();
      filtered = filtered.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.country.toLowerCase().includes(q) ||
          s.contactPerson.toLowerCase().includes(q),
      );
    }
    return paginate(filtered, params);
  },

  async getSupplier(id: string): Promise<Supplier> {
    await delay(300);
    const supplier = suppliers.find((s) => s.id === id);
    if (!supplier) throw new Error('Supplier not found');
    return supplier;
  },

  async createSupplier(data: Omit<Supplier, 'id' | 'createdAt'>): Promise<Supplier> {
    await delay(600);
    const supplier: Supplier = {
      ...data,
      id: `sup-${generateId().slice(0, 8)}`,
      createdAt: new Date().toISOString(),
    };
    suppliers = [supplier, ...suppliers];
    return supplier;
  },

  async updateSupplier(id: string, data: Partial<Supplier>): Promise<Supplier> {
    await delay(500);
    const idx = suppliers.findIndex((s) => s.id === id);
    if (idx === -1) throw new Error('Supplier not found');
    suppliers[idx] = { ...suppliers[idx], ...data };
    return suppliers[idx];
  },

  // ── Purchase Orders ───────────────────────────────────────────────────────
  async getPurchaseOrders(params: ListQueryParams = {}): Promise<PaginatedResponse<PurchaseOrder>> {
    await delay(400);
    return paginate(purchaseOrders, params);
  },

  async getPurchaseOrder(id: string): Promise<PurchaseOrder> {
    await delay(300);
    const po = purchaseOrders.find((p) => p.id === id);
    if (!po) throw new Error('Purchase order not found');
    return po;
  },

  async createPurchaseOrder(data: PurchaseOrderWritePayload): Promise<PurchaseOrder> {
    await delay(600);
    const today = new Date().toISOString().slice(0, 10);
    const todayCount = purchaseOrders.filter((p) => p.orderNumber.startsWith(`PO-${today}-`)).length;
    const po: PurchaseOrder = {
      ...data,
      items: data.items.map((item) => ({ ...item, lineStatus: 'pending' as const })),
      id: `po-${generateId().slice(0, 8)}`,
      orderNumber: `PO-${today}-${String(todayCount + 1).padStart(3, '0')}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    purchaseOrders = [po, ...purchaseOrders];
    return po;
  },

  async updatePurchaseOrder(id: string, data: PurchaseOrderWritePayload): Promise<PurchaseOrder> {
    await delay(600);
    const idx = purchaseOrders.findIndex((p) => p.id === id);
    if (idx === -1) throw new Error('Purchase order not found');
    if (purchaseOrders[idx].status !== 'draft') {
      throw new Error('Only draft purchase orders can be edited');
    }
    purchaseOrders[idx] = {
      ...purchaseOrders[idx],
      ...data,
      items: data.items.map((item) => ({
        ...item,
        lineStatus: 'pending' as const,
      })),
      updatedAt: new Date().toISOString(),
    };
    return purchaseOrders[idx];
  },

  async updatePurchaseOrderStatus(id: string, status: PurchaseOrderStatus): Promise<PurchaseOrder> {
    await delay(500);
    const idx = purchaseOrders.findIndex((p) => p.id === id);
    if (idx === -1) throw new Error('Purchase order not found');
    purchaseOrders[idx] = { ...purchaseOrders[idx], status, updatedAt: new Date().toISOString() };
    return purchaseOrders[idx];
  },

  async receivePurchaseOrderItems(
    id: string,
    items: PurchaseOrderReceiveItem[],
  ): Promise<PurchaseOrder> {
    await delay(600);
    const idx = purchaseOrders.findIndex((p) => p.id === id);
    if (idx === -1) throw new Error('Purchase order not found');
    const po = purchaseOrders[idx];
    if (po.status !== 'ordered' && po.status !== 'partial') {
      throw new Error('Only ordered or partially received purchase orders can be processed');
    }

    const updatedItems = po.items.map((item) => {
      const receive = items.find((r) => r.productId === item.productId);
      if (!receive) return item;
      const remaining = item.quantity - item.receivedQuantity;
      const delta = Math.min(receive.receiveQuantity, remaining);
      const receivedQuantity = item.receivedQuantity + delta;
      const lineStatus: PurchaseOrderLineStatus =
        receivedQuantity <= 0 ? 'pending'
        : receivedQuantity >= item.quantity ? 'received'
        : 'partial';
      return { ...item, receivedQuantity, lineStatus };
    });

    const allReceived = updatedItems.every((i) => i.receivedQuantity >= i.quantity);
    const anyReceived = updatedItems.some((i) => i.receivedQuantity > 0);
    const status: PurchaseOrderStatus = allReceived ? 'received' : anyReceived ? 'partial' : po.status;

    purchaseOrders[idx] = {
      ...po,
      items: updatedItems,
      status,
      receivedBy: 'Admin User',
      receivedDate: new Date().toISOString().slice(0, 10),
      updatedAt: new Date().toISOString(),
    };
    return purchaseOrders[idx];
  },

  // ── Customers ─────────────────────────────────────────────────────────────
  async getCustomers(params: ListQueryParams = {}): Promise<PaginatedResponse<Customer>> {
    await delay(400);
    return paginate(customers, params);
  },

  async lookupCustomers(q: string, limit = 15): Promise<Customer[]> {
    await delay(120);
    const term = q.trim().toLowerCase();
    const digits = term.replace(/\D/g, '');
    const filtered = customers.filter((c) => {
      if (!term) return true;
      if (c.name.toLowerCase().includes(term)) return true;
      if (c.email.toLowerCase().includes(term)) return true;
      if (c.phone.toLowerCase().includes(term)) return true;
      if (digits.length >= 3 && c.phone.replace(/\D/g, '').includes(digits)) return true;
      return false;
    });
    return filtered.slice(0, limit);
  },

  async getCustomer(id: string): Promise<Customer> {
    await delay(300);
    const customer = customers.find((c) => c.id === id);
    if (!customer) throw new Error('Customer not found');
    return customer;
  },

  async getCustomerTransactions(customerId: string): Promise<Transaction[]> {
    await delay(300);
    return transactions.filter((t) => t.customerId === customerId);
  },

  async createCustomer(data: Omit<Customer, 'id' | 'createdAt' | 'loyaltyPoints' | 'membershipTier' | 'totalSpent'>): Promise<Customer> {
    await delay(600);
    const customer: Customer = {
      ...data,
      id: `cust-${generateId().slice(0, 8)}`,
      loyaltyPoints: 0,
      membershipTier: 'bronze',
      totalSpent: 0,
      createdAt: new Date().toISOString(),
    };
    customers = [customer, ...customers];
    return customer;
  },

  async updateCustomer(id: string, data: Partial<Customer>): Promise<Customer> {
    await delay(500);
    const idx = customers.findIndex((c) => c.id === id);
    if (idx === -1) throw new Error('Customer not found');
    customers[idx] = { ...customers[idx], ...data };
    return customers[idx];
  },

  // ── Transactions ──────────────────────────────────────────────────────────
  async getTransactions(params: ListQueryParams = {}): Promise<PaginatedResponse<Transaction>> {
    await delay(300);
    let filtered = [...transactions];

    if (params.search) {
      const q = params.search.toLowerCase();
      filtered = filtered.filter(
        (t) =>
          t.transactionNumber.toLowerCase().includes(q) ||
          (t.customerName?.toLowerCase().includes(q) ?? false),
      );
    }

    if (params.paymentMethod) {
      filtered = filtered.filter((t) => t.paymentMethod === params.paymentMethod);
    }

    if (params.startDate) {
      const start = new Date(params.startDate as string).getTime();
      filtered = filtered.filter((t) => new Date(t.createdAt).getTime() >= start);
    }

    if (params.endDate) {
      const end = new Date(params.endDate as string);
      end.setHours(23, 59, 59, 999);
      filtered = filtered.filter((t) => new Date(t.createdAt).getTime() <= end.getTime());
    }

    filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return paginate(filtered, params);
  },

  async getTransaction(id: string): Promise<Transaction> {
    await delay(200);
    const txn = transactions.find((t) => t.id === id);
    if (!txn) throw new Error('Transaction not found');
    return txn;
  },

  async createTransaction(
    data: Omit<Transaction, 'id' | 'transactionNumber' | 'createdAt'>,
  ): Promise<Transaction> {
    await delay(700);
    const txn: Transaction = {
      ...data,
      id: `txn-${generateId().slice(0, 8)}`,
      transactionNumber: `TXN-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(transactions.length + 1).padStart(3, '0')}`,
      createdAt: new Date().toISOString(),
    };
    transactions = [txn, ...transactions];
    if (data.customerId) {
      const idx = customers.findIndex((c) => c.id === data.customerId);
      if (idx !== -1) {
        const points = Math.floor(data.total / 100);
        customers[idx] = {
          ...customers[idx],
          loyaltyPoints: customers[idx].loyaltyPoints + points - data.loyaltyPointsRedeemed,
          totalSpent: customers[idx].totalSpent + data.total,
        };
      }
    }
    return txn;
  },

  // ── Notifications ─────────────────────────────────────────────────────────
  async getNotifications(): Promise<AppNotification[]> {
    await delay(300);
    return notifications;
  },

  async getSettings(): Promise<StoreSettings> {
    await delay(300);
    return mockStoreSettings;
  },
};
