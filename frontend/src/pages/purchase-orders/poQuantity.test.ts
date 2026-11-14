import { describe, expect, it } from 'vitest';
import { MAX_PO_LINE_QUANTITY } from '@/constants';
import { parsePoQuantity, poQuantityError, receiveQuantityError } from '@/pages/purchase-orders/poQuantity';

describe('poQuantity', () => {
  it('accepts a normal whole number and the maximum', () => {
    expect(parsePoQuantity('3')).toBe(3);
    expect(parsePoQuantity(String(MAX_PO_LINE_QUANTITY))).toBe(MAX_PO_LINE_QUANTITY);
    expect(poQuantityError('3')).toBeNull();
  });

  it('rejects empty, zero, negative, non-integer, and above-max values', () => {
    expect(poQuantityError('')).toBe('Enter a quantity');
    expect(poQuantityError('   ')).toBe('Enter a quantity');
    expect(poQuantityError('0')).toBe('Quantity must be at least 1');
    expect(poQuantityError('-1')).toBe('Quantity must be at least 1');
    expect(poQuantityError('1.5')).toBe('Enter a whole number');
    expect(poQuantityError('abc')).toBe('Enter a whole number');
    expect(poQuantityError(String(MAX_PO_LINE_QUANTITY + 1))).toMatch(/Maximum is/);
    expect(parsePoQuantity('0')).toBeNull();
    expect(parsePoQuantity('-1')).toBeNull();
    expect(parsePoQuantity('1.5')).toBeNull();
    expect(parsePoQuantity('999999999')).toBeNull();
  });

  it('rejects a receive quantity above the remaining packs', () => {
    expect(receiveQuantityError('3', 5)).toBeNull();
    expect(receiveQuantityError('0', 5)).toBe('Quantity must be at least 1');
    expect(receiveQuantityError('6', 5)).toBe('Cannot receive more than 5');
    expect(receiveQuantityError(String(MAX_PO_LINE_QUANTITY + 1), MAX_PO_LINE_QUANTITY)).toMatch(/Maximum is/);
  });
});
