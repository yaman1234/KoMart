import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { SalesPage } from './SalesPage';
import { useTransactions } from '@/hooks/useTransactions';
import { storeTodayIso } from '@/utils/storeDate';

vi.mock('@/hooks/useTransactions', () => ({
  useTransactions: vi.fn(() => ({ data: undefined, isLoading: false })),
}));

vi.mock('@/hooks/useSettings', () => ({
  useStoreSettings: () => ({ data: { calendarSystem: 'AD' } }),
}));

const mockedUseTransactions = vi.mocked(useTransactions);

function presetButton(container: HTMLElement, label: string) {
  return Array.from(container.querySelectorAll('button')).find((el) => el.textContent === label);
}

describe('SalesPage date filter', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    mockedUseTransactions.mockClear();
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

  it('scopes a fresh visit to today in the store timezone', () => {
    const today = storeTodayIso();

    act(() => {
      root.render(
        <MemoryRouter initialEntries={['/sales']}>
          <SalesPage />
        </MemoryRouter>,
      );
    });

    expect(presetButton(container, 'Today')?.className).toContain('MuiButton-contained');
    expect(mockedUseTransactions).toHaveBeenCalled();
    const params = mockedUseTransactions.mock.calls.at(-1)?.[0];
    expect(params?.startDate).toBe(today);
    expect(params?.endDate).toBe(today);

    cleanup();
  });

  it('keeps an explicit date range from the URL', () => {
    act(() => {
      root.render(
        <MemoryRouter initialEntries={['/sales?startDate=2026-05-01&endDate=2026-05-02']}>
          <SalesPage />
        </MemoryRouter>,
      );
    });

    expect(presetButton(container, 'Today')?.className).not.toContain('MuiButton-contained');
    const params = mockedUseTransactions.mock.calls.at(-1)?.[0];
    expect(params?.startDate).toBe('2026-05-01');
    expect(params?.endDate).toBe('2026-05-02');

    const todayButton = presetButton(container, 'Today');
    act(() => {
      todayButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const today = storeTodayIso();
    expect(presetButton(container, 'Today')?.className).toContain('MuiButton-contained');
    const after = mockedUseTransactions.mock.calls.at(-1)?.[0];
    expect(after?.startDate).toBe(today);
    expect(after?.endDate).toBe(today);

    const weekButton = presetButton(container, '7D');
    act(() => {
      weekButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(presetButton(container, 'Today')?.className).not.toContain('MuiButton-contained');
    expect(presetButton(container, '7D')?.className).toContain('MuiButton-contained');
    const week = mockedUseTransactions.mock.calls.at(-1)?.[0];
    expect(week?.startDate).not.toBe(today);
    expect(week?.endDate).toBe(today);

    cleanup();
  });
});