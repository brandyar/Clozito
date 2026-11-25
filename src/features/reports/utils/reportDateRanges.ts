import { formatIsoDateString, getTodayIso } from '../../../utils/dateUtils';

export type DatePresetKey =
  | 'today'
  | 'yesterday'
  | 'last7days'
  | 'last30days'
  | 'thisMonth'
  | 'lastMonth'
  | 'thisSeason'
  | 'thisYear'
  | 'allTime'
  | 'custom';

export interface DateRangeResult {
  from: string; // YYYY-MM-DD
  to: string; // YYYY-MM-DD
}

export function calculateDateRange(preset: DatePresetKey, _legacyFlag?: boolean): DateRangeResult {
  const todayIso = getTodayIso();
  const now = new Date();

  if (preset === 'allTime') {
    return {
      from: '2020-01-01',
      to: todayIso,
    };
  }

  if (preset === 'today') {
    return {
      from: todayIso,
      to: todayIso,
    };
  }

  if (preset === 'yesterday') {
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const yIso = formatIsoDateString(yesterday.getFullYear(), yesterday.getMonth() + 1, yesterday.getDate());
    return {
      from: yIso,
      to: yIso,
    };
  }

  if (preset === 'last7days') {
    const past7 = new Date(now);
    past7.setDate(now.getDate() - 6);
    return {
      from: formatIsoDateString(past7.getFullYear(), past7.getMonth() + 1, past7.getDate()),
      to: todayIso,
    };
  }

  if (preset === 'last30days') {
    const past30 = new Date(now);
    past30.setDate(now.getDate() - 29);
    return {
      from: formatIsoDateString(past30.getFullYear(), past30.getMonth() + 1, past30.getDate()),
      to: todayIso,
    };
  }

  const gy = now.getFullYear();
  const gm = now.getMonth(); // 0-indexed

  if (preset === 'thisMonth') {
    return {
      from: formatIsoDateString(gy, gm + 1, 1),
      to: todayIso,
    };
  }

  if (preset === 'lastMonth') {
    const start = new Date(gy, gm - 1, 1);
    const end = new Date(gy, gm, 0);
    return {
      from: formatIsoDateString(start.getFullYear(), start.getMonth() + 1, start.getDate()),
      to: formatIsoDateString(end.getFullYear(), end.getMonth() + 1, end.getDate()),
    };
  }

  if (preset === 'thisSeason') {
    const quarterStartMonth = Math.floor(gm / 3) * 3;
    return {
      from: formatIsoDateString(gy, quarterStartMonth + 1, 1),
      to: todayIso,
    };
  }

  if (preset === 'thisYear') {
    return {
      from: formatIsoDateString(gy, 1, 1),
      to: todayIso,
    };
  }

  return {
    from: todayIso,
    to: todayIso,
  };
}
