import { Request, Response, NextFunction, RequestHandler } from 'express';
import net from 'net';
import { SERVER_CONFIG, sanitizeOriginUrl } from './config';

/**
 * Production Security Hardening Utilities for Clozito BFF Gateway:
 * - Strict CORS origin enforcement (zero wildcard `*` responses)
 * - Defense-in-depth HTTP security headers (HSTS, CSP, nosniff, Referrer-Policy, Permissions-Policy)
 * - In-memory sliding-window rate limiters for Auth & Public endpoints
 * - Outbound SSRF protection for user-supplied WooCommerce store URLs
 * - Production error sanitization to prevent leaking internal infrastructure details
 */

const ALLOWED_CORS_METHODS = 'GET, POST, PUT, PATCH, DELETE, OPTIONS';
const ALLOWED_CORS_HEADERS =
  'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-Clozito-Platform, X-Tankhor-Platform';

/**
 * Checks whether an incoming Origin header is permitted to access the BFF API.
 */
export function isAllowedOrigin(origin: string | undefined, req: Request): boolean {
  if (!origin) return true; // Non-browser / server-to-server / same-origin navigation requests

  const normalized = origin.trim().replace(/\/+$/, '');
  if (!normalized || normalized === 'null') {
    return false;
  }

  // 1. Explicit allowlist (official production domains, Tauri desktop WebViews, ALLOWED_ORIGINS env)
  if (SERVER_CONFIG.allowedOrigins.has(normalized)) {
    return true;
  }

  // 2. Same-origin check against Host / X-Forwarded-Host (supports reverse-proxied deployments)
  const forwardedHost = req.headers['x-forwarded-host'];
  const rawHost =
    (Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost) || req.get('host') || '';
  const cleanHost = rawHost.split(',')[0].trim().toLowerCase();
  if (cleanHost) {
    try {
      const parsedOrigin = new URL(normalized);
      if (parsedOrigin.host.toLowerCase() === cleanHost) {
        return true;
      }
    } catch {
      return false;
    }
  }

  // 3. Development / preview origins (strictly disabled in production)
  if (!SERVER_CONFIG.isProduction) {
    try {
      const parsed = new URL(normalized);
      const hostname = parsed.hostname.toLowerCase();
      if (
        hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname === '[::1]' ||
        hostname.endsWith('.run.app')
      ) {
        return true;
      }
    } catch {
      return false;
    }
  }

  return false;
}

/**
 * Strict CORS middleware replacing wildcard `*`.
 * Only echoes explicitly verified origins and rejects unauthorized preflight requests.
 */
export function createCorsMiddleware(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;
    res.vary('Origin');

    if (origin) {
      if (isAllowedOrigin(origin, req)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Access-Control-Allow-Methods', ALLOWED_CORS_METHODS);
        res.setHeader('Access-Control-Allow-Headers', ALLOWED_CORS_HEADERS);
        res.setHeader('Access-Control-Max-Age', '86400');
      } else if (req.method === 'OPTIONS') {
        return res.status(403).json({ error: 'Origin not allowed by CORS policy.' });
      }
    }

    if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }

    next();
  };
}

/**
 * Builds Content-Security-Policy header value suitable for Clozito SPA & Stripe Billing.
 */
function buildContentSecurityPolicy(isHttps: boolean): string {
  const directusOrigin = sanitizeOriginUrl(SERVER_CONFIG.directusUrl);
  const appOrigin = sanitizeOriginUrl(SERVER_CONFIG.appUrl);
  const connectSources = new Set<string>([
    "'self'",
    'https://app.clozito.com',
    'https://api.clozito.com',
    'https://dl.clozito.com',
    'https://api.stripe.com',
    'https://checkout.stripe.com',
  ]);
  if (directusOrigin) connectSources.add(directusOrigin);
  if (appOrigin) connectSources.add(appOrigin);

  const directives = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: blob: https:",
    `connect-src ${Array.from(connectSources).join(' ')}`,
    "frame-src 'self' https://checkout.stripe.com https://billing.stripe.com",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self' https://checkout.stripe.com https://billing.stripe.com",
  ];

  if (!SERVER_CONFIG.allowIframeEmbedding) {
    directives.push("frame-ancestors 'self'");
  }

  if (isHttps && SERVER_CONFIG.isProduction) {
    directives.push('upgrade-insecure-requests');
  }

  return directives.join('; ');
}

/**
 * Sets standard defense-in-depth HTTP security headers on all responses.
 */
export function securityHeadersMiddleware(req: Request, res: Response, next: NextFunction): void {
  const forwardedProto = req.headers['x-forwarded-proto'];
  const proto = Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto;
  const isHttps = req.secure || proto === 'https';

  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-DNS-Prefetch-Control', 'off');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  // Camera allowed on self for WebcamBarcodeScannerModal
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=(), payment=(self)');

  if (SERVER_CONFIG.isProduction) {
    if (isHttps) {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    if (!SERVER_CONFIG.allowIframeEmbedding) {
      res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    }
    res.setHeader('Content-Security-Policy', buildContentSecurityPolicy(isHttps));
  }

  next();
}

/**
 * Resolves the best-effort client IP address (compatible with Express trust proxy).
 */
function getClientIp(req: Request): string {
  const ip = req.ip || req.socket?.remoteAddress || 'unknown';
  return String(ip).replace(/^::ffff:/, '');
}

interface RateLimitOptions {
  windowMs: number;
  maxRequests: number;
  keyPrefix: string;
  keyGenerator?: (req: Request) => string;
  message?: string;
}

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

const activeRateLimitStores: Array<Map<string, RateLimitBucket>> = [];

// Periodic garbage collection to keep memory bounded
const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const store of activeRateLimitStores) {
    for (const [key, bucket] of store.entries()) {
      if (bucket.resetAt <= now) {
        store.delete(key);
      }
    }
  }
}, 60 * 1000);
if (typeof cleanupTimer.unref === 'function') {
  cleanupTimer.unref();
}

/**
 * Creates a lightweight, dependency-free sliding/fixed-window rate limiter middleware.
 */
export function createRateLimiter(options: RateLimitOptions): RequestHandler {
  const store = new Map<string, RateLimitBucket>();
  activeRateLimitStores.push(store);

  const message = options.message || 'Too many requests. Please try again shortly.';

  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    const rawKey = options.keyGenerator ? options.keyGenerator(req) : getClientIp(req);
    const key = `${options.keyPrefix}:${rawKey}`;

    let bucket = store.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 1, resetAt: now + options.windowMs };
      store.set(key, bucket);
    } else {
      bucket.count += 1;
    }

    const remaining = Math.max(0, options.maxRequests - bucket.count);
    const resetSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));

    res.setHeader('RateLimit-Limit', String(options.maxRequests));
    res.setHeader('RateLimit-Remaining', String(remaining));
    res.setHeader('RateLimit-Reset', String(resetSeconds));

    if (bucket.count > options.maxRequests) {
      res.setHeader('Retry-After', String(resetSeconds));
      return res.status(429).json({
        error: message,
        code: 'RATE_LIMITED',
        retryAfterSeconds: resetSeconds,
      });
    }

    next();
  };
}

// Pre-configured production rate limiters
export const authLoginRateLimiter = createRateLimiter({
  keyPrefix: 'auth_login',
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 20,
  message: 'Too many sign-in attempts. Please wait 15 minutes and try again.',
});

export const authRegisterRateLimiter = createRateLimiter({
  keyPrefix: 'auth_register',
  windowMs: 60 * 60 * 1000, // 1 hour
  maxRequests: 10,
  message: 'Too many registration attempts from this network. Please try again later.',
});

export const authPasswordResetRateLimiter = createRateLimiter({
  keyPrefix: 'auth_reset',
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 8,
  message: 'Too many password reset requests. Please wait 15 minutes before retrying.',
});

export const authRefreshRateLimiter = createRateLimiter({
  keyPrefix: 'auth_refresh',
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 60,
  message: 'Too many session refresh requests. Please slow down.',
});

export const authSensitiveActionRateLimiter = createRateLimiter({
  keyPrefix: 'auth_sensitive',
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 5,
  message: 'Too many sensitive account requests. Please try again later.',
});

export const publicCatalogReadRateLimiter = createRateLimiter({
  keyPrefix: 'public_catalog_read',
  windowMs: 5 * 60 * 1000, // 5 minutes
  maxRequests: 120,
  message: 'Too many catalog requests. Please try again in a few minutes.',
});

export const publicWriteRateLimiter = createRateLimiter({
  keyPrefix: 'public_write',
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 15,
  message: 'Too many submissions. Please wait a few minutes before trying again.',
});

export const webhookRateLimiter = createRateLimiter({
  keyPrefix: 'webhook',
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 120,
  message: 'Webhook rate limit exceeded.',
});

/**
 * Validates that a user-supplied external store URL (e.g. WooCommerce) is safe
 * and cannot target loopback, private networks, or cloud metadata services (SSRF guard).
 */
export function validateExternalStoreUrl(rawUrl: string): { valid: boolean; url?: string; error?: string } {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return { valid: false, error: 'Store URL is required.' };
  }

  let candidate = rawUrl.trim().replace(/\/+$/, '');
  if (!candidate) {
    return { valid: false, error: 'Store URL is required.' };
  }

  if (!/^https?:\/\//i.test(candidate)) {
    candidate = `https://${candidate}`;
  }

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return { valid: false, error: 'Invalid store URL format.' };
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return { valid: false, error: 'Only HTTP and HTTPS store URLs are supported.' };
  }

  if (parsed.username || parsed.password) {
    return { valid: false, error: 'Store URL must not contain embedded credentials.' };
  }

  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (
    !hostname ||
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    hostname === 'metadata.google.internal' ||
    hostname === '0.0.0.0' ||
    hostname === '::1' ||
    hostname === '::'
  ) {
    return { valid: false, error: 'Local or internal hostnames are not allowed.' };
  }

  const ipVersion = net.isIP(hostname);
  if (ipVersion === 4) {
    const parts = hostname.split('.').map(Number);
    const [a, b] = parts;
    const isPrivateV4 =
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127);
    if (isPrivateV4) {
      return { valid: false, error: 'Private or loopback IP addresses are not allowed.' };
    }
  } else if (ipVersion === 6) {
    const lower = hostname.toLowerCase();
    const isPrivateV6 =
      lower === '::1' ||
      lower === '::' ||
      lower.startsWith('fc') ||
      lower.startsWith('fd') ||
      lower.startsWith('fe80:') ||
      lower.startsWith('::ffff:127.') ||
      lower.startsWith('::ffff:10.') ||
      lower.startsWith('::ffff:192.168.') ||
      lower.startsWith('::ffff:169.254.');
    if (isPrivateV6) {
      return { valid: false, error: 'Private or loopback IPv6 addresses are not allowed.' };
    }
  }

  return { valid: true, url: `${parsed.origin}${parsed.pathname}`.replace(/\/+$/, '') };
}

const SENSITIVE_ERROR_PATTERNS = [
  /directus/i,
  /postgres/i,
  /knex/i,
  /sql/i,
  /econnrefused/i,
  /enotfound/i,
  /etimedout/i,
  /econnreset/i,
  /fetch failed/i,
  /sk_(live|test)_/i,
  /whsec_/i,
  /bearer\s+[a-z0-9._-]+/i,
  /https?:\/\/[a-z0-9.-]+/i,
  /at\s+\S+\s+\(\S+:\d+:\d+\)/i,
];

/**
 * Sanitizes internal server error messages so sensitive details never reach API clients in production.
 */
export function sanitizeErrorMessage(rawMessage: unknown, fallback = 'An internal server error occurred.'): string {
  const msg = typeof rawMessage === 'string' ? rawMessage.trim() : '';
  if (!msg) return fallback;

  if (!SERVER_CONFIG.isProduction) {
    // Still strip tokens/keys even in development
    if (/sk_(live|test)_|whsec_|bearer\s+[a-z0-9._-]+/i.test(msg)) {
      return fallback;
    }
    return msg;
  }

  for (const pattern of SENSITIVE_ERROR_PATTERNS) {
    if (pattern.test(msg)) {
      return fallback;
    }
  }

  // Keep short, clean messages; replace verbose multi-line diagnostics
  if (msg.length > 200 || msg.includes('\n')) {
    return fallback;
  }

  return msg;
}

/**
 * Middleware that automatically sanitizes 5xx JSON error payloads on `/api/*`
 * so stack traces, upstream URLs, or database details can never leak in production.
 */
export function apiErrorSanitizerMiddleware(_req: Request, res: Response, next: NextFunction): void {
  const originalJson = res.json.bind(res);

  res.json = ((body: any) => {
    if (res.statusCode >= 500 && body && typeof body === 'object' && !Array.isArray(body)) {
      const sanitized: Record<string, any> = { ...body };
      delete sanitized.stack;
      delete sanitized.trace;
      delete sanitized.details;
      if (typeof sanitized.error === 'string') {
        sanitized.error = sanitizeErrorMessage(sanitized.error);
      }
      if (typeof sanitized.message === 'string') {
        sanitized.message = sanitizeErrorMessage(sanitized.message);
      }
      return originalJson(sanitized);
    }
    return originalJson(body);
  }) as any;

  next();
}

/**
 * Final Express error handler for malformed payloads and unhandled exceptions.
 */
export function globalApiErrorHandler(err: any, _req: Request, res: Response, next: NextFunction): void {
  if (res.headersSent) {
    next(err);
    return;
  }

  if (err?.type === 'entity.parse.failed' || err instanceof SyntaxError) {
    res.status(400).json({ error: 'Invalid JSON request payload.' });
    return;
  }

  if (err?.type === 'entity.too.large') {
    res.status(413).json({ error: 'Request payload exceeds maximum allowed size.' });
    return;
  }

  console.error('[Clozito BFF] Unhandled server error:', err?.message || err);
  res.status(500).json({
    error: sanitizeErrorMessage(err?.message, 'An unexpected server error occurred. Please try again.'),
  });
}
