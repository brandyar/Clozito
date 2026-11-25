/**
 * Gregorian Date Formatting & Manipulation Utilities
 */

export interface GregorianDate {
  gy: number; // Gregorian year (e.g. 2026)
  gm: number; // Gregorian month (1 - 12)
  gd: number; // Gregorian day (1 - 31)
}

export const GREGORIAN_MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

export const GREGORIAN_WEEKDAYS = [
  { key: 'su', label: 'Sunday', short: 'Su' },
  { key: 'mo', label: 'Monday', short: 'Mo' },
  { key: 'tu', label: 'Tuesday', short: 'Tu' },
  { key: 'we', label: 'Wednesday', short: 'We' },
  { key: 'th', label: 'Thursday', short: 'Th' },
  { key: 'fr', label: 'Friday', short: 'Fr' },
  { key: 'sa', label: 'Saturday', short: 'Sa' },
] as const;

/**
 * Formats a Gregorian year/month/day into a standard YYYY-MM-DD string.
 */
export function formatIsoDateString(year: number, month: number, day: number): string {
  const m = String(month).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${year}-${m}-${d}`;
}

/**
 * Returns today's ISO date string (YYYY-MM-DD).
 */
export function getTodayIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
