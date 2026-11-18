import { describe, expect, it } from 'vitest';
import { cleanSupplierPaymentDetail, supplierPoKpis, supplierReturnKpis } from './supplierPoKpis';

describe('supplierPoKpis', () => {
  it('excludes draft and cancelled and matches payable outstanding', () => {
    const kpis = supplierPoKpis([
      { status: 'draft', totalAmount: 100, amountPaid: 0 },
      { status: 'cancelled', totalAmount: 200, amountPaid: 50 },
      { status: 'ordered', totalAmount: 1000, amountPaid: 100 },
      { status: 'partial', totalAmount: 500, amountPaid: 0 },
      { status: 'received', totalAmount: 2000, amountPaid: 350 },
      { status: 'Received', totalAmount: 566039.8, amountPaid: 1000 },
      { status: ' completed ', totalAmount: 999, amountPaid: 0 },
    ]);

    expect(kpis).toEqual({
      committedCount: 4,
      committedAmount: 569539.8,
      receivedCount: 2,
      receivedAmount: 568039.8,
      pendingCount: 2,
      pendingAmount: 1500,
      paidAmount: 1450,
      payableOutstanding: 568089.8,
    });
  });

  it('clamps overpayment to zero outstanding', () => {
    const kpis = supplierPoKpis([
      { status: 'received', totalAmount: 100, amountPaid: 150 },
    ]);
    expect(kpis.paidAmount).toBe(150);
    expect(kpis.payableOutstanding).toBe(0);
  });
});

describe('supplierReturnKpis', () => {
  it('counts every mode in returned goods and only open refunds as receivable', () => {
    const kpis = supplierReturnKpis([
      { status: 'closed', settlementType: 'stock_only', totalAmount: 4000 },
      {
        status: 'requested',
        settlementType: 'refund',
        totalAmount: 10000,
        amountReceived: 2000,
        writeOffAmount: 1000,
      },
      { status: 'closed', settlementType: 'refund', totalAmount: 3000, amountReceived: 3000 },
      { status: 'cancelled', settlementType: 'refund', totalAmount: 999 },
      { status: 'requested', settlementType: 'reduce_payable', totalAmount: 800 },
    ]);

    expect(kpis).toEqual({
      returnedCount: 4,
      returnedAmount: 17800,
      receivableCount: 1,
      receivableAmount: 7000,
    });
  });
});

describe('cleanSupplierPaymentDetail', () => {
  it('drops blank optional fields', () => {
    expect(
      cleanSupplierPaymentDetail({
        method: 'bank',
        label: '  ',
        accountName: ' Nabil ',
        accountNumber: '',
        bankName: undefined,
        qrImageUrl: ' https://cdn.example.com/qr.png ',
      }),
    ).toEqual({
      method: 'bank',
      label: undefined,
      accountName: 'Nabil',
      accountNumber: undefined,
      bankName: undefined,
      qrImageUrl: 'https://cdn.example.com/qr.png',
    });
  });
});
