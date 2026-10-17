import { describe, it, expect } from 'vitest';
import { UOM_OPTIONS } from '@/constants';
import {
  formatConversion,
  formatSellLineSubtitle,
  formatReceiptConversionSubtitle,
  formatStockQty,
  formatApproxPackQty,
  getProductApproxPackStock,
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

  it('formatReceiptConversionSubtitle returns empty when no conversion', () => {
    expect(formatReceiptConversionSubtitle('pcs', 1, 'pcs', UOM_OPTIONS)).toBe('');
    expect(formatReceiptConversionSubtitle('pcs', 1, 'pcs')).toBe('');
  });

  it('formatReceiptConversionSubtitle shows conversion note when factor > 1', () => {
    expect(formatReceiptConversionSubtitle('pack', 12, 'pcs', UOM_OPTIONS)).toBe('12 Pieces (pcs) each');
    expect(formatReceiptConversionSubtitle('pack', 12, 'pcs')).toBe('12 Pieces (pcs) each');
  });

  it('formatApproxPackQty calculates exact pack quantity', () => {
    const result = formatApproxPackQty(120, 24, 'box', 'pcs', UOM_OPTIONS);
    expect(result).not.toBeNull();
    expect(result?.label).toBe('≈ 5 Box');
    expect(result?.packs).toBe(5);
    expect(result?.tooltip).toBe('5 Box (120 Pieces (pcs) total)');
  });

  it('formatApproxPackQty calculates approximate decimal pack quantity and remainder breakdown', () => {
    const result = formatApproxPackQty(125, 24, 'box', 'pcs', UOM_OPTIONS);
    expect(result).not.toBeNull();
    expect(result?.label).toBe('≈ 5.2 Box');
    expect(result?.tooltip).toBe('5 Box + 5 Pieces (pcs) (125 Pieces (pcs) total)');
  });

  it('formatApproxPackQty returns 0 when stock is 0', () => {
    const result = formatApproxPackQty(0, 24, 'box', 'pcs', UOM_OPTIONS);
    expect(result?.label).toBe('0 Box');
  });

  it('formatApproxPackQty returns null when factor is <= 1', () => {
    expect(formatApproxPackQty(100, 1, 'box', 'pcs', UOM_OPTIONS)).toBeNull();
  });

  it('getProductApproxPackStock only returns stock for pack and piece products', () => {
    // sellMode both -> returns approx pack stock
    const bothProd = {
      stock: 120,
      unitsPerBuyUom: 24,
      buyUom: 'box',
      uom: 'pcs',
      sellMode: 'both',
    };
    expect(getProductApproxPackStock(bothProd, UOM_OPTIONS)?.label).toBe('≈ 5 Box');

    // sellMode piece -> returns null
    const pieceProd = {
      stock: 120,
      unitsPerBuyUom: 24,
      buyUom: 'box',
      uom: 'pcs',
      sellMode: 'piece',
    };
    expect(getProductApproxPackStock(pieceProd, UOM_OPTIONS)).toBeNull();

    // sellMode unit -> returns null
    const unitProd = {
      stock: 120,
      unitsPerBuyUom: 24,
      buyUom: 'box',
      uom: 'pcs',
      sellMode: 'unit',
    };
    expect(getProductApproxPackStock(unitProd, UOM_OPTIONS)).toBeNull();
  });
});
