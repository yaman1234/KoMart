import { describe, expect, it } from 'vitest';
import {
  findOversellLines,
  lineBaseQuantity,
  maxSellQuantity,
  oversellPayMessage,
  stockCapMessage,
} from './posStock';

describe('posStock', () => {
  it('counts pack lines in base units', () => {
    expect(lineBaseQuantity(2, 6)).toBe(12);
    expect(lineBaseQuantity(3)).toBe(3);
  });

  it('caps a piece line at on-hand and still allows the exact on-hand quantity', () => {
    const line = { productId: 'snack', name: 'Snack B', quantity: 10, unitFactor: 1, sellUom: 'pcs' };
    expect(maxSellQuantity([line], line, 10)).toBe(10);
    expect(maxSellQuantity([{ ...line, quantity: 11 }], line, 10)).toBe(10);
  });

  it('shares on-hand stock between piece and pack lines', () => {
    const piece = { productId: 'snack', name: 'Snack B', quantity: 4, unitFactor: 1, sellUom: 'pcs' };
    const pack = { productId: 'snack', name: 'Snack B', quantity: 1, unitFactor: 6, sellUom: 'pack' };
    expect(maxSellQuantity([piece, pack], pack, 10)).toBe(1);
    expect(maxSellQuantity([piece, pack], piece, 10)).toBe(4);
  });

  it('flags a cart that requests more than on-hand', () => {
    const lines = findOversellLines(
      [{ productId: 'snack', name: 'Snack B', quantity: 11, unitFactor: 1 }],
      { snack: 10 },
    );
    expect(lines).toEqual([
      { productId: 'snack', name: 'Snack B', onHand: 10, requested: 11 },
    ]);
    expect(oversellPayMessage(lines)).toContain('10 units in stock');
    expect(oversellPayMessage(lines)).toContain('requests 11');
    expect(findOversellLines(
      [{ productId: 'snack', name: 'Snack B', quantity: 10, unitFactor: 1 }],
      { snack: 10 },
    )).toEqual([]);
  });

  it('describes the stock cap', () => {
    expect(stockCapMessage('Snack B', 10, 10)).toBe('Cannot sell more “Snack B”. Only 10 in stock.');
    expect(stockCapMessage('Snack B', 0, 0)).toBe('“Snack B” is out of stock.');
  });
});
