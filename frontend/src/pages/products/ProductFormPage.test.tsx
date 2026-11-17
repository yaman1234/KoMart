import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ProductFormPage } from '@/pages/products/ProductFormPage';
import { PRODUCT_FIELD_LABELS } from '@/constants/productFieldLabels';
import { useProduct } from '@/hooks/useProducts';

vi.mock('@/hooks/useProducts', () => ({
  useProduct: vi.fn(() => ({ data: undefined, isLoading: false })),
  useCreateProduct: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
  useUpdateProduct: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
}));

vi.mock('@/hooks/useSettings', () => ({
  useStoreSettings: () => ({ data: { calendarSystem: 'AD', defaultLowStockThreshold: 10 } }),
}));

vi.mock('@/hooks/useSuppliers', () => ({
  useSuppliers: () => ({ data: { data: [] } }),
}));

vi.mock('@/hooks/useCategories', () => ({
  useCategoryNames: () => ['Snacks'],
}));

vi.mock('@/hooks/useUoms', () => ({
  useUomOptions: () => [
    { value: 'pack', label: 'Pack' },
    { value: 'pcs', label: 'Pieces (pcs)' },
  ],
}));

function clickCheckbox(labelText: string) {
  const label = Array.from(document.querySelectorAll('label')).find((el) =>
    el.textContent?.includes(labelText),
  );
  const input = label?.querySelector('input');
  act(() => {
    input?.click();
  });
}

describe('ProductFormPage labels', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.mocked(useProduct).mockReturnValue({ data: undefined, isLoading: false } as never);
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
            <Route path="/products/new" element={<ProductFormPage />} />
          </Routes>
        </MemoryRouter>,
      );
    });
  }

  it('keeps sheet and Excel headers on PRODUCT_FIELD_LABELS', () => {
    expect(PRODUCT_FIELD_LABELS.unitCost).toBe('Unit cost');
    expect(PRODUCT_FIELD_LABELS.unitPrice).toBe('Unit price');
    expect(PRODUCT_FIELD_LABELS.packPrice).toBe('Pack price');
    expect(PRODUCT_FIELD_LABELS.marginPercent).toBe('Margin %');
    expect(PRODUCT_FIELD_LABELS.lowStock).toBe('Low stock');
    expect(PRODUCT_FIELD_LABELS.buyUom).toBe('Buy unit');
    expect(PRODUCT_FIELD_LABELS.sellMode).toBe('Sell as');
    expect(PRODUCT_FIELD_LABELS.unitsPerPack).toBe('Per pack');
  });

  it('uses the same visible labels as product details', () => {
    renderAt('/products/new');
    const text = document.body.textContent ?? '';

    expect(text).toContain('Cost / pc');
    expect(text).toContain('Price / pc');
    expect(text).toContain('Buy unit (purchase)');
    expect(text).toContain('Buy unit');
    expect(text).toContain('Uses conversion (Sell unit)');
    expect(text).toContain('Margin');
    expect(text).toContain('Popular');
    expect(text).toContain('Low stock alert');
    expect(text).toContain('Supplier');
    expect(text).toContain('Country');
    expect(text).toContain('Nutrition');
    expect(text).toContain('Allergens');
    expect(text).toContain('Barcode');
    expect(text).toContain('Brand');
    expect(text).toContain('Category');

    expect(text).not.toContain('Unit cost');
    expect(text).not.toContain('Unit price');
    expect(text).not.toContain('Primary Unit');
    expect(text).not.toContain('Secondary Unit');
    expect(text).not.toContain('Sell mode');
    expect(text).not.toContain('Units per pack');
    expect(text).not.toContain('Margin %');
    expect(text).not.toContain('Most Popular');
    expect(text).not.toContain('Primary Supplier');
    expect(text).not.toContain('Country of Origin');
    expect(text).not.toContain('Nutrition Information');
    expect(text).not.toContain('Allergen Information');
    expect(text).not.toContain('(optional)');

    clickCheckbox('Uses conversion (Sell unit)');
    const withConversion = document.body.textContent ?? '';
    expect(withConversion).toContain('Pcs in pack');
    expect(withConversion).toContain('Sell unit (stock & sell)');
    expect(withConversion).toContain('Sell as');
    expect(withConversion).toContain('Pack only');
    expect(withConversion).toContain('Price / pack');
    expect(withConversion).not.toContain('Pack price');

    const sellAs = Array.from(document.querySelectorAll('[role="combobox"]')).find((el) =>
      el.textContent?.includes('Pack only'),
    );
    act(() => {
      sellAs?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, cancelable: true }));
    });
    const options = Array.from(document.querySelectorAll('[role="option"]')).map((el) =>
      el.textContent?.trim(),
    );
    expect(options).toEqual(expect.arrayContaining(['Pack only', 'Piece only', 'Pack & piece']));
  });
});
