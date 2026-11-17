import { isMockAccessToken } from '@/config/mock';

/** Refresh a little early so a burst of queries does not all leave with a token that expires mid-flight. */
const REFRESH_SKEW_MS = 30_000;

export function readAccessTokenExpiryMs(token: string): number | null {
  const payload = token.split('.')[1];
  if (!payload) return null;
  try {
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    const json = JSON.parse(atob(padded)) as { exp?: unknown };
    return typeof json.exp === 'number' ? json.exp * 1000 : null;
  } catch {
    return null;
  }
}

/**
 * True when an authenticated request should wait for a refresh.
 * A missing token needs a refresh. Mock tokens and non-JWT values do not.
 */
export function accessTokenNeedsRefresh(
  token: string | null | undefined,
  now = Date.now(),
): boolean {
  if (!token) return true;
  if (isMockAccessToken(token)) return false;
  const expiresAt = readAccessTokenExpiryMs(token);
  if (expiresAt == null) return false;
  return expiresAt <= now + REFRESH_SKEW_MS;
}
