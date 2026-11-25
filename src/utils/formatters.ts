/**
 * Localization & Formatting Utilities for Clozito (Global / European Edition)
 * Default currency: EUR (€) with 2-decimal precision and locale-aware formatting (en / it).
 */

import { BRAND } from '../config/brand';

export function getActiveLocale(): 'en' | 'it' {
  if (typeof document !== 'undefined' && document.documentElement?.lang === 'it') {
    return 'it';
  }
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem('clozito_locale') || localStorage.getItem('tankhor_locale');
    if (saved === 'it') return 'it';
  }
  return 'en';
}

export function getActiveIntlLocale(): string {
  return getActiveLocale() === 'it' ? 'it-IT' : 'en-IE';
}

/**
 * Legacy helper retained for backward compatibility across components.
 * Persian locale has been replaced with Italian (it) and English (en).
 */
export function isCurrentLocalePersian(): boolean {
  return false;
}

/**
 * Legacy helper retained for backward compatibility across components.
 * Always outputs standard Western Arabic numerals.
 */
export function toPersianDigits(num: number | string | undefined | null, _force: boolean = false): string {
  if (num === undefined || num === null) return '';
  return String(num);
}

/**
 * Normalizes legacy currency codes (such as TOMAN/IRT/IRR) to EUR by default
 * while preserving valid ISO-4217 global currencies (EUR, USD, GBP, CHF, etc.).
 */
export function resolveCurrencyCode(currency?: string | null): string {
  if (!currency) return BRAND.defaultCurrency;
  const upper = String(currency).trim().toUpperCase();
  if (!upper || upper === 'TOMAN' || upper === 'IRT' || upper === 'IRR') {
    return BRAND.defaultCurrency;
  }
  return upper;
}

/**
 * Rounds any monetary amount to 2 decimal places (cents precision) without float drift.
 */
export function roundCurrency(amount: number | string | undefined | null): number {
  const num = typeof amount === 'number' ? amount : Number(amount);
  if (!Number.isFinite(num)) return 0;
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

/**
 * Resolves the effective VAT / Tax rate (%) for an organization.
 * Checks organization.default_tax_rate first, then per-org local cache, then BRAND.defaultVatRate (22%).
 */
export function getOrganizationTaxRate(org?: { id?: number; default_tax_rate?: number | string | null } | null): number {
  const raw = org?.default_tax_rate;
  if (raw !== undefined && raw !== null && raw !== '') {
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 100) {
      return roundCurrency(parsed);
    }
  }
  if (typeof window !== 'undefined' && org?.id) {
    try {
      const cached = localStorage.getItem(`clozito_org_vat_${org.id}`);
      if (cached !== null && cached !== '') {
        const parsed = Number(cached);
        if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 100) {
          return roundCurrency(parsed);
        }
      }
    } catch {
      // ignore storage errors
    }
  }
  return BRAND.defaultVatRate;
}

export function saveOrganizationTaxRateCache(orgId?: number | null, rate?: number | null): void {
  if (typeof window === 'undefined' || !orgId || rate === undefined || rate === null) return;
  const parsed = Number(rate);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) return;
  try {
    localStorage.setItem(`clozito_org_vat_${orgId}`, String(roundCurrency(parsed)));
  } catch {
    // ignore storage errors
  }
}

export interface FiscalMetadata {
  vat_number?: string | null;
  tax_code?: string | null;
}

export function getFiscalMetadataCache(entity: 'org' | 'customer', id?: number | null): FiscalMetadata {
  if (typeof window === 'undefined' || !id) return {};
  try {
    const raw = localStorage.getItem(`clozito_${entity}_fiscal_${id}`);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return {
      vat_number: typeof parsed?.vat_number === 'string' ? parsed.vat_number : null,
      tax_code: typeof parsed?.tax_code === 'string' ? parsed.tax_code : null,
    };
  } catch {
    return {};
  }
}

export function saveFiscalMetadataCache(entity: 'org' | 'customer', id?: number | null, meta?: FiscalMetadata): void {
  if (typeof window === 'undefined' || !id || !meta) return;
  try {
    const existing = getFiscalMetadataCache(entity, id);
    const next: FiscalMetadata = {
      vat_number: meta.vat_number !== undefined ? (meta.vat_number?.trim() || null) : existing.vat_number ?? null,
      tax_code: meta.tax_code !== undefined ? (meta.tax_code?.trim() || null) : existing.tax_code ?? null,
    };
    localStorage.setItem(`clozito_${entity}_fiscal_${id}`, JSON.stringify(next));
  } catch {
    // ignore storage errors
  }
}


/**
 * Formats monetary amounts with 2-decimal precision according to active locale and currency.
 * - Italian (it-IT): 1.250,50 €
 * - English (en-IE): €1,250.50
 */
export function formatCurrency(
  amount: number | string | undefined | null,
  currency: string = BRAND.defaultCurrency,
  _isPersian?: boolean,
  localeOverride?: 'en' | 'it'
): string {
  if (amount === undefined || amount === null || amount === '') return '-';

  const num = typeof amount === 'number' ? amount : Number(amount);
  if (isNaN(num)) return '-';

  const resolvedCurrency = resolveCurrencyCode(currency);
  const intlLocale = localeOverride ? (localeOverride === 'it' ? 'it-IT' : 'en-IE') : getActiveIntlLocale();

  try {
    return new Intl.NumberFormat(intlLocale, {
      style: 'currency',
      currency: resolvedCurrency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num);
  } catch {
    const fallbackNum = new Intl.NumberFormat(intlLocale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num);
    return `${fallbackNum} ${resolvedCurrency}`;
  }
}

/**
 * Formats ISO date string to localized Gregorian date (English or Italian).
 */
export function formatDate(
  isoString?: string | null,
  _isPersian?: boolean,
  localeOverride?: 'en' | 'it'
): string {
  if (!isoString) return '-';
  try {
    let date: Date;
    const clean = String(isoString).trim().slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
      const [gy, gm, gd] = clean.split('-').map(Number);
      date = new Date(gy, gm - 1, gd, 12, 0, 0);
    } else {
      date = new Date(isoString);
    }

    if (isNaN(date.getTime())) return String(isoString);

    const intlLocale = localeOverride ? (localeOverride === 'it' ? 'it-IT' : 'en-IE') : getActiveIntlLocale();

    return new Intl.DateTimeFormat(intlLocale, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(date);
  } catch {
    return String(isoString);
  }
}

export const formatPersianDate = formatDate;

/**
 * Formats ISO date string to numeric Gregorian format:
 * - Italian: DD/MM/YYYY
 * - English: YYYY-MM-DD
 */
export function formatDateNumeric(isoString?: string | null, _isPersian?: boolean): string {
  if (!isoString) return '-';
  try {
    const clean = String(isoString).trim().slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
      if (getActiveLocale() === 'it') {
        const [y, m, d] = clean.split('-');
        return `${d}/${m}/${y}`;
      }
      return clean;
    }
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return String(isoString);
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return getActiveLocale() === 'it' ? `${d}/${m}/${y}` : `${y}-${m}-${d}`;
  } catch {
    return String(isoString);
  }
}

/**
 * Safely extracts numeric ID from number, string, or object like { id: number }
 */
export function normalizeId(val: any): number | undefined {
  if (val === undefined || val === null || val === '') return undefined;
  if (typeof val === 'number') {
    return !isNaN(val) && val > 0 ? val : undefined;
  }
  if (typeof val === 'object' && val !== null && 'id' in val) {
    const parsed = Number(val.id);
    return !isNaN(parsed) && parsed > 0 ? parsed : undefined;
  }
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!trimmed || isNaN(Number(trimmed))) return undefined;
    const parsed = Number(trimmed);
    return parsed > 0 ? parsed : undefined;
  }
  return undefined;
}

/**
 * Normalizes European/English/Italian text (including accented Latin characters) for fuzzy search.
 */
export function normalizeSearchText(str?: string | number | null): string {
  if (str === undefined || str === null) return '';
  return String(str)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[-_/\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Checks if a search query matches one or more target strings using multi-token matching.
 */
export function matchesSearchQuery(
  query?: string | null,
  ...targets: Array<string | number | undefined | null>
): boolean {
  if (!query) return true;
  const normQuery = normalizeSearchText(query);
  if (!normQuery) return true;

  const queryTokens = normQuery.split(' ').filter(Boolean);
  const combinedTarget = normalizeSearchText(targets.filter((t) => t !== undefined && t !== null).join(' '));

  return queryTokens.every((token) => combinedTarget.includes(token));
}
