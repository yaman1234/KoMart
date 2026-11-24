import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { ProductQuickViewDialog } from '@/components/products/ProductQuickViewDialog';
import { useAuthStore, useCartStore } from '@/store';
import type { CartItem, Product, UserRole } from '@/types';

const product = {
  id: 'prod-1',
  name: 'Shin Ramyun',
  sku: 'KM-001',
  barcode: '123',
  brand: 'Nongshim',
  countryOfOrigin: 'South Korea',
  category: 'Instant Noodles',
  supplierId: 'sup-1',
  supplierName: 'Seoul Foods',
  description: 'Spicy noodles',
  buyUom: 'pack',
  uom: 'pcs',
  unitsPerBuyUom: 4,
  sellMode: 'both',
  costPrice: 100,
  sellingPrice: 150,
  packSellingPrice: 500,
  images: [],
  stock: 12,
  lowStockThreshold: 5,
  tags: ['spicy'],
  status: 'active',
  createdAt: '2024-06-01T00:00:00Z',
  updatedAt: '2024-06-01T00:00:00Z',
} as Product;

function setRole(role: UserRole | null) {
  useAuthStore.setState({
    user: role
      ? {
          id: 'user-1',
          email: `${role}@komart.com`,
          name: role,
          role,
          createdAt: '2024-01-01T00:00:00Z',
        }
      : null,
    isAuthenticated: role != null,
    accessToken: role ? 'token' : null,
    refreshToken: role ? 'refresh' : null,
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

describe('ProductQuickViewDialog Go to Product', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    localStorage.clear();
    useCartStore.setState({ items: [], customerId: null });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    setRole(null);
  });

  function renderDialog(role: UserRole, showGoToProduct = false) {
    setRole(role);
    act(() => {
      root.render(
        <MemoryRouter initialEntries={['/pos?search=ramen']}>
          <Routes>
            <Route
              path="/pos"
              element={
                <ProductQuickViewDialog
                  product={product}
                  open
                  onClose={() => undefined}
                  showGoToProduct={showGoToProduct}
                />
              }
            />
            <Route path="/products/:id" element={<LocationProbe />} />
          </Routes>
        </MemoryRouter>,
      );
    });
  }

  it('shows the button for admin and manager only when the POS prop is set', () => {
    renderDialog('admin', true);
    expect(buttonByText('Go to Product')).toBeTruthy();

    renderDialog('manager', true);
    expect(buttonByText('Go to Product')).toBeTruthy();

    renderDialog('cashier', true);
    expect(buttonByText('Go to Product')).toBeUndefined();
    expect(document.body.textContent).toContain('Shin Ramyun');

    renderDialog('admin', false);
    expect(buttonByText('Go to Product')).toBeUndefined();
    expect(document.body.textContent).toContain('Product details');
  });

  it('opens the product page with the POS marker and leaves the cart intact', () => {
    const line: CartItem = {
      productId: 'prod-1',
      name: 'Shin Ramyun',
      sku: 'KM-001',
      price: 150,
      quantity: 2,
      discount: 0,
    };
    useCartStore.getState().addItem(line);
    renderDialog('admin', true);

    act(() => {
      buttonByText('Go to Product')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(document.querySelector('[data-testid="loc"]')?.textContent).toBe('/products/prod-1');
    expect(useCartStore.getState().items).toEqual([line]);
  });
});
