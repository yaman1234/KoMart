/** Suggest cash tender amounts: exact total plus sensible NPR round-ups. */
export function cashTenderSuggestions(total: number): number[] {
  if (total <= 0) return [0];

  const ceilTo = (step: number) => Math.ceil(total / step) * step;

  const candidates = new Set<number>([
    Math.round(total * 100) / 100,
    ceilTo(50),
    ceilTo(100),
    ceilTo(500),
    ceilTo(1000),
  ]);

  for (const bill of [500, 1000, 2000, 5000]) {
    if (bill >= total) candidates.add(bill);
  }

  return Array.from(candidates)
    .filter((v) => v >= total)
    .sort((a, b) => a - b)
    .slice(0, 6);
}
