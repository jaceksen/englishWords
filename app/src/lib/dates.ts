import type { Translations, UiLanguage } from '@/i18n';

export type RangeKey = 'today' | 'week' | 'last7' | 'all';

export const RANGE_KEYS: RangeKey[] = ['today', 'week', 'last7', 'all'];

/** Local-time day key, e.g. "2026-10-27". */
export function dayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** Start of the range (inclusive), or null for "all". Weeks start on Monday. */
export function rangeStart(range: RangeKey, now = new Date()): Date | null {
  const today = startOfDay(now);
  switch (range) {
    case 'today':
      return today;
    case 'week': {
      const daysSinceMonday = (today.getDay() + 6) % 7;
      return new Date(today.getFullYear(), today.getMonth(), today.getDate() - daysSinceMonday);
    }
    case 'last7':
      return new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6);
    case 'all':
      return null;
  }
}

export function formatDayHeader(key: string, t: Translations, uiLanguage: UiLanguage) {
  const today = dayKey();
  const yesterday = dayKey(new Date(Date.now() - 24 * 60 * 60 * 1000));
  if (key === today) return t.words.today;
  if (key === yesterday) return t.words.yesterday;
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(uiLanguage.locale, { weekday: 'long', day: 'numeric', month: 'long' });
}
