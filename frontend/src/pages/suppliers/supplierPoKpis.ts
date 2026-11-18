import type { PurchaseOrderStatus, SupplierPaymentDetail } from '@/types';

const COMMITTED_STATUSES = new Set<PurchaseOrderStatus>(['ordered', 'partial', 'received']);

export interface SupplierPoKpis {
  committedCount: number;
  committedAmount: number;
  receivedCount: number;
  receivedAmount: number;
  pendingCount: number;
  pendingAmount: number;
  paidAmount: number;
  payableOutstanding: number;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Same committed set and outstanding rule as the purchase-order summary API. */
export function supplierPoKpis(
  orders: Array<{ status?: string; totalAmount?: number; amountPaid?: number }>,
): SupplierPoKpis {
  let committedCount = 0;
  let committedAmount = 0;
  let receivedCount = 0;
  let receivedAmount = 0;
  let pendingCount = 0;
  let pendingAmount = 0;
  let paidAmount = 0;
  let payableOutstanding = 0;

  for (const order of orders) {
    const status = (order.status ?? '').trim().toLowerCase();
    if (!COMMITTED_STATUSES.has(status as PurchaseOrderStatus)) continue;
    const total = Number(order.totalAmount) || 0;
    const paid = Number(order.amountPaid) || 0;
    committedCount += 1;
    committedAmount += total;
    paidAmount += paid;
    payableOutstanding += Math.max(0, total - paid);
    if (status === 'received') {
      receivedCount += 1;
      receivedAmount += total;
    } else {
      pendingCount += 1;
      pendingAmount += total;
    }
  }

  return {
    committedCount,
    committedAmount: roundMoney(committedAmount),
    receivedCount,
    receivedAmount: roundMoney(receivedAmount),
    pendingCount,
    pendingAmount: roundMoney(pendingAmount),
    paidAmount: roundMoney(paidAmount),
    payableOutstanding: roundMoney(payableOutstanding),
  };
}

export interface SupplierReturnKpiInput {
  status?: string;
  settlementType?: string;
  totalAmount?: number;
  amountReceived?: number;
  writeOffAmount?: number;
}

export interface SupplierReturnKpis {
  returnedCount: number;
  returnedAmount: number;
  receivableCount: number;
  receivableAmount: number;
}

/** Same returned/receivable rules as the supplier purchase-order summary. */
export function supplierReturnKpis(returns: SupplierReturnKpiInput[]): SupplierReturnKpis {
  let returnedCount = 0;
  let returnedAmount = 0;
  let receivableCount = 0;
  let receivableAmount = 0;

  for (const row of returns) {
    const status = (row.status ?? '').trim().toLowerCase();
    if (status === 'cancelled') continue;
    const total = Number(row.totalAmount) || 0;
    returnedCount += 1;
    returnedAmount += total;
    const settlement = (row.settlementType ?? '').trim().toLowerCase();
    if (status === 'requested' && settlement === 'refund') {
      receivableCount += 1;
      const received = Number(row.amountReceived) || 0;
      const writeOff = Number(row.writeOffAmount) || 0;
      receivableAmount += Math.max(0, total - received - writeOff);
    }
  }

  return {
    returnedCount,
    returnedAmount: roundMoney(returnedAmount),
    receivableCount,
    receivableAmount: roundMoney(receivableAmount),
  };
}

export function qrImageUrlError(url?: string): string | undefined {
  const text = url?.trim();
  if (!text) return undefined;
  if (!text.toLowerCase().startsWith('https://')) return 'QR image must use https://';
  return undefined;
}

export function cleanSupplierPaymentDetail(row: SupplierPaymentDetail): SupplierPaymentDetail {
  const trim = (value?: string) => {
    const text = value?.trim();
    return text ? text : undefined;
  };
  return {
    method: row.method,
    label: trim(row.label),
    accountName: trim(row.accountName),
    accountNumber: trim(row.accountNumber),
    bankName: trim(row.bankName),
    qrImageUrl: trim(row.qrImageUrl),
  };
}
