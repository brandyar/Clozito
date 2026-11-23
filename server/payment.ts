import { Router, Request, Response } from 'express';
import Stripe from 'stripe';
import { DirectusAdminClient } from './directusAdmin';
import { requireAuth, AuthenticatedRequest, getUserOrganizations } from './auth';
import { generateLicenseTokenString } from '../src/utils/license';

export const paymentRouter = Router();

// Plan pricing definitions in EUR (whole euros & cents)
export const SUBSCRIPTION_PLANS: Record<
  number,
  { title: string; titleIt: string; priceEur: number; priceCents: number; discountPercent: number }
> = {
  1: {
    title: '1-Month Pro Plan',
    titleIt: 'Piano Pro 1 Mese',
    priceEur: 29,
    priceCents: 2900,
    discountPercent: 0,
  },
  3: {
    title: '3-Month Pro Plan (Quarterly)',
    titleIt: 'Piano Pro 3 Mesi (Trimestrale)',
    priceEur: 79,
    priceCents: 7900,
    discountPercent: 9,
  },
  6: {
    title: '6-Month Pro Plan (Semi-Annual)',
    titleIt: 'Piano Pro 6 Mesi (Semestrale)',
    priceEur: 149,
    priceCents: 14900,
    discountPercent: 14,
  },
  12: {
    title: '12-Month Pro Plan (Annual)',
    titleIt: 'Piano Pro 12 Mesi (Annuale)',
    priceEur: 269,
    priceCents: 26900,
    discountPercent: 23,
  },
};

// Default perpetual module pricing in EUR when catalog price is absent
const DEFAULT_MODULE_PRICES_EUR: Record<string, { name: string; priceEur: number }> = {
  barcode: { name: 'Barcode & Thermal Label Designer', priceEur: 49 },
  accounting: { name: 'Accounting & Financial Ledger', priceEur: 79 },
  woocommerce: { name: 'WooCommerce Store Sync', priceEur: 99 },
  online_catalog: { name: 'Digital Showroom & Size Finder', priceEur: 59 },
  production: { name: 'Garment Production & BOM', priceEur: 119 },
};

// In-memory idempotency guard to avoid double fulfillment when callback and webhook both arrive
const fulfilledSessions = new Set<string>();
const inFlightSessions = new Map<string, Promise<FulfillmentResult>>();

interface FulfillmentResult {
  type: 'pro_subscription' | 'module_purchase';
  organizationId: number;
  refNumber: string;
  moduleSlug?: string;
  moduleName?: string;
  alreadyFulfilled?: boolean;
}

interface StripeRuntimeConfig {
  secretKey: string;
  webhookSecret: string;
  fetchedAt: number;
}

const STRIPE_CONFIG_TTL_MS = 60 * 1000;
let cachedStripeConfig: StripeRuntimeConfig | null = null;
let cachedStripeClient: Stripe | null = null;
let cachedStripeKey: string | null = null;

/**
 * Loads STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET from the Directus `project_settings` collection
 * (supports both uppercase STRIPE_* and lowercase stripe_* field names), with environment fallback.
 */
async function getStripeConfig(forceRefresh = false): Promise<{ secretKey: string; webhookSecret: string }> {
  const now = Date.now();
  if (!forceRefresh && cachedStripeConfig && now - cachedStripeConfig.fetchedAt < STRIPE_CONFIG_TTL_MS) {
    return {
      secretKey: cachedStripeConfig.secretKey,
      webhookSecret: cachedStripeConfig.webhookSecret,
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

  // Only cache when we found at least one key so freshly added keys are picked up immediately
  if (secretKey || webhookSecret) {
    cachedStripeConfig = { secretKey, webhookSecret, fetchedAt: now };
  }

  return { secretKey, webhookSecret };
}

/**
 * Lazily initializes the Stripe client using keys from `project_settings` (fallback: env).
 * Never hardcodes credentials.
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
 */
function getAppOrigin(req: Request): string {
  const configured = (process.env.APP_URL || '').trim().replace(/\/+$/, '');
  if (configured && /^https?:\/\//i.test(configured)) {
    return configured;
  }
  const protoHeader = req.headers['x-forwarded-proto'];
  const proto = Array.isArray(protoHeader) ? protoHeader[0] : (protoHeader || req.protocol || 'http');
  const host = req.get('host') || 'localhost:3000';
  return `${proto}://${host}`;
}

/**
 * Strict server-side organization membership check.
 */
async function verifyOrgMembership(userId: string, organizationId: number): Promise<boolean> {
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
      return true;
    }
    const orgs = await getUserOrganizations(userId);
    return Array.isArray(orgs) && orgs.some((o: any) => Number(o.id) === organizationId);
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
 * Idempotently fulfills a paid Stripe Checkout Session (Pro Subscription or Perpetual Module License).
 */
async function fulfillCheckoutSession(session: Stripe.Checkout.Session): Promise<FulfillmentResult> {
  const sessionId = session.id;
  const metadata = session.metadata || {};
  const type = metadata.type === 'module_purchase' ? 'module_purchase' : 'pro_subscription';
  const organizationId = Number(metadata.organization_id);
  const paymentIntentRef =
    typeof session.payment_intent === 'string'
      ? session.payment_intent
      : session.payment_intent?.id || sessionId;

  if (!organizationId || isNaN(organizationId) || organizationId <= 0) {
    throw new Error('Missing valid organization_id in Stripe session metadata.');
  }

  if (fulfilledSessions.has(sessionId)) {
    return {
      type,
      organizationId,
      refNumber: paymentIntentRef,
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

      // Database-level idempotency check by Transaction_id
      const existingSubs = await DirectusAdminClient.getItems('subscriptions', {
        filter: {
          organization_id: { _eq: organizationId },
          Transaction_id: { _eq: sessionId },
        },
        limit: 1,
      }).catch(() => []);

      if (Array.isArray(existingSubs) && existingSubs.length > 0) {
        fulfilledSessions.add(sessionId);
        return {
          type: 'pro_subscription',
          organizationId,
          refNumber: paymentIntentRef,
          alreadyFulfilled: true,
        };
      }

      // Compute start & end date extending any currently active subscription
      let startDate = new Date();
      try {
        const activeSubs = await DirectusAdminClient.getItems('subscriptions', {
          filter: {
            organization_id: { _eq: organizationId },
            status: { _eq: 'active' },
          },
          sort: '-end_date',
          limit: 1,
        });
        if (Array.isArray(activeSubs) && activeSubs.length > 0 && activeSubs[0].end_date) {
          const currentEnd = new Date(activeSubs[0].end_date);
          if (currentEnd.getTime() > Date.now()) {
            startDate = currentEnd;
          }
        }
      } catch {
        // Fallback to starting now
      }

      const endDate = new Date(startDate.getTime());
      endDate.setMonth(endDate.getMonth() + durationMonths);

      await DirectusAdminClient.createItem('subscriptions', {
        organization_id: organizationId,
        plan: 'pro',
        status: 'active',
        start_date: startDate.toISOString(),
        end_date: endDate.toISOString(),
        amount: `€${amountEur.toFixed(2)}`,
        Transaction_id: sessionId,
      });

      await DirectusAdminClient.updateItem('organizations', organizationId, {
        plan: 'pro',
      });

      fulfilledSessions.add(sessionId);
      return {
        type: 'pro_subscription',
        organizationId,
        refNumber: paymentIntentRef,
      };
    } else {
      const moduleSlug = String(metadata.module_slug || '').trim();
      const moduleId = Number(metadata.module_id) || undefined;
      const moduleName = String(metadata.module_name || DEFAULT_MODULE_PRICES_EUR[moduleSlug]?.name || moduleSlug);
      const hardwareId = metadata.hardware_id && metadata.hardware_id !== 'ANY' ? metadata.hardware_id : null;

      if (!moduleSlug) {
        throw new Error('Missing module_slug in Stripe session metadata.');
      }

      // Resolve system module record if ID not provided
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

      // Check for existing entitlement record
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
 * Public: Get available EUR subscription plans & Stripe readiness status
 * GET /api/payment/plans
 */
paymentRouter.get('/plans', async (_req, res) => {
  const stripe = await getStripeClient().catch(() => null);
  return res.json({
    currency: 'EUR',
    stripeConfigured: Boolean(stripe),
    plans: Object.entries(SUBSCRIPTION_PLANS).map(([months, info]) => ({
      durationMonths: Number(months),
      title: info.title,
      titleIt: info.titleIt,
      priceEur: info.priceEur,
      priceCents: info.priceCents,
      discountPercent: info.discountPercent,
    })),
  });
});

/**
 * Create a Stripe Checkout Session for a Pro Subscription
 * POST /api/payment/request
 */
paymentRouter.post('/request', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const stripe = await getStripeClient();
    if (!stripe) {
      return res.status(503).json({
        error: 'Stripe is not configured yet. Please set STRIPE_SECRET_KEY in project_settings.',
      });
    }

    const { organizationId, durationMonths } = req.body || {};
    const { userId, email } = req.user!;

    const orgIdNum = Number(organizationId || req.user!.organizationId);
    if (!Number.isInteger(orgIdNum) || orgIdNum <= 0) {
      return res.status(400).json({ error: 'Invalid organization ID.' });
    }

    const months = Number(durationMonths);
    const planInfo = SUBSCRIPTION_PLANS[months];
    if (!planInfo) {
      return res.status(400).json({ error: 'Invalid subscription duration. Allowed values: 1, 3, 6, 12 months.' });
    }

    // Enforce tenant membership authorization
    const isMember = await verifyOrgMembership(userId, orgIdNum);
    if (!isMember) {
      return res.status(403).json({ error: 'You do not have permission to manage billing for this organization.' });
    }

    const org = await DirectusAdminClient.getItemById('organizations', orgIdNum);
    if (!org) {
      return res.status(404).json({ error: 'Organization not found.' });
    }

    const orderId = `CLZ-PRO-${orgIdNum}-${Date.now()}`;
    const appOrigin = getAppOrigin(req);

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: email || undefined,
      client_reference_id: orderId,
      line_items: [
        {
          price_data: {
            currency: 'eur',
            unit_amount: planInfo.priceCents,
            product_data: {
              name: `Clozito ${planInfo.title}`,
              description: `Cloud Pro workspace subscription for ${org.name || `Organization #${orgIdNum}`} (${months} month${months > 1 ? 's' : ''})`,
            },
          },
          quantity: 1,
        },
      ],
      metadata: {
        type: 'pro_subscription',
        order_id: orderId,
        organization_id: String(orgIdNum),
        user_id: String(userId),
        duration_months: String(months),
      },
      success_url: `${appOrigin}/api/payment/callback?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appOrigin}/?payment=cancelled&type=pro&org_id=${orgIdNum}`,
    });

    if (!session.url) {
      return res.status(502).json({ error: 'Failed to initialize Stripe Checkout session URL.' });
    }

    return res.json({
      success: true,
      sessionId: session.id,
      trackId: session.id,
      orderId,
      amountEur: planInfo.priceEur,
      currency: 'EUR',
      paymentUrl: session.url,
    });
  } catch (err: any) {
    console.error('[payment] Stripe Pro Checkout creation failed:', err?.message);
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
    if (!stripe) {
      return res.status(503).json({
        error: 'Stripe is not configured yet. Please set STRIPE_SECRET_KEY in project_settings.',
      });
    }

    const { organizationId, moduleSlug, hardwareId } = req.body || {};
    const { userId, email } = req.user!;

    const orgIdNum = Number(organizationId || req.user!.organizationId);
    if (!Number.isInteger(orgIdNum) || orgIdNum <= 0) {
      return res.status(400).json({ error: 'Invalid organization ID.' });
    }

    const cleanSlug = String(moduleSlug || '').trim();
    if (!/^[a-z0-9_-]{2,40}$/i.test(cleanSlug)) {
      return res.status(400).json({ error: 'Invalid module identifier.' });
    }

    const cleanHardwareId = hardwareId ? String(hardwareId).trim().slice(0, 64) : 'ANY';

    // Enforce tenant membership authorization
    const isMember = await verifyOrgMembership(userId, orgIdNum);
    if (!isMember) {
      return res.status(403).json({ error: 'You do not have permission to purchase modules for this organization.' });
    }

    const org = await DirectusAdminClient.getItemById('organizations', orgIdNum);
    if (!org) {
      return res.status(404).json({ error: 'Organization not found.' });
    }

    // Look up module catalog record
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

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: email || undefined,
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
    });

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
 * Stripe Checkout Return Callback
 * GET /api/payment/callback?session_id=cs_...
 */
paymentRouter.get('/callback', async (req: Request, res: Response) => {
  const sessionId = String(req.query.session_id || '').trim();
  if (!sessionId || !sessionId.startsWith('cs_')) {
    return res.redirect('/?payment=failed&reason=invalid_session');
  }

  try {
    const stripe = await getStripeClient();
    if (!stripe) {
      return res.redirect('/?payment=failed&reason=gateway_unconfigured');
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (!session || session.payment_status !== 'paid') {
      return res.redirect(
        `/?payment=failed&session_id=${encodeURIComponent(sessionId)}&reason=payment_not_completed`
      );
    }

    const result = await fulfillCheckoutSession(session);

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
      plan: 'pro',
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
    if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.payment_status === 'paid') {
        await fulfillCheckoutSession(session);
      }
    }
    return res.json({ received: true });
  } catch (err: any) {
    console.error('[payment] Stripe webhook fulfillment error:', err?.message);
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

    const isMember = await verifyOrgMembership(userId, orgIdNum);
    if (!isMember) {
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
      Array.isArray(existingSubs) &&
      existingSubs.some(
        (s: any) =>
          String(s.Transaction_id || '').startsWith('TRIAL-') ||
          String(s.plan || '').toLowerCase() === 'trial'
      );

    if (hasUsedTrial) {
      return res.status(409).json({
        error: 'The 14-day free trial has already been used for this organization.',
      });
    }

    const startDate = new Date();
    const endDate = new Date(startDate.getTime() + 14 * 24 * 60 * 60 * 1000);

    const subscription = await DirectusAdminClient.createItem('subscriptions', {
      organization_id: orgIdNum,
      plan: 'trial',
      status: 'active',
      start_date: startDate.toISOString(),
      end_date: endDate.toISOString(),
      amount: '€0.00 (14-Day Free Trial)',
      Transaction_id: `TRIAL-${orgIdNum}-${Date.now()}`,
    });

    const updatedOrg = await DirectusAdminClient.updateItem('organizations', orgIdNum, {
      plan: 'pro',
    });

    return res.json({
      success: true,
      message: 'Your 14-day Pro free trial is now active.',
      plan: 'pro',
      isPro: true,
      isTrial: true,
      trialDaysRemaining: 14,
      trialEndsAt: endDate.toISOString(),
      organization: updatedOrg || { ...org, plan: 'pro' },
      activeOrganization: updatedOrg || { ...org, plan: 'pro' },
      subscription,
    });
  } catch (err: any) {
    console.error('[payment] Start free trial error:', err?.message);
    return res.status(500).json({ error: 'Could not activate free trial. Please try again.' });
  }
});

/**
 * Get organization subscription history & remaining days
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

    const subscriptions = await DirectusAdminClient.getItems('subscriptions', {
      filter: { organization_id: { _eq: orgIdNum } },
      sort: '-start_date',
      limit: 50,
    }).catch(() => []);

    const list = Array.isArray(subscriptions) ? subscriptions : [];
    const now = Date.now();
    const activeSubscription =
      list.find((s: any) => s.status === 'active' && s.end_date && new Date(s.end_date).getTime() > now) || null;

    let remainingDays = 0;
    if (activeSubscription?.end_date) {
      remainingDays = Math.max(0, Math.ceil((new Date(activeSubscription.end_date).getTime() - now) / (1000 * 60 * 60 * 24)));
    }

    return res.json({
      subscriptions: list,
      activeSubscription,
      isPro: Boolean(activeSubscription),
      remainingDays,
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
