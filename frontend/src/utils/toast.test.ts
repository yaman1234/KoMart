import { describe, expect, it, beforeEach } from 'vitest';
import { shouldDedupeToast, useToastStore } from '@/store/toast';
import { showSuccess } from '@/utils/toast';

describe('toast notifications', () => {
  beforeEach(() => {
    useToastStore.setState({ toasts: [] });
  });

  it('dedupes identical messages within the window', () => {
    expect(shouldDedupeToast('success:Saved')).toBe(false);
    expect(shouldDedupeToast('success:Saved')).toBe(true);
  });

  it('enqueues a toast message', () => {
    showSuccess('Product created.');
    expect(useToastStore.getState().toasts).toHaveLength(1);
    expect(useToastStore.getState().toasts[0]?.message).toBe('Product created.');
  });
});
