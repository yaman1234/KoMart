import { describe, expect, it } from 'vitest';
import { addCalendarDays, storeMonthStartIso, storeTodayIso } from './storeDate';

describe('store date helpers', () => {
  it('uses the Asia/Kathmandu calendar date rather than UTC', () => {
    // 18:00 UTC is still the 16th in Kathmandu (23:45). 19:00 UTC is the 17th (00:45).
    expect(storeTodayIso(new Date('2026-11-16T18:00:00Z'))).toBe('2026-11-16');
    expect(storeTodayIso(new Date('2026-11-16T19:00:00Z'))).toBe('2026-11-17');
  });

  it('adds calendar days across month and year boundaries', () => {
    expect(addCalendarDays('2026-11-16', -1)).toBe('2026-11-15');
    expect(addCalendarDays('2026-11-16', -6)).toBe('2026-11-10');
    expect(addCalendarDays('2026-11-16', -29)).toBe('2026-10-18');
    expect(addCalendarDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(addCalendarDays('2024-02-28', 1)).toBe('2024-02-29');
  });

  it('starts the store month on the Kathmandu calendar', () => {
    expect(storeMonthStartIso(new Date('2026-11-16T19:00:00Z'))).toBe('2026-11-01');
    // 18:00 UTC is 23:45 the same calendar day in Kathmandu (UTC+5:45).
    expect(storeMonthStartIso(new Date('2026-03-31T18:00:00Z'))).toBe('2026-03-01');
  });
});
