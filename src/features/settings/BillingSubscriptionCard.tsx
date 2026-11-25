import React, { useState, useEffect } from 'react';
import { useTranslation } from '../../i18n';
import { useOrganization } from '../../context/OrganizationContext';
import { useAuth } from '../../context/AuthContext';
import { directusClient } from '../../api/directus';
import { isTauriEnvironment } from '../../storage';
import { openExternalUrl } from '../../utils/desktop';
import { formatDate } from '../../utils/formatters';
import {
  isPaidCloudPlan,
  normalizePlanTier,
  getPlanDisplayName,
  SubscriptionTier,
} from '../../config/plans';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import {
  CreditCard,
  ExternalLink,
  Sparkles,
  AlertTriangle,
  Calendar,
  Receipt,
  ShieldCheck,
  RefreshCw,
} from 'lucide-react';

interface BillingSubscriptionCardProps {
  onOpenUpgrade: (tier?: SubscriptionTier) => void;
}

export const BillingSubscriptionCard: React.FC<BillingSubscriptionCardProps> = ({ onOpenUpgrade }) => {
  const { t, locale } = useTranslation();
  const { activeOrganization, isOwner, userRole } = useOrganization();
  const { isCloudAuthenticated, openLoginModal } = useAuth();

  const [loading, setLoading] = useState(false);
  const [openingPortal, setOpeningPortal] = useState(false);
  const [portalError, setPortalError] = useState<string | null>(null);
  const [billingData, setBillingData] = useState<{
    subscriptions: any[];
    activeSubscription: any;
    isPro: boolean;
    remainingDays: number;
    stripeSubscriptionStatus?: string | null;
    hasBillingPortal?: boolean;
    hasActiveStripeSubscription?: boolean;
  } | null>(null);

  const canManageBilling = isOwner || userRole === 'manager';

  const loadBillingInfo = async () => {
    if (!activeOrganization?.id || !isCloudAuthenticated) return;
    setLoading(true);
    try {
      const res = await directusClient.getSubscriptions(activeOrganization.id);
      setBillingData(res);
    } catch {
      // keep fallback org state
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBillingInfo();
  }, [activeOrganization?.id, activeOrganization?.plan, activeOrganization?.stripe_subscription_status, isCloudAuthenticated]);

  const handleOpenCustomerPortal = async () => {
    if (!activeOrganization?.id) return;
    if (!isCloudAuthenticated) {
      openLoginModal();
      return;
    }
    setPortalError(null);
    setOpeningPortal(true);
    try {
      const res = await directusClient.createBillingPortalSession(activeOrganization.id, locale);
      if (res?.success && res.portalUrl) {
        if (isTauriEnvironment()) {
          await openExternalUrl(res.portalUrl);
        } else {
          window.location.href = res.portalUrl;
        }
      } else {
        setPortalError(res?.error || t('settings.billingPortalError'));
      }
    } catch (err: any) {
      setPortalError(err?.message || t('settings.billingPortalError'));
    } finally {
      setOpeningPortal(false);
    }
  };

  const stripeStatus = String(
    billingData?.stripeSubscriptionStatus || activeOrganization?.stripe_subscription_status || ''
  ).toLowerCase();
  const effectivePlan = activeOrganization?.plan || (billingData as any)?.plan || 'free';
  const normalizedTier = normalizePlanTier(effectivePlan);
  const isPro = isPaidCloudPlan(effectivePlan) || Boolean(billingData?.isPro);
  const isBoutiqueOnly = normalizedTier === 'boutique';
  const isPastDue = stripeStatus === 'past_due';
  const isCanceled = stripeStatus === 'canceled';
  const isTrialActive = Boolean(
    isPro &&
      activeOrganization?.trial_ends_at &&
      new Date(activeOrganization.trial_ends_at).getTime() > Date.now() &&
      !billingData?.hasActiveStripeSubscription
  );
  const hasBillingPortal = Boolean(billingData?.hasBillingPortal || activeOrganization?.stripe_customer_id);

  const renderStatusBadge = () => {
    if (isPastDue) {
      return <Badge variant="danger">{t('settings.billingStatusPastDue')}</Badge>;
    }
    if (isTrialActive || stripeStatus === 'trialing') {
      return <Badge variant="warning">{t('settings.billingStatusTrialing')}</Badge>;
    }
    if (isPro) {
      return <Badge variant="success">{t('settings.billingStatusActive')}</Badge>;
    }
    if (isCanceled) {
      return <Badge variant="neutral">{t('settings.billingStatusCanceled')}</Badge>;
    }
    return <Badge variant="neutral">{t('settings.billingStatusFree')}</Badge>;
  };

  const renewalDate =
    billingData?.activeSubscription?.end_date ||
    (isTrialActive ? activeOrganization?.trial_ends_at : null);

  return (
    <Card
      title={t('settings.billingTitle')}
      subtitle={t('settings.billingSubtitle')}
      action={
        <div className="flex items-center gap-2">
          {renderStatusBadge()}
          {isCloudAuthenticated && (
            <button
              type="button"
              onClick={loadBillingInfo}
              disabled={loading}
              className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
              title={t('common.refresh', 'Refresh')}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          )}
        </div>
      }
    >
      <div className="space-y-4">
        {/* Past Due Alert Banner */}
        {isPastDue && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/70">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-xs font-bold text-rose-900 dark:text-rose-200">
                  {t('settings.billingPastDueTitle')}
                </h4>
                <p className="text-xs text-rose-700 dark:text-rose-300/90 mt-0.5 leading-relaxed">
                  {t('settings.billingPastDueDesc')}
                </p>
              </div>
            </div>
            {canManageBilling && hasBillingPortal && (
              <Button
                variant="primary"
                size="sm"
                onClick={handleOpenCustomerPortal}
                isLoading={openingPortal}
                icon={<CreditCard className="w-3.5 h-3.5" />}
                className="shrink-0 bg-rose-600 hover:bg-rose-700 text-xs font-bold"
              >
                {t('settings.updatePaymentMethodBtn')}
              </Button>
            )}
          </div>
        )}

        {/* Current Plan & Portal Controls */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 rounded-xl bg-neutral-50/90 dark:bg-[#181a20] border border-neutral-200/80 dark:border-neutral-800">
          <div className="flex items-start gap-3.5">
            <div
              className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
                isPro
                  ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400'
                  : 'bg-neutral-200/70 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300'
              }`}
            >
              <CreditCard className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="text-sm font-bold text-neutral-900 dark:text-neutral-100">
                  {getPlanDisplayName(effectivePlan, locale)}
                </h4>
                {billingData?.remainingDays ? (
                  <span className="text-[11px] font-mono text-neutral-500 dark:text-neutral-400">
                    • {billingData.remainingDays} {t('settings.daysRemaining')}
                  </span>
                ) : null}
              </div>
              {renewalDate && (
                <p className="text-xs text-neutral-500 dark:text-neutral-400 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5" />
                  <span>
                    {t('settings.subscriptionExpiry')}:{' '}
                    <strong className="text-neutral-800 dark:text-neutral-200">
                      {formatDate(renewalDate, false, locale)}
                    </strong>
                  </span>
                </p>
              )}
              <p className="text-[11px] text-neutral-500 dark:text-neutral-400 flex items-center gap-1.5 pt-0.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span>{t('settings.billingEuMethodsNote')}</span>
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {canManageBilling ? (
              <>
                {hasBillingPortal && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleOpenCustomerPortal}
                    isLoading={openingPortal}
                    icon={<ExternalLink className="w-3.5 h-3.5" />}
                    className="text-xs font-bold"
                  >
                    {openingPortal ? t('settings.openingPortal') : t('settings.manageBillingBtn')}
                  </Button>
                )}
                <Button
                  variant={isPro && hasBillingPortal && !isBoutiqueOnly ? 'outline' : 'primary'}
                  size="sm"
                  onClick={() => onOpenUpgrade(isBoutiqueOnly ? 'atelier' : undefined)}
                  icon={<Sparkles className="w-3.5 h-3.5" />}
                  className="text-xs font-bold"
                >
                  {isBoutiqueOnly
                    ? locale === 'it'
                      ? 'Passa ad Atelier (€49/mese)'
                      : 'Upgrade to Atelier (€49/mo)'
                    : isPro
                    ? t('settings.renewSubscription')
                    : t('settings.upgradeToPro')}
                </Button>
              </>
            ) : (
              <span className="text-[11px] text-neutral-500 dark:text-neutral-400">
                {t('settings.billingPortalOwnerOnly')}
              </span>
            )}
          </div>
        </div>

        {/* Portal Error */}
        {portalError && (
          <div className="flex items-start gap-2.5 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/60 text-rose-700 dark:text-rose-300 text-xs">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{portalError}</span>
          </div>
        )}

        {/* Recent Subscription History */}
        {billingData && billingData.subscriptions.length > 0 && (
          <div className="space-y-2 pt-1">
            <h5 className="text-xs font-bold text-neutral-700 dark:text-neutral-300 flex items-center gap-1.5">
              <Receipt className="w-3.5 h-3.5 text-neutral-400" />
              <span>{t('settings.billingHistoryTitle')}</span>
            </h5>
            <div className="overflow-x-auto rounded-xl border border-neutral-200/80 dark:border-neutral-800">
              <table className="w-full text-xs text-left">
                <thead className="bg-neutral-50 dark:bg-neutral-900/70 text-neutral-500 dark:text-neutral-400 border-b border-neutral-200/80 dark:border-neutral-800">
                  <tr>
                    <th className="px-3 py-2 font-semibold">{t('settings.billingPeriodCol')}</th>
                    <th className="px-3 py-2 font-semibold">{t('settings.billingAmountCol')}</th>
                    <th className="px-3 py-2 font-semibold">{t('settings.billingRefCol')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800/70 bg-white dark:bg-[#13151a]">
                  {billingData.subscriptions.slice(0, 6).map((sub: any) => (
                    <tr key={sub.id} className="hover:bg-neutral-50/70 dark:hover:bg-neutral-800/30">
                      <td className="px-3 py-2 font-mono text-[11px] text-neutral-700 dark:text-neutral-300 whitespace-nowrap">
                        {formatDate(sub.start_date, false, locale)} → {formatDate(sub.end_date, false, locale)}
                      </td>
                      <td className="px-3 py-2 font-semibold text-neutral-900 dark:text-neutral-100 whitespace-nowrap">
                        {sub.transaction_amount || sub.amount || '-'}
                      </td>
                      <td className="px-3 py-2 font-mono text-[11px] text-neutral-500 dark:text-neutral-400 truncate max-w-[180px]">
                        {sub.Transaction_id || sub.transaction_id || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
};
