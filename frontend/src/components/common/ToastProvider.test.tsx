import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '@mui/material';
import { createAppTheme } from '@/theme';
import { useToastStore } from '@/store/toast';
import { API_TIMEOUT_MESSAGE } from '@/utils/apiTimeout';
import { ToastProvider } from './ToastProvider';

const mockState = vi.hoisted(() => ({ enabled: false }));

vi.mock('@/config/mock', () => ({
  isMockEnabled: () => mockState.enabled,
}));

function renderToasts() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);

  act(() => {
    root.render(
      <ThemeProvider theme={createAppTheme('light')}>
        <ToastProvider />
      </ThemeProvider>,
    );
  });

  return {
    unmount() {
      act(() => root.unmount());
      container.remove();
    },
  };
}

describe('timeout notice', () => {
  beforeEach(() => {
    mockState.enabled = false;
    useToastStore.setState({ toasts: [], timeoutNoticeOpen: false });
  });

  it('shows one dismissible timeout message with a refresh action', () => {
    useToastStore.getState().showTimeoutNotice();
    useToastStore.getState().showTimeoutNotice();
    const view = renderToasts();

    expect(document.body.textContent).toContain(API_TIMEOUT_MESSAGE);
    const refresh = Array.from(document.body.querySelectorAll('button')).find(
      (button) => button.textContent === 'Refresh',
    );
    expect(refresh).toBeTruthy();

    const close = document.body.querySelector('button[aria-label="Close"]');
    act(() => {
      close?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(useToastStore.getState().timeoutNoticeOpen).toBe(false);
    expect(document.body.textContent).not.toContain(API_TIMEOUT_MESSAGE);
    view.unmount();
  });

  it('stays hidden in mock mode', () => {
    mockState.enabled = true;
    useToastStore.setState({ timeoutNoticeOpen: true });
    const view = renderToasts();
    expect(document.body.textContent).not.toContain(API_TIMEOUT_MESSAGE);
    view.unmount();
  });
});
