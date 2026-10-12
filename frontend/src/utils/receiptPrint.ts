/**
 * Receipt printing utilities — thermal 80mm layout, blob-URL print, PDF download.
 */

import { jsPDF } from 'jspdf';
import { formatAmount, formatCurrency, formatDateTime } from '@/utils';
import { formatSellLineSubtitle } from '@/utils/uomDisplay';
import { getTransactionDiscountBreakdown, getTransactionDiscountLines } from '@/utils/transactionDiscounts';
import { APP_NAME } from '@/constants';
import type { ReceiptBranding, StoreSettings, Transaction } from '@/types';

export type { ReceiptBranding };

export function receiptBrandingFromSettings(
  settings: Pick<StoreSettings, 'storeName' | 'address' | 'phone' | 'receiptHeader' | 'receiptFooter'>,
): ReceiptBranding {
  return {
    storeName: settings.storeName,
    address: settings.address || undefined,
    phone: settings.phone || undefined,
    receiptHeader: settings.receiptHeader || undefined,
    receiptFooter: settings.receiptFooter || undefined,
  };
}

function brandingHeaderHtml(branding?: ReceiptBranding): string {
  const name = escapeHtml(branding?.storeName || APP_NAME);
  const headerLines = branding?.receiptHeader
    ? branding.receiptHeader.split('\n').filter(Boolean)
        .map((line) => `<div class="center">${escapeHtml(line)}</div>`).join('')
    : '';
  const address = branding?.address
    ? `<div class="center">${escapeHtml(branding.address)}</div>`
    : '';
  const phone = branding?.phone
    ? `<div class="center">${escapeHtml(branding.phone)}</div>`
    : '';
  return `
    <div class="center xl bold">${name}</div>
    ${headerLines}
    ${address}
    ${phone}`;
}

function brandingFooterHtml(branding?: ReceiptBranding): string {
  if (branding?.receiptFooter) {
    return branding.receiptFooter.split('\n').filter(Boolean)
      .map((line) => `<div class="center">${escapeHtml(line)}</div>`).join('');
  }
  const name = escapeHtml(branding?.storeName || APP_NAME);
  return `
    <div class="center" style="margin-top:8px">Thank you for shopping at ${name}!</div>
    <div class="center">Please come again</div>`;
}

const RECEIPT_WIDTH_MM = 80;
const THERMAL_FONT = 'courier';

/** Escape text for safe HTML insertion */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const RECEIPT_PRINT_STYLES = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body {
    width: ${RECEIPT_WIDTH_MM}mm;
    min-height: 100%;
    font-family: 'Courier New', Courier, monospace;
    font-size: 12px;
    line-height: 1.35;
    color: #000 !important;
    background: #fff !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .center { text-align: center; }
  .right  { text-align: right; }
  .bold   { font-weight: bold; }
  .lg     { font-size: 14px; }
  .xl     { font-size: 18px; }
  .sep    { border-top: 1px dashed #000; margin: 6px 0; }
  .row    { display: flex; justify-content: space-between; gap: 4px; margin: 2px 0; }
  .row span:last-child { text-align: right; flex-shrink: 0; }
  table   { width: 100%; border-collapse: collapse; margin: 4px 0; table-layout: fixed; }
  th, td  { padding: 2px 1px; vertical-align: top; font-size: 11px; word-wrap: break-word; }
  th      { font-weight: bold; border-bottom: 1px solid #000; }
  .name   { width: 42%; text-align: left; }
  .qty    { width: 12%; text-align: center; }
  .rate   { width: 22%; text-align: right; }
  .amt    { width: 24%; text-align: right; }
  @media print {
    html, body { width: ${RECEIPT_WIDTH_MM}mm; margin: 0; padding: 2mm; }
    @page { size: ${RECEIPT_WIDTH_MM}mm auto; margin: 2mm; }
  }
`;

export function buildPrintDocument(bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=${RECEIPT_WIDTH_MM}mm"/>
  <title>Receipt</title>
  <style>${RECEIPT_PRINT_STYLES}</style>
</head>
<body>${bodyHtml}</body>
</html>`;
}

function receiptCustomerLabel(txn: Transaction): string {
  return txn.customerName && txn.customerName !== 'Walk-In'
    ? txn.customerName
    : 'Walk-In Customer';
}

export function buildReceiptHtml(txn: Transaction, tendered?: number, branding?: ReceiptBranding): string {
  const change = tendered !== undefined ? tendered - txn.total : undefined;
  const discountBreakdown = getTransactionDiscountBreakdown(txn);
  const discountLines = getTransactionDiscountLines(txn);

  const itemRows = (txn.items ?? []).map((item) => {
    const price = Number(item.price) || 0;
    const qty = Number(item.quantity) || 0;
    const name = escapeHtml(item.name || 'Item');
    const subtitle = formatSellLineSubtitle(item.sellUom, item.unitFactor, item.uom ?? '');
    const subtitleHtml = subtitle
      ? `<div style="font-size:10px;color:#555">${escapeHtml(subtitle)}</div>`
      : '';
    return `
    <tr>
      <td class="name">${name}${subtitleHtml}</td>
      <td class="qty">${qty}</td>
      <td class="rate">${price.toFixed(2)}</td>
      <td class="amt">${(price * qty).toFixed(2)}</td>
    </tr>`;
  }).join('');

  const tableHead = `<th class="name">Item</th><th class="qty">Qty</th><th class="rate">Rate</th><th class="amt">Amount</th>`;

  const customerLabel = escapeHtml(receiptCustomerLabel(txn));

  const subtotal = Number(txn.subtotal) || 0;
  const total = Number(txn.total) || 0;

  const discountRowsHtml = discountLines.map(
    (line) => `<div class="row"><span>${escapeHtml(line.label)}</span><span>- ${line.amount.toFixed(2)}</span></div>`,
  ).join('');
  const totalSavingsRow = discountBreakdown.hasDiscounts
    ? `<div class="row bold"><span>Total savings</span><span>- ${discountBreakdown.totalDiscount.toFixed(2)}</span></div>`
    : '';

  return `
    ${brandingHeaderHtml(branding)}
    <div class="sep"></div>
    <div class="row"><span>Date:</span><span>${escapeHtml(formatDateTime(txn.createdAt))}</span></div>
    <div class="row"><span>Bill No:</span><span class="bold">${escapeHtml(txn.transactionNumber)}</span></div>
    <div class="row"><span>Customer:</span><span>${customerLabel}</span></div>
    <div class="row"><span>Cashier:</span><span>${escapeHtml(txn.createdBy)}</span></div>
    <div class="sep"></div>
    <table>
      <thead><tr>${tableHead}</tr></thead>
      <tbody>${itemRows}</tbody>
    </table>
    <div class="sep"></div>
    <div class="row"><span>Subtotal</span><span>${subtotal.toFixed(2)}</span></div>
    ${discountRowsHtml}
    ${totalSavingsRow}
    <div class="sep"></div>
    <div class="row bold lg"><span>TOTAL</span><span>Rs. ${total.toFixed(2)}</span></div>
    <div class="sep"></div>
    <div class="row"><span>Payment</span><span class="bold">${escapeHtml(txn.paymentMethod.toUpperCase())}</span></div>
    ${tendered !== undefined ? `<div class="row"><span>Tendered</span><span>${tendered.toFixed(2)}</span></div>` : ''}
    ${change !== undefined && change >= 0 ? `<div class="row bold"><span>Change</span><span>${change.toFixed(2)}</span></div>` : ''}
    ${txn.notes?.trim() ? `<div class="sep"></div><div><span class="bold">Remarks</span><br/>${escapeHtml(txn.notes.trim())}</div>` : ''}
    <div class="sep"></div>
    ${brandingFooterHtml(branding)}
    <div style="margin-top:16px"></div>`;
}

export type PrintMethod = 'popup' | 'iframe';

export interface PrintResult {
  ok: boolean;
  method?: PrintMethod;
  message?: string;
}

function schedulePrint(targetWindow: Window, onDone?: () => void): void {
  const runPrint = () => {
    try {
      targetWindow.focus();
      targetWindow.print();
    } catch {
      /* browser may block */
    }
    if (onDone) {
      if ('onafterprint' in targetWindow) {
        targetWindow.onafterprint = onDone;
      } else {
        setTimeout(onDone, 2500);
      }
    }
  };

  if (targetWindow.document.readyState === 'complete') {
    requestAnimationFrame(() => setTimeout(runPrint, 200));
  } else {
    targetWindow.addEventListener('load', () => {
      requestAnimationFrame(() => setTimeout(runPrint, 200));
    }, { once: true });
    setTimeout(runPrint, 1000);
  }
}

function printViaIframe(docHtml: string): PrintResult {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('title', 'Receipt print');
  iframe.style.cssText =
    'position:fixed;top:0;left:0;width:0;height:0;border:0;opacity:0;pointer-events:none;';
  document.body.appendChild(iframe);

  const blob = new Blob([docHtml], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const cleanup = () => {
    URL.revokeObjectURL(url);
    if (iframe.parentNode) {
      document.body.removeChild(iframe);
    }
  };

  iframe.onload = () => {
    const frameWin = iframe.contentWindow;
    if (!frameWin) {
      cleanup();
      return;
    }
    schedulePrint(frameWin, cleanup);
  };

  iframe.src = url;
  return { ok: true, method: 'iframe' };
}

/**
 * Open browser print dialog for a thermal receipt.
 * Uses blob URL (fixes blank/white print window) with iframe fallback.
 */
export function printReceipt(htmlBody: string): PrintResult {
  const docHtml = buildPrintDocument(htmlBody);
  const blob = new Blob([docHtml], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const popup = window.open(url, '_blank', 'width=420,height=720,scrollbars=yes');

  if (popup) {
    const cleanup = () => {
      URL.revokeObjectURL(url);
      try {
        if (!popup.closed) popup.close();
      } catch {
        /* ignore */
      }
    };

    schedulePrint(popup, cleanup);
    return { ok: true, method: 'popup' };
  }

  URL.revokeObjectURL(url);
  return printViaIframe(docHtml);
}

type PdfLine =
  | { kind: 'center'; text: string; bold?: boolean; size?: number }
  | { kind: 'row'; left: string; right?: string; bold?: boolean; size?: number }
  | { kind: 'sep' }
  | { kind: 'itemHeader' }
  | {
      kind: 'item';
      name: string;
      qty: string;
      rate: string;
      amt: string;
      subtitle?: string;
    }
  | { kind: 'block'; title: string; body: string };

/** Exported for tests — builds the same structure used by Download PDF. */
export function buildPdfLines(txn: Transaction, tendered?: number, branding?: ReceiptBranding): PdfLine[] {
  const storeName = branding?.storeName || APP_NAME;
  const lines: PdfLine[] = [
    { kind: 'center', text: storeName, bold: true, size: 11 },
  ];
  if (branding?.receiptHeader) {
    for (const line of branding.receiptHeader.split('\n').filter(Boolean)) {
      lines.push({ kind: 'center', text: line });
    }
  }
  if (branding?.address) lines.push({ kind: 'center', text: branding.address });
  if (branding?.phone) lines.push({ kind: 'center', text: branding.phone });
  lines.push({ kind: 'sep' });
  lines.push({ kind: 'row', left: 'Date', right: formatDateTime(txn.createdAt) });
  lines.push({ kind: 'row', left: 'Bill No', right: txn.transactionNumber, bold: true });
  lines.push({ kind: 'row', left: 'Customer', right: receiptCustomerLabel(txn) });
  lines.push({ kind: 'row', left: 'Cashier', right: txn.createdBy });
  lines.push({ kind: 'sep' });
  lines.push({ kind: 'itemHeader' });

  for (const item of txn.items ?? []) {
    const price = Number(item.price) || 0;
    const qty = Number(item.quantity) || 0;
    const subtitle = formatSellLineSubtitle(item.sellUom, item.unitFactor, item.uom ?? '');
    lines.push({
      kind: 'item',
      name: item.name || 'Item',
      qty: String(qty),
      rate: price.toFixed(2),
      amt: (price * qty).toFixed(2),
      subtitle: subtitle || undefined,
    });
  }

  lines.push({ kind: 'sep' });
  lines.push({ kind: 'row', left: 'Subtotal', right: formatAmount(txn.subtotal) });

  const discountLines = getTransactionDiscountLines(txn);
  for (const line of discountLines) {
    const label = line.label.length > 18 ? `${line.label.slice(0, 17)}…` : line.label;
    lines.push({ kind: 'row', left: label, right: `- ${formatAmount(line.amount)}` });
  }
  const breakdown = getTransactionDiscountBreakdown(txn);
  if (breakdown.hasDiscounts) {
    lines.push({
      kind: 'row',
      left: 'Total savings',
      right: `- ${formatAmount(breakdown.totalDiscount)}`,
      bold: true,
    });
  }

  lines.push({ kind: 'row', left: 'TOTAL', right: formatCurrency(txn.total), bold: true, size: 11 });
  lines.push({ kind: 'sep' });
  lines.push({ kind: 'row', left: 'Payment', right: txn.paymentMethod.toUpperCase(), bold: true });
  if (tendered !== undefined) {
    lines.push({ kind: 'row', left: 'Tendered', right: formatAmount(tendered) });
    const change = tendered - txn.total;
    if (change >= 0) {
      lines.push({ kind: 'row', left: 'Change', right: formatAmount(change), bold: true });
    }
  }

  if (txn.notes?.trim()) {
    lines.push({ kind: 'sep' });
    lines.push({ kind: 'block', title: 'Remarks', body: txn.notes.trim() });
  }

  lines.push({ kind: 'sep' });
  if (branding?.receiptFooter) {
    for (const line of branding.receiptFooter.split('\n').filter(Boolean)) {
      lines.push({ kind: 'center', text: line });
    }
  } else {
    lines.push({ kind: 'center', text: `Thank you for shopping at ${storeName}!` });
    lines.push({ kind: 'center', text: 'Please come again' });
  }

  return lines;
}

function estimatePdfHeight(lines: PdfLine[], lineHeight: number, margin: number): number {
  let rows = 0;
  for (const line of lines) {
    if (line.kind === 'item') {
      rows += 1 + (line.subtitle ? 1 : 0);
      // name wrap allowance
      rows += Math.max(0, Math.ceil(line.name.length / 22) - 1);
    } else if (line.kind === 'block') {
      rows += 1 + Math.max(1, Math.ceil(line.body.length / 36));
    } else if (line.kind === 'center') {
      rows += Math.max(1, Math.ceil(line.text.length / 36));
    } else {
      rows += 1;
    }
  }
  return Math.max(120, margin * 2 + rows * lineHeight + 10);
}

/** Generate and download a PDF receipt sized for 80mm thermal printers. */
export function downloadReceiptPdf(txn: Transaction, tendered?: number, branding?: ReceiptBranding): void {
  const lines = buildPdfLines(txn, tendered, branding);
  const lineHeight = 4;
  const margin = 4;
  const heightMm = estimatePdfHeight(lines, lineHeight, margin);

  // Column anchors for Item | Qty | Rate | Amt (mirrors print HTML proportions)
  const nameX = margin;
  const nameMaxW = 34;
  const qtyX = margin + 38;
  const rateX = RECEIPT_WIDTH_MM - margin - 17;
  const amtX = RECEIPT_WIDTH_MM - margin;

  const doc = new jsPDF({
    unit: 'mm',
    format: [RECEIPT_WIDTH_MM, heightMm],
    orientation: 'portrait',
  });

  doc.setFont(THERMAL_FONT, 'normal');
  let y = margin + 4;

  for (const line of lines) {
    if (line.kind === 'sep') {
      doc.setFontSize(9);
      doc.setFont(THERMAL_FONT, 'normal');
      doc.text('--------------------------------', RECEIPT_WIDTH_MM / 2, y, { align: 'center' });
      y += lineHeight;
      continue;
    }

    if (line.kind === 'center') {
      const size = line.size ?? 9;
      doc.setFontSize(size);
      doc.setFont(THERMAL_FONT, line.bold ? 'bold' : 'normal');
      const maxWidth = RECEIPT_WIDTH_MM - margin * 2;
      const wrapped = doc.splitTextToSize(line.text, maxWidth) as string[];
      for (const w of wrapped) {
        doc.text(w, RECEIPT_WIDTH_MM / 2, y, { align: 'center' });
        y += lineHeight;
      }
      continue;
    }

    if (line.kind === 'row') {
      const size = line.size ?? 9;
      doc.setFontSize(size);
      doc.setFont(THERMAL_FONT, line.bold ? 'bold' : 'normal');
      doc.text(line.left, margin, y);
      if (line.right) {
        doc.text(line.right, amtX, y, { align: 'right' });
      }
      y += lineHeight;
      continue;
    }

    if (line.kind === 'itemHeader') {
      doc.setFontSize(8);
      doc.setFont(THERMAL_FONT, 'bold');
      doc.text('Item', nameX, y);
      doc.text('Qty', qtyX, y, { align: 'right' });
      doc.text('Rate', rateX, y, { align: 'right' });
      doc.text('Amt', amtX, y, { align: 'right' });
      y += lineHeight;
      continue;
    }

    if (line.kind === 'item') {
      doc.setFontSize(8);
      doc.setFont(THERMAL_FONT, 'normal');
      const nameLines = doc.splitTextToSize(line.name, nameMaxW) as string[];
      const first = nameLines[0] ?? '';
      doc.text(first, nameX, y);
      doc.text(line.qty, qtyX, y, { align: 'right' });
      doc.text(line.rate, rateX, y, { align: 'right' });
      doc.text(line.amt, amtX, y, { align: 'right' });
      y += lineHeight;
      for (let i = 1; i < nameLines.length; i++) {
        doc.text(nameLines[i], nameX, y);
        y += lineHeight;
      }
      if (line.subtitle) {
        doc.setFontSize(7);
        const subLines = doc.splitTextToSize(line.subtitle, nameMaxW) as string[];
        for (const s of subLines) {
          doc.text(s, nameX, y);
          y += lineHeight;
        }
        doc.setFontSize(8);
      }
      continue;
    }

    if (line.kind === 'block') {
      doc.setFontSize(9);
      doc.setFont(THERMAL_FONT, 'bold');
      doc.text(line.title, margin, y);
      y += lineHeight;
      doc.setFont(THERMAL_FONT, 'normal');
      const bodyLines = doc.splitTextToSize(line.body, RECEIPT_WIDTH_MM - margin * 2) as string[];
      for (const b of bodyLines) {
        doc.text(b, margin, y);
        y += lineHeight;
      }
    }
  }

  doc.save(`${txn.transactionNumber}.pdf`);
}

/** Convenience: print from a transaction object. */
export function printTransactionReceipt(
  txn: Transaction,
  tendered?: number,
  branding?: ReceiptBranding,
): PrintResult {
  return printReceipt(buildReceiptHtml(txn, tendered, branding));
}
