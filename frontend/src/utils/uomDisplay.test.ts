import { describe, it, expect } from 'vitest';
import { UOM_OPTIONS } from '@/constants';
import {
  formatConversion,
  formatSellLineSubtitle,
  formatStockQty,
} from './uomDisplay';

describe('uomDisplay', () => {
  it('formatConversion returns empty when factor is 1 and UOMs match', () => {
    expect(formatConversion('pcs', 'pcs', 1, UOM_OPTIONS)).toBe('');
  });

  it('formatConversion returns empty when no conversion even if codes differ', () => {
    expect(formatConversion('pack', 'pcs', 1, UOM_OPTIONS)).toBe('');
  });

  it('formatConversion shows pack to pcs', () => {
    expect(formatConversion('pack', 'pcs', 12, UOM_OPTIONS)).toBe('1 Pack = 12 Pieces (pcs)');
  });

  it('formatStockQty appends base unit', () => {
    expect(formatStockQty(60, 'pcs', UOM_OPTIONS)).toBe('60 Pieces (pcs)');
  });

  it('formatStockQty without uom returns qty only', () => {
    expect(formatStockQty(60, '', UOM_OPTIONS)).toBe('60');
  });

  it('formatSellLineSubtitle for piece sell', () => {
    expect(formatSellLineSubtitle('pcs', 1, 'pcs', UOM_OPTIONS)).toBe('Sell: Pieces (pcs)');
  });

  it('formatSellLineSubtitle for pack sell', () => {
    expect(formatSellLineSubtitle('pack', 12, 'pcs', UOM_OPTIONS)).toBe('Sell: Pack · 12 Pieces (pcs) each');
  });
});
