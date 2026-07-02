import { describe, it, expect } from 'vitest';
import { escapeHtml, buildReceiptHtml, buildPrintDocument } from './receiptPrint';
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

  it('buildPrintDocument wraps body in full HTML document', () => {
    const doc = buildPrintDocument('<div>test</div>');
    expect(doc).toContain('<!DOCTYPE html>');
    expect(doc).toContain('80mm');
    expect(doc).toContain('<div>test</div>');
  });
});
