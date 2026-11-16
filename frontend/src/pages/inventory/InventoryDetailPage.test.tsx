import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { InventoryDetailPage } from '@/pages/inventory/InventoryDetailPage';
import { useInventoryItem } from '@/hooks/useInventory';
import { useAuthStore } from '@/store';
import { saveLastListUrl } from '@/utils/navigation';
import type { InventoryItem } from '@/types';

vi.mock('@/hooks/useInventory', () => ({
  useInventoryItem: vi.fn(),
  useAdjustStock: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}));

vi.mock('@/hooks/useFormatDate', () => ({
  useFormatDate: () => (value: string) => value,
}));

const item = {
  id: 'prod-1',
  name: 'Shin Ramyun',
  sku: 'KM-001',
  barcode: '123',
  brand: 'Nongshim',
  countryOfOrigin: 'South Korea',
  category: 'Instant Noodles',
  supplierId: '',
  supplierName: 'Seoul Foods',
  description: '',
  uom: 'pcs',
  costPrice: 100,
  sellingPrice: 150,
  images: [],
  stock: 12,
  lowStockThreshold: 5,
  batches: [],
  batchCount: 0,
  createdAt: '2024-06-01T00:00:00Z',
  updatedAt: '2024-06-01T00:00:00Z',
} as InventoryItem;

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="loc">{`${location.pathname}${location.search}`}</div>;
}

function buttonByText(label: string): HTMLButtonElement | undefined {
  return Array.from(document.querySelectorAll('button')).find(
    (el) => el.textContent?.trim() === label,
  ) as HTMLButtonElement | undefined;
}

describe('InventoryDetailPage Back to POS', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    sessionStorage.clear();
    useAuthStore.setState({
      user: {
        id: 'user-1',
        email: 'manager@komart.com',
        name: 'Manager',
        role: 'manager',
        createdAt: '2024-01-01T00:00:00Z',
      },
      isAuthenticated: true,
      accessToken: 'token',
      refreshToken: 'refresh',
    });
    vi.mocked(useInventoryItem).mockReturnValue({
      data: item,
      isLoading: false,
      isError: false,
    } as never);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  function renderAt(entry: string) {
    act(() => {
      root.render(
        <MemoryRouter initialEntries={[entry]}>
          <Routes>
            <Route path="/inventory/:productId" element={<InventoryDetailPage />} />
            <Route path="/products/:id" element={<LocationProbe />} />
            <Route path="/pos" element={<LocationProbe />} />
          </Routes>
        </MemoryRouter>,
      );
    });
  }

  it('shows Back to POS on the missing-item state when opened from POS', () => {
    vi.mocked(useInventoryItem).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    } as never);
    saveLastListUrl('/pos', '/pos?search=ramen');
    renderAt('/inventory/missing?from=pos');

    expect(document.body.textContent).toContain('Inventory item not found.');
    expect(buttonByText('Back')).toBeTruthy();
    expect(buttonByText('Back to POS')).toBeTruthy();

    act(() => {
      buttonByText('Back to POS')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(document.querySelector('[data-testid="loc"]')?.textContent).toBe('/pos?search=ramen');
  });

  it('hides Back to POS on a normal inventory visit', () => {
    renderAt('/inventory/prod-1');
    expect(buttonByText('Back')).toBeTruthy();
    expect(buttonByText('Back to POS')).toBeUndefined();
  });

  it('returns to the saved POS URL and keeps the marker on the product link', () => {
    saveLastListUrl('/pos', '/pos?search=ramen&popularOnly=true');
    renderAt('/inventory/prod-1?from=pos');

    expect(buttonByText('Back to POS')).toBeTruthy();
    const productLink = Array.from(document.querySelectorAll('a')).find(
      (el) => el.textContent?.trim() === 'Product',
    );
    expect(productLink?.getAttribute('href')).toBe('/products/prod-1?from=pos');

    act(() => {
      buttonByText('Back to POS')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(document.querySelector('[data-testid="loc"]')?.textContent).toBe(
      '/pos?search=ramen&popularOnly=true',
    );
  });
});
