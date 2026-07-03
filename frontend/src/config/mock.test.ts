import { describe, expect, it } from 'vitest';
import {
  isMockAccessToken,
  isMockRefreshToken,
  isMockSession,
  MOCK_ACCESS_TOKEN,
  MOCK_REFRESH_TOKEN,
} from './mock';

describe('mock session helpers', () => {
  it('detects mock tokens', () => {
    expect(isMockAccessToken(MOCK_ACCESS_TOKEN)).toBe(true);
    expect(isMockRefreshToken(MOCK_REFRESH_TOKEN)).toBe(true);
    expect(isMockSession(MOCK_ACCESS_TOKEN, MOCK_REFRESH_TOKEN)).toBe(true);
    expect(isMockSession('real-jwt', MOCK_REFRESH_TOKEN)).toBe(true);
    expect(isMockSession('real-jwt', 'real-refresh')).toBe(false);
  });
});
