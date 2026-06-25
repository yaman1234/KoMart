import { CURRENCY_SYMBOL } from '@/constants';
import type { UserRole } from '@/types';

export function canManageSuppliers(role?: UserRole): boolean {
  return role === 'admin' || role === 'manager';
}

export function canManagePurchaseOrders(role?: UserRole): boolean {
  return role === 'admin';
}

export function formatAmount(amount: number): string {
  return amount.toLocaleString('en-NP', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatCurrency(amount: number): string {
  return `${CURRENCY_SYMBOL} ${formatAmount(amount)}`;
}

export function formatDate(date: string | Date): string {
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function formatDateTime(date: string | Date): string {
  return new Date(date).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function calculateTax(subtotal: number, taxRate: number): number {
  return Math.round(subtotal * (taxRate / 100) * 100) / 100;
}

export function calculateCartTotal(
  items: { price: number; quantity: number; discount: number }[],
  taxRate: number,
  loyaltyDiscount = 0,
): { subtotal: number; discount: number; tax: number; total: number } {
  const subtotal = items.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0,
  );
  const itemDiscount = items.reduce(
    (sum, item) => sum + item.discount * item.quantity,
    0,
  );
  const discount = itemDiscount + loyaltyDiscount;
  const taxable = subtotal - discount;
  const tax = calculateTax(taxable, taxRate);
  const total = taxable + tax;

  return { subtotal, discount, tax, total };
}

export function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function generateId(): string {
  return crypto.randomUUID();
}
