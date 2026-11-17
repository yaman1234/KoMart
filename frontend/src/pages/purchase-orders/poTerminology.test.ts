import { describe, expect, it } from 'vitest';
import { sellAsLabel } from '@/pages/purchase-orders/poTerminology';

describe('sellAsLabel', () => {
  it('shows Piece only when there is no pack conversion', () => {
    expect(sellAsLabel('unit', 1)).toBe('Piece only');
    expect(sellAsLabel('piece', 1)).toBe('Piece only');
    expect(sellAsLabel('both', 1)).toBe('Piece only');
    expect(sellAsLabel(undefined, 1)).toBe('Piece only');
  });

  it('keeps the existing labels when a pack contains more than one piece', () => {
    expect(sellAsLabel('unit', 12)).toBe('Pack only');
    expect(sellAsLabel('piece', 6)).toBe('Piece only');
    expect(sellAsLabel('both', 24)).toBe('Pack & piece');
    expect(sellAsLabel(undefined, 4)).toBe('Pack only');
  });
});
