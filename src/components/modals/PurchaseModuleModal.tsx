import React, { useState, useEffect, useRef } from 'react';
import { useOrganization } from '../../context/OrganizationContext';
import { useAuth } from '../../context/AuthContext';
import { isTauriEnvironment } from '../../storage';
import { directusClient } from '../../api/directus';
import { useModuleAccess } from '../../hooks/useModuleAccess';
import { useTranslation } from '../../i18n';
import { formatModulePrice } from '../../utils/license';
import { openExternalUrl } from '../../utils/desktop';
import { getRequiredTierForModule, isModuleOfflinePurchasable } from '../../config/plans';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import {
  CreditCard,
  ShieldCheck,
  Cpu,
  KeyRound,
  Sparkles,
  CheckCircle2,
  X,
  Copy,
  Check,
  Barcode,
  Boxes,
  Calculator,
  AlertCircle,
  ExternalLink,
  RefreshCw,
  Lock,
  Globe,
  Store,
  Scissors,
} from 'lucide-react';

interface PurchaseModuleModalProps {
  isOpen: boolean;
  onClose: () => void;
  moduleSlug: string;
  moduleName?: string;
  onSuccess?: () => void;
  onOpenProModal?: () => void;
}

const MODULE_COPY: Record<string, { en: { name: string; desc: string }; it: { name: string; desc: string } }> = {
  barcode: {
    en: {
      name: 'Barcode & Thermal Label Designer',
      desc: 'Design custom garment hang-tags and thermal barcode labels with EAN-13 and CODE-128 batch printing.',
    },
    it: {
      name: 'Codici a Barre ed Etichette Termiche',
      desc: 'Crea cartellini abbigliamento ed etichette termiche personalizzate con stampa massiva EAN-13 e CODE-128.',
    },
  },
  accounting: {
    en: {
      name: 'Accounting & Financial Ledger',
      desc: 'Profit & Loss analytics, expenses, treasury accounts, party ledgers, EU VAT/IVA reports, and Xero/QuickBooks/IFRS exports.',
    },
    it: {
      name: 'Contabilità e Gestione Finanziaria',
      desc: 'Conto economico, spese, conti bancari e cassa, partitari clienti/fornitori, report IVA UE ed export contabili.',
    },
  },
  woocommerce: {
    en: {
      name: 'WooCommerce Store Sync',
      desc: 'Two-way synchronization of apparel variants, inventory levels, pricing, and automated online order import.',
    },
    it: {
      name: 'Sincronizzazione WooCommerce',
      desc: 'Sincronizzazione bidirezionale di varianti abbigliamento, giacenze, prezzi e importazione automatica ordini.',
    },
  },
  online_catalog: {
    en: {
      name: 'Digital Showroom & Size Finder',
      desc: 'Public digital lookbook with QR sharing and an intelligent garment-to-body size recommendation engine.',
    },
    it: {
      name: 'Catalogo Digitale e Guida Taglie Smart',
      desc: 'Showroom online pubblico con condivisione QR e motore intelligente per consigliare la taglia perfetta.',
    },
  },
  production: {
    en: {
      name: 'Garment Production & BOM',
      desc: 'Manage fabrics, trims, Bills of Materials (BOM), cutting & sewing work orders, contractors, and unit costs.',
    },
    it: {
      name: 'Produzione Abbigliamento e Distinta Base',
      desc: 'Gestisci tessuti, accessori, distinte base (BOM), ordini di taglio/cucito, contoterzisti e costi di produzione.',
    },
  },
};

export const PurchaseModuleModal: React.FC<PurchaseModuleModalProps> = ({
  isOpen,
  onClose,
  moduleSlug,
  moduleName,
  onSuccess,
  onOpenProModal,
}) => {
  const { locale } = useTranslation();
  const isIt = locale === 'it';
  const { activeOrganization } = useOrganization();
  const { isCloudAuthenticated, openLoginModal } = useAuth();
  const { systemModules, orgModules, hardwareId, activateLicense, refreshModules, hasAccess } = useModuleAccess();
  const isDesktop = isTauriEnvironment();

  const [isProcessing, setIsProcessing] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [copiedHwId, setCopiedHwId] = useState(false);

  // Manual offline license activation toggle
  const [showManualKey, setShowManualKey] = useState(false);
  const [manualKey, setManualKey] = useState('');
  const [isActivatingKey, setIsActivatingKey] = useState(false);

  // Desktop external Stripe polling state
  const [waitingPayment, setWaitingPayment] = useState<{
    sessionId: string;
    paymentUrl: string;
    priceDisplay: string;
  } | null>(null);
  const pollingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const matchedSystemMod = systemModules.find((m) => m.slug === moduleSlug);
  const matchedOrgMod = orgModules.find((m) => m.slug === moduleSlug);
  const localizedCopy = MODULE_COPY[moduleSlug]?.[isIt ? 'it' : 'en'];

  const resolvedName =
    moduleName ||
    localizedCopy?.name ||
    matchedSystemMod?.name ||
    moduleSlug;

  const description =
    localizedCopy?.desc ||
    matchedSystemMod?.description ||
    (isIt
      ? 'Modulo professionale aggiuntivo per il tuo flusso di lavoro moda e magazzino.'
      : 'Specialized add-on module built for apparel, footwear, and retail operations.');

  const canBuyOffline = isModuleOfflinePurchasable(moduleSlug);
  const requiredTier = getRequiredTierForModule(moduleSlug);
  const requiredTierLabel =
    requiredTier === 'boutique'
      ? 'Boutique Cloud (€29/mo)'
      : isIt
        ? 'Atelier & Produzione Cloud (€49/mese)'
        : 'Atelier & Production Cloud (€49/mo)';

  const formattedPrice = canBuyOffline
    ? formatModulePrice(matchedSystemMod || matchedOrgMod || { slug: moduleSlug }, locale)
    : '';

  const handleCopyHw = () => {
    navigator.clipboard.writeText(hardwareId);
    setCopiedHwId(true);
    setTimeout(() => setCopiedHwId(false), 2000);
  };

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
        await refreshModules();
        if (hasAccess(moduleSlug)) {
          clearInterval(checkInterval);
          pollingTimerRef.current = null;
          setWaitingPayment(null);
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
  }, [waitingPayment, success, refreshModules, hasAccess, moduleSlug, onSuccess]);

  useEffect(() => {
    if (!isOpen) {
      setError(null);
      setWaitingPayment(null);
      setSuccess(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const renderModuleIcon = () => {
    switch (moduleSlug) {
      case 'barcode':
        return <Barcode className="w-6 h-6" />;
      case 'accounting':
        return <Calculator className="w-6 h-6" />;
      case 'woocommerce':
        return <Store className="w-6 h-6" />;
      case 'online_catalog':
        return <Globe className="w-6 h-6" />;
      case 'production':
        return <Scissors className="w-6 h-6" />;
      default:
        return <Boxes className="w-6 h-6" />;
    }
  };

  const handleStripeCheckout = async () => {
    if (!activeOrganization?.id) return;
    setError(null);

    if (!isCloudAuthenticated) {
      openLoginModal();
      return;
    }

    setIsProcessing(true);
    try {
      const res = await directusClient.requestModulePayment({
        organizationId: activeOrganization.id,
        moduleSlug,
        hardwareId,
        locale,
      });

      if (res && res.success && res.paymentUrl) {
        if (isDesktop) {
          await openExternalUrl(res.paymentUrl);
          setWaitingPayment({
            sessionId: String(res.sessionId || res.trackId || ''),
            paymentUrl: res.paymentUrl,
            priceDisplay: formattedPrice,
          });
        } else {
          window.location.href = res.paymentUrl;
        }
      } else {
        setError(
          res?.error ||
            (isIt
              ? 'Impossibile avviare il pagamento Stripe per questo modulo.'
              : 'Could not initialize Stripe Checkout for this module.')
        );
      }
    } catch (err: any) {
      setError(
        err?.message ||
          (isIt ? 'Errore di connessione con Stripe.' : 'Connection error with Stripe gateway.')
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const handleVerifyNow = async () => {
    setIsChecking(true);
    setError(null);
    try {
      await refreshModules();
      if (hasAccess(moduleSlug)) {
        setWaitingPayment(null);
        setSuccess(true);
        if (onSuccess) onSuccess();
      } else {
        setError(
          isIt
            ? 'La licenza non risulta ancora attiva. Riprova tra qualche secondo dopo il completamento su Stripe.'
            : 'License is not active yet. Please verify again a few seconds after completing Stripe Checkout.'
        );
      }
    } catch (err: any) {
      setError(err?.message || (isIt ? 'Errore di verifica.' : 'Verification failed.'));
    } finally {
      setIsChecking(false);
    }
  };

  const handleActivateManualKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualKey.trim()) return;
    setError(null);
    setIsActivatingKey(true);
    try {
      const res = await activateLicense(manualKey.trim());
      if (res.success) {
        setSuccess(true);
        setManualKey('');
        if (onSuccess) onSuccess();
      } else {
        setError(
          res.message ||
            (isIt
              ? 'Chiave di licenza non valida o non corrispondente a questa organizzazione.'
              : 'Invalid license key or mismatch with this organization/device.')
        );
      }
    } catch (err: any) {
      setError(err?.message || (isIt ? 'Attivazione licenza fallita.' : 'License activation failed.'));
    } finally {
      setIsActivatingKey(false);
    }
  };

  return (
    <div
      id="purchase-module-modal-backdrop"
      dir="ltr"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-xs animate-fade-in"
    >
      <div
        id="purchase-module-modal-card"
        className="relative w-full max-w-xl max-h-[92vh] overflow-y-auto bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100 dark:border-neutral-800">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 flex items-center justify-center">
              {renderModuleIcon()}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-neutral-900 dark:text-white">{resolvedName}</h2>
                <Badge variant={canBuyOffline ? 'default' : 'info'}>
                  {canBuyOffline
                    ? isIt ? 'Licenza Desktop Offline' : 'Desktop Offline License'
                    : isIt ? 'Abbonamento Cloud' : 'Cloud Subscription'}
                </Badge>
              </div>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                {canBuyOffline
                  ? isIt ? 'Acquisto una tantum per uso locale • Stripe EUR' : 'One-time Desktop Offline license • Stripe EUR'
                  : isIt ? `Incluso in ${requiredTierLabel}` : `Included in ${requiredTierLabel}`}
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

        <div className="p-6 space-y-5">
          {error && (
            <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/50 text-rose-700 dark:text-rose-300 text-sm">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {success ? (
            <div className="py-6 text-center space-y-4">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-bold text-neutral-900 dark:text-white">
                  {isIt ? 'Modulo attivato con successo!' : 'Module Activated Successfully!'}
                </h3>
                <p className="text-sm text-neutral-600 dark:text-neutral-400">
                  {isIt
                    ? `Tutte le funzionalità di ${resolvedName} sono ora sbloccate per la tua organizzazione.`
                    : `All features of ${resolvedName} are now unlocked for your organization.`}
                </p>
              </div>
              <Button variant="primary" onClick={onClose}>
                {isIt ? 'Inizia a Usarlo' : 'Start Using Module'}
              </Button>
            </div>
          ) : waitingPayment ? (
            <div className="py-5 text-center space-y-4">
              <div className="w-12 h-12 mx-auto rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                <RefreshCw className="w-6 h-6 animate-spin" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-neutral-900 dark:text-white">
                  {isIt ? 'In attesa della conferma Stripe...' : 'Waiting for Stripe Confirmation...'}
                </h3>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 max-w-sm mx-auto">
                  {isIt
                    ? 'Completa l’acquisto nel browser aperto. La licenza verrà attivata automaticamente.'
                    : 'Finish payment in your browser window. Your license will activate automatically.'}
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => openExternalUrl(waitingPayment.paymentUrl)}
                  className="gap-1.5"
                >
                  <ExternalLink className="w-4 h-4" />
                  {isIt ? 'Riapri Stripe' : 'Re-open Stripe'}
                </Button>
                <Button variant="primary" size="sm" onClick={handleVerifyNow} isLoading={isChecking} className="gap-1.5">
                  <RefreshCw className="w-4 h-4" />
                  {isIt ? 'Verifica Ora' : 'Verify Now'}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setWaitingPayment(null)}>
                  {isIt ? 'Annulla' : 'Cancel'}
                </Button>
              </div>
            </div>
          ) : !canBuyOffline ? (
            <div className="space-y-4 py-2">
              <p className="text-sm text-neutral-600 dark:text-neutral-300 leading-relaxed">{description}</p>
              <div className="p-4 rounded-xl bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800/60 space-y-2">
                <div className="flex items-center gap-2 text-sm font-bold text-indigo-950 dark:text-indigo-200">
                  <Sparkles className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  <span>
                    {isIt
                      ? `Incluso in ${requiredTierLabel}`
                      : `Included in ${requiredTierLabel}`}
                  </span>
                </div>
                <p className="text-xs text-indigo-800/90 dark:text-indigo-300 leading-relaxed">
                  {isIt
                    ? 'Questo modulo utilizza server cloud e API online continue ed è incluso nell’abbonamento Cloud anziché come licenza offline una tantum.'
                    : 'This module relies on continuous cloud hosting and online APIs, so it is included with a Cloud Subscription rather than a one-time offline license.'}
                </p>
              </div>
              {onOpenProModal && (
                <Button
                  variant="primary"
                  className="w-full py-3 gap-2 text-sm font-semibold"
                  onClick={() => {
                    onClose();
                    onOpenProModal();
                  }}
                >
                  <Sparkles className="w-4 h-4" />
                  {isIt ? 'Scegli un Piano Cloud' : 'View Cloud Plans'}
                </Button>
              )}
            </div>
          ) : (
            <>
              <p className="text-sm text-neutral-600 dark:text-neutral-300 leading-relaxed">{description}</p>

              {/* Price Summary Card */}
              <div className="p-4 rounded-xl bg-neutral-50 dark:bg-neutral-800/60 border border-neutral-200 dark:border-neutral-700/70 flex items-center justify-between gap-4">
                <div>
                  <span className="text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                    {isIt ? 'Licenza Desktop Offline (una tantum)' : 'Desktop Offline License (One-Time)'}
                  </span>
                  <div className="text-2xl font-extrabold text-neutral-900 dark:text-white mt-0.5">
                    {formattedPrice}
                  </div>
                </div>
                <div className="text-right space-y-1">
                  <div className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                    <ShieldCheck className="w-4 h-4" />
                    <span>{isIt ? 'Aggiornamenti inclusi' : 'Free updates included'}</span>
                  </div>
                  <div className="flex items-center justify-end gap-1 text-[11px] text-neutral-500 dark:text-neutral-400">
                    <Lock className="w-3 h-3" />
                    <span>Stripe EUR Checkout</span>
                  </div>
                </div>
              </div>

              {/* Included in Cloud Tier hint */}
              {onOpenProModal && (
                <div className="flex items-center justify-between gap-3 p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50">
                  <div className="flex items-center gap-2 text-xs text-amber-900 dark:text-amber-200">
                    <Sparkles className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>
                      {isIt
                        ? `Incluso anche in ${requiredTierLabel} insieme alla sincronizzazione cloud.`
                        : `Also included in ${requiredTierLabel} along with multi-user Cloud Sync.`}
                    </span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      onClose();
                      onOpenProModal();
                    }}
                  >
                    {isIt ? 'Vedi Piani' : 'View Plans'}
                  </Button>
                </div>
              )}

              {/* Primary Stripe Button */}
              <Button
                variant="primary"
                className="w-full py-3 gap-2 text-sm font-semibold"
                onClick={handleStripeCheckout}
                isLoading={isProcessing}
              >
                <CreditCard className="w-4 h-4" />
                {isIt
                  ? `Acquista Licenza Offline (${formattedPrice})`
                  : `Buy Offline License (${formattedPrice})`}
              </Button>

              {/* Hardware Fingerprint + Offline License Key */}
              <div className="pt-4 border-t border-neutral-100 dark:border-neutral-800 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5 text-neutral-500 dark:text-neutral-400">
                    <Cpu className="w-3.5 h-3.5" />
                    <span>{isIt ? 'ID Dispositivo:' : 'Device ID:'}</span>
                    <code className="px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 font-mono text-[11px] text-neutral-700 dark:text-neutral-300">
                      {hardwareId}
                    </code>
                  </div>
                  <button
                    type="button"
                    onClick={handleCopyHw}
                    className="inline-flex items-center gap-1 text-neutral-500 hover:text-neutral-900 dark:hover:text-white transition-colors"
                  >
                    {copiedHwId ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedHwId ? (isIt ? 'Copiato' : 'Copied') : (isIt ? 'Copia' : 'Copy')}</span>
                  </button>
                </div>

                <div>
                  <button
                    type="button"
                    onClick={() => setShowManualKey((v) => !v)}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition-colors"
                  >
                    <KeyRound className="w-3.5 h-3.5" />
                    <span>
                      {isIt ? 'Hai già una chiave di licenza offline?' : 'Already have an offline license key?'}
                    </span>
                  </button>

                  {showManualKey && (
                    <form onSubmit={handleActivateManualKey} className="mt-2.5 flex gap-2">
                      <input
                        type="text"
                        value={manualKey}
                        onChange={(e) => setManualKey(e.target.value)}
                        placeholder="CLZ1_..."
                        className="flex-1 px-3 py-2 text-xs font-mono rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-white"
                      />
                      <Button type="submit" variant="outline" size="sm" isLoading={isActivatingKey}>
                        {isIt ? 'Attiva' : 'Activate'}
                      </Button>
                    </form>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
