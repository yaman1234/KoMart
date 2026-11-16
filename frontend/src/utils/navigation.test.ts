import { beforeEach, describe, expect, it } from 'vitest';
import {
  isFromPosSearch,
  posReturnPath,
  saveLastListUrl,
  withFromPos,
} from '@/utils/navigation';

describe('POS return navigation', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('reads and appends the came-from-POS marker', () => {
    expect(isFromPosSearch('')).toBe(false);
    expect(isFromPosSearch('category=Snacks')).toBe(false);
    expect(isFromPosSearch('from=pos')).toBe(true);
    expect(isFromPosSearch('?tab=ledger&from=pos')).toBe(true);

    expect(withFromPos('/products/prod-1', false)).toBe('/products/prod-1');
    expect(withFromPos('/products/prod-1/edit', true)).toBe('/products/prod-1/edit?from=pos');
    expect(withFromPos('/inventory/prod-1?tab=ledger', true)).toBe('/inventory/prod-1?tab=ledger&from=pos');
  });

  it('returns the saved POS list URL, including filters', () => {
    expect(posReturnPath()).toBe('/pos');

    saveLastListUrl('/pos', '/pos?search=ramen&category=Snacks');
    expect(posReturnPath()).toBe('/pos?search=ramen&category=Snacks');

    saveLastListUrl('/pos', 'https://example.test/pos?search=ramen');
    expect(posReturnPath()).toBe('/pos');
  });
});
