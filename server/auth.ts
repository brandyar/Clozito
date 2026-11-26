import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import Stripe from 'stripe';
import { DirectusAdminClient } from './directusAdmin';
import { isPaidCloudPlan, normalizePlanTier } from '../src/config/plans';
import {
  authLoginRateLimiter,
  authRegisterRateLimiter,
  authRefreshRateLimiter,
  authSensitiveActionRateLimiter,
} from './security';

const ENV_JWT_SECRET = (process.env.JWT_SECRET || '').trim();
if (!ENV_JWT_SECRET && process.env.NODE_ENV === 'production') {
  console.warn(
    '[Clozito Auth] WARNING: JWT_SECRET environment variable is not set in production. Using an ephemeral random signing key (sessions will reset on restart).'
  );
}
const JWT_SECRET = ENV_JWT_SECRET || crypto.randomBytes(32).toString('hex');

export interface AuthTokenPayload {
  userId: string;
  email: string;
  organizationId: number;
  role: string;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthTokenPayload;
}

export function generateToken(payload: AuthTokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '30d' });
}

export function verifyToken(token: string): AuthTokenPayload | null {
  try {
    const verified = jwt.verify(token, JWT_SECRET) as any;
    if (!verified || typeof verified !== 'object' || !verified.userId) {
      return null;
    }
    return {
      userId: String(verified.userId),
      email: String(verified.email || ''),
      organizationId: Number(verified.organizationId || 0),
      role: String(verified.role || 'viewer'),
    };
  } catch {
    return null;
  }
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required. Missing or invalid Bearer token.' });
  }

  const token = authHeader.split(' ')[1];
  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({ error: 'Invalid or expired session token.' });
  }

  req.user = payload;
  next();
}

/**
 * Securely resolve all full Organization objects that a user belongs to.
 * Strictly checks organization_users memberships and prevents tenant leakage.
 */
// In-memory SWR caches for user organizations & profile to eliminate repeated Directus roundtrips after idle
const userOrgsCache = new Map<string, { activeOrganization: any; organizations: any[]; timestamp: number }>();
const userOrgsInFlight = new Map<string, Promise<{ activeOrganization: any; organizations: any[] }>>();
const userMeCache = new Map<string, { data: any; timestamp: number }>();

const USER_ORGS_FRESH_MS = 60 * 1000; // 60 seconds fresh
const USER_ORGS_SWR_MS = 10 * 60 * 1000; // 10 minutes stale-while-revalidate

export function invalidateUserCaches(userId?: string): void {
  if (!userId) {
    userOrgsCache.clear();
    userMeCache.clear();
    return;
  }
  userOrgsCache.delete(userId);
  for (const key of userMeCache.keys()) {
    if (key.startsWith(`${userId}_`)) {
      userMeCache.delete(key);
    }
  }
}

/**
 * Validates and enforces trial and subscription status on an organization.
 * If trial has expired and there is no active paid subscription, auto-downgrades plan to 'free'.
 */
export async function sanitizeAndEnforceOrgPlan(org: any): Promise<any> {
  if (!org || !org.id) return org;
  const now = new Date();
  const currentPlan = org.plan || 'free';

  if (isPaidCloudPlan(currentPlan)) {
    let isTrialActive = false;
    let trialExpired = false;

    if (org.trial_ends_at) {
      const trialEnd = new Date(org.trial_ends_at);
      if (!isNaN(trialEnd.getTime())) {
        if (trialEnd > now) {
          isTrialActive = true;
        } else {
          trialExpired = true;
        }
      }
    } else if (org.has_used_trial) {
      trialExpired = true;
    }

    if (isTrialActive) {
      return {
        ...org,
        is_trial: true,
        trial_days_remaining: Math.max(0, Math.ceil((new Date(org.trial_ends_at).getTime() - now.getTime()) / (1000 * 60 * 60 * 24))),
      };
    }

    // Check Stripe recurring subscription status first (handles active, trialing, and past_due grace period)
    const stripeStatus = String(org.stripe_subscription_status || '').toLowerCase();
    if (org.stripe_subscription_id && ['active', 'trialing', 'past_due'].includes(stripeStatus)) {
      return {
        ...org,
        plan: currentPlan,
        has_active_subscription: true,
      };
    }

    // Check for active paid subscription
    try {
      const subs: any[] = await DirectusAdminClient.getItems('subscriptions', {
        filter: { organization_id: { _eq: Number(org.id) } },
        sort: '-end_date',
        limit: 10,
      }).catch(() => []);

      const activePaidSub = subs.find((s: any) => {
        if (!s.end_date) return false;
        const notTrial = !String(s.transaction_id || s.Transaction_id || '').startsWith('TRIAL-');
        const endDate = new Date(s.end_date);
        return notTrial && !isNaN(endDate.getTime()) && endDate > now;
      });

      if (activePaidSub && stripeStatus !== 'canceled') {
        return {
          ...org,
          plan: currentPlan,
          has_active_subscription: true,
          subscription_end_date: activePaidSub.end_date,
        };
      }

      // Neither active trial nor active paid sub -> Auto downgrade to free
      console.log(`[enforceOrganizationPlan] Org #${org.id} (${org.name}) cloud trial/subscription expired. Downgrading to 'free'`);
      org.plan = 'free';

      DirectusAdminClient.updateItem('organizations', Number(org.id), {
        plan: 'free',
        date_updated: now.toISOString(),
      }).catch((err: any) => console.error(`[enforceOrganizationPlan] Failed to update org #${org.id} to free:`, err.message));
    } catch (err: any) {
      console.warn(`[enforceOrganizationPlan] Error checking subscriptions for org #${org.id}:`, err.message);
      if (trialExpired) {
        org.plan = 'free';
      }
    }
  }

  return org;
}

async function fetchUserOrganizationsFresh(
  userId: string,
  targetActiveOrgId?: number,
  userEmail?: string
): Promise<{ activeOrganization: any; organizations: any[] }> {
  const existingPromise = userOrgsInFlight.get(userId);
  if (existingPromise && !targetActiveOrgId) {
    return existingPromise;
  }

  const work = (async () => {
    try {
      // 1. Fetch memberships from organization_users strictly for this userId / email
      let memberships: any[] = [];
      try {
        const filters: any[] = [
          { user_id: { _eq: userId } },
          { user_id: { id: { _eq: userId } } },
        ];
        if (userEmail) {
          filters.push({ user_id: { email: { _eq: userEmail.toLowerCase().trim() } } });
        }

        memberships = await DirectusAdminClient.getItems('organization_users', {
          filter: {
            _or: filters,
          },
          fields: ['id', 'role', 'status', 'organization_id.*', 'organization_id', 'warehouse_id', 'financial_account_id', 'can_change_warehouse', 'user_id.id', 'user_id.email'],
        });
      } catch (err: any) {
        console.warn('[getUserOrganizations] First membership fetch attempt failed:', err.message);
        try {
          memberships = await DirectusAdminClient.getItems('organization_users', {
            filter: { user_id: { _eq: userId } },
            fields: ['id', 'role', 'status', 'organization_id.*', 'organization_id', 'warehouse_id', 'financial_account_id', 'can_change_warehouse'],
          });
        } catch (err2: any) {
          console.warn('[getUserOrganizations] Second membership fetch attempt failed:', err2.message);
          memberships = [];
        }
      }

      const orgList: any[] = [];
      const orgIdsToFetch = new Set<number>();

      for (const m of memberships) {
        const rawWh = typeof m.warehouse_id === 'object' && m.warehouse_id ? m.warehouse_id.id : m.warehouse_id;
        const rawAcc = typeof m.financial_account_id === 'object' && m.financial_account_id ? m.financial_account_id.id : m.financial_account_id;
        if (typeof m.organization_id === 'object' && m.organization_id && m.organization_id.id && m.organization_id.name) {
          orgList.push({
            ...m.organization_id,
            user_role: m.role || 'viewer',
            user_warehouse_id: rawWh ? Number(rawWh) : null,
            user_financial_account_id: rawAcc ? Number(rawAcc) : null,
            user_can_change_warehouse: m.can_change_warehouse !== undefined && m.can_change_warehouse !== null ? Boolean(m.can_change_warehouse) : true,
          });
        } else if (m.organization_id) {
          const idNum = Number(typeof m.organization_id === 'object' ? m.organization_id.id : m.organization_id);
          if (idNum && !isNaN(idNum) && idNum > 0) {
            orgIdsToFetch.add(idNum);
          }
        }
      }

      // 2. Fetch full organization objects ONLY for verified memberships
      for (const orgId of Array.from(orgIdsToFetch)) {
        if (!orgList.some((o) => Number(o.id) === Number(orgId))) {
          try {
            const org = await DirectusAdminClient.getItemById('organizations', orgId);
            if (org && org.id && org.name) {
              const matchingMembership = memberships.find(
                (m: any) => Number(typeof m.organization_id === 'object' ? m.organization_id?.id : m.organization_id) === Number(orgId)
              );
              const rawWh = matchingMembership && typeof matchingMembership.warehouse_id === 'object' && matchingMembership.warehouse_id ? matchingMembership.warehouse_id.id : matchingMembership?.warehouse_id;
              const rawAcc = matchingMembership && typeof matchingMembership.financial_account_id === 'object' && matchingMembership.financial_account_id ? matchingMembership.financial_account_id.id : matchingMembership?.financial_account_id;
              orgList.push({
                ...org,
                user_role: matchingMembership?.role || 'viewer',
                user_warehouse_id: rawWh ? Number(rawWh) : null,
                user_financial_account_id: rawAcc ? Number(rawAcc) : null,
                user_can_change_warehouse: matchingMembership?.can_change_warehouse !== undefined && matchingMembership?.can_change_warehouse !== null ? Boolean(matchingMembership.can_change_warehouse) : true,
              });
            }
          } catch (fetchErr: any) {
            console.warn(`[getUserOrganizations] Could not load organization #${orgId}:`, fetchErr.message);
          }
        }
      }

      // 3. Deduplicate organizations by ID
      const uniqueOrgs: any[] = [];
      const seenIds = new Set<number>();
      for (const org of orgList) {
        const idNum = Number(org.id);
        if (idNum && !seenIds.has(idNum)) {
          seenIds.add(idNum);
          uniqueOrgs.push(org);
        }
      }

      // 4. Sanitize and enforce plan status (revert expired trials/subs to free)
      const sanitizedOrgs: any[] = [];
      for (const org of uniqueOrgs) {
        const sanitized = await sanitizeAndEnforceOrgPlan(org);
        sanitizedOrgs.push(sanitized);
      }

      let activeOrg: any = null;
      if (targetActiveOrgId) {
        activeOrg = sanitizedOrgs.find((o) => Number(o.id) === Number(targetActiveOrgId)) || null;
      }
      if (!activeOrg && sanitizedOrgs.length > 0) {
        activeOrg = sanitizedOrgs[0];
      }

      if (sanitizedOrgs.length > 0) {
        const result = { activeOrganization: activeOrg, organizations: sanitizedOrgs };
        userOrgsCache.set(userId, { ...result, timestamp: Date.now() });
        return result;
      }

      const cached = userOrgsCache.get(userId);
      if (cached && cached.organizations.length > 0) {
        let fallbackActive = cached.activeOrganization;
        if (targetActiveOrgId) {
          fallbackActive = cached.organizations.find((o) => Number(o.id) === Number(targetActiveOrgId)) || fallbackActive;
        }
        return { activeOrganization: fallbackActive, organizations: cached.organizations };
      }

      return { activeOrganization: activeOrg, organizations: uniqueOrgs };
    } finally {
      userOrgsInFlight.delete(userId);
    }
  })();

  if (!targetActiveOrgId) {
    userOrgsInFlight.set(userId, work);
  }
  return work;
}

export async function getUserOrganizations(userId: string, targetActiveOrgId?: number, userEmail?: string): Promise<{ activeOrganization: any; organizations: any[] }> {
  try {
    const existingCache = userOrgsCache.get(userId);
    if (existingCache && existingCache.organizations.length > 0) {
      const age = Date.now() - existingCache.timestamp;
      if (age < USER_ORGS_SWR_MS) {
        // If stale (older than 60s), refresh silently in background without blocking the request
        if (age >= USER_ORGS_FRESH_MS && !userOrgsInFlight.has(userId)) {
          fetchUserOrganizationsFresh(userId, targetActiveOrgId, userEmail).catch(() => {});
        }
        if (!targetActiveOrgId) {
          return { activeOrganization: existingCache.activeOrganization, organizations: existingCache.organizations };
        }
        const matched = existingCache.organizations.find((o) => Number(o.id) === Number(targetActiveOrgId));
        if (matched) {
          return { activeOrganization: matched, organizations: existingCache.organizations };
        }
      }
    }

    return await fetchUserOrganizationsFresh(userId, targetActiveOrgId, userEmail);
  } catch (error: any) {
    console.error('[getUserOrganizations Error]:', error);
    const cached = userOrgsCache.get(userId);
    if (cached && cached.organizations.length > 0) {
      console.warn(`[getUserOrganizations] Directus error for user ${userId}, serving from cache.`);
      return { activeOrganization: cached.activeOrganization, organizations: cached.organizations };
    }
    return { activeOrganization: null, organizations: [] };
  }
}

/* SWR helper above replaces legacy inline body */

export const authRouter = Router();

// Register new user + provision custom Organization + initial warehouse/category
authRouter.post('/register', authRegisterRateLimiter, async (req: Request, res: Response) => {
  try {
    let body: any = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {
        body = {};
      }
    }
    body = body || {};

    const email = (body.email || body.username || body.userEmail || body.Email || '').toString().trim();
    const password = (body.password || body.pass || body.Password || '').toString();
    const first_name = (body.first_name || body.firstName || '').toString().trim();
    const last_name = (body.last_name || body.lastName || '').toString().trim();
    const user_phone = (body.user_phone || body.userPhone || body.phone || '').toString().trim();
    const org_name = (body.org_name || body.orgName || '').toString().trim();
    const org_slug = (body.org_slug || body.orgSlug || '').toString().trim();
    const currency = (body.currency || 'EUR').toString().trim();
    const timezone = (body.timezone || 'Europe/Rome').toString().trim();
    const locale = String(body.locale || 'en').toLowerCase() === 'it' ? 'it' : 'en';
    const initial_category_name = (body.initial_category_name || body.initialCategoryName || '').toString().trim();
    const initial_warehouse_name = (body.initial_warehouse_name || body.initialWarehouseName || '').toString().trim();
    const accepted_terms = body.accepted_terms === true || body.acceptedTerms === true;

    if (!email || !password) {
      console.warn('[Auth Register Warning] Missing email or password:', { hasEmail: !!email, hasPassword: !!password, bodyKeys: Object.keys(body) });
      return res.status(400).json({ error: locale === 'it' ? 'Email e password sono obbligatori.' : 'Email address and password are required.' });
    }

    if (!accepted_terms) {
      return res.status(400).json({
        error:
          locale === 'it'
            ? 'Devi accettare i Termini di Servizio e l\'Informativa sulla Privacy per registrarti.'
            : 'You must accept the Terms of Service and Privacy Policy to create an account.',
      });
    }

    // Authoritative server-generated GDPR consent timestamp
    const consentTimestamp = new Date().toISOString();

    // 1. Check if user already exists
    const existingUsers = await DirectusAdminClient.getItems('directus_users', {
      filter: { email: { _eq: email.toLowerCase().trim() } },
      limit: 1,
    }).catch(() => []);

    let userId: string;
    let userEmail = email.toLowerCase().trim();
    let userFirstName = first_name || '';
    let userLastName = last_name || '';

    if (existingUsers && existingUsers.length > 0) {
      const existingUser = existingUsers[0];
      const orgsData = await getUserOrganizations(existingUser.id, undefined, userEmail);
      if (orgsData.organizations.length > 0) {
        return res.status(400).json({
          error:
            locale === 'it'
              ? 'Questa email è già registrata con un negozio. Effettua l\'accesso.'
              : 'This email address is already registered with a workspace. Please sign in instead.',
        });
      }
      userId = existingUser.id;
      userFirstName = existingUser.first_name || userFirstName;
      userLastName = existingUser.last_name || userLastName;
      // Update password & phone if provided
      const userUpdatePayload: any = {};
      if (password) userUpdatePayload.password = password;
      if (user_phone) userUpdatePayload.user_phone = user_phone;
      if (Object.keys(userUpdatePayload).length > 0) {
        await DirectusAdminClient.request(`/users/${userId}`, {
          method: 'PATCH',
          body: JSON.stringify(userUpdatePayload),
        }).catch(() => {});
      }
    } else {
      // 2. Create User via Admin Client with tenant role
      const userRoleId = DirectusAdminClient.getUserRoleId();
      const userPayload: any = {
        email: userEmail,
        password: password,
        first_name: userFirstName,
        last_name: userLastName,
        user_phone: user_phone,
        status: 'active',
        role: userRoleId,
      };

      let newUser: any;
      try {
        newUser = await DirectusAdminClient.request('/users', {
          method: 'POST',
          body: JSON.stringify(userPayload),
        });
      } catch (err: any) {
        console.error('[Auth Service] User creation error:', err.message);
        const errMsg = err?.message || '';

        if (
          errMsg.includes('RECORD_NOT_UNIQUE') ||
          errMsg.toLowerCase().includes('unique') ||
          errMsg.toLowerCase().includes('already exists')
        ) {
          return res.status(400).json({
            error:
              locale === 'it'
                ? 'Questa email è già registrata. Effettua l\'accesso.'
                : 'This email address is already registered. Please sign in.',
          });
        }

        if (errMsg.includes('INVALID_CREDENTIALS') || errMsg.includes('Invalid user credentials')) {
          return res.status(500).json({
            error: 'Server authentication configuration error. Please contact an administrator.',
          });
        }

        return res.status(500).json({
          error:
            locale === 'it'
              ? `Errore durante la creazione dell'account: ${errMsg}`
              : `Could not create user account: ${errMsg}`,
        });
      }

      userId = newUser.id;
    }

    // 3. Create the Organization specified by the user
    const generatedSlug = (org_slug && org_slug.trim())
      ? org_slug.trim().toLowerCase().replace(/[^a-z0-9-_]/g, '-')
      : `org-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;

    const defaultOrgFallback =
      locale === 'it'
        ? (first_name ? `Boutique ${first_name} ${last_name || ''}`.trim() : 'La Mia Boutique')
        : (first_name ? `${first_name} ${last_name || ''} Boutique`.trim() : 'My Boutique');

    const finalOrgName = (org_name && org_name.trim()) ? org_name.trim() : defaultOrgFallback;

    const resolvedCurrency = !currency || currency.toUpperCase() === 'TOMAN' ? 'EUR' : currency;

    const baseOrgPayload = {
      name: finalOrgName,
      slug: generatedSlug,
      currency: resolvedCurrency,
      timezone: timezone || 'Europe/Rome',
      plan: 'free',
      status: 'active',
    };

    let newOrg: any;
    try {
      newOrg = await DirectusAdminClient.createItem('organizations', {
        ...baseOrgPayload,
        terms_accepted_at: consentTimestamp,
        privacy_accepted_at: consentTimestamp,
      });
    } catch (consentColErr: any) {
      // Graceful fallback if optional GDPR timestamp columns have not yet been added in Directus schema
      console.warn('[Auth Register] Consent timestamp columns not yet present on organizations, retrying base payload:', consentColErr?.message);
      newOrg = await DirectusAdminClient.createItem('organizations', baseOrgPayload);
    }

    if (newOrg && typeof newOrg === 'object') {
      newOrg = {
        ...newOrg,
        terms_accepted_at: newOrg.terms_accepted_at || consentTimestamp,
        privacy_accepted_at: newOrg.privacy_accepted_at || consentTimestamp,
      };
    }

    // 4. Create membership in organization_users (role: owner)
    await DirectusAdminClient.createItem('organization_users', {
      organization_id: newOrg.id,
      user_id: userId,
      role: 'owner',
      status: 'active',
      date_joined: new Date().toISOString(),
    });

    // 5. Create initial starter items for the new organization (EN/IT localized, never Persian)
    try {
      // 5a. Initial Category
      const categoryTitle = (initial_category_name && initial_category_name.trim())
        ? initial_category_name.trim()
        : (locale === 'it' ? 'Abbigliamento Generale' : 'General Apparel');
      await DirectusAdminClient.createItem('categories', {
        organization_id: newOrg.id,
        name: categoryTitle,
        slug: `cat-${Date.now().toString(36)}`,
        status: 'active',
      }).catch((e) => console.warn('Could not seed initial category:', e.message));

      // 5b. Initial Warehouse
      const warehouseTitle = (initial_warehouse_name && initial_warehouse_name.trim())
        ? initial_warehouse_name.trim()
        : (locale === 'it' ? 'Magazzino Centrale' : 'Main Warehouse');
      await DirectusAdminClient.createItem('warehouses', {
        organization_id: newOrg.id,
        name: warehouseTitle,
        code: 'WH-MAIN',
        status: 'active',
      }).catch((e) => console.warn('Could not seed initial warehouse:', e.message));
    } catch (seedErr: any) {
      console.warn('[Auth Register] Starter seeding warning:', seedErr.message);
    }

    // 6. Generate Auth JWT token
    const token = generateToken({
      userId: userId,
      email: userEmail,
      organizationId: newOrg.id,
      role: 'owner',
    });

    return res.status(201).json({
      success: true,
      token,
      access_token: token,
      refresh_token: token,
      user: {
        id: userId,
        email: userEmail,
        first_name: userFirstName,
        last_name: userLastName,
        user_phone: user_phone,
        role: 'owner',
      },
      organization: newOrg,
    });
  } catch (error: any) {
    console.error('[Auth Register Error]:', error);
    return res.status(500).json({ error: error.message || 'Registration failed.' });
  }
});

// Login with email & password
authRouter.post('/login', authLoginRateLimiter, async (req: Request, res: Response) => {
  try {
    let body: any = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {
        body = {};
      }
    }
    body = body || {};

    const email = (body.email || body.username || body.userEmail || '').toString().trim();
    const password = (body.password || body.pass || '').toString();

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const cleanEmail = email.toLowerCase().trim();

    // 1. Authenticate credentials
    let directusAuthRes: any;
    try {
      directusAuthRes = await DirectusAdminClient.request('/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          email: cleanEmail,
          password: password,
          mode: 'json',
        }),
      });
    } catch (err: any) {
      console.warn(`[Auth Login] Auth error for ${cleanEmail}:`, err.message);
      return res.status(401).json({ error: 'Invalid email address or password.' });
    }

    // 2. Fetch full user info using access_token or Admin Client
    let userRecord: any;
    if (directusAuthRes?.access_token) {
      try {
        userRecord = await DirectusAdminClient.request('/users/me', {
          headers: {
            Authorization: `Bearer ${directusAuthRes.access_token}`,
          },
        });
      } catch {
        // Fallback to query
      }
    }

    if (!userRecord) {
      try {
        const users = await DirectusAdminClient.getItems('directus_users', {
          filter: { email: { _eq: cleanEmail } },
          limit: 1,
        });
        userRecord = users?.[0];
      } catch (err: any) {
        console.warn('[Auth Login] User lookup error:', err.message);
      }
    }

    if (!userRecord) {
      return res.status(404).json({ error: 'User account not found.' });
    }

    const userId = userRecord.id;

    // 3. Fetch user's organizations and active org
    const orgsData = await getUserOrganizations(userId, undefined, cleanEmail);
    let activeOrg = orgsData.activeOrganization;
    let userRole = activeOrg?.user_role || 'viewer';

    if (!activeOrg || orgsData.organizations.length === 0) {
      return res.status(403).json({
        error: 'No workspace or store is associated with this account. Please register to create your store.',
      });
    }

    // 4. Generate user JWT
    const token = generateToken({
      userId: userId,
      email: cleanEmail,
      organizationId: activeOrg.id,
      role: userRole,
    });

    const userProfile = {
      id: userId,
      email: userRecord.email,
      first_name: userRecord.first_name,
      last_name: userRecord.last_name,
      avatar: userRecord.avatar,
      title: userRecord.title,
      status: userRecord.status,
      role: userRole,
    };

    return res.json({
      success: true,
      token,
      access_token: token,
      refresh_token: token,
      user: userProfile,
      activeOrganization: activeOrg,
      organizations: orgsData.organizations,
    });
  } catch (error: any) {
    console.error('[Auth Login Error]:', error);
    return res.status(500).json({ error: error.message || 'Sign-in failed.' });
  }
});

// Silent token refresh endpoint (issues fresh JWT before or shortly after expiry)
authRouter.post('/refresh', authRefreshRateLimiter, async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    const rawToken =
      req.body?.refresh_token ||
      (authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : '');

    if (!rawToken || typeof rawToken !== 'string') {
      return res.status(401).json({ error: 'Refresh token is required.' });
    }

    let decoded: any = null;
    try {
      decoded = jwt.verify(rawToken, JWT_SECRET, { ignoreExpiration: true });
    } catch {
      return res.status(401).json({ error: 'Invalid refresh token signature.' });
    }

    if (!decoded || !decoded.userId) {
      return res.status(401).json({ error: 'Invalid refresh token payload.' });
    }

    // Reject tokens expired more than 7 days ago
    if (decoded.exp && Date.now() / 1000 - Number(decoded.exp) > 7 * 24 * 60 * 60) {
      return res.status(401).json({ error: 'Session expired. Please sign in again.' });
    }

    const userId = String(decoded.userId);
    const email = String(decoded.email || '');
    const targetOrgId = Number(decoded.organizationId) || undefined;

    const { activeOrganization } = await getUserOrganizations(userId, targetOrgId, email);
    const resolvedOrgId = Number(activeOrganization?.id || targetOrgId || 1);
    const resolvedRole = activeOrganization?.user_role || decoded.role || 'viewer';

    const newToken = generateToken({
      userId,
      email,
      organizationId: resolvedOrgId,
      role: resolvedRole,
    });

    return res.json({
      success: true,
      token: newToken,
      access_token: newToken,
      refresh_token: newToken,
      expires_in: 30 * 24 * 60 * 60,
    });
  } catch (error: any) {
    console.error('[Auth /refresh Error]:', error);
    return res.status(500).json({ error: error.message || 'Failed to refresh user session.' });
  }
});

// Current User Profile & Organization info
authRouter.get('/me', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { userId, organizationId } = req.user!;
    const cacheKey = `${userId}_${organizationId || 'default'}`;
    const cached = userMeCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < 30000) {
      return res.json(cached.data);
    }

    // Fetch user details
    const user = await DirectusAdminClient.request(`/users/${userId}`).catch(() => null);
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    // Fetch full organization details and all memberships
    const { activeOrganization, organizations } = await getUserOrganizations(userId, organizationId, user.email);
    const userRole = activeOrganization?.user_role || req.user?.role || 'viewer';

    const responseData = {
      id: user.id,
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      avatar: user.avatar,
      title: user.title,
      status: user.status,
      role: userRole,
      user_role: userRole,
      active_organization_id: activeOrganization?.id || organizationId,
      active_organization: activeOrganization,
      activeOrganization: activeOrganization,
      organizations: organizations,
    };

    userMeCache.set(cacheKey, { data: responseData, timestamp: Date.now() });
    return res.json(responseData);
  } catch (error: any) {
    console.error('[Auth /me Error]:', error);
    return res.status(500).json({ error: error.message || 'Failed to fetch user profile.' });
  }
});

// Update Current User Profile & Password directly in Directus
authRouter.patch('/me', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { userId } = req.user!;
    const { first_name, last_name, title, avatar, password, current_password } = req.body;

    // 1. Fetch current user from Directus
    const currentUser = await DirectusAdminClient.request(`/users/${userId}`).catch(() => null);
    if (!currentUser) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const updatePayload: Record<string, any> = {};
    if (first_name !== undefined) updatePayload.first_name = String(first_name).trim();
    if (last_name !== undefined) updatePayload.last_name = String(last_name).trim();
    if (title !== undefined) updatePayload.title = String(title).trim();
    if (avatar !== undefined) updatePayload.avatar = avatar;

    // 2. If password change is requested
    if (password && typeof password === 'string' && password.trim().length > 0) {
      const cleanPass = password.trim();
      if (cleanPass.length < 6) {
        return res.status(400).json({ error: 'New password must be at least 6 characters.' });
      }

      // If current password provided, verify against Directus login
      if (current_password) {
        try {
          const directusBaseUrl = DirectusAdminClient.getBaseUrl();
          const verifyRes = await fetch(`${directusBaseUrl}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: currentUser.email,
              password: current_password,
              mode: 'json',
            }),
          });
          if (!verifyRes.ok) {
            return res.status(400).json({ error: 'Current password is incorrect.' });
          }
        } catch (authErr: any) {
          console.warn('[Auth PATCH /me] Password check warning:', authErr?.message);
        }
      }

      updatePayload.password = cleanPass;
    }

    // 3. Save updates into Directus
    const updatedUser = await DirectusAdminClient.request(`/users/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify(updatePayload),
    });

    const finalUser = updatedUser?.data || updatedUser || currentUser;

    return res.json({
      success: true,
      message: 'User profile updated successfully.',
      user: {
        id: finalUser.id || userId,
        email: finalUser.email || currentUser.email,
        first_name: finalUser.first_name ?? updatePayload.first_name ?? currentUser.first_name,
        last_name: finalUser.last_name ?? updatePayload.last_name ?? currentUser.last_name,
        avatar: finalUser.avatar ?? updatePayload.avatar ?? currentUser.avatar,
        title: finalUser.title ?? updatePayload.title ?? currentUser.title,
      },
    });
  } catch (error: any) {
    console.error('[Auth PATCH /me Error]:', error);
    return res.status(500).json({ error: error.message || 'Failed to update user profile.' });
  }
});

// Switch active organization
authRouter.post('/switch-org', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { targetOrganizationId } = req.body;
    const { userId, email } = req.user!;

    if (!targetOrganizationId) {
      return res.status(400).json({ error: 'targetOrganizationId is required' });
    }

    const { activeOrganization, organizations } = await getUserOrganizations(userId, Number(targetOrganizationId), email);

    if (!activeOrganization || Number(activeOrganization.id) !== Number(targetOrganizationId)) {
      return res.status(403).json({ error: 'You do not have access to this organization.' });
    }

    const role = activeOrganization.user_role || 'viewer';

    invalidateUserCaches(userId);

    const newToken = generateToken({
      userId,
      email,
      organizationId: Number(activeOrganization.id),
      role,
    });

    return res.json({
      success: true,
      token: newToken,
      access_token: newToken,
      refresh_token: newToken,
      activeOrganization,
      organizations,
      role,
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to switch organization.' });
  }
});

// Check live organization plan status directly from Directus with trial support & auto-downgrade
authRouter.get('/check-plan', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { userId, organizationId, email } = req.user!;
    const orgIdNum = Number(req.query.organization_id || organizationId);
    if (!orgIdNum || isNaN(orgIdNum) || orgIdNum <= 0) {
      return res.status(400).json({ error: 'No active organization specified.' });
    }

    // Always fetch fresh organization directly from Directus Admin
    const org: any = await DirectusAdminClient.getItemById('organizations', orgIdNum);
    if (!org) {
      return res.status(404).json({ error: 'Organization not found.' });
    }

    const now = new Date();
    let currentPlan = org.plan || 'free';
    let isTrial = false;
    let trialDaysRemaining = 0;
    let trialExpired = false;

    // 1. Check if organization has any active paid subscription
    const existingSubs: any[] = await DirectusAdminClient.getItems('subscriptions', {
      filter: { organization_id: { _eq: orgIdNum } },
      sort: '-end_date',
      limit: 10,
    }).catch(() => []);

    const activePaidSub = existingSubs.find((s: any) => {
      if (!s.end_date) return false;
      const notTrial = !String(s.Transaction_id || '').startsWith('TRIAL-');
      return notTrial && new Date(s.end_date) > now;
    });

    // 2. Check trial status
    if (org.trial_ends_at) {
      const trialEnd = new Date(org.trial_ends_at);
      if (trialEnd > now) {
        isTrial = true;
        trialDaysRemaining = Math.max(0, Math.ceil((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
      } else {
        trialExpired = true;
      }
    }

    // 3. Auto-downgrade logic:
    // Respect active/trialing/past_due Stripe subscriptions; otherwise downgrade if no active paid sub and trial expired
    const stripeStatus = String(org.stripe_subscription_status || '').toLowerCase();
    const hasLiveStripeSub = Boolean(
      org.stripe_subscription_id && ['active', 'trialing', 'past_due'].includes(stripeStatus)
    );

    if (isPaidCloudPlan(currentPlan) && !hasLiveStripeSub && (!activePaidSub || stripeStatus === 'canceled')) {
      if (trialExpired || (org.has_used_trial && !isTrial) || stripeStatus === 'canceled') {
        console.log(`[check-plan] Organization #${orgIdNum} trial/subscription ended. Reverting plan to 'free'`);
        await DirectusAdminClient.updateItem('organizations', orgIdNum, {
          plan: 'free',
          date_updated: now.toISOString(),
        }).catch((err) => console.error('[check-plan] Failed to update org plan to free:', err));
        currentPlan = 'free';
        org.plan = 'free';
      }
    }

    const isPro = isPaidCloudPlan(currentPlan);
    const planTier = normalizePlanTier(currentPlan);
    const { activeOrganization, organizations } = await getUserOrganizations(userId, orgIdNum, email);

    return res.json({
      success: true,
      organizationId: orgIdNum,
      plan: currentPlan,
      planTier,
      isPro,
      isTrial: isPro && isTrial,
      trialDaysRemaining,
      trialEndsAt: org.trial_ends_at || null,
      hasUsedTrial: Boolean(org.has_used_trial),
      trialExpired,
      organization: org,
      activeOrganization: activeOrganization || org,
      organizations,
    });
  } catch (error: any) {
    console.error('[Auth /check-plan Error]:', error);
    return res.status(500).json({ error: error.message || 'Failed to check subscription status.' });
  }
});

// Activate 14-day free trial for Pro plan
authRouter.post('/start-trial', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { userId, organizationId, email } = req.user!;
    const orgIdNum = Number(req.body?.organization_id || req.body?.organizationId || organizationId);

    if (!orgIdNum || isNaN(orgIdNum) || orgIdNum <= 0) {
      return res.status(400).json({ error: 'Organization ID is not specified.' });
    }

    // Verify user membership in organization
    const orgMembers = await DirectusAdminClient.getItems('organization_users', {
      filter: {
        organization_id: { _eq: orgIdNum },
        user_id: { _eq: userId },
        status: { _eq: 'active' },
      },
    });

    if (!orgMembers || orgMembers.length === 0) {
      return res.status(403).json({ error: 'You do not have access to this organization.' });
    }

    // Fetch fresh organization
    const org: any = await DirectusAdminClient.getItemById('organizations', orgIdNum);
    if (!org) {
      return res.status(404).json({ error: 'Organization not found.' });
    }

    // Check if organization has already used its trial
    if (org.has_used_trial) {
      return res.status(400).json({
        error: 'This organization has already used its 14-day free trial.',
        has_used_trial: true,
      });
    }

    const now = new Date();
    const trialDays = 14;
    const trialEndsAt = new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000);

    // 1. Update organization (full Atelier Cloud trial so users can test every module)
    await DirectusAdminClient.updateItem('organizations', orgIdNum, {
      plan: 'atelier',
      has_used_trial: true,
      trial_ends_at: trialEndsAt.toISOString(),
      date_updated: now.toISOString(),
    });

    // 2. Create entry in subscriptions collection
    let createdSub: any = null;
    try {
      createdSub = await DirectusAdminClient.createItem('subscriptions', {
        organization_id: orgIdNum,
        start_date: now.toISOString(),
        end_date: trialEndsAt.toISOString(),
        transaction_amount: '€0.00 (14-Day Free Trial)',
        Transaction_id: `TRIAL-14D-${orgIdNum}-${Date.now().toString(36).toUpperCase()}`,
        user_created: userId || undefined,
        date_created: now.toISOString(),
      });
    } catch (subErr: any) {
      console.warn('[start-trial] Could not insert subscriptions record:', subErr?.message);
    }

    const updatedOrg: any = await DirectusAdminClient.getItemById('organizations', orgIdNum);
    const { activeOrganization, organizations } = await getUserOrganizations(userId, orgIdNum, email);

    console.log(`[start-trial] 14-day free trial activated for org #${orgIdNum} (${updatedOrg?.name}) by user ${email || userId}`);

    return res.json({
      success: true,
      message: 'Your 14-day Atelier Cloud free trial has been activated!',
      plan: 'atelier',
      planTier: 'atelier',
      isPro: true,
      isTrial: true,
      trialDaysRemaining: 14,
      trialEndsAt: trialEndsAt.toISOString(),
      organization: updatedOrg,
      activeOrganization: activeOrganization || updatedOrg,
      organizations,
      subscription: createdSub,
    });
  } catch (error: any) {
    console.error('[Auth /start-trial Error]:', error);
    return res.status(500).json({ error: error.message || 'Could not activate free trial.' });
  }
});

// Create new organization and assign current user as owner
authRouter.post('/create-org', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { name, slug, currency, timezone, plan, locale } = req.body;
    const { userId, email } = req.user!;
    const isIt = String(locale || 'en').toLowerCase() === 'it';

    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: isIt ? 'Il nome dell\'organizzazione è obbligatorio.' : 'Organization name is required.' });
    }

    const orgName = String(name).trim();
    const orgSlug = slug && String(slug).trim()
      ? String(slug).trim().toLowerCase().replace(/\s+/g, '-')
      : `org-${Date.now().toString(36)}`;
    const orgCurrency = currency && String(currency).toUpperCase() !== 'TOMAN' ? currency : 'EUR';
    const orgTimezone = timezone || 'Europe/Rome';
    const orgPlan = plan || 'free';

    // 1. Create Organization
    const newOrg = await DirectusAdminClient.createItem('organizations', {
      name: orgName,
      slug: orgSlug,
      currency: orgCurrency,
      timezone: orgTimezone,
      plan: orgPlan,
      status: 'active',
    });

    // 2. Create organization_users membership as owner
    await DirectusAdminClient.createItem('organization_users', {
      organization_id: newOrg.id,
      user_id: userId,
      role: 'owner',
      status: 'active',
    });

    // 3. Create default warehouse for this organization
    try {
      await DirectusAdminClient.createItem('warehouses', {
        organization_id: newOrg.id,
        name: isIt ? 'Magazzino Centrale' : 'Main Warehouse',
        code: 'WH-CENTRAL',
        status: 'active',
      });
    } catch (e: any) {
      console.warn('[Create Org] Default warehouse auto-creation skipped:', e.message);
    }

    invalidateUserCaches(userId);

    // 4. Generate new JWT token scoped to this new organization with owner role
    const newToken = generateToken({
      userId,
      email,
      organizationId: newOrg.id,
      role: 'owner',
    });

    const { organizations } = await getUserOrganizations(userId, newOrg.id);

    return res.status(201).json({
      success: true,
      token: newToken,
      access_token: newToken,
      refresh_token: newToken,
      organization: newOrg,
      activeOrganization: newOrg,
      organizations: organizations.length > 0 ? organizations : [newOrg],
      role: 'owner',
    });
  } catch (error: any) {
    console.error('[Auth /create-org Error]:', error);
    return res.status(500).json({ error: error.message || 'Failed to create organization.' });
  }
});

// Helper: Resolve Stripe client from project_settings or environment for best-effort subscription cancellation on erasure
async function getOptionalStripeClient(): Promise<Stripe | null> {
  try {
    let secretKey = (process.env.STRIPE_SECRET_KEY || '').trim();
    if (!secretKey) {
      const settingsRes = await DirectusAdminClient.request('/items/project_settings').catch(() => null);
      const record = Array.isArray(settingsRes) ? settingsRes[0] : settingsRes?.data || settingsRes;
      secretKey = String(record?.stripe_secret_key || record?.STRIPE_SECRET_KEY || '').trim();
    }
    if (!secretKey || !secretKey.startsWith('sk_')) return null;
    return new Stripe(secretKey);
  } catch {
    return null;
  }
}

const GDPR_EXPORT_COLLECTIONS = [
  'products',
  'product_variants',
  'categories',
  'brands',
  'collections',
  'seasons',
  'customers',
  'orders',
  'order_items',
  'suppliers',
  'purchase_orders',
  'warehouses',
  'warehouse_locations',
  'inventory_items',
  'inventory_movements',
  'expenses',
  'expense_categories',
  'financial_accounts',
  'person_transactions',
  'size_guide_templates',
  'subscriptions',
] as const;

// Dependency-safe deletion order for tenant-scoped collections on GDPR Art. 17 erasure
const GDPR_ERASURE_COLLECTIONS = [
  'order_items',
  'orders',
  'purchase_order_items',
  'purchase_orders',
  'inventory_movements',
  'inventory_items',
  'warehouse_locations',
  'warehouses',
  'product_variants',
  'products',
  'size_guide_values',
  'size_guide_measurements',
  'size_guide_templates',
  'categories',
  'brands',
  'collections',
  'seasons',
  'person_transactions',
  'treasury_transactions',
  'expenses',
  'expense_categories',
  'cheques',
  'financial_accounts',
  'customers',
  'suppliers',
  'production_orders',
  'bom_items',
  'boms',
  'raw_materials',
  'contractors',
  'organization_modules',
  'subscriptions',
] as const;

// GDPR Art. 20 — Data Portability Export (strictly scoped to authenticated user & verified organization)
authRouter.get('/gdpr/export', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { userId, email, organizationId } = req.user!;
    const requestedOrgId = req.query.organization_id ? Number(req.query.organization_id) : organizationId;

    const { organizations, activeOrganization } = await getUserOrganizations(userId, requestedOrgId, email);
    const verifiedOrg =
      organizations.find((o: any) => Number(o.id) === Number(requestedOrgId)) || activeOrganization;

    if (!verifiedOrg || !verifiedOrg.id) {
      return res.status(403).json({ error: 'You do not have access to this organization.' });
    }

    const targetOrgId = Number(verifiedOrg.id);
    const rawUser = await DirectusAdminClient.request(`/users/${userId}`).catch(() => null);
    const userObj = rawUser?.data || rawUser || {};

    const sanitizedUser = {
      id: userObj.id || userId,
      email: userObj.email || email,
      first_name: userObj.first_name || '',
      last_name: userObj.last_name || '',
      user_phone: userObj.user_phone || '',
      title: userObj.title || '',
      status: userObj.status || 'active',
      role_in_organization: verifiedOrg.user_role || 'viewer',
    };

    const collections: Record<string, any[]> = {};
    const counts: Record<string, number> = {};

    for (const collection of GDPR_EXPORT_COLLECTIONS) {
      try {
        const items = await DirectusAdminClient.getItems(collection, {
          filter: { organization_id: { _eq: targetOrgId } },
          limit: -1,
        });
        const list = Array.isArray(items) ? items : [];
        collections[collection] = list;
        counts[collection] = list.length;
      } catch {
        collections[collection] = [];
        counts[collection] = 0;
      }
    }

    return res.json({
      schema: 'clozito-gdpr-export-v1',
      regulation: 'Regulation (EU) 2016/679 (GDPR) — Article 20 Data Portability',
      exported_at: new Date().toISOString(),
      user: sanitizedUser,
      organization: verifiedOrg,
      counts,
      collections,
    });
  } catch (error: any) {
    console.error('[GDPR Export Error]:', error);
    return res.status(500).json({ error: error.message || 'Failed to export GDPR data archive.' });
  }
});

// GDPR Art. 17 — Right to Erasure (Account & Sole-Owned Workspace Deletion)
authRouter.post('/gdpr/delete-account', authSensitiveActionRateLimiter, requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { userId, email } = req.user!;
    const { password, confirmText, deleteOwnedWorkspaces = true, locale = 'en' } = req.body || {};
    const isIt = String(locale).toLowerCase() === 'it';

    if (String(confirmText || '').trim().toUpperCase() !== 'DELETE') {
      return res.status(400).json({
        error: isIt
          ? 'Per confermare l\'eliminazione digita esattamente DELETE.'
          : 'Please type DELETE to confirm permanent account erasure.',
      });
    }

    if (!password || typeof password !== 'string' || !password.trim()) {
      return res.status(400).json({
        error: isIt
          ? 'La password attuale è obbligatoria per eliminare l\'account.'
          : 'Current password is required to confirm account deletion.',
      });
    }

    // 1. Fetch authoritative user record
    const rawUser = await DirectusAdminClient.request(`/users/${userId}`).catch(() => null);
    const currentUser = rawUser?.data || rawUser;
    const authoritativeEmail = (currentUser?.email || email || '').toString().trim().toLowerCase();

    if (!authoritativeEmail) {
      return res.status(404).json({ error: 'User account not found.' });
    }

    // 2. Verify current password directly against Directus Auth before any destructive action
    const directusBaseUrl = DirectusAdminClient.getBaseUrl();
    const verifyRes = await fetch(`${directusBaseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: authoritativeEmail,
        password: password,
        mode: 'json',
      }),
    });

    if (!verifyRes.ok) {
      return res.status(401).json({
        error: isIt
          ? 'Password attuale non corretta. Eliminazione annullata.'
          : 'Current password is incorrect. Account deletion aborted.',
      });
    }

    // 3. Inspect all memberships for this user
    const userMemberships = await DirectusAdminClient.getItems('organization_users', {
      filter: { user_id: { _eq: userId } },
      limit: -1,
    }).catch(() => []);

    const deletedOrganizationIds: number[] = [];
    const stripeClient = await getOptionalStripeClient();

    if (deleteOwnedWorkspaces && Array.isArray(userMemberships)) {
      for (const membership of userMemberships) {
        const orgId = Number(
          typeof membership.organization_id === 'object'
            ? membership.organization_id?.id
            : membership.organization_id
        );
        if (!orgId || isNaN(orgId)) continue;
        if (String(membership.role || '').toLowerCase() !== 'owner') continue;

        // Only erase workspace data if this user is the SOLE owner of the organization
        const orgMembers = await DirectusAdminClient.getItems('organization_users', {
          filter: { organization_id: { _eq: orgId } },
          limit: -1,
        }).catch(() => []);

        const otherOwners = (Array.isArray(orgMembers) ? orgMembers : []).filter((m: any) => {
          const mUserId = typeof m.user_id === 'object' ? m.user_id?.id : m.user_id;
          return String(mUserId) !== String(userId) && String(m.role || '').toLowerCase() === 'owner';
        });

        if (otherOwners.length > 0) {
          continue;
        }

        // Best-effort cancel active Stripe subscription so the user is never billed again
        try {
          const orgRes = await DirectusAdminClient.request(`/items/organizations/${orgId}`).catch(() => null);
          const orgObj = orgRes?.data || orgRes;
          if (stripeClient && orgObj?.stripe_subscription_id) {
            await stripeClient.subscriptions.cancel(String(orgObj.stripe_subscription_id)).catch((sErr: any) => {
              console.warn(`[GDPR Erasure] Stripe subscription cancel notice for org #${orgId}:`, sErr?.message);
            });
          }
        } catch {
          // Non-blocking Stripe cancel
        }

        // Delete tenant-scoped collection rows for this sole-owned organization
        for (const collection of GDPR_ERASURE_COLLECTIONS) {
          try {
            const rows = await DirectusAdminClient.getItems(collection, {
              filter: { organization_id: { _eq: orgId } },
              fields: ['id'],
              limit: -1,
            });
            if (Array.isArray(rows) && rows.length > 0) {
              const ids = rows.map((r: any) => r.id).filter((id: any) => id !== undefined && id !== null);
              if (ids.length > 0) {
                await DirectusAdminClient.request(`/items/${collection}`, {
                  method: 'DELETE',
                  body: JSON.stringify(ids),
                }).catch(async () => {
                  for (const id of ids) {
                    await DirectusAdminClient.request(`/items/${collection}/${id}`, { method: 'DELETE' }).catch(() => {});
                  }
                });
              }
            }
          } catch {
            // Continue erasing remaining collections
          }
        }

        // Remove all remaining organization_users entries for this sole-owned org
        if (Array.isArray(orgMembers)) {
          for (const m of orgMembers) {
            if (m?.id) {
              await DirectusAdminClient.request(`/items/organization_users/${m.id}`, { method: 'DELETE' }).catch(() => {});
            }
          }
        }

        // Delete or archive organization record
        try {
          await DirectusAdminClient.request(`/items/organizations/${orgId}`, { method: 'DELETE' });
          deletedOrganizationIds.push(orgId);
        } catch {
          await DirectusAdminClient.request(`/items/organizations/${orgId}`, {
            method: 'PATCH',
            body: JSON.stringify({
              name: `Erased Workspace #${orgId}`,
              status: 'archived',
              vat_number: null,
              tax_code: null,
              phone: null,
              mobile: null,
              address: null,
            }),
          }).catch(() => {});
          deletedOrganizationIds.push(orgId);
        }
      }
    }

    // 4. Delete all organization_users memberships belonging to this user
    if (Array.isArray(userMemberships)) {
      for (const m of userMemberships) {
        if (m?.id) {
          await DirectusAdminClient.request(`/items/organization_users/${m.id}`, { method: 'DELETE' }).catch(() => {});
        }
      }
    }

    // 5. Permanently delete (or anonymize + suspend if constrained by system audit FKs) the Directus user
    let anonymizedFallback = false;
    try {
      await DirectusAdminClient.request(`/users/${userId}`, { method: 'DELETE' });
    } catch (userDelErr: any) {
      console.warn(`[GDPR Erasure] Direct user delete fallback to anonymization for ${userId}:`, userDelErr?.message);
      anonymizedFallback = true;
      await DirectusAdminClient.request(`/users/${userId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          email: `erased-${userId.slice(0, 8)}-${Date.now()}@deleted.invalid`,
          first_name: 'Deleted',
          last_name: 'User',
          user_phone: null,
          title: null,
          avatar: null,
          status: 'suspended',
        }),
      });
    }

    invalidateUserCaches(userId);

    console.log(`[GDPR Erasure] Completed Right to Erasure for user ${userId}. Deleted orgs: [${deletedOrganizationIds.join(', ')}]`);

    return res.json({
      success: true,
      erasedUserId: userId,
      deletedOrganizationIds,
      anonymizedFallback,
    });
  } catch (error: any) {
    console.error('[GDPR Delete Account Error]:', error);
    return res.status(500).json({ error: error.message || 'Failed to erase user account.' });
  }
});
