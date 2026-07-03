/** Mock API is opt-in only — set VITE_USE_MOCK=true to enable. */
export function isMockEnabled(): boolean {
  return import.meta.env.VITE_USE_MOCK === 'true';
}

export const MOCK_ACCESS_TOKEN = 'mock-jwt-token';
export const MOCK_REFRESH_TOKEN = 'mock-refresh-token';

export function isMockAccessToken(token: string | null | undefined): boolean {
  return token === MOCK_ACCESS_TOKEN;
}

export function isMockRefreshToken(token: string | null | undefined): boolean {
  return token === MOCK_REFRESH_TOKEN;
}

/** True when persisted tokens came from the mock login flow. */
export function isMockSession(
  accessToken: string | null | undefined,
  refreshToken: string | null | undefined,
): boolean {
  return isMockAccessToken(accessToken) || isMockRefreshToken(refreshToken);
}
