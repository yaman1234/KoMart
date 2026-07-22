import { describe, it, expect } from 'vitest';
import {
  defaultPrimaryUom,
  hasUomConversion,
  normalizeProductUoms,
} from './uomNormalize';

describe('uomNormalize', () => {
  it('hasUomConversion is true only when factor > 1', () => {
    expect(hasUomConversion(1)).toBe(false);
    expect(hasUomConversion(12)).toBe(true);
    expect(hasUomConversion(undefined)).toBe(false);
  });

  it('normalizeProductUoms mirrors Secondary to Primary when no conversion', () => {
    expect(normalizeProductUoms({ buyUom: 'box', uom: 'pcs', unitsPerBuyUom: 1 })).toEqual({
      buyUom: 'box',
      uom: 'box',
      unitsPerBuyUom: 1,
    });
  });

  it('normalizeProductUoms keeps Secondary when converting', () => {
    expect(normalizeProductUoms({ buyUom: 'pack', uom: 'pcs', unitsPerBuyUom: 12 })).toEqual({
      buyUom: 'pack',
      uom: 'pcs',
      unitsPerBuyUom: 12,
    });
  });

  it('defaultPrimaryUom prefers pcs when present', () => {
    expect(defaultPrimaryUom([{ value: 'box' }, { value: 'pcs' }])).toBe('pcs');
    expect(defaultPrimaryUom([{ value: 'box' }, { value: 'kg' }])).toBe('');
  });
});
