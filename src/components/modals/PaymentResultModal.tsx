import React, { useEffect, useState } from 'react';
import { useOrganization } from '../../context/OrganizationContext';
import { storageManager } from '../../storage';
import { useTranslation } from '../../i18n';
import { BRAND } from '../../config/brand';
import { Button } from '../ui/Button';
import { CheckCircle2, XCircle, Sparkles, ShieldCheck, RefreshCw, AlertTriangle } from 'lucide-react';

interface PaymentResultState {
  isOpen: boolean;
  status: 'success' | 'module_success' | 'failed' | 'cancelled';
  sessionId?: string | null;
  refNumber?: string | null;
  orgId?: string | null;
  plan?: string | null;
  message?: string | null;
  moduleSlug?: string | null;
  moduleName?: string | null;
}

export const PaymentResultModal: React.FC<{ onRetryPayment?: () => void }> = ({ onRetryPayment }) => {
  const { locale } = useTranslation();
  const isIt = locale === 'it';
  const { refreshOrganizations, activeOrganization } = useOrganization();
  const [result, setResult] = useState<PaymentResultState>({
    isOpen: false,
    status: 'success',
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      const urlParams = new URLSearchParams(window.location.search);
      const paymentStatus = urlParams.get('payment');

      if (
        paymentStatus === 'success' ||
        paymentStatus === 'module_success' ||
        paymentStatus === 'failed' ||
        paymentStatus === 'cancelled'
      ) {
        const sessionId = urlParams.get('session_id') || urlParams.get('track_id');
        const refNumber = urlParams.get('ref_number');
        const orgId = urlParams.get('org_id');
        const plan = urlParams.get('plan');
        const message = urlParams.get('message') || urlParams.get('reason');
        const moduleSlug = urlParams.get('module');
        const moduleName = urlParams.get('module_name');

        setResult({
          isOpen: true,
          status: paymentStatus,
          sessionId,
          refNumber,
          orgId,
          plan,
          message,
          moduleSlug,
          moduleName,
        });

        if (paymentStatus === 'success') {
          storageManager.setMode('cloud_synced', { verifiedPro: true });
          refreshOrganizations().catch(console.error);
        }

        if (paymentStatus === 'module_success') {
          window.dispatchEvent(new CustomEvent('tankhor_module_activated', { detail: { slug: moduleSlug } }));
        }

        const cleanUrl = window.location.pathname;
        window.history.replaceState({}, document.title, cleanUrl);
      }
    } catch (e) {
      console.warn('Failed to parse payment URL parameters:', e);
    }
  }, [refreshOrganizations]);

  if (!result.isOpen) return null;

  const handleClose = () => {
    setResult((prev) => ({ ...prev, isOpen: false }));
    if (result.status === 'module_success') {
      window.dispatchEvent(new CustomEvent('tankhor_module_activated', { detail: { slug: result.moduleSlug } }));
    }
  };

  const handleRetry = () => {
    handleClose();
    if (onRetryPayment) {
      onRetryPayment();
    }
  };

  const isSuccess = result.status === 'success' || result.status === 'module_success';
  const isModule = result.status === 'module_success';
  const isCancelled = result.status === 'cancelled';

  const title = isSuccess
    ? isModule
      ? isIt
        ? 'Modulo attivato!'
        : 'Add-on Module Activated!'
      : isIt
        ? `Benvenuto in ${BRAND.name} Pro!`
        : `Welcome to ${BRAND.name} Pro!`
    : isCancelled
      ? isIt
        ? 'Pagamento annullato'
        : 'Checkout Cancelled'
      : isIt
        ? 'Pagamento non completato'
        : 'Payment Could Not Be Verified';

  const subtitle = isSuccess
    ? isModule
      ? isIt
        ? `La licenza perpetua per "${result.moduleName || result.moduleSlug}" è ora attiva per ${activeOrganization?.name || 'la tua organizzazione'}.`
        : `Your perpetual license for "${result.moduleName || result.moduleSlug}" is now active for ${activeOrganization?.name || 'your organization'}.`
      : isIt
        ? `L’abbonamento Pro è stato confermato da Stripe. La sincronizzazione cloud è ora attiva per ${activeOrganization?.name || 'il tuo spazio di lavoro'}.`
        : `Your Stripe payment was confirmed. Cloud Pro sync and multi-user features are now enabled for ${activeOrganization?.name || 'your workspace'}.`
    : isCancelled
      ? isIt
        ? 'Hai chiuso Stripe Checkout prima del completamento. Nessun addebito è stato effettuato.'
        : 'You left Stripe Checkout before completing payment. No charge was made.'
      : isIt
        ? 'Non è stato possibile verificare la transazione Stripe. Se il pagamento è andato a buon fine, contatta il supporto con il codice di riferimento.'
        : 'We could not confirm your Stripe payment. If your card was charged, please contact support with the reference ID below.';

  return (
    <div
      id="payment-result-modal-backdrop"
      dir="ltr"
      className="fixed inset-0 z-[100] bg-neutral-950/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
    >
      <div
        id="payment-result-card"
        className="w-full max-w-md bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-2xl overflow-hidden animate-fade-in"
      >
        <div className="p-6 text-center space-y-4">
          <div
            className={`w-16 h-16 mx-auto rounded-2xl flex items-center justify-center ${
              isSuccess
                ? 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400'
                : isCancelled
                  ? 'bg-amber-100 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400'
                  : 'bg-rose-100 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400'
            }`}
          >
            {isSuccess ? (
              isModule ? <Sparkles className="w-8 h-8" /> : <CheckCircle2 className="w-9 h-9" />
            ) : isCancelled ? (
              <AlertTriangle className="w-8 h-8" />
            ) : (
              <XCircle className="w-9 h-9" />
            )}
          </div>

          <div className="space-y-1.5">
            <h2 className="text-xl font-bold text-neutral-900 dark:text-white">{title}</h2>
            <p className="text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed">{subtitle}</p>
          </div>

          {(result.refNumber || result.sessionId) && (
            <div className="p-3.5 rounded-xl bg-neutral-50 dark:bg-neutral-800/60 border border-neutral-200 dark:border-neutral-800 text-left space-y-2 text-xs">
              {result.refNumber && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-neutral-500 dark:text-neutral-400">
                    {isIt ? 'Riferimento Stripe:' : 'Stripe Reference:'}
                  </span>
                  <span className="font-mono font-semibold text-neutral-900 dark:text-white truncate max-w-[210px]">
                    {result.refNumber}
                  </span>
                </div>
              )}
              {result.sessionId && result.sessionId !== result.refNumber && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-neutral-500 dark:text-neutral-400">
                    {isIt ? 'ID Sessione:' : 'Session ID:'}
                  </span>
                  <span className="font-mono text-neutral-700 dark:text-neutral-300 truncate max-w-[210px]">
                    {result.sessionId}
                  </span>
                </div>
              )}
            </div>
          )}

          {isSuccess && (
            <div className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
              <ShieldCheck className="w-4 h-4" />
              <span>{isIt ? 'Transazione verificata tramite Stripe' : 'Transaction verified via Stripe'}</span>
            </div>
          )}
        </div>

        <div className="px-6 py-4 bg-neutral-50 dark:bg-neutral-800/40 border-t border-neutral-100 dark:border-neutral-800 flex items-center justify-end gap-2">
          {!isSuccess && onRetryPayment && (
            <Button variant="outline" onClick={handleRetry} className="gap-1.5">
              <RefreshCw className="w-4 h-4" />
              {isIt ? 'Riprova' : 'Try Again'}
            </Button>
          )}
          <Button variant="primary" onClick={handleClose}>
            {isSuccess
              ? isIt
                ? 'Continua'
                : 'Continue'
              : isIt
                ? 'Chiudi'
                : 'Close'}
          </Button>
        </div>
      </div>
    </div>
  );
};
