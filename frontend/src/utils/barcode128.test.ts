import { describe, expect, it } from 'vitest';
import { code128Svg, encodeCode128 } from './barcode128';

describe('encodeCode128', () => {
  it('encodes a 6-digit SKU in code set C, keeping leading zeros', () => {
    const encoded = encodeCode128('040029');
    // Start C, pairs 04 / 00 / 29, checksum 93, stop.
    // 105 + 4*1 + 0*2 + 29*3 = 196 ≡ 93 (mod 103)
    expect(encoded.text).toBe('040029');
    expect(encoded.checksum).toBe(93);
    expect(encoded.symbols).toEqual([105, 4, 0, 29, 93, 106]);
    expect(encoded.patterns).toEqual([
      '211232',
      '121322',
      '212222',
      '322211',
      '111341',
      '2331112',
    ]);
    expect(encoded.bars[0]).toEqual({ x: 10, width: 2 });
    expect(encoded.totalModules).toBe(10 + 11 * 5 + 13 + 10);
  });

  it('encodes an alphanumeric string in code set B', () => {
    const encoded = encodeCode128('Hi!');
    // H=40, i=73, !=1. Start B.
    // 104 + 40*1 + 73*2 + 1*3 = 293 ≡ 87 (mod 103)
    expect(encoded.checksum).toBe(87);
    expect(encoded.symbols).toEqual([104, 40, 73, 1, 87, 106]);
    expect(encoded.patterns).toEqual([
      '211214',
      '231113',
      '142112',
      '222122',
      '421112',
      '2331112',
    ]);
  });

  it('encodes a 13-digit EAN in code set C with a set B tail', () => {
    const encoded = encodeCode128('8901234567890');
    // Six pairs, then Code B for the leftover '0' (value 16).
    // checksum 82
    expect(encoded.checksum).toBe(82);
    expect(encoded.symbols).toEqual([105, 89, 1, 23, 45, 67, 89, 100, 16, 82, 106]);
    expect(encoded.patterns[0]).toBe('211232');
    expect(encoded.patterns[7]).toBe('114131');
    expect(encoded.patterns.at(-1)).toBe('2331112');
  });

  it('switches into set C for an even digit run inside text', () => {
    const encoded = encodeCode128('A12');
    // Start B, 'A' (33), Code C, pair 12.
    // 104 + 33*1 + 99*2 + 12*3 = 371 ≡ 62 (mod 103)
    expect(encoded.symbols).toEqual([104, 33, 99, 12, 62, 106]);
  });

  it('renders an SVG with crisp edges and a quiet zone', () => {
    const svg = code128Svg(encodeCode128('040029'));
    expect(svg).toContain('shape-rendering="crispEdges"');
    expect(svg).toContain('fill="#000"');
    expect(svg).toContain('x="10"');
    expect(svg.startsWith('<svg ')).toBe(true);
  });

  it('rejects an empty value', () => {
    expect(() => encodeCode128('')).toThrow(/empty/i);
  });
});
