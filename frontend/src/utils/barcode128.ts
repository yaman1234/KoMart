/**
 * Code 128 encoder (sets B and C only).
 * Even-length digit runs are encoded in set C; everything else uses set B.
 * Patterns follow ISO/IEC 15417 (bar/space widths). The stop symbol includes
 * the terminating 2-module bar (2331112).
 */

const START_B = 104;
const START_C = 105;
const CODE_B = 100;
const CODE_C = 99;
const STOP = 106;

/** Width strings for values 0–105, plus the 13-module stop pattern at 106. */
const PATTERNS: readonly string[] = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312',
  '132212', '221213', '221312', '231212', '112232', '122132', '122231', '113222',
  '123122', '123221', '223211', '221132', '221231', '213212', '223112', '312131',
  '311222', '321122', '321221', '312212', '322112', '322211', '212123', '212321',
  '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121',
  '313121', '211331', '231131', '213113', '213311', '213131', '311123', '311321',
  '331121', '312113', '312311', '332111', '314111', '221411', '431111', '111224',
  '111422', '121124', '121421', '141122', '141221', '112214', '112412', '122114',
  '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112',
  '421211', '212141', '214121', '412121', '111143', '111341', '131141', '114113',
  '114311', '411113', '411311', '113141', '114131', '311141', '411131', '211412',
  '211214', '211232', '2331112',
];

export const CODE128_QUIET_ZONE = 10;

export interface Code128Bar {
  /** Start of a black bar, in modules from the left edge of the quiet zone. */
  x: number;
  width: number;
}

export interface Code128Encoding {
  text: string;
  /** Start, data, code-set switches, checksum, and stop. */
  symbols: number[];
  checksum: number;
  patterns: string[];
  quietZone: number;
  totalModules: number;
  bars: Code128Bar[];
}

function isDigit(ch: string): boolean {
  return ch >= '0' && ch <= '9';
}

function digitRunLength(text: string, index: number): number {
  let count = 0;
  while (index + count < text.length && isDigit(text[index + count]!)) count += 1;
  return count;
}

function patternModules(pattern: string): number {
  let total = 0;
  for (const ch of pattern) total += Number(ch);
  return total;
}

function barsFromPatterns(patterns: string[], quietZone: number): Code128Bar[] {
  const bars: Code128Bar[] = [];
  let x = quietZone;
  for (const pattern of patterns) {
    let ink = true;
    for (const ch of pattern) {
      const width = Number(ch);
      if (ink) bars.push({ x, width });
      x += width;
      ink = !ink;
    }
  }
  return bars;
}

/**
 * Encode `text` as Code 128.
 * A digit run contributes its longest even prefix to set C (pairs 00–99).
 * A leftover odd digit, and every non-digit, is encoded in set B.
 */
export function encodeCode128(text: string): Code128Encoding {
  if (text.length === 0) {
    throw new Error('Code 128 value is empty');
  }

  const symbols: number[] = [];
  let charset: 'B' | 'C' | null = null;
  let index = 0;

  const useCharset = (next: 'B' | 'C') => {
    if (charset === next) return;
    if (charset === null) symbols.push(next === 'C' ? START_C : START_B);
    else symbols.push(next === 'C' ? CODE_C : CODE_B);
    charset = next;
  };

  while (index < text.length) {
    const run = digitRunLength(text, index);
    const even = run - (run % 2);
    if (even >= 2) {
      useCharset('C');
      for (let pair = 0; pair < even; pair += 2) {
        symbols.push(Number.parseInt(text.slice(index + pair, index + pair + 2), 10));
      }
      index += even;
      continue;
    }

    const code = text.charCodeAt(index);
    if (code < 32 || code > 126) {
      throw new Error(`Cannot encode character in Code 128: ${text[index]}`);
    }
    useCharset('B');
    symbols.push(code - 32);
    index += 1;
  }

  let sum = symbols[0] ?? 0;
  for (let weight = 1; weight < symbols.length; weight += 1) {
    sum += (symbols[weight] ?? 0) * weight;
  }
  const checksum = sum % 103;
  symbols.push(checksum);
  symbols.push(STOP);

  const patterns = symbols.map((value) => {
    const pattern = PATTERNS[value];
    if (!pattern) throw new Error(`Code 128 symbol out of range: ${value}`);
    return pattern;
  });
  const symbolModules = patterns.reduce((total, pattern) => total + patternModules(pattern), 0);

  return {
    text,
    symbols,
    checksum,
    patterns,
    quietZone: CODE128_QUIET_ZONE,
    totalModules: symbolModules + CODE128_QUIET_ZONE * 2,
    bars: barsFromPatterns(patterns, CODE128_QUIET_ZONE),
  };
}

export function code128Svg(
  encoding: Code128Encoding,
  options?: { module?: number; height?: number },
): string {
  const moduleWidth = options?.module ?? 1;
  const height = options?.height ?? 40;
  const width = encoding.totalModules * moduleWidth;
  const rects = encoding.bars
    .map((bar) => {
      const x = bar.x * moduleWidth;
      const w = bar.width * moduleWidth;
      return `<rect x="${x}" y="0" width="${w}" height="${height}" fill="#000"/>`;
    })
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid meet">${rects}</svg>`;
}
