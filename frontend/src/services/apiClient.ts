import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { API_BASE_URL } from '@/constants';
import { useAuthStore } from '@/store';
import { useLoadingStore } from '@/store/loading';
import {
  isMockEnabled,
  isMockRefreshToken,
  isMockSession,
} from '@/config/mock';
import { mockApi } from '@/services/mock/mockApi';
import { showError } from '@/utils/toast';

// ── Key-case converters ───────────────────────────────────────────────────────

function toCamel(key: string): string {
  return key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

function toSnake(key: string): string {
  return key.replace(/([A-Z])/g, (c) => `_${c.toLowerCase()}`);
}

function convertKeys(obj: unknown, fn: (k: string) => string): unknown {
  if (Array.isArray(obj)) return obj.map((v) => convertKeys(v, fn));
  if (obj !== null && typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj as Record<string, unknown>).map(([k, v]) => [fn(k), convertKeys(v, fn)]),
    );
  }
  return obj;
}

/** Backend snake_case → frontend camelCase */
export function camelizeKeys(obj: unknown): unknown {
  return convertKeys(obj, toCamel);
}

/** Frontend camelCase → backend snake_case */
export function decamelizeKeys(obj: unknown): unknown {
  return convertKeys(obj, toSnake);
}

// ── Axios instances ───────────────────────────────────────────────────────────

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000,
});

/** Bare client for token refresh — avoids interceptor recursion */
const refreshClient = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000,
});

type RetryConfig = InternalAxiosRequestConfig & { _retry?: boolean };

let isRefreshing = false;
let refreshQueue: Array<{
  resolve: (token: string) => void;
  reject: (err: unknown) => void;
}> = [];

function processRefreshQueue(error: unknown, token: string | null = null) {
  refreshQueue.forEach(({ resolve, reject }) => {
    if (error) reject(error);
    else if (token) resolve(token);
  });
  refreshQueue = [];
}

function isAuthUrl(url?: string): boolean {
  if (!url) return false;
  return url.includes('/auth/login') || url.includes('/auth/refresh') || url.includes('/auth/logout');
}

function shouldAttachAuthHeader(url?: string): boolean {
  if (!url) return true;
  return !url.includes('/auth/login') && !url.includes('/auth/refresh');
}

let sessionExpiredNotified = false;

function notifySessionExpired() {
  if (sessionExpiredNotified) return;
  sessionExpiredNotified = true;
  showError('Your session has expired. Please login again.', { dedupeKey: 'session-expired' });
  window.setTimeout(() => {
    sessionExpiredNotified = false;
  }, 5000);
}

async function refreshAccessToken(): Promise<string> {
  const refreshToken = useAuthStore.getState().refreshToken;
  if (!refreshToken) {
    throw new Error('No refresh token');
  }

  if (isMockEnabled()) {
    const result = await mockApi.refresh(refreshToken);
    useAuthStore.getState().setTokens(result.accessToken, result.refreshToken);
    return result.accessToken;
  }

  if (isMockRefreshToken(refreshToken)) {
    throw new Error('Stale mock session — please sign in again');
  }

  const { data } = await refreshClient.post('/auth/refresh', {
    refresh_token: refreshToken,
  });

  const normalized = camelizeKeys(data) as {
    accessToken: string;
    refreshToken: string;
    user?: unknown;
  };

  useAuthStore.getState().setTokens(normalized.accessToken, normalized.refreshToken);
  return normalized.accessToken;
}

// Request: attach JWT + convert outgoing camelCase → snake_case
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    useLoadingStore.getState().start();
    const token = useAuthStore.getState().accessToken;
    if (token && shouldAttachAuthHeader(config.url)) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    if (config.params) {
      config.params = decamelizeKeys(config.params);
    }
    if (config.data && typeof config.data === 'object') {
      config.data = decamelizeKeys(config.data);
    }
    return config;
  },
  (error) => {
    useLoadingStore.getState().stop();
    return Promise.reject(error);
  },
);

// Response: convert incoming snake_case → camelCase; refresh on 401
apiClient.interceptors.response.use(
  (response) => {
    useLoadingStore.getState().stop();
    response.data = camelizeKeys(response.data);
    return response;
  },
  async (error: AxiosError) => {
    useLoadingStore.getState().stop();

    const original = error.config as RetryConfig | undefined;
    const status = error.response?.status;

    if (status !== 401 || !original || original._retry || isAuthUrl(original.url)) {
      if (status === 401 && isAuthUrl(original?.url)) {
        useAuthStore.getState().logout();
      }
      return Promise.reject(error);
    }

    const { refreshToken } = useAuthStore.getState();
    if (!isMockEnabled() && isMockSession(useAuthStore.getState().accessToken, refreshToken)) {
      notifySessionExpired();
      useAuthStore.getState().logout();
      return Promise.reject(error);
    }

    if (isRefreshing) {
      return new Promise<string>((resolve, reject) => {
        refreshQueue.push({ resolve, reject });
      }).then((token) => {
        original.headers.Authorization = `Bearer ${token}`;
        return apiClient(original);
      });
    }

    original._retry = true;
    isRefreshing = true;

    try {
      const newToken = await refreshAccessToken();
      processRefreshQueue(null, newToken);
      original.headers.Authorization = `Bearer ${newToken}`;
      return apiClient(original);
    } catch (refreshError) {
      processRefreshQueue(refreshError, null);
      notifySessionExpired();
      useAuthStore.getState().logout();
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  },
);

// ── Error helper ──────────────────────────────────────────────────────────────

export function getErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    if (!error.response) {
      if (error.code === 'ECONNABORTED') return 'Request timed out. Please try again.';
      return 'Network error. Check your connection and try again.';
    }

    const data = error.response.data as {
      message?: string;
      detail?: string | Array<{ msg?: string; loc?: unknown[] }>;
    };

    if (typeof data?.detail === 'string') return data.detail;
    if (Array.isArray(data?.detail)) {
      return data.detail
        .map((e) => e.msg ?? JSON.stringify(e))
        .join('; ');
    }

    const status = error.response.status;
    if (status === 403) {
      return data?.message ?? 'Permission denied.';
    }
    if (status === 401) {
      return data?.message ?? 'Your session has expired. Please login again.';
    }
    if (status === 404) {
      return data?.message ?? 'Resource not found.';
    }
    if (status === 409) {
      return data?.message ?? 'This action conflicts with existing data.';
    }
    if (status === 422) {
      return data?.message ?? 'Invalid input. Please check your entries.';
    }
    if (status === 400) {
      return data?.message ?? 'Invalid request.';
    }
    if (status >= 500) {
      return 'Server unavailable. Please try again later.';
    }

    return data?.message ?? error.message;
  }
  if (error instanceof Error) return error.message;
  return 'An unexpected error occurred.';
}
