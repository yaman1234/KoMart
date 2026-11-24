import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useToastStore } from '@/store/toast';
import { isRequestTimeout, reportApiTimeout } from '@/utils/apiTimeout';

const mockState = vi.hoisted(() => ({ enabled: false }));

vi.mock('@/config/mock', () => ({
  isMockEnabled: () => mockState.enabled,
}));

function axiosError(message: string, code?: string, status?: number) {
  return new axios.AxiosError(
    message,
    code,
    undefined,
    undefined,
    status == null
      ? undefined
      : {
          status,
          data: {},
          statusText: '',
          headers: {},
          config: {} as never,
        },
  );
}

describe('isRequestTimeout', () => {
  it('detects axios timeout codes and timeout messages', () => {
    expect(isRequestTimeout(axiosError('timeout of 30000ms exceeded', 'ECONNABORTED'))).toBe(true);
    expect(isRequestTimeout(axiosError('timeout of 60000ms exceeded', 'ETIMEDOUT'))).toBe(true);
    expect(isRequestTimeout(axiosError('Request aborted', 'ECONNABORTED'))).toBe(true);
    expect(isRequestTimeout(new Error('timeout of 30000ms exceeded'))).toBe(true);
  });

  it('detects AbortError and TimeoutError from a timeout signal', () => {
    expect(
      isRequestTimeout(new DOMException('The operation was aborted due to timeout', 'AbortError')),
    ).toBe(true);
    expect(isRequestTimeout(new DOMException('signal timed out', 'TimeoutError'))).toBe(true);
    expect(isRequestTimeout(axiosError('canceled', 'ERR_CANCELED'))).toBe(false);

    const wrapped = new Error('canceled');
    (wrapped as Error & { cause?: unknown }).cause = new DOMException(
      'The operation was aborted due to timeout',
      'AbortError',
    );
    expect(isRequestTimeout(wrapped)).toBe(true);
  });

  it('ignores HTTP errors, user aborts, and offline errors with no response', () => {
    expect(isRequestTimeout(axiosError('Request failed with status code 401', 'ERR_BAD_REQUEST', 401))).toBe(false);
    expect(isRequestTimeout(axiosError('Request failed with status code 404', 'ERR_BAD_REQUEST', 404))).toBe(false);
    expect(isRequestTimeout(axiosError('Request failed with status code 500', 'ERR_BAD_RESPONSE', 500))).toBe(false);
    expect(isRequestTimeout(axiosError('Gateway Timeout', 'ERR_BAD_RESPONSE', 504))).toBe(false);
    expect(isRequestTimeout(new DOMException('The user aborted a request.', 'AbortError'))).toBe(false);
    expect(isRequestTimeout(axiosError('canceled', 'ERR_CANCELED'))).toBe(false);
    expect(isRequestTimeout(axiosError('Network Error', 'ERR_NETWORK'))).toBe(false);
    expect(isRequestTimeout(null)).toBe(false);
  });
});

describe('reportApiTimeout', () => {
  beforeEach(() => {
    mockState.enabled = false;
    useToastStore.setState({ timeoutNoticeOpen: false, toasts: [] });
  });

  it('opens a single notice for a burst of timeouts', () => {
    const updates: boolean[] = [];
    const unsubscribe = useToastStore.subscribe((state) => {
      updates.push(state.timeoutNoticeOpen);
    });

    const error = axiosError('timeout of 30000ms exceeded', 'ECONNABORTED');
    reportApiTimeout(error);
    reportApiTimeout(error);
    reportApiTimeout(axiosError('timeout of 30000ms exceeded', 'ETIMEDOUT'));

    expect(useToastStore.getState().timeoutNoticeOpen).toBe(true);
    expect(updates).toEqual([true]);
    unsubscribe();
  });

  it('does not open for non-timeout errors', () => {
    reportApiTimeout(axiosError('Network Error', 'ERR_NETWORK'));
    reportApiTimeout(axiosError('Request failed with status code 401', 'ERR_BAD_REQUEST', 401));
    reportApiTimeout(axiosError('Request failed with status code 500', 'ERR_BAD_RESPONSE', 500));
    expect(useToastStore.getState().timeoutNoticeOpen).toBe(false);
  });

  it('never opens in mock mode', () => {
    mockState.enabled = true;
    reportApiTimeout(axiosError('timeout of 30000ms exceeded', 'ECONNABORTED'));
    expect(useToastStore.getState().timeoutNoticeOpen).toBe(false);
  });

  it('can show again after the notice is dismissed', () => {
    const error = axiosError('timeout of 30000ms exceeded', 'ETIMEDOUT');
    reportApiTimeout(error);
    useToastStore.getState().dismissTimeoutNotice();
    expect(useToastStore.getState().timeoutNoticeOpen).toBe(false);
    reportApiTimeout(error);
    expect(useToastStore.getState().timeoutNoticeOpen).toBe(true);
  });
});
