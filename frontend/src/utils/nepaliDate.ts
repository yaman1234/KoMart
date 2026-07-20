import NepaliDate from 'nepali-date-converter';

export type CalendarSystem = 'AD' | 'BS';

export const BS_MONTHS = [
  'Baisakh',
  'Jestha',
  'Ashadh',
  'Shrawan',
  'Bhadra',
  'Ashwin',
  'Kartik',
  'Mangsir',
  'Poush',
  'Magh',
  'Falgun',
  'Chaitra',
] as const;

/** Convert AD YYYY-MM-DD → BS YYYY-MM-DD (1-indexed month in string). */
export function adToBs(adDate: string): string {
  if (!adDate || !/^\d{4}-\d{2}-\d{2}$/.test(adDate)) return '';
  const [y, m, d] = adDate.split('-').map(Number);
  const nd = new NepaliDate(new Date(y, m - 1, d));
  return nd.format('YYYY-MM-DD');
}

/** Convert BS YYYY-MM-DD → AD YYYY-MM-DD. */
export function bsToAd(bsDate: string): string {
  if (!bsDate || !/^\d{4}-\d{2}-\d{2}$/.test(bsDate)) return '';
  try {
    const nd = NepaliDate.parse(bsDate);
    const ad = nd.getAD();
    return `${ad.year}-${String(ad.month + 1).padStart(2, '0')}-${String(ad.date).padStart(2, '0')}`;
  } catch {
    return '';
  }
}

export function parseYmd(ymd: string): { year: number; month: number; day: number } | null {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const [year, month, day] = ymd.split('-').map(Number);
  return { year, month, day };
}

export function toYmd(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Days in a BS month (1-indexed month). */
export function daysInBsMonth(year: number, month: number): number {
  for (let day = 32; day >= 28; day -= 1) {
    try {
      NepaliDate.parse(toYmd(year, month, day));
      return day;
    } catch {
      /* try smaller */
    }
  }
  return 30;
}

export function formatDualCalendar(adDate: string, primary: CalendarSystem = 'BS'): string {
  if (!adDate) return '';
  const bs = adToBs(adDate);
  if (!bs) return adDate;
  if (primary === 'BS') return `BS ${bs} · AD ${adDate}`;
  return `AD ${adDate} · BS ${bs}`;
}

export function formatDisplayDate(adDate: string | Date, calendar: CalendarSystem = 'AD'): string {
  const ad =
    typeof adDate === 'string'
      ? adDate.slice(0, 10)
      : toYmd(adDate.getFullYear(), adDate.getMonth() + 1, adDate.getDate());

  if (!/^\d{4}-\d{2}-\d{2}$/.test(ad)) {
    return new Date(adDate).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  if (calendar === 'BS') {
    const bs = adToBs(ad);
    const parts = parseYmd(bs);
    if (!parts) return ad;
    return `${parts.day} ${BS_MONTHS[parts.month - 1]} ${parts.year} BS`;
  }

  return new Date(`${ad}T12:00:00`).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function bsYearRange(aroundAdYear = new Date().getFullYear()): number[] {
  const mid = aroundAdYear + 57;
  const years: number[] = [];
  for (let y = mid - 5; y <= mid + 5; y += 1) years.push(y);
  return years;
}
