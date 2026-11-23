/**
 * Clozito - Cryptographic Licensing & Machine Fingerprint Engine
 * Provides offline cryptographic signature verification, machine binding,
 * and module entitlement validation for hybrid desktop (Tauri) and web environments.
 */

import { OrganizationModule, SystemModule } from '../types';
import { formatCurrency } from './formatters';

// Secret verification salt for Tankhor module license signatures
// In enterprise deployment, this mirrors server-side Directus private signing key
const LICENSE_SIGN_SALT = 'TANKHOR_ENTITLEMENT_SECURE_SALT_v1_2026';

export interface LicensePayload {
  organization_id: number;
  slug: string;
  license_type: 'lifetime' | 'subscription' | 'pro_bundle';
  hardware_id?: string | null;
  issued_at: string;
  expires_at?: string | null;
}

export interface LicenseToken {
  payload: LicensePayload;
  signature: string;
}

/**
 * Computes SHA-256 hash using Web Crypto API
 */
export async function sha256(message: string): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  // Fallback simple hash if subtle crypto is not available
  let hash = 0;
  for (let i = 0; i < message.length; i++) {
    const char = message.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(16).padStart(64, '0');
}

/**
 * Gets or computes a persistent machine fingerprint for desktop/browser
 */
export function getMachineFingerprint(): string {
  if (typeof window === 'undefined') return 'TANKHOR_SERVER_ENV';

  let storedId = localStorage.getItem('tankhor_hardware_id');
  if (storedId && storedId.length >= 16) {
    return storedId;
  }

  // Derive stable fingerprint from browser/device characteristics
  const nav = window.navigator;
  const screen = window.screen;
  const rawParts = [
    nav.userAgent || '',
    nav.language || '',
    screen.colorDepth || '',
    screen.width || '',
    screen.height || '',
    nav.hardwareConcurrency || '',
    (nav as any).deviceMemory || '',
  ].join('###');

  // Simple synchronous hash for immediate seed
  let hash1 = 5381;
  let hash2 = 52711;
  for (let i = 0; i < rawParts.length; i++) {
    const char = rawParts.charCodeAt(i);
    hash1 = (hash1 * 33) ^ char;
    hash2 = (hash2 * 33) ^ char;
  }
  const hex1 = (hash1 >>> 0).toString(16).padStart(8, '0');
  const hex2 = (hash2 >>> 0).toString(16).padStart(8, '0');
  const randomSuffix = Math.random().toString(16).substring(2, 10);
  
  storedId = `HW-${hex1}-${hex2}-${randomSuffix}`.toUpperCase();
  try {
    localStorage.setItem('tankhor_hardware_id', storedId);
  } catch {}

  return storedId;
}

/**
 * Computes signature for a given payload
 */
export async function computeLicenseSignature(payload: LicensePayload): Promise<string> {
  const serialized = [
    payload.organization_id,
    payload.slug,
    payload.license_type,
    payload.hardware_id || 'ANY',
    payload.issued_at,
    payload.expires_at || 'NEVER',
    LICENSE_SIGN_SALT,
  ].join('|');

  return await sha256(serialized);
}

/**
 * Generates an exportable signed license token string.
 * Uses a compact format (TK1_...) to strictly adhere to database column length limits (< 150 chars).
 */
export async function generateLicenseTokenString(payload: LicensePayload): Promise<string> {
  const issuedSec = Math.floor(new Date(payload.issued_at).getTime() / 1000);
  const normalizedIssuedAt = new Date(issuedSec * 1000).toISOString();
  const hwid = payload.hardware_id ? String(payload.hardware_id).trim() : 'ANY';
  const expiresSec = payload.expires_at ? Math.floor(new Date(payload.expires_at).getTime() / 1000) : 'NEVER';
  const normalizedExpiresAt = expiresSec === 'NEVER' ? null : new Date(Number(expiresSec) * 1000).toISOString();

  const normalizedPayload: LicensePayload = {
    ...payload,
    issued_at: normalizedIssuedAt,
    expires_at: normalizedExpiresAt,
  };

  const signature = await computeLicenseSignature(normalizedPayload);

  return `CLZ1_${normalizedPayload.organization_id}_${normalizedPayload.slug}_${normalizedPayload.license_type}_${hwid}_${issuedSec}_${expiresSec}_${signature}`;
}

/**
 * Decodes and verifies a license token string (supports CLZ1_, legacy TK1_, and JSON base64 formats)
 */
export async function verifyLicenseTokenString(
  tokenStr: string,
  expectedOrgId?: number,
  expectedHardwareId?: string
): Promise<{ valid: boolean; payload?: LicensePayload; error?: string }> {
  try {
    const trimmed = tokenStr.trim();
    let payload: LicensePayload;
    let signature: string;

    if (trimmed.startsWith('CLZ1_') || trimmed.startsWith('TK1_')) {
      const parts = trimmed.split('_');
      if (parts.length < 8) {
        return { valid: false, error: 'INVALID_TOKEN_FORMAT' };
      }
      const orgId = Number(parts[1]);
      signature = parts[parts.length - 1];
      const expiresSec = parts[parts.length - 2];
      const issuedSec = Number(parts[parts.length - 3]);
      const hwidRaw = parts[parts.length - 4];
      const hwid = hwidRaw === 'ANY' ? null : hwidRaw;

      // Middle segment encodes `${slug}_${license_type}` (supports slugs like `online_catalog` and `pro_bundle`)
      const middle = parts.slice(2, parts.length - 4).join('_');
      let license_type: LicensePayload['license_type'] = 'lifetime';
      let slug = middle;
      if (middle.endsWith('_pro_bundle')) {
        license_type = 'pro_bundle';
        slug = middle.slice(0, -'_pro_bundle'.length);
      } else if (middle.endsWith('_subscription')) {
        license_type = 'subscription';
        slug = middle.slice(0, -'_subscription'.length);
      } else if (middle.endsWith('_lifetime')) {
        license_type = 'lifetime';
        slug = middle.slice(0, -'_lifetime'.length);
      } else {
        slug = parts[2];
        license_type = parts[3] as LicensePayload['license_type'];
      }

      payload = {
        organization_id: orgId,
        slug,
        license_type,
        hardware_id: hwid,
        issued_at: new Date(issuedSec * 1000).toISOString(),
        expires_at: expiresSec === 'NEVER' ? null : new Date(Number(expiresSec) * 1000).toISOString(),
      };
    } else {
      // Legacy base64/JSON format
      let rawJson: string;
      try {
        rawJson = decodeURIComponent(atob(trimmed));
      } catch {
        rawJson = Buffer.from(trimmed, 'base64').toString('utf-8');
      }
      const tokenObj: LicenseToken = JSON.parse(rawJson);

      if (!tokenObj || !tokenObj.payload || !tokenObj.signature) {
        return { valid: false, error: 'INVALID_FORMAT' };
      }
      payload = tokenObj.payload;
      signature = tokenObj.signature;
    }

    // 1. Verify cryptographic signature
    const expectedSig = await computeLicenseSignature(payload);
    if (expectedSig !== signature) {
      return { valid: false, error: 'SIGNATURE_MISMATCH' };
    }

    // 2. Verify organization match if expectedOrgId provided
    if (expectedOrgId && payload.organization_id !== expectedOrgId) {
      return { valid: false, error: 'ORGANIZATION_MISMATCH' };
    }

    // 3. Verify hardware binding if bound
    if (payload.hardware_id && payload.hardware_id !== 'ANY') {
      const currentHw = expectedHardwareId || getMachineFingerprint();
      if (payload.hardware_id.toUpperCase() !== currentHw.toUpperCase()) {
        return { valid: false, error: 'HARDWARE_MISMATCH' };
      }
    }

    // 4. Verify expiry date if time-limited
    if (payload.expires_at && payload.expires_at !== 'NEVER') {
      const expiry = new Date(payload.expires_at).getTime();
      if (Date.now() > expiry) {
        return { valid: false, error: 'LICENSE_EXPIRED' };
      }
    }

    return { valid: true, payload };
  } catch (err: any) {
    return { valid: false, error: err.message || 'DECODE_ERROR' };
  }
}

/**
 * Checks if an organization module has valid active entitlement
 */
export async function isModuleLicenseActive(
  module: OrganizationModule,
  expectedOrgId?: number
): Promise<boolean> {
  if (!module || module.status !== 'active') return false;

  // If expiry date passed
  if (module.expires_at) {
    const expiry = new Date(module.expires_at).getTime();
    if (Date.now() > expiry) return false;
  }

  // If license token is present, cryptographically verify it
  if (module.license_token) {
    const res = await verifyLicenseTokenString(module.license_token, expectedOrgId);
    return res.valid;
  }

  // If created via cloud directus admin without raw token, verify status
  return module.status === 'active';
}

const DEFAULT_MODULE_EUR_BY_SLUG: Record<string, number> = {
  barcode: 49,
  accounting: 79,
  woocommerce: 99,
  online_catalog: 59,
  production: 119,
};

/**
 * Formats a module price in EUR for the active locale ('en' | 'it')
 */
export function formatModulePrice(
  module?: { slug?: string; price_eur?: string | number | null; price_usd?: string | number | null; price_ir?: string | number | null } | null,
  locale: string = 'en'
): string {
  if (!module) return '';
  const isIt = locale === 'it';

  const candidates = [module.price_eur, module.price_usd];
  for (const raw of candidates) {
    if (raw !== undefined && raw !== null && String(raw).trim() !== '') {
      const num = Number(String(raw).replace(/[^0-9.]/g, ''));
      if (!isNaN(num) && num > 0) {
        return formatCurrency(num, 'EUR', false, isIt ? 'it' : 'en');
      }
    }
  }

  if (module.slug && DEFAULT_MODULE_EUR_BY_SLUG[module.slug]) {
    return formatCurrency(DEFAULT_MODULE_EUR_BY_SLUG[module.slug], 'EUR', false, isIt ? 'it' : 'en');
  }

  return isIt ? 'Contatta il supporto' : 'Contact Support';
}

/**
 * Fallback baseline catalog of add-on modules (EUR pricing)
 */
export const DEFAULT_SYSTEM_MODULES: SystemModule[] = [
  {
    id: 1,
    name: 'Barcode & Thermal Label Designer',
    slug: 'barcode',
    description: 'Custom label sizes, thermal printer support, batch printing, and international EAN-13 & CODE-128 barcodes.',
    icon: 'barcode',
    price_ir: '49',
    price_usd: '49',
    is_standalone_purchasable: true,
    included_in_pro: false,
    status: 'published',
  },
  {
    id: 2,
    name: 'Accounting & Financial Ledger',
    slug: 'accounting',
    description: 'P&L dashboard, expense tracking, financial accounts, party ledgers, EU VAT/IVA reporting, and Xero/QuickBooks/IFRS exports.',
    icon: 'calculator',
    price_ir: '79',
    price_usd: '79',
    is_standalone_purchasable: true,
    included_in_pro: false,
    status: 'published',
  },
  {
    id: 3,
    name: 'WooCommerce Store Sync',
    slug: 'woocommerce',
    description: 'Two-way WooCommerce integration with automated apparel variant stock & price synchronization and instant order import.',
    icon: 'shopping-bag',
    price_ir: '99',
    price_usd: '99',
    is_standalone_purchasable: true,
    included_in_pro: false,
    status: 'published',
  },
  {
    id: 4,
    name: 'Digital Showroom & Size Finder',
    slug: 'online_catalog',
    description: 'Shareable online lookbook & digital catalog with smart garment size recommendation engine, QR sharing, and quick inquiry dispatch.',
    icon: 'globe',
    price_ir: '59',
    price_usd: '59',
    is_standalone_purchasable: true,
    included_in_pro: false,
    status: 'published',
  },
  {
    id: 5,
    name: 'Garment Production & BOM',
    slug: 'production',
    description: 'Raw materials & trim inventory, Bills of Materials (BOM), cutting & sewing production orders, contractor ledgers, and unit costing.',
    icon: 'scissors',
    price_ir: '119',
    price_usd: '119',
    is_standalone_purchasable: true,
    included_in_pro: false,
    status: 'published',
  },
];

