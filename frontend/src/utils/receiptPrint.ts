/**
 * Receipt printing utilities — thermal 80mm layout, blob-URL print, PDF/HTML download.
 */

import { jsPDF } from 'jspdf';
import { formatAmount, formatCurrency, formatDateTime } from '@/utils';
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

export function buildReceiptHtml(txn: Transaction, tendered?: number, branding?: ReceiptBranding): string {
  const change = tendered !== undefined ? tendered - txn.total : undefined;
  const discountBreakdown = getTransactionDiscountBreakdown(txn);
  const discountLines = getTransactionDiscountLines(txn);

  const itemRows = (txn.items ?? []).map((item) => {
    const price = Number(item.price) || 0;
    const qty = Number(item.quantity) || 0;
    const name = escapeHtml(item.name || 'Item');
    return `
    <tr>
      <td class="name">${name}</td>
      <td class="qty">${qty}</td>
      <td class="rate">${price.toFixed(2)}</td>
      <td class="amt">${(price * qty).toFixed(2)}</td>
    </tr>`;
  }).join('');

  const tableHead = `<th class="name">Item</th><th class="qty">Qty</th><th class="rate">Rate</th><th class="amt">Amount</th>`;

  const customerLabel = txn.customerName && txn.customerName !== 'Walk-In'
    ? escapeHtml(txn.customerName)
    : 'Walk-In';

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

/** Download receipt as standalone HTML (opens correctly in any browser). */
export function downloadReceiptHtml(txn: Transaction, tendered?: number, branding?: ReceiptBranding): void {
  const docHtml = buildPrintDocument(buildReceiptHtml(txn, tendered, branding));
  const blob = new Blob([docHtml], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${txn.transactionNumber}.html`;
  link.click();
  URL.revokeObjectURL(url);
}

interface PdfLine {
  left: string;
  right?: string;
  bold?: boolean;
  size?: number;
}

function buildPdfLines(txn: Transaction, tendered?: number, branding?: ReceiptBranding): PdfLine[] {
  const storeName = branding?.storeName || APP_NAME;
  const lines: PdfLine[] = [
    { left: storeName, bold: true, size: 11 },
  ];
  if (branding?.receiptHeader) {
    for (const line of branding.receiptHeader.split('\n').filter(Boolean)) {
      lines.push({ left: line });
    }
  }
  if (branding?.address) lines.push({ left: branding.address });
  if (branding?.phone) lines.push({ left: branding.phone });
  lines.push({ left: '--------------------------------' });
  lines.push({ left: 'Date', right: formatDateTime(txn.createdAt) });
  lines.push({ left: 'Bill No', right: txn.transactionNumber, bold: true });
  lines.push({
    left: 'Customer',
    right: txn.customerName && txn.customerName !== 'Walk-In' ? txn.customerName : 'Walk-In',
  });
  lines.push({ left: 'Cashier', right: txn.createdBy });
  lines.push({ left: '--------------------------------' });
  lines.push({ left: 'Item', right: 'Amt', bold: true });

  for (const item of txn.items ?? []) {
    const price = Number(item.price) || 0;
    const qty = Number(item.quantity) || 0;
    const name = (item.name || 'Item').slice(0, 22);
    lines.push({ left: `${name} x${qty}`, right: (price * qty).toFixed(2) });
  }

  lines.push({ left: '--------------------------------' });
  lines.push({ left: 'Subtotal', right: formatAmount(txn.subtotal) });

  const discountLines = getTransactionDiscountLines(txn);
  for (const line of discountLines) {
    const label = line.label.length > 18 ? `${line.label.slice(0, 17)}…` : line.label;
    lines.push({ left: label, right: `- ${formatAmount(line.amount)}` });
  }
  const breakdown = getTransactionDiscountBreakdown(txn);
  if (breakdown.hasDiscounts) {
    lines.push({ left: 'Total savings', right: `- ${formatAmount(breakdown.totalDiscount)}`, bold: true });
  }

  lines.push({ left: 'TOTAL', right: formatCurrency(txn.total), bold: true, size: 11 });
  lines.push({ left: '--------------------------------' });
  lines.push({ left: 'Payment', right: txn.paymentMethod.toUpperCase(), bold: true });
  if (tendered !== undefined) {
    lines.push({ left: 'Tendered', right: formatAmount(tendered) });
    const change = tendered - txn.total;
    if (change >= 0) {
      lines.push({ left: 'Change', right: formatAmount(change), bold: true });
    }
  }
  lines.push({ left: '--------------------------------' });
  if (branding?.receiptFooter) {
    for (const line of branding.receiptFooter.split('\n').filter(Boolean)) {
      lines.push({ left: line });
    }
  } else {
    lines.push({ left: `Thank you for shopping at ${storeName}!` });
    lines.push({ left: 'Please come again' });
  }

  return lines;
}

/** Generate and download a PDF receipt sized for 80mm thermal printers. */
export function downloadReceiptPdf(txn: Transaction, tendered?: number, branding?: ReceiptBranding): void {
  const lines = buildPdfLines(txn, tendered, branding);
  const lineHeight = 4;
  const margin = 4;
  const heightMm = Math.max(120, margin * 2 + lines.length * lineHeight + 10);

  const doc = new jsPDF({
    unit: 'mm',
    format: [RECEIPT_WIDTH_MM, heightMm],
    orientation: 'portrait',
  });

  doc.setFont(THERMAL_FONT, 'normal');
  let y = margin + 4;

  for (const line of lines) {
    const size = line.size ?? 9;
    doc.setFontSize(size);
    doc.setFont(THERMAL_FONT, line.bold ? 'bold' : 'normal');

    if (line.right) {
      doc.text(line.left, margin, y);
      doc.text(line.right, RECEIPT_WIDTH_MM - margin, y, { align: 'right' });
    } else {
      const text = line.left;
      const maxWidth = RECEIPT_WIDTH_MM - margin * 2;
      const wrapped = doc.splitTextToSize(text, maxWidth) as string[];
      for (const w of wrapped) {
        doc.text(w, RECEIPT_WIDTH_MM / 2, y, { align: 'center' });
        y += lineHeight;
      }
      y -= lineHeight;
    }
    y += lineHeight;
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
