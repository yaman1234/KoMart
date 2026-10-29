import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { MemoryRouter, useLocation } from 'react-router-dom';
import {
  useListState,
  stringParam,
  pageParam,
  pageSizeParam,
  booleanParam,
  enumParam,
} from './useListState';
import {
  navigateBack,
  saveLastListUrl,
  getLastListUrl,
} from '@/utils/navigation';
import {
  saveScrollPosition,
  getSavedScrollPosition,
  restoreScroll,
} from '@/utils/scrollRestoration';

describe('useListState and Navigation State Preservation', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    sessionStorage.clear();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  const cleanup = () => {
    act(() => {
      root.unmount();
    });
    container.remove();
  };

  it('Scenario 1: Search query preservation and state update', async () => {
    let captured: any;
    function TestComponent() {
      const listState = useListState({
        routePrefix: '/products',
        schema: {
          search: stringParam(''),
          page: pageParam(0),
        },
      });
      const location = useLocation();
      captured = { ...listState, location };
      return <div>Search: {listState.filters.search}</div>;
    }

    act(() => {
      root.render(
        <MemoryRouter initialEntries={['/products?search=buldak']}>
          <TestComponent />
        </MemoryRouter>
      );
    });

    expect(captured.filters.search).toBe('buldak');
    expect(container.textContent).toContain('Search: buldak');

    act(() => {
      captured.setFilter('search', 'shin ramyun');
    });

    expect(captured.filters.search).toBe('shin ramyun');
    expect(captured.location.search).toContain('search=shin+ramyun');

    cleanup();
  });

  it('Scenario 2: Multiple concurrent filters preserved in URL query parameters', () => {
    let captured: any;
    function TestComponent() {
      const listState = useListState({
        routePrefix: '/purchase-orders',
        schema: {
          search: stringParam(''),
          status: enumParam(['', 'ordered', 'received', 'cancelled'] as const, ''),
          category: stringParam(''),
          offerOnly: booleanParam(false),
          page: pageParam(0),
          pageSize: pageSizeParam(10),
        },
      });
      const location = useLocation();
      captured = { ...listState, location };
      return <div>Status: {listState.filters.status}</div>;
    }

    act(() => {
      root.render(
        <MemoryRouter initialEntries={['/purchase-orders']}>
          <TestComponent />
        </MemoryRouter>
      );
    });

    act(() => {
      captured.setFilters({
        search: 'PO-2026',
        status: 'received',
        offerOnly: true,
        page: 0,
      });
    });

    expect(captured.filters.search).toBe('PO-2026');
    expect(captured.filters.status).toBe('received');
    expect(captured.filters.offerOnly).toBe(true);

    const searchParams = new URLSearchParams(captured.location.search);
    expect(searchParams.get('search')).toBe('PO-2026');
    expect(searchParams.get('status')).toBe('received');
    expect(searchParams.get('offerOnly')).toBe('true');

    cleanup();
  });

  it('Scenario 3: Pagination and sorting parameter synchronization with URL', () => {
    let captured: any;
    function TestComponent() {
      const listState = useListState({
        routePrefix: '/sales',
        schema: {
          page: pageParam(0),
          pageSize: pageSizeParam(25),
          sortBy: stringParam('createdAt'),
          sortOrder: enumParam(['asc', 'desc'] as const, 'desc'),
        },
      });
      const location = useLocation();
      captured = { ...listState, location };
      return <div>Page: {listState.filters.page}</div>;
    }

    // Direct visit to page 3 (page=3 in URL means 0-indexed page 2 in component state)
    act(() => {
      root.render(
        <MemoryRouter initialEntries={['/sales?page=3&sortBy=total&sortOrder=asc']}>
          <TestComponent />
        </MemoryRouter>
      );
    });

    expect(captured.filters.page).toBe(2);
    expect(captured.filters.sortBy).toBe('total');
    expect(captured.filters.sortOrder).toBe('asc');

    // Change page to page 4 (index 3)
    act(() => {
      captured.setFilter('page', 3);
    });

    const searchParams = new URLSearchParams(captured.location.search);
    expect(searchParams.get('page')).toBe('4');

    cleanup();
  });

  it('Scenario 4 & 5: Direct URL access and fallback state restoration', () => {
    let captured: any;
    function TestComponent() {
      const listState = useListState({
        routePrefix: '/inventory',
        schema: {
          tab: enumParam(['stock', 'ledger'] as const, 'stock'),
          filter: enumParam(['all', 'low', 'out', 'expiring'] as const, 'all'),
          search: stringParam(''),
        },
      });
      captured = listState;
      return <div>Tab: {listState.filters.tab}</div>;
    }

    act(() => {
      root.render(
        <MemoryRouter initialEntries={['/inventory?tab=ledger&filter=low&search=noodle']}>
          <TestComponent />
        </MemoryRouter>
      );
    });

    expect(captured.filters.tab).toBe('ledger');
    expect(captured.filters.filter).toBe('low');
    expect(captured.filters.search).toBe('noodle');

    cleanup();
  });

  it('Scenario 6: Scroll restoration recording and retrieval on scroll containers', () => {
    saveScrollPosition('loc_key', '/products?search=buldak', 450);

    const savedTop = getSavedScrollPosition('loc_key', '/products?search=buldak');
    expect(savedTop).toBe(450);

    const targetEl = document.createElement('div');
    Object.defineProperty(targetEl, 'scrollHeight', { value: 1000, configurable: true });
    Object.defineProperty(targetEl, 'clientHeight', { value: 500, configurable: true });

    restoreScroll(targetEl, 450);
    expect(targetEl.scrollTop).toBe(450);
  });

  it('Scenario 7: Out-of-range page clamping when dataset shrinks', () => {
    let captured: any;
    function TestComponent() {
      const listState = useListState({
        routePrefix: '/products',
        schema: {
          page: pageParam(0),
          pageSize: pageSizeParam(10),
        },
      });
      captured = listState;
      return <div>Page: {listState.filters.page}</div>;
    }

    // User is on page 5 (index 4) with 100 items
    act(() => {
      root.render(
        <MemoryRouter initialEntries={['/products?page=5']}>
          <TestComponent />
        </MemoryRouter>
      );
    });

    expect(captured.filters.page).toBe(4);

    // Underlying dataset shrinks to 15 items total (max page index is 1)
    act(() => {
      captured.clampPage(15);
    });

    // Page must automatically clamp to 1 (page 2 in URL) without crashing
    expect(captured.filters.page).toBe(1);

    cleanup();
  });

  it('Scenario 8: navigateBack navigation and last list URL tracking', () => {
    const mockNavigate = vi.fn();

    // 1. Save list URL with state
    saveLastListUrl('/products', '/products?search=buldak&category=Noodles&page=2');
    expect(getLastListUrl('/products')).toBe('/products?search=buldak&category=Noodles&page=2');

    // 2. Direct entrance without history depth -> uses saved last list URL or fallback
    navigateBack(mockNavigate, '/products');
    expect(mockNavigate).toHaveBeenCalledWith('/products?search=buldak&category=Noodles&page=2', { replace: true });

    // 3. Clear storage and test clean fallback
    sessionStorage.clear();
    mockNavigate.mockClear();
    navigateBack(mockNavigate, '/products');
    expect(mockNavigate).toHaveBeenCalledWith('/products', { replace: true });
  });
});
