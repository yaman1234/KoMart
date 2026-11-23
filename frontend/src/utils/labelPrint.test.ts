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
  it('prints 2-column rows on 80mm roll, with name, bars, and price directly defined in print CSS', () => {
    const { html, printed, skipped } = buildLabelDocument([skuOnly], 2);
    expect(printed).toBe(2);
    expect(skipped).toBe(0);
    expect(html).toContain('@page {');
    expect(html).toContain('size: 80mm 20mm;');
    expect(html).toContain('margin: 0;');
    expect(html.match(/class="km-label-row"/g)).toHaveLength(1);
    expect(html.match(/class="km-barcode-label"/g)).toHaveLength(2);
    expect(html).toContain('Honey Butter Chips');
    expect(html).toContain(formatCurrency(320));
    expect(html).toContain('shape-rendering="crispEdges"');
    expect(html).toContain('page-break-after: always !important');
    expect(html).not.toContain('class="code"');
    expect(html).not.toContain('040029');
  });

  it('prints odd copies by filling the remaining column slot with an empty label', () => {
    const { html, printed } = buildLabelDocument([skuOnly], 1);
    expect(printed).toBe(1);
    expect(html.match(/class="km-label-row"/g)).toHaveLength(1);
    expect(html).toContain('km-barcode-label-empty');
  });

  it('prints 3 copies across 2 rows', () => {
    const { html, printed } = buildLabelDocument([skuOnly], 3);
    expect(printed).toBe(3);
    expect(html.match(/class="km-label-row"/g)).toHaveLength(2);
  });

  it('prints the barcode and the offered price when the offer is lower, without code text', () => {
    const { html } = buildLabelDocument([withOffer], 1);
    expect(html).not.toContain('8901234567890');
    expect(html).not.toContain('040030');
    expect(html).toContain('Shin Ramyun Black');
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
  it('renders a 2-column preview matching the physical roll without @page', () => {
    const html = buildLabelPreviewHtml(skuOnly, 2);
    expect(html).toContain('class="km-label-row km-label-preview-row"');
    expect(html.match(/class="km-barcode-label"/g)?.length).toBe(2);
    expect(html).toContain('Honey Butter Chips');
    expect(html).not.toContain('040029');
    expect(html).not.toContain('@page');
  });

  it('renders an empty slot in the second column when copies is 1', () => {
    const html = buildLabelPreviewHtml(skuOnly, 1);
    expect(html).toContain('km-barcode-label-empty');
    expect(html).toContain('Column 2 · Empty');
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
