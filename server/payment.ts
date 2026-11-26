import { Router, Request, Response } from 'express';
import Stripe from 'stripe';
import { DirectusAdminClient } from './directusAdmin';
import { SERVER_CONFIG, sanitizeOriginUrl } from './config';
import { requireAuth, AuthenticatedRequest, getUserOrganizations, invalidateUserCaches } from './auth';
import { generateLicenseTokenString } from '../src/utils/license';
import {
  SUBSCRIPTION_TIERS,
  SubscriptionTier,
  parseSubscriptionTier,
  isPaidCloudPlan,
  normalizePlanTier,
  isModuleOfflinePurchasable,
  getRequiredTierForModule,
} from '../src/config/plans';

export const paymentRouter = Router();

// Backward-compatible export referencing Boutique Cloud billing cycles
export const SUBSCRIPTION_PLANS = SUBSCRIPTION_TIERS.boutique.cycles;

// Authoritative one-time EUR pricing ONLY for zero-server-cost Desktop Offline add-ons.
// Cloud-hosted modules (woocommerce, online_catalog) are strictly subscription-only.
const DEFAULT_MODULE_PRICES_EUR: Record<string, { name: string; priceEur: number }> = {
  barcode: { name: 'Barcode & Thermal Label Designer', priceEur: 49 },
  accounting: { name: 'Accounting & Financial Ledger', priceEur: 79 },
  production: { name: 'Garment Production & BOM', priceEur: 119 },
};

// In-memory idempotency guards to prevent duplicate fulfillment across callback + webhooks
const fulfilledSessions = new Set<string>();
const inFlightSessions = new Map<string, Promise<FulfillmentResult>>();
const processedInvoiceIds = new Set<string>();

interface FulfillmentResult {
  type: 'pro_subscription' | 'module_purchase';
  organizationId: number;
  refNumber: string;
  planTier?: SubscriptionTier;
  moduleSlug?: string;
  moduleName?: string;
  alreadyFulfilled?: boolean;
}

interface StripeRuntimeConfig {
  secretKey: string;
  webhookSecret: string;
  automaticTaxEnabled: boolean;
  fetchedAt: number;
}

const STRIPE_CONFIG_TTL_MS = 60 * 1000;
let cachedStripeConfig: StripeRuntimeConfig | null = null;
let cachedStripeClient: Stripe | null = null;
let cachedStripeKey: string | null = null;

/**
 * Loads STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET from Directus `project_settings`
 * (supports both uppercase STRIPE_* and lowercase stripe_* field names), with environment fallback.
 */
async function getStripeConfig(forceRefresh = false): Promise<{
  secretKey: string;
  webhookSecret: string;
  automaticTaxEnabled: boolean;
}> {
  const now = Date.now();
  if (!forceRefresh && cachedStripeConfig && now - cachedStripeConfig.fetchedAt < STRIPE_CONFIG_TTL_MS) {
    return {
      secretKey: cachedStripeConfig.secretKey,
      webhookSecret: cachedStripeConfig.webhookSecret,
      automaticTaxEnabled: cachedStripeConfig.automaticTaxEnabled,
    };
  }

  let settingsData: Record<string, any> | null = null;
  try {
    const resp: any = await DirectusAdminClient.request('/items/project_settings');
    if (resp) {
      if (resp.data) {
        settingsData = Array.isArray(resp.data) ? resp.data[0] : resp.data;
      } else if (Array.isArray(resp)) {
        settingsData = resp[0];
      } else if (typeof resp === 'object') {
        settingsData = resp;
      }
    }
  } catch (err: any) {
    console.warn('[payment] /items/project_settings fetch fallback:', err?.message);
    try {
      const items = await DirectusAdminClient.getItems('project_settings', { limit: 1 });
      if (Array.isArray(items) && items.length > 0) {
        settingsData = items[0];
      }
    } catch (fallbackErr: any) {
      console.warn('[payment] Could not load project_settings from server:', fallbackErr?.message);
    }
  }

  const secretKey = String(
    settingsData?.STRIPE_SECRET_KEY ||
      settingsData?.stripe_secret_key ||
      process.env.STRIPE_SECRET_KEY ||
      ''
  ).trim();

  const webhookSecret = String(
    settingsData?.STRIPE_WEBHOOK_SECRET ||
      settingsData?.stripe_webhook_secret ||
      process.env.STRIPE_WEBHOOK_SECRET ||
      ''
  ).trim();

  const rawAutoTax =
    settingsData?.STRIPE_AUTOMATIC_TAX ??
    settingsData?.stripe_automatic_tax ??
    process.env.STRIPE_AUTOMATIC_TAX;
  const automaticTaxEnabled =
    rawAutoTax === true || String(rawAutoTax || '').toLowerCase() === 'true' || String(rawAutoTax || '') === '1';

  // Only cache when at least one key is present so newly configured keys take effect immediately
  if (secretKey || webhookSecret) {
    cachedStripeConfig = { secretKey, webhookSecret, automaticTaxEnabled, fetchedAt: now };
  }

  return { secretKey, webhookSecret, automaticTaxEnabled };
}

/**
 * Lazily initializes the Stripe SDK client using server-side credentials.
 */
async function getStripeClient(forceRefresh = false): Promise<Stripe | null> {
  const { secretKey } = await getStripeConfig(forceRefresh);
  if (!secretKey) return null;
  if (cachedStripeClient && cachedStripeKey === secretKey) {
    return cachedStripeClient;
  }
  cachedStripeKey = secretKey;
  cachedStripeClient = new Stripe(secretKey);
  return cachedStripeClient;
}

/**
 * Resolves the canonical public application origin for Stripe redirect URLs.
 * Never trusts arbitrary client-supplied redirect URLs.
 */
function getAppOrigin(req: Request): string {
  const configured = sanitizeOriginUrl(process.env.APP_URL);
  if (configured) {
    return configured;
  }
  const protoHeader = req.headers['x-forwarded-proto'];
  const proto = Array.isArray(protoHeader) ? protoHeader[0] : protoHeader || req.protocol || 'https';
  const host = req.get('host');
  if (host) {
    return `${proto}://${host}`;
  }
  return SERVER_CONFIG.appUrl;
}

/**
 * Resolves a safe Stripe Checkout/Portal locale ('it' | 'en').
 */
function resolveStripeLocale(rawLocale: unknown): 'it' | 'en' {
  return String(rawLocale || '').toLowerCase().startsWith('it') ? 'it' : 'en';
}

/**
 * Verifies active membership in an organization, optionally restricting to billing-capable roles (owner / manager).
 */
async function verifyOrgMembership(
  userId: string,
  organizationId: number,
  requireBillingRole = false
): Promise<boolean> {
  if (!userId || !organizationId || organizationId <= 0) return false;
  try {
    const memberships = await DirectusAdminClient.getItems('organization_users', {
      filter: {
        organization_id: { _eq: organizationId },
        user_id: { _eq: userId },
        status: { _eq: 'active' },
      },
      limit: 1,
    });
    if (Array.isArray(memberships) && memberships.length > 0) {
      if (!requireBillingRole) return true;
      const role = String(memberships[0]?.role || '').toLowerCase();
      return role === 'owner' || role === 'manager' || role === 'admin';
    }
    const { organizations } = await getUserOrganizations(userId);
    const match = Array.isArray(organizations)
      ? organizations.find((o: any) => Number(o.id) === organizationId)
      : null;
    if (!match) return false;
    if (!requireBillingRole) return true;
    const role = String(match.role || match.user_role || '').toLowerCase();
    return !role || role === 'owner' || role === 'manager' || role === 'admin';
  } catch (err) {
    console.warn('[payment] Organization membership verification failed:', (err as any)?.message);
    return false;
  }
}

/**
 * Resolves a numeric EUR price from a system_modules record or fallback map.
 */
function resolveModulePriceEur(slug: string, modRecord: any): number {
  const candidates = [modRecord?.price_eur, modRecord?.price_usd];
  for (const raw of candidates) {
    if (raw !== undefined && raw !== null && String(raw).trim() !== '') {
      const parsed = Number(String(raw).replace(/[^0-9.]/g, ''));
      if (!isNaN(parsed) && parsed > 0 && parsed <= 100000) {
        return Math.round(parsed * 100) / 100;
      }
    }
  }
  return DEFAULT_MODULE_PRICES_EUR[slug]?.priceEur || 49;
}

/**
 * Ensures a Stripe Customer exists for the organization and persists `stripe_customer_id`.
 * Having a persistent Stripe Customer enables EU VAT/Tax ID collection, automatic invoice history,
 * and self-service billing management via Stripe Customer Portal.
 */
async function ensureStripeCustomer(
  stripe: Stripe,
  org: any,
  orgIdNum: number,
  email?: string | null
): Promise<string> {
  const existingId = typeof org?.stripe_customer_id === 'string' ? org.stripe_customer_id.trim() : '';
  if (existingId && existingId.startsWith('cus_')) {
    try {
      const existing = await stripe.customers.retrieve(existingId);
      if (existing && !('deleted' in existing && existing.deleted)) {
        return existingId;
      }
    } catch (err: any) {
      // Customer might belong to a different Stripe mode (test vs live) — create a fresh one
      console.warn(`[payment] Existing Stripe customer ${existingId} unavailable, creating a new one:`, err?.message);
    }
  }

  const customer = await stripe.customers.create({
    email: email || undefined,
    name: org?.name ? String(org.name) : `Organization #${orgIdNum}`,
    metadata: {
      organization_id: String(orgIdNum),
      organization_slug: org?.slug ? String(org.slug) : '',
    },
  });

  await DirectusAdminClient.updateItem('organizations', orgIdNum, {
    stripe_customer_id: customer.id,
  }).catch((err: any) => console.warn('[payment] Could not persist stripe_customer_id:', err?.message));

  invalidateUserCaches();
  return customer.id;
}

/**
 * Creates a Stripe Checkout Session, optionally with `automatic_tax` enabled and safe retry if
 * Stripe Tax is not yet activated on the connected Stripe account.
 */
async function createCheckoutSessionWithTaxFallback(
  stripe: Stripe,
  params: Stripe.Checkout.SessionCreateParams,
  automaticTaxEnabled: boolean
): Promise<Stripe.Checkout.Session> {
  if (!automaticTaxEnabled) {
    return await stripe.checkout.sessions.create(params);
  }
  try {
    return await stripe.checkout.sessions.create({
      ...params,
      automatic_tax: { enabled: true },
    });
  } catch (err: any) {
    const msg = String(err?.message || '').toLowerCase();
    if (msg.includes('automatic_tax') || msg.includes('stripe tax') || msg.includes('tax calculation')) {
      console.warn('[payment] Automatic Tax not active on Stripe account — falling back without automatic_tax.');
      return await stripe.checkout.sessions.create(params);
    }
    throw err;
  }
}

/**
 * Safely extracts period start/end timestamps across both legacy and newer Stripe Subscription API versions.
 */
function extractSubscriptionPeriod(sub: Stripe.Subscription | null, fallbackMonths = 1): { start: Date; end: Date } {
  const firstItem = sub?.items?.data?.[0] as any;
  const startUnix = Number(firstItem?.current_period_start || (sub as any)?.current_period_start || 0);
  const endUnix = Number(firstItem?.current_period_end || (sub as any)?.current_period_end || 0);

  if (startUnix > 0 && endUnix > startUnix) {
    return {
      start: new Date(startUnix * 1000),
      end: new Date(endUnix * 1000),
    };
  }

  const start = new Date();
  const end = new Date(start.getTime());
  end.setMonth(end.getMonth() + Math.max(1, fallbackMonths));
  return { start, end };
}

/**
 * Extracts subscription ID from a Stripe Invoice across legacy (`invoice.subscription`)
 * and Stripe API v2025+ (`invoice.parent.subscription_details.subscription`).
 */
function extractInvoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const parentSub = (invoice as any)?.parent?.subscription_details?.subscription;
  if (typeof parentSub === 'string' && parentSub) return parentSub;
  if (parentSub && typeof parentSub === 'object' && typeof parentSub.id === 'string') return parentSub.id;

  const legacySub = (invoice as any)?.subscription;
  if (typeof legacySub === 'string' && legacySub) return legacySub;
  if (legacySub && typeof legacySub === 'object' && typeof legacySub.id === 'string') return legacySub.id;

  return null;
}

/**
 * Resolves the tenant organization ID from Stripe metadata, stripe_subscription_id, or stripe_customer_id.
 */
async function resolveOrganizationIdFromStripe(opts: {
  metadata?: Record<string, string | null | undefined> | null;
  subscriptionId?: string | null;
  customerId?: string | null;
}): Promise<number | null> {
  const metaOrgId = Number(opts.metadata?.organization_id);
  if (Number.isInteger(metaOrgId) && metaOrgId > 0) {
    return metaOrgId;
  }

  if (opts.subscriptionId) {
    const bySub = await DirectusAdminClient.getItems('organizations', {
      filter: { stripe_subscription_id: { _eq: opts.subscriptionId } },
      limit: 1,
    }).catch(() => []);
    if (Array.isArray(bySub) && bySub.length > 0 && Number(bySub[0].id) > 0) {
      return Number(bySub[0].id);
    }
  }

  if (opts.customerId) {
    const byCus = await DirectusAdminClient.getItems('organizations', {
      filter: { stripe_customer_id: { _eq: opts.customerId } },
      limit: 1,
    }).catch(() => []);
    if (Array.isArray(byCus) && byCus.length > 0 && Number(byCus[0].id) > 0) {
      return Number(byCus[0].id);
    }
  }

  return null;
}

/**
 * Idempotently inserts a record into `subscriptions` using exact canonical Directus schema columns:
 * `organization_id`, `start_date`, `end_date`, `transaction_amount`, `Transaction_id`.
 */
async function recordSubscriptionPayment(params: {
  organizationId: number;
  startDate: Date;
  endDate: Date;
  amountEur: number;
  transactionId: string;
}): Promise<boolean> {
  const existing = await DirectusAdminClient.getItems('subscriptions', {
    filter: {
      organization_id: { _eq: params.organizationId },
      Transaction_id: { _eq: params.transactionId },
    },
    limit: 1,
  }).catch(() => []);

  if (Array.isArray(existing) && existing.length > 0) {
    return false;
  }

  await DirectusAdminClient.createItem('subscriptions', {
    organization_id: params.organizationId,
    start_date: params.startDate.toISOString(),
    end_date: params.endDate.toISOString(),
    transaction_amount: `€${params.amountEur.toFixed(2)}`,
    Transaction_id: params.transactionId,
  });

  return true;
}

/**
 * Idempotently fulfills a paid Stripe Checkout Session (Recurring Pro Subscription or Perpetual Module License).
 */
async function fulfillCheckoutSession(
  stripe: Stripe,
  session: Stripe.Checkout.Session
): Promise<FulfillmentResult> {
  const sessionId = session.id;
  const metadata = session.metadata || {};
  const type = metadata.type === 'module_purchase' ? 'module_purchase' : 'pro_subscription';
  const stripeCustomerId =
    typeof session.customer === 'string' ? session.customer : session.customer?.id || null;
  const stripeSubscriptionId =
    typeof session.subscription === 'string' ? session.subscription : session.subscription?.id || null;

  const organizationId = await resolveOrganizationIdFromStripe({
    metadata,
    subscriptionId: stripeSubscriptionId,
    customerId: stripeCustomerId,
  });

  const paymentIntentRef =
    typeof session.payment_intent === 'string'
      ? session.payment_intent
      : session.payment_intent?.id ||
        (typeof session.invoice === 'string' ? session.invoice : session.invoice?.id) ||
        stripeSubscriptionId ||
        sessionId;

  if (!organizationId || isNaN(organizationId) || organizationId <= 0) {
    throw new Error('Missing valid organization_id in Stripe session metadata.');
  }

  if (fulfilledSessions.has(sessionId)) {
    return {
      type,
      organizationId,
      refNumber: paymentIntentRef,
      planTier: parseSubscriptionTier(metadata.plan_tier, 'atelier'),
      moduleSlug: metadata.module_slug,
      moduleName: metadata.module_name,
      alreadyFulfilled: true,
    };
  }

  const existingPromise = inFlightSessions.get(sessionId);
  if (existingPromise) {
    return existingPromise;
  }

  const task = (async (): Promise<FulfillmentResult> => {
    if (type === 'pro_subscription') {
      const durationMonths = Number(metadata.duration_months) || 1;
      const amountEur = (session.amount_total || 0) / 100;

      // Retrieve live Stripe Subscription to capture exact billing period, tier & status
      let stripeSub: Stripe.Subscription | null = null;
      if (stripeSubscriptionId) {
        stripeSub = await stripe.subscriptions.retrieve(stripeSubscriptionId).catch(() => null);
      }

      const resolvedTier = parseSubscriptionTier(
        metadata.plan_tier || stripeSub?.metadata?.plan_tier,
        'atelier'
      );

      const invoiceRef =
        typeof session.invoice === 'string' ? session.invoice : session.invoice?.id || sessionId;

      const { start: periodStart, end: periodEnd } = stripeSub
        ? extractSubscriptionPeriod(stripeSub, durationMonths)
        : (() => {
            const s = new Date();
            const e = new Date(s.getTime());
            e.setMonth(e.getMonth() + durationMonths);
            return { start: s, end: e };
          })();

      // Avoid double insert if invoice.paid already recorded this invoice
      await recordSubscriptionPayment({
        organizationId,
        startDate: periodStart,
        endDate: periodEnd,
        amountEur,
        transactionId: invoiceRef,
      });

      const orgUpdate: Record<string, any> = {
        plan: resolvedTier,
        stripe_subscription_status: stripeSub?.status || 'active',
        date_updated: new Date().toISOString(),
      };
      if (stripeCustomerId) orgUpdate.stripe_customer_id = stripeCustomerId;
      if (stripeSubscriptionId) orgUpdate.stripe_subscription_id = stripeSubscriptionId;

      await DirectusAdminClient.updateItem('organizations', organizationId, orgUpdate);
      invalidateUserCaches();

      fulfilledSessions.add(sessionId);
      if (invoiceRef !== sessionId) processedInvoiceIds.add(invoiceRef);

      return {
        type: 'pro_subscription',
        organizationId,
        refNumber: paymentIntentRef,
        planTier: resolvedTier,
      };
    } else {
      // Perpetual Add-on Module Purchase
      const moduleSlug = String(metadata.module_slug || '').trim();
      const moduleId = Number(metadata.module_id) || undefined;
      const moduleName = String(metadata.module_name || DEFAULT_MODULE_PRICES_EUR[moduleSlug]?.name || moduleSlug);
      const hardwareId = metadata.hardware_id && metadata.hardware_id !== 'ANY' ? metadata.hardware_id : null;

      if (!moduleSlug) {
        throw new Error('Missing module_slug in Stripe session metadata.');
      }

      if (stripeCustomerId) {
        await DirectusAdminClient.updateItem('organizations', organizationId, {
          stripe_customer_id: stripeCustomerId,
        }).catch(() => {});
      }

      let resolvedModuleId = moduleId;
      if (!resolvedModuleId) {
        const foundMods = await DirectusAdminClient.getItems('system_modules', {
          filter: { slug: { _eq: moduleSlug } },
          limit: 1,
        }).catch(() => []);
        if (Array.isArray(foundMods) && foundMods.length > 0) {
          resolvedModuleId = Number(foundMods[0].id);
        }
      }

      const issuedAt = new Date().toISOString();
      const licenseToken = await generateLicenseTokenString({
        organization_id: organizationId,
        slug: moduleSlug,
        license_type: 'lifetime',
        hardware_id: hardwareId,
        issued_at: issuedAt,
        expires_at: null,
      });

      const existingOrgModules = await DirectusAdminClient.getItems('organization_modules', {
        filter: {
          organization_id: { _eq: organizationId },
          ...(resolvedModuleId ? { module_id: { _eq: resolvedModuleId } } : {}),
        },
        limit: 50,
      }).catch(() => []);

      const matchingRecord = Array.isArray(existingOrgModules)
        ? existingOrgModules.find((m: any) => {
            if (resolvedModuleId && Number(m.module_id) === resolvedModuleId) return true;
            if (m.module_id?.slug === moduleSlug) return true;
            return false;
          })
        : null;

      if (matchingRecord) {
        await DirectusAdminClient.updateItem('organization_modules', matchingRecord.id, {
          status: 'active',
          license_type: 'lifetime',
          hardware_id: hardwareId || matchingRecord.hardware_id || null,
          license_token: licenseToken,
          activated_at: issuedAt,
          expires_at: null,
        });
      } else {
        await DirectusAdminClient.createItem('organization_modules', {
          organization_id: organizationId,
          module_id: resolvedModuleId || null,
          status: 'active',
          license_type: 'lifetime',
          hardware_id: hardwareId,
          license_token: licenseToken,
          activated_at: issuedAt,
          expires_at: null,
        });
      }

      fulfilledSessions.add(sessionId);
      return {
        type: 'module_purchase',
        organizationId,
        refNumber: paymentIntentRef,
        moduleSlug,
        moduleName,
      };
    }
  })();

  inFlightSessions.set(sessionId, task);
  try {
    return await task;
  } finally {
    inFlightSessions.delete(sessionId);
  }
}

/**
 * Handles `invoice.paid` webhook events for automatic recurring subscription renewals.
 */
async function handleInvoicePaid(stripe: Stripe, invoice: Stripe.Invoice): Promise<void> {
  const invoiceId = invoice.id;
  if (!invoiceId || processedInvoiceIds.has(invoiceId)) return;

  const subscriptionId = extractInvoiceSubscriptionId(invoice);
  if (!subscriptionId) {
    // One-off invoice (e.g. module add-on) handled via checkout.session.completed
    return;
  }

  const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id || null;
  const stripeSub = await stripe.subscriptions.retrieve(subscriptionId).catch(() => null);

  const organizationId = await resolveOrganizationIdFromStripe({
    metadata: {
      ...(invoice.metadata || {}),
      ...(stripeSub?.metadata || {}),
    },
    subscriptionId,
    customerId,
  });

  if (!organizationId) {
    console.warn(`[payment] invoice.paid (${invoiceId}) could not be matched to any organization.`);
    return;
  }

  // Extract period from invoice line item or subscription
  const firstLine = invoice.lines?.data?.[0];
  let startDate: Date;
  let endDate: Date;
  if (firstLine?.period?.start && firstLine?.period?.end && firstLine.period.end > firstLine.period.start) {
    startDate = new Date(firstLine.period.start * 1000);
    endDate = new Date(firstLine.period.end * 1000);
  } else {
    const durationMonths = Number(stripeSub?.metadata?.duration_months) || 1;
    const period = extractSubscriptionPeriod(stripeSub, durationMonths);
    startDate = period.start;
    endDate = period.end;
  }

  const amountEur = (invoice.amount_paid || 0) / 100;

  await recordSubscriptionPayment({
    organizationId,
    startDate,
    endDate,
    amountEur,
    transactionId: invoiceId,
  });

  const resolvedTier = parseSubscriptionTier(
    stripeSub?.metadata?.plan_tier || invoice.metadata?.plan_tier,
    'atelier'
  );

  const orgUpdate: Record<string, any> = {
    plan: resolvedTier,
    stripe_subscription_id: subscriptionId,
    stripe_subscription_status: stripeSub?.status || 'active',
    date_updated: new Date().toISOString(),
  };
  if (customerId) orgUpdate.stripe_customer_id = customerId;

  await DirectusAdminClient.updateItem('organizations', organizationId, orgUpdate);
  processedInvoiceIds.add(invoiceId);
  invalidateUserCaches();
  console.log(
    `[payment] invoice.paid renewed ${resolvedTier} plan for org #${organizationId} until ${endDate.toISOString()}`
  );
}

/**
 * Handles `invoice.payment_failed` webhook events.
 * Marks the organization's Stripe status as `past_due` so the UI prompts the owner to update
 * their payment method in Stripe Customer Portal during Stripe's retry grace period.
 */
async function handleInvoicePaymentFailed(stripe: Stripe, invoice: Stripe.Invoice): Promise<void> {
  const subscriptionId = extractInvoiceSubscriptionId(invoice);
  const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id || null;
  const stripeSub = subscriptionId ? await stripe.subscriptions.retrieve(subscriptionId).catch(() => null) : null;

  const organizationId = await resolveOrganizationIdFromStripe({
    metadata: {
      ...(invoice.metadata || {}),
      ...(stripeSub?.metadata || {}),
    },
    subscriptionId,
    customerId,
  });

  if (!organizationId) {
    console.warn(`[payment] invoice.payment_failed (${invoice.id}) could not be matched to any organization.`);
    return;
  }

  const orgUpdate: Record<string, any> = {
    stripe_subscription_status: 'past_due',
    date_updated: new Date().toISOString(),
  };
  if (customerId) orgUpdate.stripe_customer_id = customerId;
  if (subscriptionId) orgUpdate.stripe_subscription_id = subscriptionId;

  await DirectusAdminClient.updateItem('organizations', organizationId, orgUpdate);
  invalidateUserCaches();
  console.warn(`[payment] invoice.payment_failed marked org #${organizationId} as past_due.`);
}

/**
 * Handles `customer.subscription.updated` and `customer.subscription.deleted` webhook events.
 */
async function handleSubscriptionLifecycleEvent(
  subscription: Stripe.Subscription,
  isDeleted: boolean
): Promise<void> {
  const customerId =
    typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id || null;

  const organizationId = await resolveOrganizationIdFromStripe({
    metadata: subscription.metadata,
    subscriptionId: subscription.id,
    customerId,
  });

  if (!organizationId) {
    console.warn(`[payment] Subscription event (${subscription.id}) could not be matched to any organization.`);
    return;
  }

  const status = isDeleted ? 'canceled' : String(subscription.status || 'active');
  const shouldDowngrade =
    isDeleted || status === 'canceled' || status === 'unpaid' || status === 'incomplete_expired';
  const shouldBePro = status === 'active' || status === 'trialing' || status === 'past_due';

  const orgUpdate: Record<string, any> = {
    stripe_subscription_id: subscription.id,
    stripe_subscription_status: status,
    date_updated: new Date().toISOString(),
  };
  if (customerId) orgUpdate.stripe_customer_id = customerId;

  const resolvedTier = parseSubscriptionTier(subscription.metadata?.plan_tier, 'atelier');

  if (shouldDowngrade) {
    orgUpdate.plan = 'free';
  } else if (shouldBePro) {
    orgUpdate.plan = resolvedTier;
  }

  await DirectusAdminClient.updateItem('organizations', organizationId, orgUpdate);
  invalidateUserCaches();
  console.log(
    `[payment] Subscription ${isDeleted ? 'deleted' : 'updated'} for org #${organizationId}: status=${status}, plan=${orgUpdate.plan || 'unchanged'}`
  );
}

/**
 * Public: Get available EUR recurring subscription plans & Stripe readiness status
 * GET /api/payment/plans
 */
paymentRouter.get('/plans', async (_req, res) => {
  const stripe = await getStripeClient().catch(() => null);
  const mapCycles = (tierKey: SubscriptionTier) =>
    Object.values(SUBSCRIPTION_TIERS[tierKey].cycles).map((info) => ({
      durationMonths: info.durationMonths,
      title: info.title,
      titleIt: info.titleIt,
      priceEur: info.priceEur,
      priceCents: info.priceCents,
      monthlyEquivalentEur: info.monthlyEquivalentEur,
      discountPercent: info.discountPercent,
      interval: info.interval,
      intervalCount: info.intervalCount,
    }));

  return res.json({
    currency: 'EUR',
    billingMode: 'subscription',
    stripeConfigured: Boolean(stripe),
    tiers: {
      boutique: {
        id: 'boutique',
        name: SUBSCRIPTION_TIERS.boutique.name,
        nameIt: SUBSCRIPTION_TIERS.boutique.nameIt,
        tagline: SUBSCRIPTION_TIERS.boutique.tagline,
        taglineIt: SUBSCRIPTION_TIERS.boutique.taglineIt,
        includedModules: SUBSCRIPTION_TIERS.boutique.includedModules,
        plans: mapCycles('boutique'),
      },
      atelier: {
        id: 'atelier',
        name: SUBSCRIPTION_TIERS.atelier.name,
        nameIt: SUBSCRIPTION_TIERS.atelier.nameIt,
        tagline: SUBSCRIPTION_TIERS.atelier.tagline,
        taglineIt: SUBSCRIPTION_TIERS.atelier.taglineIt,
        includedModules: SUBSCRIPTION_TIERS.atelier.includedModules,
        plans: mapCycles('atelier'),
      },
    },
    plans: mapCycles('boutique'),
  });
});

/**
 * Create a Stripe Checkout Session for a Recurring Cloud Subscription (Boutique or Atelier tier)
 * Authoritative EUR prices are resolved strictly server-side from SUBSCRIPTION_TIERS.
 * Includes EU VAT / Partita IVA Tax ID collection and dynamic European payment methods.
 * POST /api/payment/request
 */
paymentRouter.post('/request', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const stripe = await getStripeClient();
    const { automaticTaxEnabled } = await getStripeConfig();
    if (!stripe) {
      return res.status(503).json({
        error: 'Stripe is not configured yet. Please set STRIPE_SECRET_KEY in project_settings.',
      });
    }

    const { organizationId, durationMonths, planTier, locale } = req.body || {};
    const { userId, email } = req.user!;

    const orgIdNum = Number(organizationId || req.user!.organizationId);
    if (!Number.isInteger(orgIdNum) || orgIdNum <= 0) {
      return res.status(400).json({ error: 'Invalid organization ID.' });
    }

    // Strictly validate subscription tier (defaults to 'atelier' if omitted by legacy clients)
    const rawTier = planTier !== undefined && planTier !== null ? String(planTier).trim().toLowerCase() : 'atelier';
    if (rawTier !== 'boutique' && rawTier !== 'atelier' && rawTier !== 'pro') {
      return res.status(400).json({ error: 'Invalid subscription tier. Allowed values: boutique, atelier.' });
    }
    const resolvedTier: SubscriptionTier = rawTier === 'boutique' ? 'boutique' : 'atelier';

    const months = Number(durationMonths) as 1 | 3 | 6 | 12;
    const tierConfig = SUBSCRIPTION_TIERS[resolvedTier];
    const planInfo = tierConfig.cycles[months];
    if (!planInfo) {
      return res.status(400).json({ error: 'Invalid subscription duration. Allowed values: 1, 3, 6, 12 months.' });
    }

    // Enforce tenant membership & billing role authorization
    const canManageBilling = await verifyOrgMembership(userId, orgIdNum, true);
    if (!canManageBilling) {
      return res.status(403).json({ error: 'You do not have permission to manage billing for this organization.' });
    }

    const org = await DirectusAdminClient.getItemById('organizations', orgIdNum);
    if (!org) {
      return res.status(404).json({ error: 'Organization not found.' });
    }

    const stripeCustomerId = await ensureStripeCustomer(stripe, org, orgIdNum, email);
    const orderId = `CLZ-${resolvedTier.toUpperCase()}-${orgIdNum}-${Date.now()}`;
    const appOrigin = getAppOrigin(req);
    const checkoutLocale = resolveStripeLocale(locale);

    // Note: payment_method_types is intentionally omitted so Stripe dynamically presents
    // all EU payment methods enabled in Dashboard (Card, SEPA Direct Debit, Apple Pay, Google Pay, etc.)
    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: 'subscription',
      customer: stripeCustomerId,
      customer_update: {
        address: 'auto',
        name: 'auto',
      },
      billing_address_collection: 'required',
      tax_id_collection: {
        enabled: true,
      },
      allow_promotion_codes: true,
      locale: checkoutLocale,
      client_reference_id: orderId,
      line_items: [
        {
          price_data: {
            currency: 'eur',
            unit_amount: planInfo.priceCents,
            recurring: {
              interval: planInfo.interval,
              interval_count: planInfo.intervalCount,
            },
            product_data: {
              name: `Clozito ${planInfo.title}`,
              description: `${tierConfig.name} recurring workspace subscription for ${org.name || `Organization #${orgIdNum}`}`,
            },
          },
          quantity: 1,
        },
      ],
      subscription_data: {
        metadata: {
          type: 'pro_subscription',
          plan_tier: resolvedTier,
          order_id: orderId,
          organization_id: String(orgIdNum),
          user_id: String(userId),
          duration_months: String(months),
        },
      },
      metadata: {
        type: 'pro_subscription',
        plan_tier: resolvedTier,
        order_id: orderId,
        organization_id: String(orgIdNum),
        user_id: String(userId),
        duration_months: String(months),
      },
      success_url: `${appOrigin}/api/payment/callback?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appOrigin}/?payment=cancelled&type=pro&plan=${resolvedTier}&org_id=${orgIdNum}`,
    };

    const session = await createCheckoutSessionWithTaxFallback(stripe, sessionParams, automaticTaxEnabled);

    if (!session.url) {
      return res.status(502).json({ error: 'Failed to initialize Stripe Checkout session URL.' });
    }

    return res.json({
      success: true,
      sessionId: session.id,
      trackId: session.id,
      orderId,
      planTier: resolvedTier,
      amountEur: planInfo.priceEur,
      currency: 'EUR',
      paymentUrl: session.url,
    });
  } catch (err: any) {
    console.error('[payment] Stripe Checkout creation failed:', err?.message);
    return res.status(500).json({ error: 'Could not start Stripe Checkout. Please try again later.' });
  }
});

/**
 * Create a Stripe Checkout Session for a Perpetual Add-on Module License
 * POST /api/payment/request-module
 */
paymentRouter.post('/request-module', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const stripe = await getStripeClient();
    const { automaticTaxEnabled } = await getStripeConfig();
    if (!stripe) {
      return res.status(503).json({
        error: 'Stripe is not configured yet. Please set STRIPE_SECRET_KEY in project_settings.',
      });
    }

    const { organizationId, moduleSlug, hardwareId, locale } = req.body || {};
    const { userId, email } = req.user!;

    const orgIdNum = Number(organizationId || req.user!.organizationId);
    if (!Number.isInteger(orgIdNum) || orgIdNum <= 0) {
      return res.status(400).json({ error: 'Invalid organization ID.' });
    }

    const cleanSlug = String(moduleSlug || '').trim().toLowerCase();
    if (!/^[a-z0-9_-]{2,40}$/i.test(cleanSlug)) {
      return res.status(400).json({ error: 'Invalid module identifier.' });
    }

    // Server-side policy enforcement: Cloud-hosted modules (WooCommerce Sync, Digital Catalog)
    // incur ongoing hosting/API costs and are strictly included in Boutique/Atelier Cloud Subscriptions.
    if (!isModuleOfflinePurchasable(cleanSlug)) {
      const reqTier = getRequiredTierForModule(cleanSlug);
      const tierLabel = reqTier === 'boutique' ? 'Boutique Cloud (€29/mo)' : 'Atelier & Production Cloud (€49/mo)';
      return res.status(400).json({
        error: `This cloud module is not available as a one-time offline license. Subscribe to ${tierLabel} to unlock it immediately.`,
        code: 'CLOUD_SUBSCRIPTION_REQUIRED',
        requiredTier: reqTier,
      });
    }

    const cleanHardwareId = hardwareId ? String(hardwareId).trim().slice(0, 64) : 'ANY';

    // Enforce tenant membership & billing role authorization
    const canManageBilling = await verifyOrgMembership(userId, orgIdNum, true);
    if (!canManageBilling) {
      return res.status(403).json({ error: 'You do not have permission to purchase modules for this organization.' });
    }

    const org = await DirectusAdminClient.getItemById('organizations', orgIdNum);
    if (!org) {
      return res.status(404).json({ error: 'Organization not found.' });
    }

    const foundModules = await DirectusAdminClient.getItems('system_modules', {
      filter: { slug: { _eq: cleanSlug } },
      limit: 1,
    }).catch(() => []);

    const modRecord = Array.isArray(foundModules) && foundModules.length > 0 ? foundModules[0] : null;
    if (!modRecord && !DEFAULT_MODULE_PRICES_EUR[cleanSlug]) {
      return res.status(404).json({ error: 'Requested module was not found.' });
    }

    const priceEur = resolveModulePriceEur(cleanSlug, modRecord);
    const priceCents = Math.round(priceEur * 100);
    const moduleName =
      DEFAULT_MODULE_PRICES_EUR[cleanSlug]?.name ||
      (modRecord?.name ? String(modRecord.name) : cleanSlug);
    const orderId = `CLZ-MOD-${cleanSlug.toUpperCase()}-${orgIdNum}-${Date.now()}`;
    const appOrigin = getAppOrigin(req);
    const checkoutLocale = resolveStripeLocale(locale);
    const stripeCustomerId = await ensureStripeCustomer(stripe, org, orgIdNum, email);

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: 'payment',
      customer: stripeCustomerId,
      customer_update: {
        address: 'auto',
        name: 'auto',
      },
      billing_address_collection: 'required',
      tax_id_collection: {
        enabled: true,
      },
      invoice_creation: {
        enabled: true,
      },
      allow_promotion_codes: true,
      locale: checkoutLocale,
      client_reference_id: orderId,
      line_items: [
        {
          price_data: {
            currency: 'eur',
            unit_amount: priceCents,
            product_data: {
              name: `Clozito Add-on: ${moduleName}`,
              description: `Perpetual license for ${org.name || `Organization #${orgIdNum}`}`,
            },
          },
          quantity: 1,
        },
      ],
      metadata: {
        type: 'module_purchase',
        order_id: orderId,
        organization_id: String(orgIdNum),
        user_id: String(userId),
        module_slug: cleanSlug,
        module_id: modRecord?.id ? String(modRecord.id) : '',
        module_name: moduleName,
        hardware_id: cleanHardwareId,
      },
      success_url: `${appOrigin}/api/payment/callback?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appOrigin}/?payment=cancelled&type=module&module=${encodeURIComponent(cleanSlug)}&org_id=${orgIdNum}`,
    };

    const session = await createCheckoutSessionWithTaxFallback(stripe, sessionParams, automaticTaxEnabled);

    if (!session.url) {
      return res.status(502).json({ error: 'Failed to initialize Stripe Checkout session URL.' });
    }

    return res.json({
      success: true,
      sessionId: session.id,
      trackId: session.id,
      orderId,
      amountEur: priceEur,
      currency: 'EUR',
      paymentUrl: session.url,
    });
  } catch (err: any) {
    console.error('[payment] Stripe Module Checkout creation failed:', err?.message);
    return res.status(500).json({ error: 'Could not start Stripe Checkout for this module.' });
  }
});

/**
 * Create a Stripe Customer Portal Session for self-service billing management:
 * update payment method, switch/cancel subscription, edit EU VAT ID, and download PDF invoices.
 * POST /api/payment/portal
 */
paymentRouter.post('/portal', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const stripe = await getStripeClient();
    if (!stripe) {
      return res.status(503).json({
        error: 'Stripe is not configured yet. Please set STRIPE_SECRET_KEY in project_settings.',
      });
    }

    const { organizationId, locale } = req.body || {};
    const { userId, email } = req.user!;

    const orgIdNum = Number(organizationId || req.user!.organizationId);
    if (!Number.isInteger(orgIdNum) || orgIdNum <= 0) {
      return res.status(400).json({ error: 'Invalid organization ID.' });
    }

    // Strict server-side tenant & billing role check (owner / manager only)
    const canManageBilling = await verifyOrgMembership(userId, orgIdNum, true);
    if (!canManageBilling) {
      return res.status(403).json({
        error: 'Only organization owners or managers can access the billing portal.',
      });
    }

    // Always read stripe_customer_id strictly from database (never from req.body)
    const org = await DirectusAdminClient.getItemById('organizations', orgIdNum);
    if (!org) {
      return res.status(404).json({ error: 'Organization not found.' });
    }

    let stripeCustomerId = typeof org.stripe_customer_id === 'string' ? org.stripe_customer_id.trim() : '';

    // Fallback lookup by email on Stripe for organizations that checked out before stripe_customer_id existed
    if (!stripeCustomerId && email) {
      const matchedCustomers = await stripe.customers.list({ email, limit: 5 }).catch(() => ({ data: [] }));
      const matching = matchedCustomers.data.find(
        (c) => String(c.metadata?.organization_id || '') === String(orgIdNum)
      ) || matchedCustomers.data[0];

      if (matching?.id) {
        stripeCustomerId = matching.id;
        await DirectusAdminClient.updateItem('organizations', orgIdNum, {
          stripe_customer_id: stripeCustomerId,
        }).catch(() => {});
        invalidateUserCaches();
      }
    }

    if (!stripeCustomerId) {
      return res.status(400).json({
        error: 'No Stripe billing profile was found for this organization yet. Please subscribe to a Pro plan first.',
      });
    }

    const appOrigin = getAppOrigin(req);
    const portalLocale = resolveStripeLocale(locale);

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: `${appOrigin}/?billing_portal=returned&org_id=${orgIdNum}`,
      locale: portalLocale,
    });

    if (!portalSession.url) {
      return res.status(502).json({ error: 'Could not generate Stripe Customer Portal URL.' });
    }

    return res.json({
      success: true,
      portalUrl: portalSession.url,
    });
  } catch (err: any) {
    console.error('[payment] Stripe Customer Portal creation failed:', err?.message);
    const msg = String(err?.message || '').toLowerCase();
    if (msg.includes('no configuration provided') || msg.includes('portal configuration')) {
      return res.status(503).json({
        error:
          'Stripe Customer Portal is not activated in your Stripe Dashboard yet. Enable it under Billing → Customer Portal.',
      });
    }
    return res.status(500).json({ error: 'Could not open Stripe Billing Portal. Please try again later.' });
  }
});

/**
 * Stripe Checkout Return Callback
 * GET /api/payment/callback?session_id=cs_...
 */
paymentRouter.get('/callback', async (req: Request, res: Response) => {
  const sessionId = String(req.query.session_id || '').trim();
  if (!sessionId || !/^cs_[a-zA-Z0-9_]+$/.test(sessionId)) {
    return res.redirect('/?payment=failed&reason=invalid_session');
  }

  try {
    const stripe = await getStripeClient();
    if (!stripe) {
      return res.redirect('/?payment=failed&reason=gateway_unconfigured');
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (!session) {
      return res.redirect(`/?payment=failed&session_id=${encodeURIComponent(sessionId)}&reason=session_not_found`);
    }

    // SEPA Direct Debit returns payment_status='unpaid' initially while processing asynchronously
    if (session.payment_status !== 'paid' && session.payment_status !== 'no_payment_required') {
      if (session.status === 'complete' && session.mode === 'subscription') {
        const pendingTier = parseSubscriptionTier(session.metadata?.plan_tier, 'atelier');
        const qs = new URLSearchParams({
          payment: 'pending',
          plan: pendingTier,
          session_id: sessionId,
          org_id: String(session.metadata?.organization_id || ''),
        });
        return res.redirect(`/?${qs.toString()}`);
      }
      return res.redirect(
        `/?payment=failed&session_id=${encodeURIComponent(sessionId)}&reason=payment_not_completed`
      );
    }

    const result = await fulfillCheckoutSession(stripe, session);

    if (result.type === 'module_purchase') {
      const qs = new URLSearchParams({
        payment: 'module_success',
        module: result.moduleSlug || '',
        module_name: result.moduleName || '',
        session_id: sessionId,
        ref_number: result.refNumber,
        org_id: String(result.organizationId),
      });
      return res.redirect(`/?${qs.toString()}`);
    }

    const qs = new URLSearchParams({
      payment: 'success',
      plan: result.planTier || 'atelier',
      session_id: sessionId,
      ref_number: result.refNumber,
      org_id: String(result.organizationId),
    });
    return res.redirect(`/?${qs.toString()}`);
  } catch (err: any) {
    console.error('[payment] Stripe callback verification error:', err?.message);
    return res.redirect(`/?payment=failed&session_id=${encodeURIComponent(sessionId)}&reason=verification_error`);
  }
});

/**
 * Cryptographically Verified Stripe Webhook Endpoint
 * Handles complete European SaaS subscription lifecycle:
 * - checkout.session.completed / checkout.session.async_payment_succeeded
 * - invoice.paid (automatic renewals)
 * - invoice.payment_failed (past_due grace period alerts)
 * - customer.subscription.updated
 * - customer.subscription.deleted (automatic downgrade to Free)
 * POST /api/payment/webhook
 */
paymentRouter.post('/webhook', async (req: Request, res: Response) => {
  const { webhookSecret } = await getStripeConfig();
  const stripe = await getStripeClient();

  if (!stripe || !webhookSecret) {
    return res.status(503).json({ error: 'Stripe webhook handling is not configured in project_settings.' });
  }

  const signature = req.headers['stripe-signature'];
  const rawBody = (req as any).rawBody as Buffer | undefined;

  if (!signature || typeof signature !== 'string' || !rawBody) {
    return res.status(400).json({ error: 'Missing Stripe webhook signature or raw request payload.' });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err: any) {
    console.warn('[payment] Stripe webhook signature verification failed:', err?.message);
    return res.status(400).json({ error: 'Invalid webhook signature.' });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded': {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.payment_status === 'paid' || session.payment_status === 'no_payment_required') {
          await fulfillCheckoutSession(stripe, session);
        }
        break;
      }

      case 'invoice.paid': {
        const invoice = event.data.object as Stripe.Invoice;
        await handleInvoicePaid(stripe, invoice);
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        await handleInvoicePaymentFailed(stripe, invoice);
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionLifecycleEvent(subscription, false);
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionLifecycleEvent(subscription, true);
        break;
      }

      default:
        // Acknowledge unhandled Stripe event types gracefully
        break;
    }

    return res.json({ received: true });
  } catch (err: any) {
    console.error(`[payment] Stripe webhook processing error (${event.type}):`, err?.message);
    return res.status(500).json({ error: 'Webhook processing failed.' });
  }
});

/**
 * Activate a one-time 14-day Free Pro Trial for an organization
 * POST /api/payment/start-trial
 */
paymentRouter.post('/start-trial', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { organizationId } = req.body || {};
    const { userId } = req.user!;
    const orgIdNum = Number(organizationId || req.user!.organizationId);

    if (!Number.isInteger(orgIdNum) || orgIdNum <= 0) {
      return res.status(400).json({ error: 'Invalid organization ID.' });
    }

    const canManageBilling = await verifyOrgMembership(userId, orgIdNum, true);
    if (!canManageBilling) {
      return res.status(403).json({ error: 'You do not have permission to activate a trial for this organization.' });
    }

    const org = await DirectusAdminClient.getItemById('organizations', orgIdNum);
    if (!org) {
      return res.status(404).json({ error: 'Organization not found.' });
    }

    const existingSubs = await DirectusAdminClient.getItems('subscriptions', {
      filter: { organization_id: { _eq: orgIdNum } },
      limit: 50,
    }).catch(() => []);

    const hasUsedTrial =
      Boolean(org.has_used_trial) ||
      (Array.isArray(existingSubs) &&
        existingSubs.some((s: any) => String(s.Transaction_id || '').startsWith('TRIAL-')));

    if (hasUsedTrial) {
      return res.status(409).json({
        error: 'The 14-day free trial has already been used for this organization.',
      });
    }

    const startDate = new Date();
    const endDate = new Date(startDate.getTime() + 14 * 24 * 60 * 60 * 1000);

    const subscription = await DirectusAdminClient.createItem('subscriptions', {
      organization_id: orgIdNum,
      start_date: startDate.toISOString(),
      end_date: endDate.toISOString(),
      transaction_amount: '€0.00 (14-Day Free Trial)',
      Transaction_id: `TRIAL-${orgIdNum}-${Date.now()}`,
    });

    const updatedOrg = await DirectusAdminClient.updateItem('organizations', orgIdNum, {
      plan: 'atelier',
      has_used_trial: true,
      trial_ends_at: endDate.toISOString(),
      date_updated: startDate.toISOString(),
    });

    invalidateUserCaches(userId);

    return res.json({
      success: true,
      message: 'Your 14-day Atelier Cloud free trial is now active.',
      plan: 'atelier',
      planTier: 'atelier',
      isPro: true,
      isTrial: true,
      trialDaysRemaining: 14,
      trialEndsAt: endDate.toISOString(),
      organization: updatedOrg || { ...org, plan: 'atelier', has_used_trial: true, trial_ends_at: endDate.toISOString() },
      activeOrganization:
        updatedOrg || { ...org, plan: 'atelier', has_used_trial: true, trial_ends_at: endDate.toISOString() },
      subscription,
    });
  } catch (err: any) {
    console.error('[payment] Start free trial error:', err?.message);
    return res.status(500).json({ error: 'Could not activate free trial. Please try again.' });
  }
});

/**
 * Get organization subscription history, Stripe status & Customer Portal eligibility
 * GET /api/payment/subscriptions
 */
paymentRouter.get('/subscriptions', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { userId } = req.user!;
    const orgIdNum = Number(req.query.organization_id || req.user!.organizationId);

    if (!Number.isInteger(orgIdNum) || orgIdNum <= 0) {
      return res.status(400).json({ error: 'Invalid organization ID.' });
    }

    const isMember = await verifyOrgMembership(userId, orgIdNum);
    if (!isMember) {
      return res.status(403).json({ error: 'Access denied to this organization billing history.' });
    }

    const [org, subscriptions] = await Promise.all([
      DirectusAdminClient.getItemById('organizations', orgIdNum).catch(() => null),
      DirectusAdminClient.getItems('subscriptions', {
        filter: { organization_id: { _eq: orgIdNum } },
        sort: '-start_date',
        limit: 50,
      }).catch(() => []),
    ]);

    const list = Array.isArray(subscriptions) ? subscriptions : [];
    const now = Date.now();
    const activeSubscription =
      list.find((s: any) => s.end_date && new Date(s.end_date).getTime() > now) || null;

    let remainingDays = 0;
    if (activeSubscription?.end_date) {
      remainingDays = Math.max(
        0,
        Math.ceil((new Date(activeSubscription.end_date).getTime() - now) / (1000 * 60 * 60 * 24))
      );
    }

    const stripeStatus = org?.stripe_subscription_status || null;
    const hasBillingPortal = Boolean(org?.stripe_customer_id);
    const hasActiveStripeSubscription = Boolean(
      org?.stripe_subscription_id && ['active', 'trialing', 'past_due'].includes(String(stripeStatus || ''))
    );

    const orgPlan = org?.plan || 'free';
    const planTier = normalizePlanTier(orgPlan);

    return res.json({
      subscriptions: list,
      activeSubscription,
      plan: orgPlan,
      planTier,
      isPro: Boolean(activeSubscription) || isPaidCloudPlan(orgPlan),
      remainingDays,
      stripeSubscriptionStatus: stripeStatus,
      hasBillingPortal,
      hasActiveStripeSubscription,
    });
  } catch (err: any) {
    console.error('[payment] Fetch subscriptions error:', err?.message);
    return res.status(500).json({ error: 'Failed to load subscription history.' });
  }
});

/**
 * Disabled legacy test/simulation routes — kept as explicit 403 guards
 */
paymentRouter.post('/test-activate', requireAuth, (_req, res) => {
  return res.status(403).json({ error: 'Direct test activation is disabled. Please complete payment via Stripe Checkout.' });
});

paymentRouter.post('/test-activate-module', requireAuth, (_req, res) => {
  return res.status(403).json({ error: 'Direct module test activation is disabled. Please complete payment via Stripe Checkout.' });
});

paymentRouter.get('/simulate-gateway', (_req, res) => {
  return res.status(403).json({ error: 'Payment simulation gateway is disabled. Use Stripe test mode keys instead.' });
});
