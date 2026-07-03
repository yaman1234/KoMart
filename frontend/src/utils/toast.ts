import { shouldDedupeToast, useToastStore, type ToastSeverity } from '@/store/toast';
import { getErrorMessage } from '@/services/apiClient';

const DURATION: Record<ToastSeverity, number> = {
  success: 4000,
  error: 7000,
  warning: 6000,
  info: 4000,
};

export interface ToastOptions {
  duration?: number;
  /** Prevents duplicate toasts for the same action within a short window */
  dedupeKey?: string;
}

function pushToast(severity: ToastSeverity, message: string, options?: ToastOptions) {
  const trimmed = message.trim();
  if (!trimmed) return;

  const dedupeKey = options?.dedupeKey ?? `${severity}:${trimmed}`;
  if (shouldDedupeToast(dedupeKey)) return;

  useToastStore.getState().enqueue({
    message: trimmed,
    severity,
    duration: options?.duration ?? DURATION[severity],
  });
}

export function showSuccess(message: string, options?: ToastOptions) {
  pushToast('success', message, options);
}

export function showError(message: string, options?: ToastOptions) {
  pushToast('error', message, options);
}

export function showWarning(message: string, options?: ToastOptions) {
  pushToast('warning', message, options);
}

export function showInfo(message: string, options?: ToastOptions) {
  pushToast('info', message, options);
}

/** Show a toast from an API error with a friendly fallback message. */
export function showApiError(error: unknown, fallback: string, options?: ToastOptions) {
  showError(getErrorMessage(error) || fallback, {
    dedupeKey: options?.dedupeKey ?? fallback,
    ...options,
  });
}
