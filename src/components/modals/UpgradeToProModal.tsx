import React, { useState, useEffect, useRef } from 'react';
import { useOrganization } from '../../context/OrganizationContext';
import { useAuth } from '../../context/AuthContext';
import { storageManager, isTauriEnvironment } from '../../storage';
import { directusClient } from '../../api/directus';
import { CloudMigrationManager, MigrationStepProgress } from '../../storage/cloudMigrationManager';
import { useTranslation } from '../../i18n';
import { BRAND } from '../../config/brand';
import {
  SUBSCRIPTION_TIERS,
  SubscriptionTier,
  isPaidCloudPlan,
  normalizePlanTier,
  getPlanDisplayName,
} from '../../config/plans';
import { Button } from '../ui/Button';
import { formatCurrency } from '../../utils/formatters';
import { openExternalUrl } from '../../utils/desktop';
import {
  Sparkles,
  CheckCircle2,
  X,
  Zap,
  CreditCard,
  Check,
  RefreshCw,
  Lock,
  UploadCloud,
  AlertCircle,
  Clock,
  ExternalLink,
  Laptop,
  Radio,
  Download,
  Database,
  Store,
  Scissors,
} from 'lucide-react';

interface UpgradeToProModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  defaultTier?: SubscriptionTier;
}

const CYCLE_ORDER: Array<1 | 3 | 6 | 12> = [1, 3, 6, 12];

export const UpgradeToProModal: React.FC<UpgradeToProModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  defaultTier,
}) => {
  const { locale } = useTranslation();
  const isIt = locale === 'it';
  const { activeOrganization, refreshOrganizations } = useOrganization();
  const { isCloudAuthenticated, openLoginModal, updateUserOrganization } = useAuth();
  const isDesktop = isTauriEnvironment();

  const currentTier = normalizePlanTier(activeOrganization?.plan);
  const [selectedTier, setSelectedTier] = useState<SubscriptionTier>(
    defaultTier || (currentTier === 'boutique' ? 'atelier' : 'boutique')
  );
  const [selectedMonths, setSelectedMonths] = useState<1 | 3 | 6 | 12>(1);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [isOpeningPortal, setIsOpeningPortal] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [isActivatingTrial, setIsActivatingTrial] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [subscriptionDetails, setSubscriptionDetails] = useState<any>(null);

  // Desktop / external Stripe Checkout polling state
  const [waitingPayment, setWaitingPayment] = useState<{
    sessionId: string;
    paymentUrl: string;
    amountEur: number;
    durationMonths: number;
  } | null>(null);
  const pollingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Cloud Data Migration State (Local to Cloud)
  const [isMigrating, setIsMigrating] = useState(false);
  const [migrationProgress, setMigrationProgress] = useState<MigrationStepProgress | null>(null);
  const [migrationDone, setMigrationDone] = useState(false);
  const [migrationStats, setMigrationStats] = useState<{ total: number; errors: string[] } | null>(null);

  // Local Offline Migration State (Cloud to Local Desktop SQLite)
  const [isMigratingToLocal, setIsMigratingToLocal] = useState(false);
  const [localMigrationProgress, setLocalMigrationProgress] = useState<MigrationStepProgress | null>(null);
  const [localMigrationDone, setLocalMigrationDone] = useState(false);
  const [localMigrationStats, setLocalMigrationStats] = useState<{ total: number; errors: string[] } | null>(null);

  useEffect(() => {
    if (!waitingPayment || success) {
      if (pollingTimerRef.current) {
        clearInterval(pollingTimerRef.current);
        pollingTimerRef.current = null;
      }
      return;
    }

    const checkInterval = setInterval(async () => {
      try {
        const res = await directusClient.checkOrganizationPlan();
        if (res && (res.isPro || isPaidCloudPlan(res.plan))) {
          clearInterval(checkInterval);
          pollingTimerRef.current = null;
          setWaitingPayment(null);
          await refreshOrganizations();
          storageManager.setMode('cloud_synced', { verifiedPro: true });
          setSuccess(true);
          if (onSuccess) onSuccess();
        }
      } catch {
        // silent retry
      }
    }, 3000);

    pollingTimerRef.current = checkInterval;
    return () => {
      if (pollingTimerRef.current) {
        clearInterval(pollingTimerRef.current);
        pollingTimerRef.current = null;
      }
    };
  }, [waitingPayment, success, refreshOrganizations, onSuccess]);

  useEffect(() => {
    if (isOpen) {
      if (defaultTier) {
        setSelectedTier(defaultTier);
      } else {
        setSelectedTier(currentTier === 'boutique' ? 'atelier' : 'boutique');
      }
    } else {
      setError(null);
      setWaitingPayment(null);
    }
  }, [isOpen, defaultTier, currentTier]);

  if (!isOpen) return null;

  const activeTierDef = SUBSCRIPTION_TIERS[selectedTier];
  const selectedCycle = activeTierDef.cycles[selectedMonths] || activeTierDef.cycles[1];
  const isPro = isPaidCloudPlan(activeOrganization?.plan);

  const now = Date.now();
  const trialDaysRemaining = activeOrganization?.trial_ends_at
    ? Math.max(0, Math.ceil((new Date(activeOrganization.trial_ends_at).getTime() - now) / (1000 * 60 * 60 * 24)))
    : null;
  const isTrialActive = Boolean(
    isPro &&
      activeOrganization?.trial_ends_at &&
      new Date(activeOrganization.trial_ends_at).getTime() > now
  );
  const canStartTrial = !activeOrganization?.has_used_trial && !isPro;

  const handleStripeCheckout = async () => {
    if (!activeOrganization?.id) return;
    setError(null);

    if (!isCloudAuthenticated) {
      openLoginModal();
      return;
    }

    setIsProcessingPayment(true);
    try {
      const res = await directusClient.requestPayment({
        organizationId: activeOrganization.id,
        durationMonths: selectedMonths,
        planTier: selectedTier,
        locale,
      });

      if (res && res.success && res.paymentUrl) {
        if (isDesktop) {
          await openExternalUrl(res.paymentUrl);
          setWaitingPayment({
            sessionId: String(res.sessionId || res.trackId || ''),
            paymentUrl: res.paymentUrl,
            amountEur: res.amountEur || selectedCycle.priceEur,
            durationMonths: selectedMonths,
          });
        } else {
          window.location.href = res.paymentUrl;
        }
      } else {
        setError(
          res?.error ||
            (isIt
              ? 'Impossibile avviare la sessione Stripe Checkout.'
              : 'Unable to initialize Stripe Checkout session.')
        );
      }
    } catch (err: any) {
      setError(
        err?.message ||
          (isIt
            ? 'Errore di connessione con il gateway Stripe.'
            : 'Error connecting to Stripe payment gateway.')
      );
    } finally {
      setIsProcessingPayment(false);
    }
  };

  const handleOpenBillingPortal = async () => {
    if (!activeOrganization?.id) return;
    setError(null);

    if (!isCloudAuthenticated) {
      openLoginModal();
      return;
    }

    setIsOpeningPortal(true);
    try {
      const res = await directusClient.createBillingPortalSession(activeOrganization.id, locale);
      if (res?.success && res.portalUrl) {
        if (isDesktop) {
          await openExternalUrl(res.portalUrl);
        } else {
          window.location.href = res.portalUrl;
        }
      } else {
        setError(
          res?.error ||
            (isIt
              ? 'Impossibile aprire il Portale di Fatturazione Stripe.'
              : 'Unable to open Stripe Billing Portal.')
        );
      }
    } catch (err: any) {
      setError(
        err?.message ||
          (isIt
            ? 'Errore durante l\'apertura del Portale Stripe.'
            : 'Error opening Stripe Billing Portal.')
      );
    } finally {
      setIsOpeningPortal(false);
    }
  };

  const handleCheckPlanOnline = async () => {
    if (!activeOrganization) return;
    setIsChecking(true);
    setError(null);

    if (!isCloudAuthenticated) {
      openLoginModal();
      setIsChecking(false);
      return;
    }

    try {
      const res = await directusClient.checkOrganizationPlan();
      if (res && (res.isPro || isPaidCloudPlan(res.plan))) {
        await refreshOrganizations();
        storageManager.setMode('cloud_synced', { verifiedPro: true });
        setWaitingPayment(null);
        setSuccess(true);
        if (onSuccess) onSuccess();
      } else {
        setError(
          isIt
            ? 'Il piano di questa organizzazione risulta ancora Gratuito. Se hai appena completato il pagamento, riprova tra pochi secondi.'
            : 'This organization is still on the Free plan. If you just completed payment, please verify again in a few seconds.'
        );
      }
    } catch (err: any) {
      setError(err?.message || (isIt ? 'Errore di connessione al server.' : 'Server connection error.'));
    } finally {
      setIsChecking(false);
    }
  };

  const handleStartTrial = async () => {
    if (!activeOrganization) return;
    if (!isCloudAuthenticated) {
      openLoginModal();
      return;
    }

    setIsActivatingTrial(true);
    setError(null);
    try {
      const res = await directusClient.startFreeTrial(activeOrganization.id);
      if (res && (res.isPro || isPaidCloudPlan(res.plan))) {
        const resolvedPlan = (res.plan || res.organization?.plan || 'atelier') as 'atelier' | 'boutique' | 'pro';
        const updatedOrg = {
          ...activeOrganization,
          ...(res.organization || {}),
          plan: resolvedPlan,
          has_used_trial: true,
          trial_ends_at: res.trialEndsAt || res.organization?.trial_ends_at,
        };
        updateUserOrganization(updatedOrg);
        await refreshOrganizations(updatedOrg);
        storageManager.setMode('cloud_synced', { verifiedPro: true });
        setSuccess(true);
        setSubscriptionDetails({
          Transaction_id: isIt ? 'Prova Gratuita 14 Giorni (Atelier)' : '14-Day Free Atelier Trial',
          transaction_amount: formatCurrency(0, 'EUR', false, locale),
        });
        if (onSuccess) onSuccess();
      } else {
        setError(isIt ? 'Impossibile attivare la prova gratuita.' : 'Could not activate free trial.');
      }
    } catch (err: any) {
      setError(err?.message || (isIt ? 'Errore attivazione prova gratuita.' : 'Failed to activate free trial.'));
    } finally {
      setIsActivatingTrial(false);
    }
  };

  const handleStartMigration = async () => {
    if (!activeOrganization?.id) return;
    setIsMigrating(true);
    setError(null);
    try {
      const res = await CloudMigrationManager.migrateLocalToCloud(activeOrganization.id, (progress) => {
        setMigrationProgress(progress);
      });
      storageManager.setMode('cloud_synced', { verifiedPro: true });
      setMigrationDone(true);
      setMigrationStats({ total: res.totalMigrated, errors: res.errors });
    } catch (err: any) {
      setError(
        err?.message ||
          (isIt ? 'Errore durante la migrazione dei dati locali al cloud.' : 'Failed to migrate local data to cloud.')
      );
    } finally {
      setIsMigrating(false);
    }
  };

  const handleFinishAndActivate = () => {
    storageManager.setMode('cloud_synced', { verifiedPro: true });
    onClose();
    if (onSuccess) onSuccess();
  };

  const handleMigrateCloudToLocal = async () => {
    if (!activeOrganization?.id) return;
    setIsMigratingToLocal(true);
    setError(null);
    try {
      const res = await CloudMigrationManager.migrateCloudToLocal(activeOrganization.id, (progress) => {
        setLocalMigrationProgress(progress);
      });
      if (res.success) {
        setLocalMigrationDone(true);
        setLocalMigrationStats({ total: res.totalMigrated, errors: res.errors });
        await refreshOrganizations();
      } else {
        setError(res.errors[0] || (isIt ? 'Errore trasferimento nel database locale.' : 'Local transfer failed.'));
      }
    } catch (err: any) {
      setError(err?.message || (isIt ? 'Errore connessione al server cloud.' : 'Cloud connection error.'));
    } finally {
      setIsMigratingToLocal(false);
    }
  };

  const handleFinishOfflineSession = () => {
    storageManager.setMode('local_offline', { verifiedPro: false, force: true });
    onClose();
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  return (
    <div
      id="upgrade-pro-modal-backdrop"
      dir="ltr"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-xs animate-fade-in"
    >
      <div
        id="upgrade-pro-modal-card"
        className="relative w-full max-w-4xl max-h-[92vh] overflow-y-auto bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-2xl"
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 bg-white/95 dark:bg-neutral-900/95 backdrop-blur-md border-b border-neutral-100 dark:border-neutral-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-neutral-900 dark:text-white">
                {isIt ? `Piani Cloud ${BRAND.name}` : `${BRAND.name} Cloud Plans`}
              </h2>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                {isIt
                  ? 'Scegli Boutique Cloud o Atelier & Produzione Cloud • Pagamento EUR con Stripe'
                  : 'Choose Boutique Cloud or Atelier & Production Cloud • Secure EUR billing via Stripe'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Error Banner */}
          {error && (
            <div className="flex items-start gap-3 p-4 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/60 text-rose-700 dark:text-rose-300 text-sm">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Success + Optional Cloud Migration Flow */}
          {success ? (
            <div className="space-y-6 py-2">
              <div className="text-center space-y-3">
                <div className="w-16 h-16 mx-auto rounded-2xl bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                  <CheckCircle2 className="w-9 h-9" />
                </div>
                <h3 className="text-xl font-bold text-neutral-900 dark:text-white">
                  {isIt ? `${BRAND.name} Pro è attivo!` : `${BRAND.name} Pro is Now Active!`}
                </h3>
                <p className="text-sm text-neutral-600 dark:text-neutral-400 max-w-md mx-auto">
                  {isIt
                    ? 'Il tuo spazio di lavoro è ora abilitato alla sincronizzazione cloud multi-dispositivo e alla gestione del team.'
                    : 'Your workspace is now upgraded with multi-device cloud sync, team permissions, and automated backups.'}
                </p>
                {subscriptionDetails?.Transaction_id && (
                  <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-neutral-100 dark:bg-neutral-800 text-xs font-mono text-neutral-700 dark:text-neutral-300">
                    <span>{subscriptionDetails.Transaction_id}</span>
                  </div>
                )}
              </div>

              {/* Local-to-Cloud migration helper for desktop users */}
              {isDesktop && !migrationDone && (
                <div className="p-4 rounded-xl bg-sky-50 dark:bg-sky-950/20 border border-sky-200 dark:border-sky-800/40 space-y-3">
                  <div className="flex items-start gap-3">
                    <UploadCloud className="w-5 h-5 text-sky-600 dark:text-sky-400 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <h4 className="text-sm font-semibold text-neutral-900 dark:text-white">
                        {isIt ? 'Trasferisci i dati locali sul Cloud' : 'Sync Local Desktop Data to Cloud'}
                      </h4>
                      <p className="text-xs text-neutral-600 dark:text-neutral-400">
                        {isIt
                          ? 'Carica prodotti, magazzini, ordini e clienti salvati offline nel tuo spazio cloud Pro.'
                          : 'Upload your offline products, warehouses, orders, and customers to your Pro cloud workspace.'}
                      </p>
                    </div>
                  </div>
                  {isMigrating && migrationProgress && (
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-xs text-sky-700 dark:text-sky-300">
                        <span>{migrationProgress.step}</span>
                        <span>{Math.round((migrationProgress.current / Math.max(1, migrationProgress.total)) * 100)}%</span>
                      </div>
                      <div className="w-full h-2 bg-sky-100 dark:bg-sky-900/40 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-sky-600 transition-all"
                          style={{
                            width: `${Math.min(100, Math.round((migrationProgress.current / Math.max(1, migrationProgress.total)) * 100))}%`,
                          }}
                        />
                      </div>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={handleStartMigration}
                      isLoading={isMigrating}
                      className="gap-2"
                    >
                      <UploadCloud className="w-4 h-4" />
                      {isIt ? 'Avvia Migrazione al Cloud' : 'Migrate Local Data to Cloud'}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={handleFinishAndActivate}>
                      {isIt ? 'Salta e continua' : 'Skip & Continue'}
                    </Button>
                  </div>
                </div>
              )}

              {migrationDone && migrationStats && (
                <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/50 text-sm text-emerald-800 dark:text-emerald-300">
                  {isIt
                    ? `Migrazione completata: ${migrationStats.total} record sincronizzati sul cloud.`
                    : `Migration complete: ${migrationStats.total} records synchronized to the cloud.`}
                </div>
              )}

              <div className="flex justify-end">
                <Button variant="primary" onClick={handleFinishAndActivate}>
                  {isIt ? 'Apri Spazio di Lavoro Pro' : 'Continue to Pro Workspace'}
                </Button>
              </div>
            </div>
          ) : waitingPayment ? (
            /* Desktop Waiting for External Stripe Checkout */
            <div className="py-6 text-center space-y-5">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                <Radio className="w-7 h-7 animate-pulse" />
              </div>
              <div className="space-y-1.5">
                <h3 className="text-lg font-bold text-neutral-900 dark:text-white">
                  {isIt ? 'In attesa della conferma Stripe...' : 'Waiting for Stripe Payment Confirmation...'}
                </h3>
                <p className="text-sm text-neutral-600 dark:text-neutral-400 max-w-md mx-auto">
                  {isIt
                    ? 'Completa il pagamento nella finestra del browser appena aperta. L’app attiverà automaticamente il piano Pro appena Stripe conferma la transazione.'
                    : 'Complete checkout in your system browser. The desktop app checks automatically and unlocks Pro as soon as Stripe confirms payment.'}
                </p>
              </div>
              <div className="inline-flex items-center gap-3 px-4 py-2 rounded-xl bg-neutral-100 dark:bg-neutral-800 text-sm">
                <span className="text-neutral-500">{isIt ? 'Importo:' : 'Amount:'}</span>
                <span className="font-bold text-neutral-900 dark:text-white">
                  {formatCurrency(waitingPayment.amountEur, 'EUR', false, locale)}
                </span>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-3">
                <Button
                  variant="outline"
                  onClick={() => openExternalUrl(waitingPayment.paymentUrl)}
                  className="gap-2"
                >
                  <ExternalLink className="w-4 h-4" />
                  {isIt ? 'Riapri Pagina Stripe' : 'Re-open Stripe Checkout'}
                </Button>
                <Button
                  variant="primary"
                  onClick={handleCheckPlanOnline}
                  isLoading={isChecking}
                  className="gap-2"
                >
                  <RefreshCw className="w-4 h-4" />
                  {isIt ? 'Verifica Stato Ora' : 'Check Status Now'}
                </Button>
                <Button variant="ghost" onClick={() => setWaitingPayment(null)}>
                  {isIt ? 'Annulla' : 'Cancel'}
                </Button>
              </div>
            </div>
          ) : (
            <>
              {/* Active Trial / Pro Status Banner */}
              {isTrialActive && trialDaysRemaining !== null && (
                <div className="flex items-center justify-between gap-3 p-4 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50">
                  <div className="flex items-center gap-3">
                    <Clock className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />
                    <div className="text-sm">
                      <p className="font-semibold text-amber-900 dark:text-amber-200">
                        {isIt
                          ? `Prova gratuita attiva — ${trialDaysRemaining} giorni rimanenti`
                          : `Free Pro Trial Active — ${trialDaysRemaining} day${trialDaysRemaining === 1 ? '' : 's'} remaining`}
                      </p>
                      <p className="text-xs text-amber-700 dark:text-amber-300">
                        {isIt
                          ? 'Scegli un piano qui sotto per continuare senza interruzioni alla scadenza.'
                          : 'Select a billing plan below to keep uninterrupted cloud access after your trial ends.'}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* 14-Day Free Trial Callout */}
              {canStartTrial && (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/25 border border-emerald-200 dark:border-emerald-800/50">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                      <Zap className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-emerald-950 dark:text-emerald-200">
                        {isIt ? 'Prova Atelier Cloud gratis per 14 giorni' : 'Try Full Atelier Cloud Free for 14 Days'}
                      </h4>
                      <p className="text-xs text-emerald-800 dark:text-emerald-300/90 mt-0.5">
                        {isIt
                          ? 'Nessuna carta richiesta. Testa sincronizzazione cloud, WooCommerce, produzione e contabilità subito.'
                          : 'No credit card required. Experience cloud sync, WooCommerce, production BOMs & accounting immediately.'}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleStartTrial}
                    isLoading={isActivatingTrial}
                    className="shrink-0 bg-emerald-600 hover:bg-emerald-700"
                  >
                    {isIt ? 'Attiva Prova 14 Giorni' : 'Start 14-Day Free Trial'}
                  </Button>
                </div>
              )}

              {/* Step 1: 2-Tier Cloud Plan Selector (Boutique vs Atelier) */}
              <div className="space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-bold text-neutral-900 dark:text-white">
                    {isIt ? '1. Scegli il livello del piano Cloud' : '1. Choose Your Cloud Plan Tier'}
                  </h3>
                  {isPro && !isTrialActive && (
                    <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
                      {isIt ? 'Piano attuale:' : 'Current plan:'}{' '}
                      <strong className="text-neutral-900 dark:text-white">
                        {getPlanDisplayName(activeOrganization?.plan, locale)}
                      </strong>
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {(['boutique', 'atelier'] as SubscriptionTier[]).map((tierId) => {
                    const tier = SUBSCRIPTION_TIERS[tierId];
                    const isSelected = selectedTier === tierId;
                    const isCurrentPlan = !isTrialActive && currentTier === tierId;
                    const monthlyPrice = tier.cycles[1].priceEur;
                    const highlights = isIt ? tier.highlightsIt : tier.highlights;
                    const TierIcon = tierId === 'boutique' ? Store : Scissors;

                    return (
                      <button
                        key={tierId}
                        type="button"
                        onClick={() => setSelectedTier(tierId)}
                        className={`relative text-left p-5 rounded-2xl border-2 transition-all flex flex-col justify-between gap-4 cursor-pointer ${
                          isSelected
                            ? tierId === 'atelier'
                              ? 'border-indigo-600 dark:border-indigo-400 bg-indigo-50/40 dark:bg-indigo-950/20 shadow-sm'
                              : 'border-neutral-900 dark:border-white bg-neutral-50 dark:bg-neutral-800/70 shadow-sm'
                            : 'border-neutral-200 dark:border-neutral-800 hover:border-neutral-300 dark:hover:border-neutral-700 bg-white dark:bg-neutral-900/40'
                        }`}
                      >
                        <div className="space-y-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2.5">
                              <div
                                className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                                  tierId === 'atelier'
                                    ? 'bg-indigo-600 text-white'
                                    : 'bg-neutral-900 dark:bg-white text-white dark:text-neutral-900'
                                }`}
                              >
                                <TierIcon className="w-4 h-4" />
                              </div>
                              <div>
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-base font-bold text-neutral-900 dark:text-white">
                                    {isIt ? tier.nameIt : tier.name}
                                  </span>
                                  {tier.badge && (
                                    <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded bg-indigo-600/15 text-indigo-700 dark:text-indigo-300">
                                      {isIt ? tier.badgeIt : tier.badge}
                                    </span>
                                  )}
                                  {isCurrentPlan && (
                                    <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                                      {isIt ? 'Attivo' : 'Current'}
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                                  {isIt ? tier.taglineIt : tier.tagline}
                                </p>
                              </div>
                            </div>

                            <span
                              className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                                isSelected
                                  ? tierId === 'atelier'
                                    ? 'bg-indigo-600 text-white'
                                    : 'bg-neutral-900 dark:bg-white text-white dark:text-neutral-900'
                                  : 'border border-neutral-300 dark:border-neutral-700'
                              }`}
                            >
                              {isSelected && <Check className="w-3 h-3" />}
                            </span>
                          </div>

                          <div className="flex items-baseline gap-1 pt-1">
                            <span className="text-2xl font-extrabold text-neutral-900 dark:text-white">
                              {formatCurrency(monthlyPrice, 'EUR', false, locale)}
                            </span>
                            <span className="text-xs text-neutral-500 dark:text-neutral-400">
                              {isIt ? '/ mese (base)' : '/ month (base)'}
                            </span>
                          </div>

                          <ul className="space-y-1.5 pt-2 border-t border-neutral-200/70 dark:border-neutral-800">
                            {highlights.map((item, idx) => (
                              <li
                                key={idx}
                                className="flex items-start gap-2 text-xs text-neutral-700 dark:text-neutral-300 leading-snug"
                              >
                                <CheckCircle2
                                  className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${
                                    tierId === 'atelier'
                                      ? 'text-indigo-600 dark:text-indigo-400'
                                      : 'text-emerald-600 dark:text-emerald-400'
                                  }`}
                                />
                                <span>{item}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Step 2: EUR Billing Cycle Selection */}
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-bold text-neutral-900 dark:text-white">
                    {isIt
                      ? `2. Ciclo di fatturazione — ${activeTierDef.nameIt}`
                      : `2. Billing Cycle — ${activeTierDef.name}`}
                  </h3>
                  <span className="text-xs text-neutral-500 dark:text-neutral-400">
                    {isIt
                      ? 'Partita IVA / EU VAT supportati al checkout • Disdici quando vuoi'
                      : 'EU VAT / Partita IVA collected at checkout • Cancel anytime'}
                  </span>
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  {CYCLE_ORDER.map((months) => {
                    const cycle = activeTierDef.cycles[months];
                    const isSelected = selectedMonths === months;
                    const cycleLabel =
                      months === 1
                        ? isIt ? '1 Mese' : '1 Month'
                        : months === 3
                        ? isIt ? '3 Mesi' : '3 Months'
                        : months === 6
                        ? isIt ? '6 Mesi' : '6 Months'
                        : isIt ? '12 Mesi' : '12 Months';
                    const badge =
                      months === 12
                        ? isIt ? 'Miglior Risparmio' : 'Best Value'
                        : months === 3
                        ? isIt ? 'Popolare' : 'Popular'
                        : null;

                    return (
                      <button
                        key={months}
                        type="button"
                        onClick={() => setSelectedMonths(months)}
                        className={`relative text-left p-4 rounded-xl border-2 transition-all cursor-pointer ${
                          isSelected
                            ? 'border-neutral-900 dark:border-white bg-neutral-50 dark:bg-neutral-800/80 shadow-sm'
                            : 'border-neutral-200 dark:border-neutral-800 hover:border-neutral-300 dark:hover:border-neutral-700'
                        }`}
                      >
                        {badge && (
                          <span className="inline-block mb-2 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded bg-amber-500/15 text-amber-700 dark:text-amber-300">
                            {badge}
                          </span>
                        )}
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-bold text-neutral-900 dark:text-white">
                            {cycleLabel}
                          </span>
                          {isSelected && (
                            <span className="w-5 h-5 rounded-full bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 flex items-center justify-center">
                              <Check className="w-3 h-3" />
                            </span>
                          )}
                        </div>
                        <div className="mt-2">
                          <span className="text-xl sm:text-2xl font-extrabold text-neutral-900 dark:text-white">
                            {formatCurrency(cycle.priceEur, 'EUR', false, locale)}
                          </span>
                        </div>
                        <div className="mt-1 flex items-center justify-between text-xs text-neutral-500 dark:text-neutral-400">
                          <span>
                            {formatCurrency(cycle.monthlyEquivalentEur, 'EUR', false, locale)}
                            {isIt ? '/mese' : '/mo'}
                          </span>
                          {cycle.discountPercent > 0 && (
                            <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                              -{cycle.discountPercent}%
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Stripe Checkout Action Bar */}
              <div className="p-4 rounded-xl bg-neutral-50 dark:bg-neutral-800/60 border border-neutral-200 dark:border-neutral-700/70 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-sm font-semibold text-neutral-900 dark:text-white">
                    <CreditCard className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                    <span>
                      {isIt ? activeTierDef.nameIt : activeTierDef.name} •{' '}
                      {formatCurrency(selectedCycle.priceEur, 'EUR', false, locale)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400">
                    <Lock className="w-3.5 h-3.5" />
                    <span>
                      {isIt
                        ? 'Pagamento sicuro con Stripe (Visa, Mastercard, Apple Pay, Google Pay, SEPA)'
                        : 'Secured by Stripe (Visa, Mastercard, Apple Pay, Google Pay, SEPA)'}
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {activeOrganization?.stripe_customer_id && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleOpenBillingPortal}
                      isLoading={isOpeningPortal}
                      className="gap-1.5"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      {isIt ? 'Gestisci Fatturazione' : 'Manage Billing'}
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCheckPlanOnline}
                    isLoading={isChecking}
                    className="gap-1.5"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    {isIt ? 'Verifica Piano' : 'Verify Plan'}
                  </Button>
                  <Button
                    variant="primary"
                    onClick={handleStripeCheckout}
                    isLoading={isProcessingPayment}
                    className="gap-2"
                  >
                    <CreditCard className="w-4 h-4" />
                    {isIt ? 'Abbonati con Stripe' : 'Subscribe with Stripe'}
                  </Button>
                </div>
              </div>

              {/* Desktop Offline Backup / Cloud-to-Local Option */}
              {isDesktop && isPro && (
                <div className="pt-4 border-t border-neutral-200 dark:border-neutral-800 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-start gap-2.5">
                      <Laptop className="w-5 h-5 text-neutral-500 shrink-0 mt-0.5" />
                      <div>
                        <h4 className="text-sm font-semibold text-neutral-900 dark:text-white">
                          {isIt ? 'Esporta copia locale per modalità Offline Desktop' : 'Download Local Copy for Offline Desktop Mode'}
                        </h4>
                        <p className="text-xs text-neutral-500 dark:text-neutral-400">
                          {isIt
                            ? 'Scarica i dati cloud nel database SQLite locale prima di passare alla modalità offline.'
                            : 'Save a full copy of your cloud workspace into local SQLite storage before switching offline.'}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleMigrateCloudToLocal}
                      isLoading={isMigratingToLocal}
                      className="gap-1.5 shrink-0"
                    >
                      <Download className="w-4 h-4" />
                      {isIt ? 'Scarica in Locale' : 'Download Locally'}
                    </Button>
                  </div>

                  {isMigratingToLocal && localMigrationProgress && (
                    <div className="space-y-1 text-xs text-neutral-600 dark:text-neutral-300">
                      <div className="flex justify-between">
                        <span>{localMigrationProgress.step}</span>
                        <span>
                          {Math.round((localMigrationProgress.current / Math.max(1, localMigrationProgress.total)) * 100)}%
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-neutral-200 dark:bg-neutral-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-neutral-900 dark:bg-white transition-all"
                          style={{
                            width: `${Math.min(100, Math.round((localMigrationProgress.current / Math.max(1, localMigrationProgress.total)) * 100))}%`,
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {localMigrationDone && localMigrationStats && (
                    <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/50 text-xs text-emerald-800 dark:text-emerald-300">
                      <span className="flex items-center gap-2">
                        <Database className="w-4 h-4" />
                        {isIt
                          ? `${localMigrationStats.total} record salvati nel database locale.`
                          : `${localMigrationStats.total} records saved to local database.`}
                      </span>
                      <Button variant="outline" size="sm" onClick={handleFinishOfflineSession}>
                        {isIt ? 'Passa a Offline' : 'Switch to Offline'}
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
