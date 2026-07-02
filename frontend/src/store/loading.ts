import { create } from 'zustand';

interface LoadingState {
  pendingRequests: number;
  start: () => void;
  stop: () => void;
}

export const useLoadingStore = create<LoadingState>((set) => ({
  pendingRequests: 0,
  start: () => set((s) => ({ pendingRequests: s.pendingRequests + 1 })),
  stop: () => set((s) => ({ pendingRequests: Math.max(0, s.pendingRequests - 1) })),
}));

export function useApiBusy(): boolean {
  return useLoadingStore((s) => s.pendingRequests > 0);
}
