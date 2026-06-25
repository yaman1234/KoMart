import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { API_BASE_URL } from '@/constants';
import { useAuthStore } from '@/store';

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

// ── Axios instance ────────────────────────────────────────────────────────────

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000,
});

// Request: attach JWT + convert outgoing camelCase → snake_case
apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = useAuthStore.getState().accessToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  if (config.params) {
    config.params = decamelizeKeys(config.params);
  }
  if (config.data && typeof config.data === 'object') {
    config.data = decamelizeKeys(config.data);
  }
  return config;
});

// Response: convert incoming snake_case → camelCase; handle 401
apiClient.interceptors.response.use(
  (response) => {
    response.data = camelizeKeys(response.data);
    return response;
  },
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      useAuthStore.getState().logout();
    }
    return Promise.reject(error);
  },
);

// ── Error helper ──────────────────────────────────────────────────────────────

export function getErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as {
      message?: string;
      detail?: string | Array<{ msg?: string; loc?: unknown[] }>;
    };
    if (typeof data?.detail === 'string') return data.detail;
    if (Array.isArray(data?.detail)) {
      return data.detail
        .map((e) => e.msg ?? JSON.stringify(e))
        .join('; ');
    }
    if (error.response?.status === 403) {
      return data?.message ?? 'You do not have permission to perform this action';
    }
    return data?.message ?? error.message;
  }
  if (error instanceof Error) return error.message;
  return 'An unexpected error occurred';
}
