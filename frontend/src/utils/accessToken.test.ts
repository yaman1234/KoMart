import { describe, expect, it } from 'vitest';
import { MOCK_ACCESS_TOKEN } from '@/config/mock';
import { accessTokenNeedsRefresh, readAccessTokenExpiryMs } from '@/utils/accessToken';

function jwt(expSeconds: number): string {
  const payload = btoa(JSON.stringify({ exp: expSeconds }))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
  return `header.${payload}.sig`;
}

describe('accessTokenNeedsRefresh', () => {
  const now = Date.parse('2026-11-17T00:00:00Z');

  it('reads the JWT expiry', () => {
    expect(readAccessTokenExpiryMs(jwt(1_700_000_000))).toBe(1_700_000_000_000);
    expect(readAccessTokenExpiryMs('not-a-jwt')).toBeNull();
  });

  it('asks for a refresh when the token is missing or near expiry', () => {
    expect(accessTokenNeedsRefresh(null, now)).toBe(true);
    expect(accessTokenNeedsRefresh(undefined, now)).toBe(true);
    expect(accessTokenNeedsRefresh(jwt(Math.floor(now / 1000) - 60), now)).toBe(true);
    expect(accessTokenNeedsRefresh(jwt(Math.floor(now / 1000) + 10), now)).toBe(true);
  });

  it('leaves a fresh token, a mock token, and a non-JWT alone', () => {
    expect(accessTokenNeedsRefresh(jwt(Math.floor(now / 1000) + 15 * 60), now)).toBe(false);
    expect(accessTokenNeedsRefresh(MOCK_ACCESS_TOKEN, now)).toBe(false);
    expect(accessTokenNeedsRefresh('opaque-session', now)).toBe(false);
  });
});
