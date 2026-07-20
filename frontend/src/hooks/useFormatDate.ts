import { useCallback } from 'react';
import { useStoreSettings } from '@/hooks/useSettings';
import { formatDate } from '@/utils';
import type { CalendarSystem } from '@/utils/nepaliDate';

export function useCalendarSystem(): CalendarSystem {
  const { data } = useStoreSettings();
  return data?.calendarSystem ?? 'BS';
}

export function useFormatDate() {
  const calendar = useCalendarSystem();
  return useCallback((date: string | Date) => formatDate(date, calendar), [calendar]);
}
