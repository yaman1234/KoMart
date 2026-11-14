import { MAX_PO_LINE_QUANTITY } from '@/constants';

const MAX_LABEL = MAX_PO_LINE_QUANTITY.toLocaleString('en-US');

/**
 * Validate a purchase-order pack quantity.
 * Accepts a whole number from 1 through MAX_PO_LINE_QUANTITY.
 * Does not coerce invalid input.
 */
export function poQuantityError(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return 'Enter a quantity';
  if (!/^[+-]?\d+(\.\d+)?$/.test(trimmed)) return 'Enter a whole number';
  const n = Number(trimmed);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return 'Enter a whole number';
  if (n < 1) return 'Quantity must be at least 1';
  if (n > MAX_PO_LINE_QUANTITY) return `Maximum is ${MAX_LABEL}`;
  return null;
}

/** Parsed pack quantity, or null when `poQuantityError` would reject it. */
export function parsePoQuantity(input: string): number | null {
  if (poQuantityError(input)) return null;
  return Number(input.trim());
}

/**
 * Receive qty must be a valid pack quantity and not exceed packs still on the order.
 */
export function receiveQuantityError(input: string, remaining: number): string | null {
  const formatError = poQuantityError(input);
  if (formatError) return formatError;
  const n = Number(input.trim());
  const cap = Math.min(Math.max(0, Math.floor(remaining)), MAX_PO_LINE_QUANTITY);
  if (n > cap) return `Cannot receive more than ${cap.toLocaleString('en-US')}`;
  return null;
}
