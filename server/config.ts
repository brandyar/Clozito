import dotenv from 'dotenv';
dotenv.config();

/**
 * Centralized Server Configuration for Clozito BFF Gateway.
 * Single source of truth for canonical URLs, allowed CORS origins, and runtime flags.
 */

export function sanitizeOriginUrl(rawUrl?: string | null): string | null {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  const trimmed = rawUrl.trim().replace(/^["']|["']$/g, '').trim();
  if (!trimmed) return null;

  // Reject raw API tokens accidentally placed in URL env vars
  if (
    !trimmed.includes('.') &&
    !trimmed.includes('/') &&
    !trimmed.includes(':') &&
    !trimmed.startsWith('localhost')
  ) {
    return null;
  }

  let normalized = trimmed;
  if (!/^https?:\/\//i.test(normalized)) {
    if (normalized.startsWith('localhost') || normalized.startsWith('127.0.0.1')) {
      normalized = `http://${normalized}`;
    } else {
      normalized = `https://${normalized}`;
    }
  }

  try {
    const parsed = new URL(normalized);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    return parsed.origin;
  } catch {
    return null;
  }
}

export function sanitizeBaseUrl(rawUrl?: string | null, fallback = 'https://api.clozito.com'): string {
  if (!rawUrl || typeof rawUrl !== 'string') return fallback;
  const trimmed = rawUrl.trim().replace(/^["']|["']$/g, '').trim();
  if (!trimmed) return fallback;

  // Reject raw tokens without domain structure
  if (
    !trimmed.includes('.') &&
    !trimmed.includes('/') &&
    !trimmed.includes(':') &&
    !trimmed.startsWith('localhost')
  ) {
    return fallback;
  }

  let normalized = trimmed;
  if (!/^https?:\/\//i.test(normalized)) {
    if (normalized.startsWith('localhost') || normalized.startsWith('127.0.0.1')) {
      normalized = `http://${normalized}`;
    } else {
      normalized = `https://${normalized}`;
    }
  }

  return normalized.replace(/\/+$/, '');
}

const DEFAULT_APP_URL = 'https://app.clozito.com';
const DEFAULT_WEBSITE_URL = 'https://clozito.com';
const DEFAULT_DIRECTUS_URL = 'https://api.clozito.com';
const DEFAULT_DOWNLOADS_URL = 'https://dl.clozito.com';

const TAURI_DESKTOP_ORIGINS = [
  'tauri://localhost',
  'http://tauri.localhost',
  'https://tauri.localhost',
] as const;

function buildAllowedOrigins(): Set<string> {
  const origins = new Set<string>([
    DEFAULT_APP_URL,
    DEFAULT_WEBSITE_URL,
    'https://www.clozito.com',
    ...TAURI_DESKTOP_ORIGINS,
  ]);

  const appOrigin = sanitizeOriginUrl(process.env.APP_URL);
  if (appOrigin) origins.add(appOrigin);

  const websiteOrigin = sanitizeOriginUrl(process.env.WEBSITE_URL);
  if (websiteOrigin) origins.add(websiteOrigin);

  const extraRaw = process.env.ALLOWED_ORIGINS || process.env.CORS_ORIGINS || '';
  if (extraRaw) {
    for (const entry of extraRaw.split(',')) {
      const cleaned = entry.trim();
      if (!cleaned) continue;
      if (cleaned.startsWith('tauri://')) {
        origins.add(cleaned.replace(/\/+$/, ''));
        continue;
      }
      const parsedOrigin = sanitizeOriginUrl(cleaned);
      if (parsedOrigin) origins.add(parsedOrigin);
    }
  }

  return origins;
}

export const SERVER_CONFIG = {
  get isProduction(): boolean {
    return process.env.NODE_ENV === 'production';
  },

  get port(): number {
    const parsed = Number(process.env.PORT);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 3000;
  },

  get appUrl(): string {
    return sanitizeOriginUrl(process.env.APP_URL) || DEFAULT_APP_URL;
  },

  get websiteUrl(): string {
    return sanitizeOriginUrl(process.env.WEBSITE_URL) || DEFAULT_WEBSITE_URL;
  },

  get directusUrl(): string {
    const candidate =
      process.env.DIRECTUS_URL ||
      process.env.VITE_DIRECTUS_URL ||
      process.env.DIRECTUS_API_URL ||
      process.env.API_URL;
    return sanitizeBaseUrl(candidate, DEFAULT_DIRECTUS_URL);
  },

  get downloadsUrl(): string {
    return sanitizeBaseUrl(process.env.DOWNLOAD_BASE_URL, DEFAULT_DOWNLOADS_URL);
  },

  get allowedOrigins(): Set<string> {
    return buildAllowedOrigins();
  },

  get allowIframeEmbedding(): boolean {
    return process.env.ALLOW_IFRAME_EMBEDDING === 'true' || process.env.NODE_ENV !== 'production';
  },
} as const;
