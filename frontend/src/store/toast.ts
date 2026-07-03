import { create } from 'zustand';

export type ToastSeverity = 'success' | 'error' | 'warning' | 'info';

export interface ToastItem {
  id: string;
  message: string;
  severity: ToastSeverity;
  duration: number;
}

interface ToastState {
  toasts: ToastItem[];
  enqueue: (item: Omit<ToastItem, 'id'>) => void;
  dismiss: (id: string) => void;
}

const DEDUPE_MS = 2500;
const recentKeys = new Map<string, number>();

export function shouldDedupeToast(key: string): boolean {
  const now = Date.now();
  const last = recentKeys.get(key);
  if (last != null && now - last < DEDUPE_MS) return true;
  recentKeys.set(key, now);
  return false;
}

let toastCounter = 0;

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  enqueue: (item) =>
    set((state) => ({
      toasts: [...state.toasts, { ...item, id: `toast-${++toastCounter}` }].slice(-4),
    })),
  dismiss: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    })),
}));
