import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { PurchaseOrderDetailPage } from '@/pages/purchase-orders/PurchaseOrderDetailPage';
import { usePurchaseOrder } from '@/hooks/usePurchaseOrders';
import { useAuthStore } from '@/store';
import { formatCurrency } from '@/utils';
import { PO_LABELS } from '@/pages/purchase-orders/poTerminology';
import type { PurchaseOrder } from '@/types';

vi.mock('@/hooks/usePurchaseOrders', () => ({
  usePurchaseOrder: vi.fn(),
  useUpdatePurchaseOrderStatus: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
  useReceivePurchaseOrderItems: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
  useRecordPurchaseOrderPayment: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
  useUpdatePurchaseOrderBill: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
}));

vi.mock('@/hooks/usePurchaseReturns', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/usePurchaseReturns')>();
  return {
    ...actual,
    usePurchaseReturns: vi.fn(() => ({ data: { data: [] } })),
    useReturnableLines: vi.fn(() => ({ data: [] })),
    useCreatePurchaseReturn: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
  };
});

vi.mock('@/hooks/useProductCatalog', () => ({
  useProductCatalog: vi.fn(() => ({ products: [], index: { byId: new Map(), bySku: new Map() }, isLoading: false })),
}));

vi.mock('@/hooks/useSettings', () => ({
  useStoreSettings: vi.fn(() => ({ data: { taxRate: 13, currency: 'NPR', dateFormat: 'YYYY-MM-DD' } })),
}));

vi.mock('@/services', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services')>();
  return {
    ...actual,
    productService: {
      ...actual.productService,
      getLastPurchaseUnitCost: vi.fn().mockResolvedValue({ unitCost: null, purchasedAt: null, orderNumber: null }),
      getById: vi.fn().mockResolvedValue(null),
    },
  };
});

vi.mock('@/hooks/useFormatDate', () => ({
  useFormatDate: () => (value: string) => value,
}));

vi.mock('@/components/common/EntityAuditLog', () => ({
  EntityAuditLog: () => null,
}));

const mockPo: PurchaseOrder = {
  id: 'po-test-1',
  orderNumber: 'PO-2026-001',
  supplierId: 'sup-1',
  supplierName: 'Seoul Foods',
  status: 'ordered',
  items: [
    {
      productId: 'prod-1',
      productName: 'Shin Ramyun',
      quantity: 10,
      unitCost: 150,
      receivedQuantity: 0,
      orderUom: 'pack',
      baseUom: 'pcs',
      unitsPerBuyUom: 5,
      lineStatus: 'pending',
      lineTotal: 1500,
    },
    {
      productId: 'prod-2',
      productName: 'Honey Butter Chips',
      quantity: 4,
      unitCost: 250,
      receivedQuantity: 0,
      orderUom: 'box',
      baseUom: 'pcs',
      unitsPerBuyUom: 1,
      lineStatus: 'pending',
      lineTotal: 1000,
    },
  ],
  subtotal: 2500,
  discount: 0,
  additionalCharges: 0,
  vatBill: false,
  vatAmount: 0,
  vatRate: 0,
  totalAmount: 2500,
  amountPaid: 0,
  paymentStatus: 'unpaid',
  payments: [],
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

describe('PurchaseOrderDetailPage Line Total', () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    useAuthStore.setState({
      user: {
        id: 'user-admin',
        email: 'admin@komart.com',
        name: 'Admin',
        role: 'admin',
        createdAt: '2026-01-01T00:00:00Z',
      },
      isAuthenticated: true,
      accessToken: 'token',
      refreshToken: 'refresh',
    });

    vi.mocked(usePurchaseOrder).mockReturnValue({
      data: mockPo,
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof usePurchaseOrder>);
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount();
      });
    }
    container?.remove();
    container = null;
    root = null;
  });

  it('displays the Line Total column header in the items table', async () => {
    await act(async () => {
      root?.render(
        <MemoryRouter initialEntries={['/purchase-orders/po-test-1']}>
          <Routes>
            <Route path="/purchase-orders/:id" element={<PurchaseOrderDetailPage />} />
          </Routes>
        </MemoryRouter>,
      );
    });

    const headers = Array.from(container?.querySelectorAll('th') ?? []).map((th) => th.textContent?.trim());
    expect(headers).toContain(PO_LABELS.lineTotal);
    expect(headers).toContain('Line Total');
  });

  it('displays correct line total values for each purchase order item', async () => {
    await act(async () => {
      root?.render(
        <MemoryRouter initialEntries={['/purchase-orders/po-test-1']}>
          <Routes>
            <Route path="/purchase-orders/:id" element={<PurchaseOrderDetailPage />} />
          </Routes>
        </MemoryRouter>,
      );
    });

    const text = container?.textContent ?? '';
    // Shin Ramyun: 10 * 150 = 1500
    expect(text).toContain(formatCurrency(1500));
    // Honey Butter Chips: 4 * 250 = 1000
    expect(text).toContain(formatCurrency(1000));
  });
});
