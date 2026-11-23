/**
 * Centralized Brand & Regional Configuration
 * Update this single file to rename the platform or adjust default European/global settings.
 */

export const BRAND = {
  /** Provisional brand name — change here to rename across the UI */
  name: 'Clozito',
  /** Short uppercase identifier for print headers, invoices, and SKUs */
  shortName: 'CLOZITO',
  /** Default English tagline */
  taglineEn: 'Apparel, Inventory & Production Management Platform',
  /** Default Italian tagline */
  taglineIt: 'Piattaforma di Gestione Abbigliamento, Magazzino e Produzione',
  /** Contact & support info */
  supportEmail: 'support@clozito.com',
  websiteUrl: 'https://clozito.com',
  /** Default regional configuration */
  defaultLocale: 'en' as const,
  defaultCurrency: 'EUR' as const,
  defaultTimezone: 'Europe/Rome' as const,
  defaultVatRate: 22,
  /** License token prefix (legacy tokens remain supported for verification) */
  licensePrefix: 'CLZ1_',
} as const;

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
