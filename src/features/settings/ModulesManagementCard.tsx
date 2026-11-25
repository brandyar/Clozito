import React, { useState } from 'react';
import {
  Boxes,
  Lock,
  Unlock,
  Sparkles,
  ShieldCheck,
  Copy,
  Check,
  Barcode,
  Calculator,
  Users,
  HeartHandshake,
  CheckCircle2,
  AlertCircle,
  CreditCard,
  RefreshCw,
  XCircle,
  Globe,
  Store,
  Scissors,
  Cloud,
} from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { useModuleAccess } from '../../hooks/useModuleAccess';
import { useTranslation } from '../../i18n';
import { SystemModule } from '../../types';
import { formatModulePrice } from '../../utils/license';
import { PurchaseModuleModal } from '../../components/modals/PurchaseModuleModal';
import { UpgradeToProModal } from '../../components/modals/UpgradeToProModal';
import { formatDate } from '../../utils/formatters';
import { isTauriEnvironment } from '../../storage';
import {
  SubscriptionTier,
  getRequiredTierForModule,
  isModuleOfflinePurchasable,
  isModuleIncludedInPlan,
  getPlanDisplayName,
} from '../../config/plans';

export const ModulesManagementCard: React.FC = () => {
  const { t, locale } = useTranslation();
  const isIt = locale === 'it';
  const isDesktop = isTauriEnvironment();
  const {
    hasAccess,
    isPro,
    planTier,
    systemModules,
    orgModules,
    hardwareId,
    refreshModules,
    syncWithServer,
    isSyncing,
    lastSyncInfo,
  } = useModuleAccess();

  const [activePurchaseModule, setActivePurchaseModule] = useState<SystemModule | null>(null);
  const [upgradeModalTier, setUpgradeModalTier] = useState<SubscriptionTier | null>(null);
  const [copiedHwId, setCopiedHwId] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState<{ type: 'success' | 'offline' | 'error'; message: string } | null>(
    null
  );

  const getModuleIcon = (slug: string) => {
    switch (slug) {
      case 'barcode':
        return <Barcode className="w-5 h-5 text-amber-600" />;
      case 'accounting':
        return <Calculator className="w-5 h-5 text-emerald-600" />;
      case 'staff':
        return <Users className="w-5 h-5 text-sky-600" />;
      case 'crm':
        return <HeartHandshake className="w-5 h-5 text-rose-600" />;
      case 'woocommerce':
        return <Globe className="w-5 h-5 text-violet-600" />;
      case 'online_catalog':
        return <Store className="w-5 h-5 text-indigo-600" />;
      case 'production':
      case 'produce':
        return <Scissors className="w-5 h-5 text-rose-600" />;
      default:
        return <Boxes className="w-5 h-5 text-neutral-600" />;
    }
  };

  const handleCopyHw = () => {
    navigator.clipboard.writeText(hardwareId);
    setCopiedHwId(true);
    setTimeout(() => setCopiedHwId(false), 2500);
  };

  const handleManualSync = async () => {
    try {
      const res = await syncWithServer(true);
      if (res.success) {
        setSyncFeedback({
          type: 'success',
          message: t('modules.syncSuccess', 'License status successfully refreshed from cloud server.'),
        });
      } else if (res.offline) {
        setSyncFeedback({
          type: 'offline',
          message: t(
            'modules.syncOfflineNotice',
            'Cloud server is unreachable; valid local license remains active on this device.'
          ),
        });
      } else {
        setSyncFeedback({
          type: 'error',
          message: res.error || (isIt ? 'Errore di connessione al server' : 'Server connection error'),
        });
      }
    } catch (e: any) {
      setSyncFeedback({
        type: 'error',
        message: e?.message || (isIt ? 'Errore di connessione al server' : 'Server connection error'),
      });
    }

    setTimeout(() => {
      setSyncFeedback(null);
    }, 4000);
  };

  return (
    <Card
      id="modules-management-card"
      title={
        <div className="flex items-center gap-2">
          <Boxes className="w-5 h-5 text-amber-600" />
          <span>{t('modules.managementTitle', 'Modules & License Management')}</span>
        </div>
      }
      subtitle={t(
        'modules.managementSubtitle',
        'Manage included cloud tier modules, upgrades, and optional Desktop Offline add-ons'
      )}
    >
      <div className="space-y-6">
        {/* Active Plan Tier Banner */}
        {isPro ? (
          <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <Sparkles className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-bold text-emerald-900 dark:text-emerald-200">
                  {getPlanDisplayName(planTier, locale)}{' '}
                  {isIt ? 'attivo' : 'Active'}
                </h4>
                <p className="text-xs text-emerald-700 dark:text-emerald-300 mt-1 leading-relaxed">
                  {planTier === 'atelier'
                    ? isIt
                      ? 'Tutti i moduli Clozito — inclusi WooCommerce, Catalogo Digitale, Codici a Barre, Produzione/BOM e Contabilità — sono sbloccati.'
                      : 'All Clozito modules — including WooCommerce, Digital Showroom, Barcode, Production/BOM, and Accounting — are unlocked.'
                    : isIt
                      ? 'Boutique Cloud include Codici a Barre, Catalogo Digitale e WooCommerce Sync. Passa ad Atelier (€49/mese) per sbloccare Produzione/BOM e Contabilità.'
                      : 'Boutique Cloud includes Barcode, Digital Showroom & WooCommerce Sync. Upgrade to Atelier (€49/mo) to unlock Production/BOM and Accounting.'}
                </p>
              </div>
            </div>
            {planTier === 'boutique' && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => setUpgradeModalTier('atelier')}
                icon={<Sparkles className="w-3.5 h-3.5" />}
                className="shrink-0 text-xs font-bold"
              >
                {isIt ? 'Passa ad Atelier' : 'Upgrade to Atelier'}
              </Button>
            )}
          </div>
        ) : (
          <div className="p-4 rounded-xl bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-900/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <ShieldCheck className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-bold text-neutral-900 dark:text-neutral-100">
                  {isIt
                    ? 'Piani Cloud All-Inclusive o Licenze Desktop Offline'
                    : 'All-Inclusive Cloud Plans or Desktop Offline Licenses'}
                </h4>
                <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-1 leading-relaxed">
                  {isIt
                    ? 'Scegli Boutique Cloud (€29/mese) o Atelier Cloud (€49/mese) per sbloccare i moduli con sincronizzazione cloud. I moduli offline (Codici a Barre, Contabilità, Produzione) sono acquistabili anche una tantum per uso locale Desktop.'
                    : 'Choose Boutique Cloud (€29/mo) or Atelier Cloud (€49/mo) to unlock modules with cloud sync. Offline modules (Barcode, Accounting, Production) are also available as one-time Desktop Offline licenses.'}
                </p>
              </div>
            </div>
            <Button
              variant="primary"
              size="sm"
              onClick={() => setUpgradeModalTier('boutique')}
              icon={<Cloud className="w-3.5 h-3.5" />}
              className="shrink-0 text-xs font-bold"
            >
              {isIt ? 'Vedi Piani Cloud' : 'View Cloud Plans'}
            </Button>
          </div>
        )}

        {/* Server Sync & Hardware ID Info Bar */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Hardware ID */}
          <div className="p-3.5 rounded-xl bg-neutral-100/70 dark:bg-neutral-900/60 border border-neutral-200 dark:border-neutral-800 flex items-center justify-between gap-3">
            <div className="overflow-hidden">
              <span className="text-[11px] text-neutral-500 dark:text-neutral-400 block font-medium">
                {t('modules.systemHardwareId', 'Device Hardware ID:')}
              </span>
              <code className="text-xs font-mono font-bold text-neutral-800 dark:text-neutral-200 select-all dir-ltr mt-0.5 inline-block truncate max-w-[200px]">
                {hardwareId}
              </code>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyHw}
              icon={copiedHwId ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            >
              {copiedHwId ? t('common.copied') : isIt ? 'Copia ID' : 'Copy ID'}
            </Button>
          </div>

          {/* Server Sync Status & Check Button */}
          <div className="p-3.5 rounded-xl bg-neutral-100/70 dark:bg-neutral-900/60 border border-neutral-200 dark:border-neutral-800 flex items-center justify-between gap-3">
            <div className="overflow-hidden">
              <span className="text-[11px] text-neutral-500 dark:text-neutral-400 block font-medium">
                {isIt ? 'Ultimo controllo licenze cloud:' : 'Last cloud license check:'}
              </span>
              <span className="text-xs text-neutral-700 dark:text-neutral-300 font-medium flex items-center gap-1.5 mt-0.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span>
                {lastSyncInfo?.timestamp
                  ? formatDate(lastSyncInfo.timestamp, false, locale)
                  : isIt
                    ? 'Sincronizzazione iniziale completata'
                    : 'Initial sync completed'}
              </span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleManualSync}
              disabled={isSyncing}
              icon={<RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-amber-600' : ''}`} />}
            >
              {isSyncing
                ? isIt ? 'Verifica...' : 'Checking...'
                : isIt ? 'Ricontrolla' : 'Check Again'}
            </Button>
          </div>
        </div>

        {/* Sync feedback notification */}
        {syncFeedback && (
          <div
            className={`p-3 rounded-xl border text-xs flex items-center gap-2 transition-all ${
              syncFeedback.type === 'success'
                ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
                : syncFeedback.type === 'offline'
                  ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200'
                  : 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200'
            }`}
          >
            {syncFeedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
            ) : syncFeedback.type === 'offline' ? (
              <AlertCircle className="w-4 h-4 shrink-0 text-amber-600" />
            ) : (
              <XCircle className="w-4 h-4 shrink-0 text-rose-600" />
            )}
            <span>{syncFeedback.message}</span>
          </div>
        )}

        {/* Modules Catalog Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {systemModules.map((mod) => {
            const unlocked = hasAccess(mod.slug);
            const isComingSoon = mod.status === 'draft';
            const requiredTier = getRequiredTierForModule(mod.slug);
            const canBuyOffline = isModuleOfflinePurchasable(mod.slug);
            const unlockedViaTier = isModuleIncludedInPlan(planTier, mod.slug);
            const formattedPrice = canBuyOffline ? formatModulePrice(mod, locale) : '';

            const orgMod = orgModules.find((m) => m.slug === mod.slug);
            const isRevoked = orgMod?.status === 'revoked';

            const tierBadgeLabel =
              requiredTier === 'boutique'
                ? isIt ? 'Incluso in Boutique' : 'Included in Boutique'
                : isIt ? 'Incluso in Atelier' : 'Included in Atelier';

            return (
              <div
                key={mod.id}
                className={`p-4 rounded-xl border transition-all flex flex-col justify-between gap-4 ${
                  unlocked
                    ? 'border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/20 dark:bg-emerald-950/10'
                    : isRevoked
                      ? 'border-rose-200 dark:border-rose-900/40 bg-rose-50/10 dark:bg-rose-950/10'
                      : 'border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/40'
                }`}
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-lg bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center border border-neutral-200 dark:border-neutral-700 shrink-0">
                        {getModuleIcon(mod.slug)}
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-neutral-900 dark:text-neutral-100">{mod.name}</h4>
                        <span className="text-[11px] font-mono text-neutral-400 block">
                          {requiredTier === 'boutique'
                            ? isIt ? 'Boutique Cloud • €29/mese' : 'Boutique Cloud • €29/mo'
                            : isIt ? 'Atelier Cloud • €49/mese' : 'Atelier Cloud • €49/mo'}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap justify-end">
                      <Badge variant={requiredTier === 'atelier' ? 'warning' : 'info'}>{tierBadgeLabel}</Badge>
                      {unlocked ? (
                        <Badge variant="success">
                          <CheckCircle2 className="w-3 h-3 me-1" />
                          {unlockedViaTier
                            ? planTier === 'atelier'
                              ? 'Atelier'
                              : 'Boutique'
                            : t('modules.unlockedViaLicense', 'Active License')}
                        </Badge>
                      ) : isRevoked ? (
                        <Badge variant="danger">
                          <XCircle className="w-3 h-3 me-1" />
                          {t('modules.licenseRevoked', 'Revoked by Server')}
                        </Badge>
                      ) : isComingSoon ? (
                        <Badge variant="neutral">{t('modules.comingSoon', 'Coming Soon')}</Badge>
                      ) : (
                        <Badge variant="neutral">
                          <Lock className="w-3 h-3 me-1" />
                          {t('modules.locked', 'Locked')}
                        </Badge>
                      )}
                    </div>
                  </div>

                  <p className="text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed">{mod.description}</p>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-2.5 border-t border-neutral-100 dark:border-neutral-800/80">
                  <div className="text-xs">
                    {canBuyOffline ? (
                      <span className="text-neutral-600 dark:text-neutral-400">
                        {isIt ? 'Licenza Desktop Offline:' : 'Desktop Offline:'}{' '}
                        <strong className="text-neutral-900 dark:text-neutral-100">{formattedPrice}</strong>
                      </span>
                    ) : (
                      <span className="text-indigo-600 dark:text-indigo-400 font-medium flex items-center gap-1">
                        <Cloud className="w-3.5 h-3.5" />
                        <span>{isIt ? 'Solo Abbonamento Cloud' : 'Cloud Subscription Only'}</span>
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {!unlocked && !isComingSoon && (
                      <>
                        {canBuyOffline && (isDesktop || !isPro) && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setActivePurchaseModule(mod)}
                            className="text-xs font-semibold cursor-pointer"
                            icon={<CreditCard className="w-3.5 h-3.5" />}
                          >
                            {isIt ? 'Licenza Offline' : 'Offline License'}
                          </Button>
                        )}
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => setUpgradeModalTier(requiredTier)}
                          className="text-xs font-semibold cursor-pointer"
                          icon={<Sparkles className="w-3.5 h-3.5" />}
                        >
                          {requiredTier === 'atelier'
                            ? isIt ? 'Sblocca con Atelier' : 'Unlock with Atelier'
                            : isIt ? 'Sblocca con Boutique' : 'Unlock with Boutique'}
                        </Button>
                      </>
                    )}
                    {unlocked && (
                      <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                        <Unlock className="w-3.5 h-3.5" />
                        <span>{t('modules.readyToUse', 'Ready to Use')}</span>
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Desktop Offline One-Time Purchase & Activation Modal (Offline-capable modules only) */}
        {activePurchaseModule && (
          <PurchaseModuleModal
            isOpen={Boolean(activePurchaseModule)}
            onClose={() => setActivePurchaseModule(null)}
            moduleSlug={activePurchaseModule.slug}
            moduleName={activePurchaseModule.name}
            onOpenProModal={() => {
              const tier = getRequiredTierForModule(activePurchaseModule.slug);
              setActivePurchaseModule(null);
              setUpgradeModalTier(tier);
            }}
            onSuccess={() => {
              setActivePurchaseModule(null);
              refreshModules();
            }}
          />
        )}

        {/* Cloud Subscription Upgrade Modal */}
        <UpgradeToProModal
          isOpen={upgradeModalTier !== null}
          defaultTier={upgradeModalTier || 'boutique'}
          onClose={() => setUpgradeModalTier(null)}
          onSuccess={() => {
            setUpgradeModalTier(null);
            refreshModules();
          }}
        />
      </div>
    </Card>
  );
};
