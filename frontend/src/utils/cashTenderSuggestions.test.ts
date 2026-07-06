import { describe, expect, it } from 'vitest';
import { cashTenderSuggestions } from './cashTenderSuggestions';

describe('cashTenderSuggestions', () => {
  it('returns exact total and bill denominations', () => {
    expect(cashTenderSuggestions(100)).toEqual([100, 500, 1000, 2000, 5000]);
  });

  it('rounds up to next 50 and 100', () => {
    const suggestions = cashTenderSuggestions(127);
    expect(suggestions[0]).toBe(127);
    expect(suggestions).toContain(150);
    expect(suggestions).toContain(200);
    expect(suggestions.every((v, i, arr) => i === 0 || v >= arr[i - 1])).toBe(true);
  });

  it('includes standard bill denominations when needed', () => {
    const suggestions = cashTenderSuggestions(450);
    expect(suggestions).toContain(450);
    expect(suggestions).toContain(500);
  });

  it('handles zero total', () => {
    expect(cashTenderSuggestions(0)).toEqual([0]);
  });

  it('returns at most six suggestions', () => {
    expect(cashTenderSuggestions(37).length).toBeLessThanOrEqual(6);
  });
});
