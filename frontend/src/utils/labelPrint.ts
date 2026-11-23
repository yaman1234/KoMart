/**
 * 80mm wide 2-column barcode label roll (two ~39-40mm × 20mm stickers per row).
 * Sets exact page dimensions and zero margins directly in print CSS (@page and @media print)
 * to match standard 80mm thermal receipt printers without needing custom printer settings.
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

export const LABEL_SHEET_WIDTH_MM = 80; // Standard 80mm thermal printer roll width
export const LABEL_HEIGHT_MM = 20; // 20mm height per row
export const LABEL_COLUMNS = 2;
export const LABEL_GAP_X_MM = 2; // Horizontal gap between the 2 stickers
export const LABEL_WIDTH_MM = (LABEL_SHEET_WIDTH_MM - LABEL_GAP_X_MM) / LABEL_COLUMNS; // 39mm per sticker
export const LABEL_COPIES_MIN = 1;
export const LABEL_COPIES_MAX = 500;

export interface LabelPrintResult extends PrintResult {
  printed: number;
  skipped: number;
}

const LABEL_FACE_CSS = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  .km-label-row {
    width: ${LABEL_SHEET_WIDTH_MM}mm;
    height: ${LABEL_HEIGHT_MM}mm;
    max-height: ${LABEL_HEIGHT_MM}mm;
    min-height: ${LABEL_HEIGHT_MM}mm;
    display: flex;
    justify-content: space-between;
    align-items: stretch;
    box-sizing: border-box;
    overflow: hidden;
  }
  .km-barcode-label {
    width: ${LABEL_WIDTH_MM}mm;
    height: ${LABEL_HEIGHT_MM}mm;
    max-height: ${LABEL_HEIGHT_MM}mm;
    min-height: ${LABEL_HEIGHT_MM}mm;
    overflow: hidden;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: space-between;
    padding: 0.8mm 1.5mm 0.6mm;
    background: #fff;
    color: #000;
    font-family: Arial, Helvetica, sans-serif;
  }
  .km-barcode-label.km-barcode-label-empty {
    visibility: hidden;
  }
  .km-barcode-label .name {
    width: 100%;
    font-size: 6.5pt;
    line-height: 1.1;
    font-weight: 600;
    text-align: center;
    max-height: 2.2em;
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
    height: 8mm;
    shape-rendering: crispEdges;
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
    svg = code128Svg(encodeCode128(code), { module: 1, height: 30 });
  } catch {
    return null;
  }
  const name = escapeHtml(truncateLabelName(product.name, 46));
  const price = escapeHtml(formatCurrency(productLabelPrice(product)));
  return `<div class="km-barcode-label">
    <div class="name">${name}</div>
    <div class="bars">${svg}</div>
    <div class="price">${price}</div>
  </div>`;
}

/** 2-column preview matching the physical roll layout (80mm × 20mm). */
export function buildLabelPreviewHtml(product: LabelProduct, copies: number = 2): string {
  const label = labelMarkup(product) ?? `<div class="km-barcode-label"><div class="name">No barcode or SKU</div></div>`;
  const leftFace = label;
  // In the preview, show both columns filled (or blank if copies is strictly 1 and specified)
  const rightFace = copies === 1
    ? `<div class="km-barcode-label km-barcode-label-empty" style="border:1px dashed #94a3b8;background:#f8fafc;"><div class="name" style="color:#64748b;font-weight:500;">(Column 2 · Empty)</div></div>`
    : label;

  return `<style>
    ${LABEL_FACE_CSS}
    .km-label-preview-row {
      width: ${LABEL_SHEET_WIDTH_MM}mm;
      height: ${LABEL_HEIGHT_MM}mm;
      display: flex;
      justify-content: space-between;
      align-items: stretch;
      background: #e2e8f0;
      padding: 0;
      box-sizing: border-box;
    }
    .km-label-preview-row .km-barcode-label {
      border: 1px solid #94a3b8;
      border-radius: 2px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.12);
      background: #fff;
    }
    .km-label-preview-row .km-barcode-label.km-barcode-label-empty {
      visibility: visible !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
    }
  </style>
  <div class="km-label-row km-label-preview-row">
    ${leftFace}
    ${rightFace}
  </div>`;
}

/** Full print document: 82mm × 20mm pages with 2 labels per row. */
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

  const rows: string[] = [];
  for (let i = 0; i < faces.length; i += LABEL_COLUMNS) {
    const left = faces[i];
    const right = faces[i + 1] ?? '<div class="km-barcode-label km-barcode-label-empty"></div>';
    rows.push(`<div class="km-label-row">\n  ${left}\n  ${right}\n</div>`);
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>Barcode labels</title>
  <style>
    ${LABEL_FACE_CSS}
    @page {
      size: ${LABEL_SHEET_WIDTH_MM}mm ${LABEL_HEIGHT_MM}mm;
      margin: 0;
    }
    html, body {
      margin: 0;
      padding: 0;
      background: #fff;
      width: ${LABEL_SHEET_WIDTH_MM}mm;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    @media print {
      html, body {
        width: ${LABEL_SHEET_WIDTH_MM}mm !important;
        height: auto !important;
        margin: 0 !important;
        padding: 0 !important;
        overflow: visible !important;
      }
      .km-label-row {
        width: ${LABEL_SHEET_WIDTH_MM}mm !important;
        height: ${LABEL_HEIGHT_MM}mm !important;
        max-height: ${LABEL_HEIGHT_MM}mm !important;
        min-height: ${LABEL_HEIGHT_MM}mm !important;
        box-sizing: border-box !important;
        page-break-after: always !important;
        break-after: page !important;
        page-break-inside: avoid !important;
        break-inside: avoid !important;
        overflow: hidden !important;
      }
      .km-label-row:last-child {
        page-break-after: auto !important;
        break-after: auto !important;
      }
      .km-barcode-label {
        width: ${LABEL_WIDTH_MM}mm !important;
        height: ${LABEL_HEIGHT_MM}mm !important;
        max-height: ${LABEL_HEIGHT_MM}mm !important;
        box-sizing: border-box !important;
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      }
    }
  </style>
</head>
<body>
${rows.join('\n')}
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
