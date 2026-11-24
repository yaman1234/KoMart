/** Store wall-clock timezone. Sale dates and list filters use this calendar, not UTC. */
export const STORE_TIME_ZONE = 'Asia/Kathmandu';

/**
 * Calendar date in Asia/Kathmandu as YYYY-MM-DD.
 * `en-CA` formats that zone as an ISO date.
 */
export function storeTodayIso(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: STORE_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** Add calendar days to a YYYY-MM-DD date without shifting across local timezones. */
export function addCalendarDays(isoDate: string, days: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) return isoDate;
  const utc = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  utc.setUTCDate(utc.getUTCDate() + days);
  const year = utc.getUTCFullYear();
  const month = String(utc.getUTCMonth() + 1).padStart(2, '0');
  const day = String(utc.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** First calendar day of the Kathmandu month that contains `now`. */
export function storeMonthStartIso(now: Date = new Date()): string {
  return `${storeTodayIso(now).slice(0, 8)}01`;
}
