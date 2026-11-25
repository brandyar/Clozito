/**
 * Clozito - Central Plan, Tier & Module Entitlement Configuration
 * Shared single source of truth across frontend UI, storage manager, and backend Stripe routes.
 *
 * Pricing Architecture:
 *  - free     : Desktop Local (€0 / Forever) — single-user offline SQLite; optional one-time offline modules
 *               ONLY for zero-server-cost modules (`barcode`, `accounting`, `production`).
 *  - boutique : Boutique Cloud (€29/mo) — Cloud Sync + Multi-User RBAC + Barcode + Digital Catalog + WooCommerce Sync.
 *  - atelier  : Atelier & Production Cloud (€49/mo) — Everything in Boutique + Garment Production/BOM + Accounting & VAT.
 *  - pro      : Legacy alias mapped identically to `atelier` for 100% backward compatibility.
 */

export type SubscriptionTier = 'boutique' | 'atelier';
export type NormalizedPlanTier = 'free' | 'boutique' | 'atelier';
export type PlanType = 'free' | 'boutique' | 'atelier' | 'pro';

export interface BillingCycleOption {
  durationMonths: 1 | 3 | 6 | 12;
  title: string;
  titleIt: string;
  priceEur: number;
  priceCents: number;
  monthlyEquivalentEur: number;
  discountPercent: number;
  interval: 'month' | 'year';
  intervalCount: number;
}

export interface SubscriptionTierDefinition {
  id: SubscriptionTier;
  name: string;
  nameIt: string;
  shortName: string;
  shortNameIt: string;
  tagline: string;
  taglineIt: string;
  badge?: string;
  badgeIt?: string;
  includedModules: readonly string[];
  highlights: readonly string[];
  highlightsIt: readonly string[];
  cycles: Record<1 | 3 | 6 | 12, BillingCycleOption>;
}

/**
 * Modules included automatically in each cloud tier.
 * Note: Both `production` and legacy alias `produce` are listed for compatibility.
 */
export const TIER_INCLUDED_MODULES: Record<NormalizedPlanTier, readonly string[]> = {
  free: [],
  boutique: ['barcode', 'online_catalog', 'woocommerce'],
  atelier: ['barcode', 'online_catalog', 'woocommerce', 'production', 'produce', 'accounting'],
} as const;

/**
 * Zero-server-cost modules eligible for optional one-time Desktop Offline licenses.
 */
export const OFFLINE_STANDALONE_MODULES = ['barcode', 'accounting', 'production', 'produce'] as const;

/**
 * Modules that rely on Clozito cloud servers, public URLs, or continuous API/webhook sync.
 * These are strictly included in Cloud Subscriptions (Boutique / Atelier) and NEVER sold as one-time lifetime licenses.
 */
export const CLOUD_ONLY_SUBSCRIPTION_MODULES = ['woocommerce', 'online_catalog'] as const;

/**
 * Authoritative EUR recurring pricing table for Boutique Cloud and Atelier & Production Cloud.
 * Server-side Stripe Checkout ALWAYS resolves unit_amount strictly from this table.
 */
export const SUBSCRIPTION_TIERS: Record<SubscriptionTier, SubscriptionTierDefinition> = {
  boutique: {
    id: 'boutique',
    name: 'Boutique Cloud',
    nameIt: 'Boutique Cloud',
    shortName: 'Boutique',
    shortNameIt: 'Boutique',
    tagline: 'For fashion boutiques, showrooms & omnichannel retailers',
    taglineIt: 'Per boutique, showroom e negozi di abbigliamento multicanale',
    includedModules: TIER_INCLUDED_MODULES.boutique,
    highlights: [
      'Real-time Cloud Sync across Web, Windows, macOS & Mobile',
      'Multi-User Team Access & Role-Based Permissions (RBAC)',
      'Barcode & Thermal Label Designer (EAN-13 / CODE-128)',
      'Digital Showroom & Smart Garment Size Finder',
      'Two-Way WooCommerce Store & Variant Stock Sync',
      'Automated Cloud Backups & EU GDPR Hosting',
    ],
    highlightsIt: [
      'Sincronizzazione Cloud in tempo reale su Web, Windows, macOS e Mobile',
      'Accesso multi-utente e permessi basati sui ruoli (RBAC)',
      'Designer di codici a barre ed etichette termiche (EAN-13 / CODE-128)',
      'Catalogo Digitale Online e Smart Size Finder per taglie',
      'Sincronizzazione bidirezionale WooCommerce per varianti e giacenze',
      'Backup cloud automatici e hosting conforme al GDPR UE',
    ],
    cycles: {
      1: {
        durationMonths: 1,
        title: 'Boutique Cloud — Monthly',
        titleIt: 'Boutique Cloud — Mensile',
        priceEur: 29,
        priceCents: 2900,
        monthlyEquivalentEur: 29,
        discountPercent: 0,
        interval: 'month',
        intervalCount: 1,
      },
      3: {
        durationMonths: 3,
        title: 'Boutique Cloud — Quarterly (3 Months)',
        titleIt: 'Boutique Cloud — Trimestrale (3 Mesi)',
        priceEur: 79,
        priceCents: 7900,
        monthlyEquivalentEur: 26.33,
        discountPercent: 9,
        interval: 'month',
        intervalCount: 3,
      },
      6: {
        durationMonths: 6,
        title: 'Boutique Cloud — Semi-Annual (6 Months)',
        titleIt: 'Boutique Cloud — Semestrale (6 Mesi)',
        priceEur: 149,
        priceCents: 14900,
        monthlyEquivalentEur: 24.83,
        discountPercent: 14,
        interval: 'month',
        intervalCount: 6,
      },
      12: {
        durationMonths: 12,
        title: 'Boutique Cloud — Annual (12 Months)',
        titleIt: 'Boutique Cloud — Annuale (12 Mesi)',
        priceEur: 269,
        priceCents: 26900,
        monthlyEquivalentEur: 22.42,
        discountPercent: 23,
        interval: 'year',
        intervalCount: 1,
      },
    },
  },
  atelier: {
    id: 'atelier',
    name: 'Atelier & Production Cloud',
    nameIt: 'Atelier & Produzione Cloud',
    shortName: 'Atelier',
    shortNameIt: 'Atelier',
    tagline: 'Complete ERP for apparel brands, ateliers & garment manufacturers',
    taglineIt: 'ERP completo per brand di moda, atelier e laboratori sartoriali',
    badge: 'All-Inclusive',
    badgeIt: 'Tutto Incluso',
    includedModules: TIER_INCLUDED_MODULES.atelier,
    highlights: [
      'Everything included in Boutique Cloud',
      'Garment Production Orders, Cut Batches & Unit Costing',
      'Bills of Materials (BOM), Fabrics & Raw Materials Inventory',
      'External Workshop & Contractor Ledgers',
      'Full Accounting, P&L Dashboard & Financial Accounts',
      'EU VAT / IVA Reports & Xero / QuickBooks / IFRS Exports',
    ],
    highlightsIt: [
      'Tutto ciò che è incluso in Boutique Cloud',
      'Ordini di produzione sartoriale, lotti di taglio e costi unitari',
      'Distinte Base (BOM), tessuti e magazzino materie prime',
      'Contabilità laboratori esterni e fornitori conto terzi',
      'Contabilità completa, Conto Economico (P&L) e conti finanziari',
      'Report IVA UE ed esportazioni Xero / QuickBooks / IFRS',
    ],
    cycles: {
      1: {
        durationMonths: 1,
        title: 'Atelier & Production Cloud — Monthly',
        titleIt: 'Atelier & Produzione Cloud — Mensile',
        priceEur: 49,
        priceCents: 4900,
        monthlyEquivalentEur: 49,
        discountPercent: 0,
        interval: 'month',
        intervalCount: 1,
      },
      3: {
        durationMonths: 3,
        title: 'Atelier & Production Cloud — Quarterly (3 Months)',
        titleIt: 'Atelier & Produzione Cloud — Trimestrale (3 Mesi)',
        priceEur: 135,
        priceCents: 13500,
        monthlyEquivalentEur: 45,
        discountPercent: 8,
        interval: 'month',
        intervalCount: 3,
      },
      6: {
        durationMonths: 6,
        title: 'Atelier & Production Cloud — Semi-Annual (6 Months)',
        titleIt: 'Atelier & Produzione Cloud — Semestrale (6 Mesi)',
        priceEur: 259,
        priceCents: 25900,
        monthlyEquivalentEur: 43.17,
        discountPercent: 12,
        interval: 'month',
        intervalCount: 6,
      },
      12: {
        durationMonths: 12,
        title: 'Atelier & Production Cloud — Annual (12 Months)',
        titleIt: 'Atelier & Produzione Cloud — Annuale (12 Mesi)',
        priceEur: 469,
        priceCents: 46900,
        monthlyEquivalentEur: 39.08,
        discountPercent: 20,
        interval: 'year',
        intervalCount: 1,
      },
    },
  },
};

/**
 * Returns true if the plan string represents an active Cloud Subscription tier
 * (Boutique, Atelier, or legacy Pro).
 */
export function isPaidCloudPlan(plan?: string | null): boolean {
  const p = String(plan || '').trim().toLowerCase();
  return p === 'boutique' || p === 'atelier' || p === 'pro';
}

/**
 * Normalizes any organization plan value (`free`, `boutique`, `atelier`, legacy `pro`)
 * into the canonical 3-tier hierarchy (`free` | `boutique` | `atelier`).
 */
export function normalizePlanTier(plan?: string | null): NormalizedPlanTier {
  const p = String(plan || '').trim().toLowerCase();
  if (p === 'atelier' || p === 'pro') return 'atelier';
  if (p === 'boutique') return 'boutique';
  return 'free';
}

/**
 * Strictly validates a requested subscription tier from client/Stripe metadata.
 */
export function parseSubscriptionTier(value: unknown, fallback: SubscriptionTier = 'atelier'): SubscriptionTier {
  const v = String(value || '').trim().toLowerCase();
  if (v === 'boutique') return 'boutique';
  if (v === 'atelier' || v === 'pro') return 'atelier';
  return fallback;
}

/**
 * Returns true if a given module slug is automatically unlocked by the organization's plan.
 */
export function isModuleIncludedInPlan(plan: string | null | undefined, moduleSlug: string): boolean {
  const normalizedTier = normalizePlanTier(plan);
  const cleanSlug = String(moduleSlug || '').trim().toLowerCase();
  return TIER_INCLUDED_MODULES[normalizedTier].includes(cleanSlug);
}

/**
 * Returns the minimum Cloud Subscription tier that includes the given module.
 */
export function getRequiredTierForModule(moduleSlug: string): SubscriptionTier {
  const cleanSlug = String(moduleSlug || '').trim().toLowerCase();
  if (TIER_INCLUDED_MODULES.boutique.includes(cleanSlug)) {
    return 'boutique';
  }
  return 'atelier';
}

/**
 * Returns true ONLY for zero-server-cost modules allowed to be sold as one-time Desktop Offline add-ons.
 */
export function isModuleOfflinePurchasable(moduleSlug: string): boolean {
  const cleanSlug = String(moduleSlug || '').trim().toLowerCase();
  return (OFFLINE_STANDALONE_MODULES as readonly string[]).includes(cleanSlug);
}

/**
 * Returns true if a module requires a Cloud Subscription and cannot be bought as a one-time offline license.
 */
export function isCloudOnlyModule(moduleSlug: string): boolean {
  const cleanSlug = String(moduleSlug || '').trim().toLowerCase();
  return (CLOUD_ONLY_SUBSCRIPTION_MODULES as readonly string[]).includes(cleanSlug);
}

/**
 * Human-readable localized plan display name.
 */
export function getPlanDisplayName(plan?: string | null, locale: string = 'en'): string {
  const isIt = locale === 'it';
  const tier = normalizePlanTier(plan);
  if (tier === 'atelier') {
    return isIt ? 'Atelier & Produzione Cloud' : 'Atelier & Production Cloud';
  }
  if (tier === 'boutique') {
    return 'Boutique Cloud';
  }
  return isIt ? 'Desktop Locale (Gratuito)' : 'Desktop Local (Free)';
}

/**
 * Short badge label for headers and status pills.
 */
export function getPlanShortBadge(plan?: string | null, locale: string = 'en'): string {
  const isIt = locale === 'it';
  const tier = normalizePlanTier(plan);
  if (tier === 'atelier') return 'Atelier Cloud';
  if (tier === 'boutique') return 'Boutique Cloud';
  return isIt ? 'Gratuito' : 'Free';
}
