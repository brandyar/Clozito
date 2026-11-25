import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useOrganization } from './OrganizationContext';
import { storageManager } from '../storage';
import { SystemModule, OrganizationModule } from '../types';
import {
  DEFAULT_SYSTEM_MODULES,
  getMachineFingerprint,
  verifyLicenseTokenString,
  generateLicenseTokenString,
  LicensePayload,
} from '../utils/license';
import {
  syncOrganizationLicenses,
  getLastLicenseSyncInfo,
  LicenseSyncResult,
} from '../utils/licenseSync';
import {
  NormalizedPlanTier,
  isPaidCloudPlan,
  normalizePlanTier,
  isModuleIncludedInPlan,
  isModuleOfflinePurchasable,
} from '../config/plans';

export interface ModuleAccessContextType {
  hasAccess: (moduleSlug: string) => boolean;
  isPro: boolean;
  isCloudPlan: boolean;
  planTier: NormalizedPlanTier;
  activeModules: OrganizationModule[];
  orgModules: OrganizationModule[];
  systemModules: SystemModule[];
  loading: boolean;
  isSyncing: boolean;
  lastSyncInfo: { timestamp: string; isPro?: boolean; activeCount?: number; revokedCount?: number; status: string } | null;
  hardwareId: string;
  refreshModules: () => Promise<void>;
  syncWithServer: (force?: boolean) => Promise<LicenseSyncResult>;
  activateLicense: (tokenString: string) => Promise<{ success: boolean; message: string; module?: OrganizationModule }>;
  createDemoLicenseToken: (moduleSlug: string) => Promise<string>;
}

const ModuleAccessContext = createContext<ModuleAccessContextType | undefined>(undefined);

export const ModuleAccessProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { activeOrganization } = useOrganization();
  const [systemModules, setSystemModules] = useState<SystemModule[]>(DEFAULT_SYSTEM_MODULES);
  const [orgModules, setOrgModules] = useState<OrganizationModule[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncInfo, setLastSyncInfo] = useState<{ timestamp: string; isPro?: boolean; activeCount?: number; revokedCount?: number; status: string } | null>(null);
  
  const hardwareId = useMemo(() => getMachineFingerprint(), []);
  const activeOrgId = activeOrganization?.id;

  const activeOrgIdRef = useRef<number | undefined>(activeOrgId);
  activeOrgIdRef.current = activeOrgId;

  const systemModulesRef = useRef<SystemModule[]>(systemModules);
  systemModulesRef.current = systemModules;

  const planTier = useMemo<NormalizedPlanTier>(() => {
    return normalizePlanTier(activeOrganization?.plan);
  }, [activeOrganization?.plan]);

  const isCloudPlan = useMemo(() => {
    return isPaidCloudPlan(activeOrganization?.plan);
  }, [activeOrganization?.plan]);

  // Kept as backward-compatible alias for any active Cloud plan (Boutique, Atelier, or legacy Pro)
  const isPro = isCloudPlan;

  // Load modules from local storage / SQLite
  const loadModules = useCallback(async (isInitial = false) => {
    const orgId = activeOrgIdRef.current;
    if (!orgId) {
      setOrgModules([]);
      setLoading(false);
      return;
    }

    try {
      if (isInitial) {
        setLoading(true);
      }
      const adapter = storageManager.getAdapter();

      // 1. Fetch system catalog
      let sysList: SystemModule[] = [];
      if (adapter.getSystemModules) {
        sysList = await adapter.getSystemModules({ status: 'published' });
      }
      if (!sysList || sysList.length === 0) {
        sysList = DEFAULT_SYSTEM_MODULES;
      }
      systemModulesRef.current = sysList;
      setSystemModules(sysList);

      // 2. Fetch organization modules from SQLite / LocalStorage
      let orgList: OrganizationModule[] = [];
      if (adapter.getOrganizationModules) {
        orgList = await adapter.getOrganizationModules({ organization_id: orgId });
      }

      // Merge and enrich orgList
      const enrichedOrgList = orgList.map((om) => {
        const sys = sysList.find((s) => s.slug === om.slug);
        return {
          ...om,
          name: om.name || sys?.name,
          description: om.description || sys?.description,
          price_ir: om.price_ir ?? sys?.price_ir,
          price_usd: om.price_usd ?? sys?.price_usd,
          included_in_pro: om.included_in_pro !== undefined ? om.included_in_pro : sys?.included_in_pro,
        };
      });

      setOrgModules(enrichedOrgList);

      // Read last sync info
      const syncInfo = getLastLicenseSyncInfo(orgId);
      setLastSyncInfo(syncInfo);
    } catch (err) {
      console.warn('[ModuleAccessContext] Failed to load modules:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Sync and validate licenses against Directus server (background, non-blocking)
   */
  const syncWithServer = useCallback(
    async (force: boolean = false): Promise<LicenseSyncResult> => {
      const orgId = activeOrgIdRef.current;
      if (!orgId) {
        return {
          success: false,
          error: 'No active organization selected.',
          activeCount: 0,
          revokedCount: 0,
          timestamp: new Date().toISOString(),
          modules: [],
        };
      }

      setIsSyncing(true);
      try {
        const res = await syncOrganizationLicenses(orgId, { force });
        if (res.success && res.modules) {
          const sysList = systemModulesRef.current;
          setOrgModules(
            res.modules.map((om) => {
              const sys = sysList.find((s) => s.slug === om.slug);
              return {
                ...om,
                name: om.name || sys?.name,
                description: om.description || sys?.description,
                price_ir: om.price_ir ?? sys?.price_ir,
                price_usd: om.price_usd ?? sys?.price_usd,
                included_in_pro: om.included_in_pro !== undefined ? om.included_in_pro : sys?.included_in_pro,
              };
            })
          );
        }
        const updatedInfo = getLastLicenseSyncInfo(orgId);
        setLastSyncInfo(updatedInfo);
        return res;
      } finally {
        setIsSyncing(false);
      }
    },
    []
  );

  // Initial load when active organization changes
  useEffect(() => {
    let isMounted = true;
    const orgId = activeOrgId;

    if (!orgId) {
      setOrgModules([]);
      setLoading(false);
      return;
    }

    loadModules(true).then(() => {
      if (isMounted) {
        // Non-blocking background sync only once after initial load
        syncWithServer(false).catch(() => {});
      }
    });

    return () => {
      isMounted = false;
    };
  }, [activeOrgId, loadModules, syncWithServer]);

  // Global event listeners for external activations or network events
  useEffect(() => {
    if (!activeOrgId) return;

    const handleOnline = () => {
      syncWithServer(false).catch(() => {});
    };

    const handleModuleActivated = () => {
      loadModules(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('tankhor_module_activated', handleModuleActivated);

    // Heartbeat sync every 15 minutes in background
    const interval = setInterval(() => {
      syncWithServer(false).catch(() => {});
    }, 15 * 60 * 1000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('tankhor_module_activated', handleModuleActivated);
      clearInterval(interval);
    };
  }, [activeOrgId, syncWithServer, loadModules]);

  /**
   * Evaluates whether current organization has active entitlement to a module
   */
  const hasAccess = useCallback(
    (moduleSlug: string): boolean => {
      if (!activeOrgId) return false;

      // 1. Evaluate tier-based Cloud Subscription entitlement
      //    - Boutique Cloud unlocks: barcode, online_catalog, woocommerce
      //    - Atelier Cloud (and legacy Pro) unlocks: all 5 modules (adds production & accounting)
      if (isModuleIncludedInPlan(activeOrganization?.plan, moduleSlug)) {
        return true;
      }

      // 2. Check purchased standalone organization module license (offline desktop add-ons or legacy grants)
      const orgMod = orgModules.find((m) => m.slug === moduleSlug);
      if (!orgMod) return false;

      // Module MUST be active
      if (orgMod.status !== 'active') return false;

      // Check date expiry if set
      if (orgMod.expires_at) {
        const expiry = new Date(orgMod.expires_at).getTime();
        if (Date.now() > expiry) return false;
      }

      return true;
    },
    [activeOrgId, activeOrganization?.plan, orgModules]
  );

  /**
   * Activates a cryptographic offline/online license token
   */
  const activateLicense = useCallback(
    async (tokenString: string): Promise<{ success: boolean; message: string; module?: OrganizationModule }> => {
      if (!activeOrgId) {
        return { success: false, message: 'No active organization found.' };
      }

      const trimmed = tokenString.trim();
      if (!trimmed) {
        return { success: false, message: 'Please enter a license key.' };
      }

      // Verify token
      const verification = await verifyLicenseTokenString(trimmed, activeOrgId, hardwareId);
      if (!verification.valid || !verification.payload) {
        let msg = 'Invalid license key.';
        if (verification.error === 'SIGNATURE_MISMATCH') {
          msg = 'License digital signature is invalid or tampered with.';
        } else if (verification.error === 'ORGANIZATION_MISMATCH') {
          msg = 'This license key was issued for another organization.';
        } else if (verification.error === 'HARDWARE_MISMATCH') {
          msg = 'This license key is bound to a different device.';
        } else if (verification.error === 'LICENSE_EXPIRED') {
          msg = 'This license key has expired.';
        }
        return { success: false, message: msg };
      }

      const { payload } = verification;
      if (!isModuleOfflinePurchasable(payload.slug)) {
        return {
          success: false,
          message:
            'This cloud-hosted module requires an active Boutique or Atelier Cloud subscription instead of an offline license key.',
        };
      }
      const matchedSys = systemModules.find((m) => m.slug === payload.slug);

      const adapter = storageManager.getAdapter();
      if (!adapter.saveOrganizationModule) {
        return { success: false, message: 'Storage provider does not support module activation.' };
      }

      const saved = await adapter.saveOrganizationModule({
        organization_id: activeOrgId,
        slug: payload.slug,
        module_id: matchedSys?.id || 1,
        license_type: payload.license_type,
        status: 'active',
        license_token: trimmed,
        hardware_id: payload.hardware_id || hardwareId,
        starts_at: payload.issued_at,
        expires_at: payload.expires_at || null,
      });

      // Background server sync to notify cloud if online
      syncWithServer(true).catch(() => {});

      await loadModules(false);
      return {
        success: true,
        message: `Module "${matchedSys?.name || payload.slug}" activated successfully.`,
        module: saved,
      };
    },
    [activeOrgId, hardwareId, systemModules, loadModules, syncWithServer]
  );

  /**
   * Helper to generate a valid signed token for offline demonstration or testing
   */
  const createDemoLicenseToken = useCallback(
    async (moduleSlug: string): Promise<string> => {
      const payload: LicensePayload = {
        organization_id: activeOrgId || 1,
        slug: moduleSlug,
        license_type: 'lifetime',
        hardware_id: hardwareId,
        issued_at: new Date().toISOString(),
        expires_at: null, // lifetime
      };
      return await generateLicenseTokenString(payload);
    },
    [activeOrgId, hardwareId]
  );

  const contextValue = useMemo<ModuleAccessContextType>(
    () => ({
      hasAccess,
      isPro,
      isCloudPlan,
      planTier,
      activeModules: orgModules,
      orgModules,
      systemModules,
      loading,
      isSyncing,
      lastSyncInfo,
      hardwareId,
      refreshModules: () => loadModules(false),
      syncWithServer,
      activateLicense,
      createDemoLicenseToken,
    }),
    [
      hasAccess,
      isPro,
      isCloudPlan,
      planTier,
      orgModules,
      systemModules,
      loading,
      isSyncing,
      lastSyncInfo,
      hardwareId,
      loadModules,
      syncWithServer,
      activateLicense,
      createDemoLicenseToken,
    ]
  );

  return (
    <ModuleAccessContext.Provider value={contextValue}>
      {children}
    </ModuleAccessContext.Provider>
  );
};

export const useModuleAccess = (): ModuleAccessContextType => {
  const context = useContext(ModuleAccessContext);
  if (!context) {
    throw new Error('useModuleAccess must be used within a ModuleAccessProvider');
  }
  return context;
};
