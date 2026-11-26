/**
 * Centralized Brand & Regional Configuration
 * Update this single file to rename the platform or adjust default European/global settings.
 */

const metaEnv: Record<string, string | undefined> =
  typeof import.meta !== 'undefined' && (import.meta as any).env
    ? (import.meta as any).env
    : {};

const trimTrailingSlash = (url: string) => url.replace(/\/+$/, '');

const APP_URL = trimTrailingSlash(metaEnv.VITE_APP_URL || 'https://app.clozito.com');
const WEBSITE_URL = trimTrailingSlash(metaEnv.VITE_WEBSITE_URL || 'https://clozito.com');
const API_GATEWAY_URL = trimTrailingSlash(
  metaEnv.VITE_GATEWAY_URL || metaEnv.VITE_API_URL || `${APP_URL}/api`
);
const DIRECTUS_API_URL = trimTrailingSlash(metaEnv.VITE_DIRECTUS_URL || 'https://api.clozito.com');
const DOWNLOADS_URL = trimTrailingSlash(metaEnv.VITE_DOWNLOADS_URL || 'https://dl.clozito.com');

export const BRAND = {
  /** Official brand name */
  name: 'Clozito',
  /** Short uppercase identifier for print headers, invoices, and SKUs */
  shortName: 'CLOZITO',
  /** Default English tagline */
  taglineEn: 'Apparel, Inventory & Production Management Platform',
  /** Default Italian tagline */
  taglineIt: 'Piattaforma di Gestione Abbigliamento, Magazzino e Produzione',
  /** Contact & support info */
  supportEmail: 'support@clozito.com',
  websiteUrl: WEBSITE_URL,
  /** Official web application domain */
  appUrl: APP_URL,
  /** Official BFF API Gateway base URL (used by desktop & mobile clients) */
  apiGatewayUrl: API_GATEWAY_URL,
  /** Direct cloud API URL (centralized, configurable via VITE_DIRECTUS_URL) */
  directusApiUrl: DIRECTUS_API_URL,
  /** Official desktop & mobile downloads CDN */
  downloadsUrl: DOWNLOADS_URL,
  /** Default regional configuration */
  defaultLocale: 'en' as const,
  defaultCurrency: 'EUR' as const,
  defaultTimezone: 'Europe/Rome' as const,
  defaultVatRate: 22,
  /** License token prefix (legacy tokens remain supported for verification) */
  licensePrefix: 'CLZ1_',
  /** Brand logo assets */
  logoDark: '/logo-dark.png',
  logoLight: '/logo-light.png',
  favicon: '/favicon.png',
} as const;

/**
 * Returns the public HTTP(S) application origin suitable for shareable links
 * (Digital Catalog, QR codes, WooCommerce webhooks).
 * Automatically falls back to BRAND.appUrl (https://app.clozito.com) in Tauri desktop/mobile WebViews.
 */
export function getPublicAppOrigin(): string {
  if (typeof window !== 'undefined' && window.location) {
    const { protocol, hostname, origin } = window.location;
    const isTauriWebView =
      protocol.includes('tauri') ||
      hostname === 'tauri.localhost' ||
      Boolean((window as any).__TAURI__) ||
      Boolean((window as any).__TAURI_INTERNALS__);

    if (!isTauriWebView && (protocol === 'https:' || protocol === 'http:') && origin) {
      return trimTrailingSlash(origin);
    }
  }
  return BRAND.appUrl;
}

export const SUPPORTED_CURRENCIES = [
  { code: 'EUR', symbol: '€', labelEn: 'Euro (€)', labelIt: 'Euro (€)' },
  { code: 'USD', symbol: '$', labelEn: 'US Dollar ($)', labelIt: 'Dollaro USA ($)' },
  { code: 'GBP', symbol: '£', labelEn: 'British Pound (£)', labelIt: 'Sterlina Britannica (£)' },
  { code: 'CHF', symbol: 'CHF', labelEn: 'Swiss Franc (CHF)', labelIt: 'Franco Svizzero (CHF)' },
] as const;

export const SUPPORTED_TIMEZONES = [
  { value: 'Europe/Rome', label: 'Europe/Rome (CET / CEST)' },
  { value: 'Europe/London', label: 'Europe/London (GMT / BST)' },
  { value: 'Europe/Berlin', label: 'Europe/Berlin (CET / CEST)' },
  { value: 'Europe/Paris', label: 'Europe/Paris (CET / CEST)' },
  { value: 'Europe/Madrid', label: 'Europe/Madrid (CET / CEST)' },
  { value: 'Europe/Zurich', label: 'Europe/Zurich (CET / CEST)' },
  { value: 'UTC', label: 'UTC (Coordinated Universal Time)' },
  { value: 'America/New_York', label: 'America/New_York (EST / EDT)' },
] as const;

export const EU_VAT_PRESETS = [
  { rate: 22, label: '22% (Italy Standard IVA)' },
  { rate: 21, label: '21% (Spain / Netherlands / Belgium)' },
  { rate: 20, label: '20% (France / UK / Austria)' },
  { rate: 19, label: '19% (Germany)' },
  { rate: 10, label: '10% (Italy Reduced IVA)' },
  { rate: 4, label: '4% (Italy Super-Reduced IVA)' },
  { rate: 0, label: '0% (Exempt / Export)' },
] as const;
