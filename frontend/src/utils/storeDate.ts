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

/**
 * Format ISO timestamp in Asia/Kathmandu time (e.g. "09:15 AM" or "09:15:30 AM")
 */
export function formatNepalTime(isoString?: string | null, includeSeconds = false): string {
  if (!isoString) return '—';
  try {
    const raw = String(isoString).trim().replace(' ', 'T');
    // If string has no timezone offset (Z or +HH:MM or -HH:MM), treat as UTC
    const hasTz = /Z|[+-]\d{2}(:\d{2})?$/.test(raw);
    const withZ = hasTz ? raw : `${raw}Z`;
    const d = new Date(withZ);
    if (isNaN(d.getTime())) return '—';
    return new Intl.DateTimeFormat('en-US', {
      timeZone: STORE_TIME_ZONE,
      hour: '2-digit',
      minute: '2-digit',
      second: includeSeconds ? '2-digit' : undefined,
      hour12: true,
    }).format(d);
  } catch {
    return '—';
  }
}

/**
 * Format ISO timestamp into YYYY-MM-DDTHH:mm in Asia/Kathmandu timezone for datetime-local input fields.
 */
export function toNepalDateTimeInputString(isoString?: string | null): string {
  if (!isoString) return '';
  try {
    const raw = String(isoString).trim().replace(' ', 'T');
    const hasTz = /Z|[+-]\d{2}(:\d{2})?$/.test(raw);
    const withZ = hasTz ? raw : `${raw}Z`;
    const d = new Date(withZ);
    if (isNaN(d.getTime())) return '';
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: STORE_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(d);
    const map: Record<string, string> = {};
    parts.forEach((p) => {
      map[p.type] = p.value;
    });
    const hour = map.hour === '24' ? '00' : map.hour;
    return `${map.year}-${map.month}-${map.day}T${hour}:${map.minute}`;
  } catch {
    return '';
  }
}

/**
 * Convert a YYYY-MM-DDTHH:mm input in Nepal Standard Time to a UTC ISO string.
 */
export function nepalDateTimeInputToUtcIso(dateTimeLocalStr: string): string {
  if (!dateTimeLocalStr) return '';
  return new Date(`${dateTimeLocalStr}:00+05:45`).toISOString();
}
