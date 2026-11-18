/**
 * 38mm × 25mm barcode label sheet. One label per printed page.
 * Printing uses the same blob-URL / window.print / iframe path as receipts.
 */

import { escapeHtml, printHtmlDocument, type PrintResult } from '@/utils/receiptPrint';
import { formatCurrency } from '@/utils';
import { code128Svg, encodeCode128 } from '@/utils/barcode128';
import {
  productLabelCode,
  productLabelPrice,
  truncateLabelName,
  type LabelProduct,
} from '@/utils/labelCode';

export const LABEL_WIDTH_MM = 38;
export const LABEL_HEIGHT_MM = 25;
export const LABEL_COPIES_MIN = 1;
export const LABEL_COPIES_MAX = 500;

export interface LabelPrintResult extends PrintResult {
  printed: number;
  skipped: number;
}

const LABEL_FACE_CSS = `
  .km-barcode-label {
    width: ${LABEL_WIDTH_MM}mm;
    height: ${LABEL_HEIGHT_MM}mm;
    overflow: hidden;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: space-between;
    padding: 1mm 1.5mm 0.8mm;
    background: #fff;
    color: #000;
    font-family: Arial, Helvetica, sans-serif;
  }
  .km-barcode-label .name {
    width: 100%;
    font-size: 7pt;
    line-height: 1.15;
    font-weight: 600;
    text-align: center;
    max-height: 2.3em;
    overflow: hidden;
    word-break: break-word;
  }
  .km-barcode-label .bars {
    width: 100%;
    flex: 1;
    min-height: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .km-barcode-label .bars svg {
    max-width: 100%;
    width: auto;
    height: 11mm;
    shape-rendering: crispEdges;
  }
  .km-barcode-label .code {
    font-family: 'Courier New', Courier, monospace;
    font-size: 7pt;
    letter-spacing: 0.03em;
    line-height: 1.1;
    text-align: center;
  }
  .km-barcode-label .price {
    font-size: 8pt;
    font-weight: 700;
    line-height: 1.1;
    text-align: center;
  }
`;

export function clampLabelCopies(copies: number): number {
  if (!Number.isFinite(copies)) return LABEL_COPIES_MIN;
  return Math.min(LABEL_COPIES_MAX, Math.max(LABEL_COPIES_MIN, Math.floor(copies)));
}

export function labelCopiesValid(copies: number): boolean {
  return Number.isInteger(copies) && copies >= LABEL_COPIES_MIN && copies <= LABEL_COPIES_MAX;
}

function labelMarkup(product: LabelProduct): string | null {
  const code = productLabelCode(product);
  if (!code) return null;
  let svg: string;
  try {
    svg = code128Svg(encodeCode128(code), { module: 1, height: 40 });
  } catch {
    return null;
  }
  const name = escapeHtml(truncateLabelName(product.name));
  const price = escapeHtml(formatCurrency(productLabelPrice(product)));
  return `<div class="km-barcode-label">
    <div class="name">${name}</div>
    <div class="bars">${svg}</div>
    <div class="code">${escapeHtml(code)}</div>
    <div class="price">${price}</div>
  </div>`;
}

/** One label, for the on-screen preview. Does not set @page. */
export function buildLabelPreviewHtml(product: LabelProduct): string {
  const face = labelMarkup(product) ?? `<div class="km-barcode-label"><div class="name">No barcode or SKU</div></div>`;
  return `<style>${LABEL_FACE_CSS}</style>${face}`;
}

/** Full print document: one 38mm × 25mm page per label copy. */
export function buildLabelDocument(products: LabelProduct[], copies: number): { html: string; printed: number; skipped: number } {
  const count = clampLabelCopies(copies);
  const faces: string[] = [];
  let skipped = 0;
  for (const product of products) {
    const face = labelMarkup(product);
    if (!face) {
      skipped += 1;
      continue;
    }
    for (let copy = 0; copy < count; copy += 1) faces.push(face);
  }
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>Barcode labels</title>
  <style>
    ${LABEL_FACE_CSS}
    @page { size: ${LABEL_WIDTH_MM}mm ${LABEL_HEIGHT_MM}mm; margin: 0; }
    html, body { margin: 0; padding: 0; background: #fff; }
    @media print {
      .km-barcode-label { page-break-after: always; break-after: page; }
      .km-barcode-label:last-child { page-break-after: auto; break-after: auto; }
    }
  </style>
</head>
<body>
${faces.join('\n')}
</body>
</html>`;
  return { html, printed: faces.length, skipped };
}

export function printProductLabels(products: LabelProduct[], copies: number): LabelPrintResult {
  const { html, printed, skipped } = buildLabelDocument(products, copies);
  if (printed === 0) {
    return {
      ok: false,
      printed: 0,
      skipped,
      message: 'Nothing to print. Each product needs a barcode or SKU.',
    };
  }
  const result = printHtmlDocument(html, {
    width: 420,
    height: 320,
    iframeTitle: 'Barcode label print',
  });
  return { ...result, printed, skipped };
}
