import { describe, it, expect } from 'vitest';
import { escapeHtml, buildReceiptHtml, buildPrintDocument, buildPdfLines } from './receiptPrint';
import type { Transaction } from '@/types';

const sampleTxn: Transaction = {
  id: '1',
  transactionNumber: 'TXN-2026-06-29-001',
  customerName: 'Walk-In',
  items: [
    {
      productId: 'p1',
      name: 'Kimchi <Special>',
      sku: 'SKU-1',
      price: 150,
      quantity: 2,
      discount: 0,
      sellUom: 'pack',
      unitFactor: 12,
      uom: 'pcs',
    },
  ],
  subtotal: 300,
  discount: 0,
  tax: 0,
  loyaltyPointsRedeemed: 0,
  total: 300,
  paymentMethod: 'cash',
  createdBy: 'Cashier',
  createdAt: '2026-06-29T10:00:00.000Z',
};

describe('receiptPrint', () => {
  it('escapeHtml encodes special characters', () => {
    expect(escapeHtml('a & b <c>')).toBe('a &amp; b &lt;c&gt;');
  });

  it('buildReceiptHtml includes transaction data and escaped item names', () => {
    const html = buildReceiptHtml(sampleTxn, 500);
    expect(html).toContain('TXN-2026-06-29-001');
    expect(html).toContain('Kimchi &lt;Special&gt;');
    expect(html).toContain('Tendered');
    expect(html).toContain('Change');
  });

  it('buildReceiptHtml includes UOM subtitle and Walk-In Customer', () => {
    const html = buildReceiptHtml(sampleTxn);
    expect(html).toContain('Walk-In Customer');
    expect(html).toMatch(/Sell:.*[Pp]ack/);
    expect(html).toContain('150.00');
    expect(html).toContain('300.00');
  });

  it('buildReceiptHtml includes discount breakdown when present', () => {
    const html = buildReceiptHtml({
      ...sampleTxn,
      discount: 10,
      manualDiscount: 10,
      promotionDiscount: 10,
      total: 290,
    });
    expect(html).toContain('Manual discount');
    expect(html).toContain('Total savings');
  });

  it('buildReceiptHtml uses custom branding when provided', () => {
    const html = buildReceiptHtml(sampleTxn, 500, {
      storeName: 'Test Mart',
      address: 'Baneshwor',
      receiptFooter: 'Namaste!',
    });
    expect(html).toContain('Test Mart');
    expect(html).toContain('Baneshwor');
    expect(html).toContain('Namaste!');
  });

  it('buildReceiptHtml includes remarks when notes present', () => {
    const html = buildReceiptHtml({ ...sampleTxn, notes: 'Leave at door' });
    expect(html).toContain('Remarks');
    expect(html).toContain('Leave at door');
  });

  it('buildPrintDocument wraps body in full HTML document', () => {
    const doc = buildPrintDocument('<div>test</div>');
    expect(doc).toContain('<!DOCTYPE html>');
    expect(doc).toContain('80mm');
    expect(doc).toContain('<div>test</div>');
  });

  it('buildPdfLines matches on-screen columns with UOM, customer, and remarks', () => {
    const lines = buildPdfLines(
      { ...sampleTxn, notes: 'Gift wrap' },
      500,
    );

    expect(lines.some((l) => l.kind === 'itemHeader')).toBe(true);

    const item = lines.find((l) => l.kind === 'item');
    expect(item).toBeDefined();
    if (item?.kind === 'item') {
      expect(item.name).toBe('Kimchi <Special>');
      expect(item.qty).toBe('2');
      expect(item.rate).toBe('150.00');
      expect(item.amt).toBe('300.00');
      expect(item.subtitle).toMatch(/Sell:.*[Pp]ack/);
    }

    const customer = lines.find(
      (l) => l.kind === 'row' && l.left === 'Customer',
    );
    expect(customer).toMatchObject({ kind: 'row', right: 'Walk-In Customer' });

    const remarks = lines.find((l) => l.kind === 'block');
    expect(remarks).toMatchObject({ kind: 'block', title: 'Remarks', body: 'Gift wrap' });

    expect(lines.some((l) => l.kind === 'row' && l.left === 'Tendered')).toBe(true);
    expect(lines.some((l) => l.kind === 'row' && l.left === 'Change')).toBe(true);
  });

  it('buildPdfLines truncates long customer and cashier names to prevent PDF overlap', () => {
    const lines = buildPdfLines({
      ...sampleTxn,
      customerName: 'Himalayan Organic Farmhouse Cooperative Pvt. Ltd.',
      createdBy: 'cashier.lead.supervisor.nightshift',
    });
    const customer = lines.find((l) => l.kind === 'row' && l.left === 'Customer');
    const cashier = lines.find((l) => l.kind === 'row' && l.left === 'Cashier');
    expect(customer).toMatchObject({ kind: 'row', right: 'Himalayan Organic Far…' });
    expect(cashier).toMatchObject({ kind: 'row', right: 'cashier.lead.supervis…' });
  });
});
