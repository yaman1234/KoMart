import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { DateRangePicker } from './DateRangePicker';
import { addCalendarDays, storeTodayIso } from '@/utils/storeDate';

vi.mock('@/hooks/useSettings', () => ({
  useStoreSettings: () => ({ data: { calendarSystem: 'AD' } }),
}));

describe('DateRangePicker store today', () => {
  it('selects Today when the range is the Kathmandu date and keeps other ranges', () => {
    const today = storeTodayIso();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root: Root = createRoot(container);
    const onChange = vi.fn();

    const button = (label: string) =>
      Array.from(container.querySelectorAll('button')).find((el) => el.textContent === label);

    act(() => {
      root.render(<DateRangePicker startDate={today} endDate={today} onChange={onChange} />);
    });

    expect(button('Today')?.className).toContain('MuiButton-contained');
    expect(button('7D')?.className).not.toContain('MuiButton-contained');

    act(() => {
      button('Yesterday')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const yesterday = addCalendarDays(today, -1);
    expect(onChange).toHaveBeenCalledWith({ startDate: yesterday, endDate: yesterday });

    act(() => {
      root.render(
        <DateRangePicker startDate="2026-01-01" endDate="2026-01-31" onChange={onChange} />,
      );
    });

    expect(button('Today')?.className).not.toContain('MuiButton-contained');

    act(() => {
      root.unmount();
    });
    container.remove();
  });
});