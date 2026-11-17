import axios from 'axios';
import { isMockEnabled } from '@/config/mock';
import { useToastStore } from '@/store/toast';

export const API_TIMEOUT_MESSAGE =
  'The server is taking too long to respond. Please refresh the page.';

const TIMEOUT_CODES = new Set(['ECONNABORTED', 'ETIMEDOUT']);

function readString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function errorCode(error: object): string {
  return 'code' in error ? readString(error.code) : '';
}

function errorMessage(error: object): string {
  if (error instanceof Error) return error.message;
  return 'message' in error ? readString(error.message) : '';
}

function errorName(error: object): string {
  return 'name' in error ? readString(error.name) : '';
}

function mentionsTimeout(error: object): boolean {
  return errorMessage(error).toLowerCase().includes('timeout');
}

/** True for a client timeout signal, not for a user-initiated abort. */
function isTimeoutSignal(error: object): boolean {
  const name = errorName(error);
  if (name === 'TimeoutError') return true;
  return name === 'AbortError' && mentionsTimeout(error);
}

function looksLikeTimeout(error: object): boolean {
  if (TIMEOUT_CODES.has(errorCode(error))) return true;
  if (mentionsTimeout(error)) return true;
  return isTimeoutSignal(error);
}

function hasHttpResponse(error: object): boolean {
  return axios.isAxiosError(error) && error.response != null;
}

/**
 * Client-side request timeouts only.
 * Axios XHR timeouts in this app are ECONNABORTED (clarifyTimeoutError is off);
 * ETIMEDOUT covers the fetch adapter and AbortSignal timeouts. A message that
 * contains "timeout", or an AbortError/TimeoutError from a timeout signal,
 * counts as well. HTTP responses — 4xx, 5xx, and 401s from the refresh flow —
 * are not timeouts. A no-response ERR_NETWORK is an offline failure, not a timeout.
 */
export function isRequestTimeout(error: unknown): boolean {
  if (error == null || typeof error !== 'object') return false;
  if (hasHttpResponse(error)) return false;
  if (looksLikeTimeout(error)) return true;

  const cause = 'cause' in error ? error.cause : undefined;
  if (cause == null || cause === error || typeof cause !== 'object') return false;
  if (hasHttpResponse(cause)) return false;
  return looksLikeTimeout(cause);
}

/** Open the single app-wide timeout notice. No-op in mock mode and for other errors. */
export function reportApiTimeout(error: unknown): void {
  if (isMockEnabled()) return;
  if (!isRequestTimeout(error)) return;
  useToastStore.getState().showTimeoutNotice();
}
