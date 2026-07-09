import { delay, generateId } from '@/utils';
import { computeProductPricing } from '@/utils/productPricing';
import type {
  LoginCredentials,
  ListQueryParams,
  PaginatedResponse,
  Product,
  ProductBulkUpdateItem,
  ProductBulkUpdateResponse,
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
  SalesSummary,
  SalesByPaymentMethod,
  SalesByCategory,
  InventoryReportSummary,
  ExpiringProductRow,
  LowStockProductRow,
  Expense,
  ExpenseWritePayload,
  ExpenseSummary,
  ExpenseStats,
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
  DiscountRule,
  EvaluateDiscountResult,
  AuditLog,
  AuditLogQueryParams,
} from '@/types';
import {
  isMockEnabled,
  MOCK_ACCESS_TOKEN,
  MOCK_REFRESH_TOKEN,
} from '@/config/mock';
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
  mockSalesSummary,
  mockSalesByPaymentMethod,
  mockInventoryReportSummary,
  mockProfitSummary,
  mockStoreSettings,
  mockExpenses,
} from './mockData';

// Mutable in-memory store
let products = [...mockProducts];
let inventory = [...mockInventory];
let suppliers = [...mockSuppliers];
let purchaseOrders = [...mockPurchaseOrders];
let customers = [...mockCustomers];
let transactions = [...mockTransactions];
let expenses = [...mockExpenses];

function isSetupInvestmentExpense(e: Expense): boolean {
  return e.isSetupCost || e.category === 'setup_investment';
}
const notifications = [...mockNotifications];

/** In-memory only; not persisted across reload — mock stock helpers mirror real API behavior. */
function applyMockStockDelta(productId: string, delta: number): void {
  const prodIdx = products.findIndex((p) => p.id === productId);
  if (prodIdx !== -1) {
    products[prodIdx] = {
      ...products[prodIdx],
      stock: Math.max(0, products[prodIdx].stock + delta),
    };
  }
  const invIdx = inventory.findIndex((i) => i.id === productId);
  if (invIdx !== -1) {
    inventory[invIdx] = {
      ...inventory[invIdx],
      stock: Math.max(0, inventory[invIdx].stock + delta),
    };
  }
}

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
  isMockEnabled: isMockEnabled(),

  async login(credentials: LoginCredentials): Promise<{
    user: User;
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
  }> {
    await delay(600);
    if (credentials.email === 'admin@komart.com' && credentials.password === 'password') {
      return {
        user: mockUser,
        accessToken: MOCK_ACCESS_TOKEN,
        refreshToken: MOCK_REFRESH_TOKEN,
        expiresIn: 900,
      };
    }
    throw new Error('Invalid email or password');
  },

  async refresh(_refreshToken: string): Promise<{
    user: User;
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
  }> {
    await delay(200);
    return {
      user: mockUser,
      accessToken: MOCK_ACCESS_TOKEN,
      refreshToken: MOCK_REFRESH_TOKEN,
      expiresIn: 900,
    };
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
      status: data.status ?? 'active',
      supplierName: supplier?.name ?? data.supplierName ?? '',
      id: `prod-${generateId().slice(0, 8)}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const pricing = computeProductPricing({
      costPrice: product.costPrice,
      sellingPrice: product.sellingPrice,
      packSellingPrice: product.packSellingPrice ?? 0,
      unitsPerBuyUom: product.unitsPerBuyUom ?? 1,
      discountPercent: product.discountPercent ?? 0,
      offeredPrice: product.offeredPrice ?? 0,
      packDiscountPercent: product.packDiscountPercent ?? 0,
      packOfferedPrice: product.packOfferedPrice ?? 0,
    });
    Object.assign(product, pricing);
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
    const merged = products[idx];
    const pricing = computeProductPricing({
      costPrice: merged.costPrice,
      sellingPrice: merged.sellingPrice,
      packSellingPrice: merged.packSellingPrice ?? 0,
      unitsPerBuyUom: merged.unitsPerBuyUom ?? 1,
      discountPercent: merged.discountPercent ?? 0,
      offeredPrice: merged.offeredPrice ?? 0,
      packDiscountPercent: merged.packDiscountPercent ?? 0,
      packOfferedPrice: merged.packOfferedPrice ?? 0,
    });
    products[idx] = { ...merged, ...pricing };
    return products[idx];
  },

  async bulkUpdateProducts(
    updates: ProductBulkUpdateItem[],
  ): Promise<ProductBulkUpdateResponse> {
    await delay(600);
    const errors: ProductBulkUpdateResponse['errors'] = [];
    let updated = 0;
    for (const item of updates) {
      const { id, ...data } = item;
      try {
        await this.updateProduct(id, data as Partial<Product>);
        updated += 1;
      } catch (err) {
        errors.push({ id, detail: err instanceof Error ? err.message : 'Update failed' });
      }
    }
    return { updated, errors };
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
    applyMockStockDelta(adjustment.productId, adjustment.quantity);
  },

  async receiveBatch(payload: import('@/services').ReceiveBatchPayload): Promise<import('@/types').InventoryBatch> {
    await delay(500);
    applyMockStockDelta(payload.productId, payload.quantity);
    const prodIdx = products.findIndex((p) => p.id === payload.productId);
    if (prodIdx !== -1 && payload.unitCost != null) {
      products[prodIdx] = { ...products[prodIdx], costPrice: payload.unitCost };
    }
    if (prodIdx !== -1 && payload.sellingPrice != null) {
      products[prodIdx] = { ...products[prodIdx], sellingPrice: payload.sellingPrice };
    }
    const invIdx = inventory.findIndex((i) => i.id === payload.productId);
    if (invIdx !== -1) {
      inventory[invIdx] = {
        ...inventory[invIdx],
        costPrice: payload.unitCost ?? inventory[invIdx].costPrice,
        sellingPrice: payload.sellingPrice ?? inventory[invIdx].sellingPrice,
      };
    }
    return {
      id: `batch-${generateId().slice(0, 8)}`,
      productId: payload.productId,
      batchNumber: payload.batchNumber,
      quantity: payload.quantity,
      unitCost: payload.unitCost ?? 0,
      expiryDate: payload.expiryDate,
      receivedAt: new Date().toISOString(),
    };
  },

  async getInventoryHistory(params?: import('@/services').InventoryHistoryParams): Promise<PaginatedResponse<StockAdjustment>> {
    await delay(400);
    return { data: [], total: 0, page: params?.page ?? 1, pageSize: params?.pageSize ?? 25, totalPages: 1 };
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
    const po = purchaseOrders[idx];
    if (po.status === 'received' || po.status === 'cancelled') {
      throw new Error('This purchase order cannot be edited');
    }
    if (po.status === 'ordered' && data.status === 'draft') {
      throw new Error('Cannot revert a placed order to draft');
    }

    const receivedByProduct = new Map(po.items.map((i) => [i.productId, i.receivedQuantity]));
    const mergedItems = data.items.map((item) => {
      const received = receivedByProduct.get(item.productId) ?? 0;
      if (item.quantity < received) {
        throw new Error(`Quantity for ${item.productName} cannot be less than received quantity (${received})`);
      }
      const lineStatus =
        received <= 0 ? 'pending' as const
        : received >= item.quantity ? 'received' as const
        : 'partial' as const;
      return { ...item, receivedQuantity: received, lineStatus };
    });

    purchaseOrders[idx] = {
      ...po,
      ...data,
      items: mergedItems,
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
      const delta = receive.receiveQuantity;
      if (delta <= 0) return item;
      const units = receive.unitsPerBuyUom ?? item.unitsPerBuyUom ?? 1;
      applyMockStockDelta(item.productId, delta * units);
      const receivedQuantity = item.receivedQuantity + delta;
      const lineStatus: PurchaseOrderLineStatus =
        receivedQuantity <= 0 ? 'pending'
        : receivedQuantity >= item.quantity ? 'received'
        : 'partial';
      return {
        ...item,
        receivedQuantity,
        unitsPerBuyUom: receive.unitsPerBuyUom ?? item.unitsPerBuyUom,
        lineStatus,
      };
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
    for (const line of data.items) {
      applyMockStockDelta(line.productId, -line.quantity);
    }
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

  async updateTransaction(id: string, payload: Partial<Transaction>): Promise<Transaction> {
    await delay(400);
    const idx = transactions.findIndex((t) => t.id === id);
    if (idx === -1) throw new Error('Transaction not found');
    transactions[idx] = { ...transactions[idx], ...payload };
    return transactions[idx];
  },

  // ── Notifications ─────────────────────────────────────────────────────────
  async getNotifications(params?: {
    unreadOnly?: boolean;
    type?: import('@/types').NotificationType;
    sync?: boolean;
  }): Promise<AppNotification[]> {
    await delay(300);
    let list = [...notifications];
    if (params?.unreadOnly) list = list.filter((n) => !n.read);
    if (params?.type) list = list.filter((n) => n.type === params.type);
    return list;
  },

  async markNotificationRead(id: string): Promise<void> {
    await delay(150);
    const idx = notifications.findIndex((n) => n.id === id);
    if (idx >= 0) notifications[idx] = { ...notifications[idx], read: true };
  },

  async markAllNotificationsRead(): Promise<void> {
    await delay(150);
    for (let i = 0; i < notifications.length; i++) {
      notifications[i] = { ...notifications[i], read: true };
    }
  },

  async syncNotifications(): Promise<void> {
    await delay(200);
  },

  async getSettings(): Promise<StoreSettings> {
    await delay(300);
    return mockStoreSettings;
  },

  // ── Reports ───────────────────────────────────────────────────────────────
  async getSalesSummary(_range?: DateRange): Promise<SalesSummary> {
    await delay(300);
    return mockSalesSummary;
  },

  async getSalesByPaymentMethod(_range?: DateRange): Promise<SalesByPaymentMethod[]> {
    await delay(300);
    return mockSalesByPaymentMethod;
  },

  async getReportsRevenue(_range?: DateRange): Promise<RevenueDataPoint[]> {
    await delay(300);
    return mockRevenueData;
  },

  async getReportsTopProducts(_range?: DateRange): Promise<TopProduct[]> {
    await delay(300);
    return mockTopProducts;
  },

  async getReportsSalesByCategory(_range?: DateRange): Promise<SalesByCategory[]> {
    await delay(300);
    return mockSalesByCategory;
  },

  async getInventoryReportSummary(): Promise<InventoryReportSummary> {
    await delay(300);
    return mockInventoryReportSummary;
  },

  async getExpiringProducts(): Promise<PaginatedResponse<ExpiringProductRow>> {
    await delay(300);
    const rows: ExpiringProductRow[] = mockInventory
      .filter((i) => i.nearestExpiry)
      .slice(0, 5)
      .map((i) => ({
        productId: i.id,
        productName: i.name,
        sku: i.sku,
        category: i.category,
        batchNumber: i.batches[0]?.batchNumber ?? 'B-001',
        quantity: i.batches[0]?.quantity ?? i.stock,
        expiryDate: i.nearestExpiry!,
        daysUntilExpiry: 14,
      }));
    return { data: rows, total: rows.length, page: 1, pageSize: 25, totalPages: 1 };
  },

  async getLowStockReport(): Promise<PaginatedResponse<LowStockProductRow>> {
    await delay(300);
    const rows: LowStockProductRow[] = mockProducts
      .filter((p) => p.stock === 0 || (p.stock > 0 && p.stock <= p.lowStockThreshold))
      .slice(0, 10)
      .map((p) => ({
        productId: p.id,
        productName: p.name,
        sku: p.sku,
        category: p.category,
        stock: p.stock,
        lowStockThreshold: p.lowStockThreshold,
        status: p.stock === 0 ? 'out' : 'low',
      }));
    return { data: rows, total: rows.length, page: 1, pageSize: 25, totalPages: 1 };
  },

  async getProfitSummary(_range?: DateRange): Promise<ProfitSummary> {
    await delay(300);
    return mockProfitSummary;
  },

  async getMarginByCategory(_range?: DateRange): Promise<MarginByCategory[]> {
    await delay(300);
    return mockSalesByCategory.map((c) => ({
      category: c.category,
      revenue: c.revenue,
      cogs: Math.round(c.revenue * 0.6),
      grossProfit: Math.round(c.revenue * 0.4),
      grossMarginPct: 40,
    }));
  },

  async getPurchasingBySupplier(_range?: DateRange): Promise<PurchasingBySupplier[]> {
    await delay(300);
    return mockSuppliers.slice(0, 4).map((s, i) => ({
      supplierId: s.id,
      supplierName: s.name,
      totalAmount: 85000 - i * 12000,
      orderCount: 5 - i,
    }));
  },

  async getPurchaseOrdersSummary(_range?: DateRange): Promise<PurchaseOrdersSummary> {
    await delay(300);
    return {
      totalOrders: mockPurchaseOrders.length,
      totalAmount: mockPurchaseOrders.reduce((s, p) => s + p.totalAmount, 0),
      byStatus: [
        { status: 'ordered', count: 2 },
        { status: 'partial', count: 1 },
        { status: 'received', count: 3 },
      ],
    };
  },

  async getTopCustomers(_range?: DateRange): Promise<TopCustomer[]> {
    await delay(300);
    return mockCustomers.slice(0, 5).map((c) => ({
      customerId: c.id,
      customerName: c.name,
      transactionCount: 12,
      totalSpent: c.totalSpent,
    }));
  },

  async getLoyaltySummary(_range?: DateRange): Promise<LoyaltySummary> {
    await delay(300);
    return {
      pointsRedeemed: 450,
      activeMembers: mockCustomers.filter((c) => c.loyaltyPoints > 0).length,
      newCustomers: 8,
      totalMembers: mockCustomers.length,
    };
  },

  async getSalesByHour(_range?: DateRange): Promise<SalesByHour[]> {
    await delay(300);
    return Array.from({ length: 24 }, (_, h) => ({
      hour: h,
      label: `${String(h).padStart(2, '0')}:00`,
      revenue: h >= 10 && h <= 20 ? Math.floor(Math.random() * 8000) + 2000 : Math.floor(Math.random() * 1500),
      transactionCount: h >= 10 && h <= 20 ? Math.floor(Math.random() * 30) + 5 : Math.floor(Math.random() * 5),
    }));
  },

  async getSalesByDayOfWeek(_range?: DateRange): Promise<SalesByDayOfWeek[]> {
    await delay(300);
    const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    return labels.map((label, day) => ({
      day,
      label,
      revenue: 40000 + day * 3000 + (day >= 5 ? 15000 : 0),
      transactionCount: 120 + day * 8,
    }));
  },

  async getSalesByCashier(_range?: DateRange): Promise<SalesByCashier[]> {
    await delay(300);
    return [
      { cashier: 'Admin User', revenue: 185000, transactionCount: 680 },
      { cashier: 'Cashier', revenue: 157500, transactionCount: 560 },
    ];
  },

  async getDeadStock(): Promise<DeadStockProduct[]> {
    await delay(300);
    return mockProducts
      .filter((p) => p.stock > 20)
      .slice(0, 4)
      .map((p) => ({
        productId: p.id,
        productName: p.name,
        sku: p.sku,
        category: p.category,
        stock: p.stock,
        stockValue: p.stock * p.costPrice,
        daysWithoutSale: 30,
      }));
  },

  // ── Expenses ────────────────────────────────────────────────────────────────
  async getExpenses(params?: ListQueryParams): Promise<PaginatedResponse<Expense>> {
    await delay(250);
    const result = paginate<Expense>(expenses, params ?? {});
    return result;
  },

  async getExpenseStats(): Promise<ExpenseStats> {
    await delay(200);
    const now = new Date();
    const thisMonthTotal = expenses
      .filter((e) => {
        const d = new Date(e.date);
        return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
      })
      .reduce((sum, e) => sum + e.amount, 0);
    const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
    const setupInvestment = expenses
      .filter(isSetupInvestmentExpense)
      .reduce((sum, e) => sum + e.amount, 0);
    return {
      totalExpenses: Math.round(totalExpenses * 100) / 100,
      thisMonth: Math.round(thisMonthTotal * 100) / 100,
      setupInvestment: Math.round(setupInvestment * 100) / 100,
    };
  },

  async getExpense(id: string): Promise<Expense> {
    await delay(200);
    const expense = expenses.find((e) => e.id === id);
    if (!expense) throw new Error(`Expense ${id} not found`);
    return { ...expense };
  },

  async createExpense(data: ExpenseWritePayload): Promise<Expense> {
    await delay(300);
    const now = new Date().toISOString();
    const created: Expense = {
      ...data,
      id: `exp-${generateId().slice(0, 8)}`,
      createdAt: now,
      updatedAt: now,
    };
    expenses = [created, ...expenses];
    return { ...created };
  },

  async updateExpense(id: string, data: Partial<ExpenseWritePayload>): Promise<Expense> {
    await delay(300);
    const idx = expenses.findIndex((e) => e.id === id);
    if (idx === -1) throw new Error(`Expense ${id} not found`);
    expenses[idx] = { ...expenses[idx], ...data, updatedAt: new Date().toISOString() };
    return { ...expenses[idx] };
  },

  async deleteExpense(id: string): Promise<void> {
    await delay(250);
    expenses = expenses.filter((e) => e.id !== id);
  },

  async getExpenseSummary(_range?: DateRange): Promise<ExpenseSummary> {
    await delay(300);
    const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
    const setupInvestment = expenses
      .filter(isSetupInvestmentExpense)
      .reduce((sum, e) => sum + e.amount, 0);
    const categoryMap: Record<string, { amount: number; count: number }> = {};
    for (const e of expenses) {
      if (!categoryMap[e.category]) categoryMap[e.category] = { amount: 0, count: 0 };
      categoryMap[e.category].amount += e.amount;
      categoryMap[e.category].count += 1;
    }
    return {
      totalExpenses: Math.round(totalExpenses * 100) / 100,
      setupInvestment: Math.round(setupInvestment * 100) / 100,
      byCategory: Object.entries(categoryMap)
        .map(([category, v]) => ({ category, amount: Math.round(v.amount * 100) / 100, count: v.count }))
        .sort((a, b) => b.amount - a.amount),
      daily: [],
    };
  },

  // ── Discounts ─────────────────────────────────────────────────────────────
  async getDiscounts(_activeOnly = true): Promise<DiscountRule[]> {
    await delay(200);
    return [];
  },

  async createDiscount(
    data: Omit<DiscountRule, 'id' | 'createdAt' | 'updatedAt' | 'isActive'> & { isActive?: boolean },
  ): Promise<DiscountRule> {
    await delay(300);
    const now = new Date().toISOString();
    return {
      ...data,
      id: `disc-${generateId().slice(0, 8)}`,
      isActive: data.isActive ?? true,
      createdAt: now,
      updatedAt: now,
    };
  },

  async updateDiscount(id: string, data: Partial<DiscountRule>): Promise<DiscountRule> {
    await delay(300);
    const now = new Date().toISOString();
    return {
      id,
      name: data.name ?? 'Mock discount',
      code: data.code ?? '',
      ruleType: data.ruleType ?? 'cart_percent',
      value: data.value ?? 0,
      productIds: data.productIds ?? [],
      category: data.category ?? '',
      minCartTotal: data.minCartTotal ?? 0,
      maxDiscount: data.maxDiscount ?? 0,
      startsAt: data.startsAt,
      endsAt: data.endsAt,
      isActive: data.isActive ?? true,
      priority: data.priority ?? 0,
      createdAt: now,
      updatedAt: now,
    };
  },

  async deleteDiscount(_id: string): Promise<void> {
    await delay(200);
  },

  async evaluateDiscount(payload: {
    items: Array<{ productId: string; price: number; quantity: number; category?: string }>;
    couponCode?: string;
  }): Promise<EvaluateDiscountResult> {
    await delay(150);
    return {
      lineItems: payload.items.map((item) => ({
        productId: item.productId,
        perUnitDiscount: 0,
        lineDiscount: 0,
      })),
      lineDiscountTotal: 0,
      cartDiscount: 0,
      promotionDiscountTotal: 0,
      appliedPromotions: [],
    };
  },

  // ── Audit logs ──────────────────────────────────────────────────────────────
  async getAuditLogs(params?: AuditLogQueryParams): Promise<PaginatedResponse<AuditLog>> {
    await delay(250);
    const page = params?.page ?? 1;
    const pageSize = params?.pageSize ?? 25;
    return { data: [], total: 0, page, pageSize, totalPages: 0 };
  },

  async getAuditLog(id: string): Promise<AuditLog> {
    await delay(200);
    throw new Error(`Audit log ${id} not found`);
  },
};
