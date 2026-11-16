import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { ProductDetailPage } from '@/pages/products/ProductDetailPage';
import { useProduct } from '@/hooks/useProducts';
import { useAuthStore } from '@/store';
import { saveLastListUrl } from '@/utils/navigation';
import type { Product, UserRole } from '@/types';

vi.mock('@/hooks/useProducts', () => ({
  useProduct: vi.fn(),
  useDeleteProduct: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}));

vi.mock('@/hooks/useFormatDate', () => ({
  useFormatDate: () => (value: string) => value,
}));

const product = {
  id: 'prod-1',
  name: 'Shin Ramyun',
  sku: 'KM-001',
  barcode: '123',
  brand: 'Nongshim',
  countryOfOrigin: 'South Korea',
  category: 'Instant Noodles',
  supplierId: '',
  supplierName: '',
  description: 'Spicy noodles',
  buyUom: 'pack',
  uom: 'pcs',
  unitsPerBuyUom: 4,
  sellMode: 'both',
  costPrice: 100,
  sellingPrice: 150,
  images: [],
  stock: 12,
  lowStockThreshold: 5,
  tags: [],
  status: 'active',
  createdAt: '2024-06-01T00:00:00Z',
  updatedAt: '2024-06-01T00:00:00Z',
} as Product;

function setRole(role: UserRole) {
  useAuthStore.setState({
    user: {
      id: 'user-1',
      email: `${role}@komart.com`,
      name: role,
      role,
      createdAt: '2024-01-01T00:00:00Z',
    },
    isAuthenticated: true,
    accessToken: 'token',
    refreshToken: 'refresh',
  });
}

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="loc">{`${location.pathname}${location.search}`}</div>;
}

function buttonByText(label: string): HTMLButtonElement | undefined {
  return Array.from(document.querySelectorAll('button')).find(
    (el) => el.textContent?.trim() === label,
  ) as HTMLButtonElement | undefined;
}

describe('ProductDetailPage Back to POS', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    vi.mocked(useProduct).mockReturnValue({
      data: product,
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

  let renderSeq = 0;

  function renderAt(entry: string) {
    renderSeq += 1;
    const key = renderSeq;
    act(() => {
      root.render(
        <MemoryRouter key={key} initialEntries={[entry]}>
          <Routes>
            <Route path="/products/:id" element={<ProductDetailPage />} />
            <Route path="/products/:id/edit" element={<LocationProbe />} />
            <Route path="/inventory/:productId" element={<LocationProbe />} />
            <Route path="/pos" element={<LocationProbe />} />
          </Routes>
        </MemoryRouter>,
      );
    });
  }

  it('hides Back to POS unless the page was opened from POS', () => {
    setRole('admin');
    renderAt('/products/prod-1');
    expect(buttonByText('Back')).toBeTruthy();
    expect(buttonByText('Back to POS')).toBeUndefined();

    act(() => {
      buttonByText('Edit')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(document.querySelector('[data-testid="loc"]')?.textContent).toBe('/products/prod-1/edit');
  });

  it('returns to the filtered POS URL and carries the marker into edit and inventory', () => {
    setRole('manager');
    saveLastListUrl('/pos', '/pos?search=ramen&category=Snacks');
    renderAt('/products/prod-1?from=pos');

    expect(buttonByText('Back')).toBeTruthy();
    expect(buttonByText('Back to POS')).toBeTruthy();

    act(() => {
      buttonByText('Manage in Inventory')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(document.querySelector('[data-testid="loc"]')?.textContent).toBe('/inventory/prod-1?from=pos');

    renderAt('/products/prod-1?from=pos');
    act(() => {
      buttonByText('Edit')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(document.querySelector('[data-testid="loc"]')?.textContent).toBe('/products/prod-1/edit?from=pos');

    renderAt('/products/prod-1?from=pos');
    act(() => {
      buttonByText('Back to POS')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(document.querySelector('[data-testid="loc"]')?.textContent).toBe('/pos?search=ramen&category=Snacks');
  });
});
