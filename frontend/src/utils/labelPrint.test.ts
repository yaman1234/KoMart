import { describe, expect, it } from 'vitest';
import { formatCurrency } from '@/utils';
import { buildLabelDocument, buildLabelPreviewHtml, labelCopiesValid } from './labelPrint';
import type { LabelProduct } from './labelCode';

const skuOnly: LabelProduct = {
  name: 'Honey Butter Chips',
  sku: '040029',
  barcode: '',
  sellingPrice: 320,
  offeredPrice: 0,
};

const withOffer: LabelProduct = {
  name: 'Shin Ramyun Black',
  sku: '040030',
  barcode: '8901234567890',
  sellingPrice: 250,
  offeredPrice: 199,
};

describe('buildLabelDocument', () => {
  it('prints one 38mm × 25mm page per copy, using SKU when barcode is empty', () => {
    const { html, printed, skipped } = buildLabelDocument([skuOnly], 2);
    expect(printed).toBe(2);
    expect(skipped).toBe(0);
    expect(html).toContain('@page { size: 38mm 25mm; margin: 0; }');
    expect(html.match(/class="km-barcode-label"/g)).toHaveLength(2);
    expect(html).toContain('040029');
    expect(html).toContain('Honey Butter Chips');
    expect(html).toContain(formatCurrency(320));
    expect(html).toContain('shape-rendering="crispEdges"');
    expect(html).toContain('page-break-after: always');
  });

  it('prints the barcode and the offered price when the offer is lower', () => {
    const { html } = buildLabelDocument([withOffer], 1);
    expect(html).toContain('8901234567890');
    expect(html).not.toContain('>040030<');
    expect(html).toContain(formatCurrency(199));
    expect(html).not.toContain(formatCurrency(250));
  });

  it('skips a product with no code', () => {
    const { printed, skipped } = buildLabelDocument([{ ...skuOnly, sku: '  ', barcode: '' }], 3);
    expect(printed).toBe(0);
    expect(skipped).toBe(1);
  });

  it('escapes the product name', () => {
    const { html } = buildLabelDocument([{ ...skuOnly, name: 'A & B <special>' }], 1);
    expect(html).toContain('A &amp; B &lt;special&gt;');
  });
});

describe('buildLabelPreviewHtml', () => {
  it('includes the label face without a page rule', () => {
    const html = buildLabelPreviewHtml(skuOnly);
    expect(html).toContain('class="km-barcode-label"');
    expect(html).toContain('040029');
    expect(html).not.toContain('@page');
  });
});

describe('labelCopiesValid', () => {
  it('accepts 1 through 500', () => {
    expect(labelCopiesValid(1)).toBe(true);
    expect(labelCopiesValid(500)).toBe(true);
    expect(labelCopiesValid(0)).toBe(false);
    expect(labelCopiesValid(501)).toBe(false);
    expect(labelCopiesValid(1.5)).toBe(false);
  });
});
