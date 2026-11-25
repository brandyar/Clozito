import React, { useState } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { useOrganization } from '../../context/OrganizationContext';
import { useTranslation } from '../../i18n';
import { directusClient } from '../../api/directus';
import { isTauriEnvironment } from '../../storage';
import { openExternalUrl } from '../../utils/desktop';
import { AlertTriangle, CreditCard } from 'lucide-react';

interface AppShellProps {
  currentRoute: string;
  onNavigate: (route: string) => void;
  children: React.ReactNode;
}

export const AppShell: React.FC<AppShellProps> = ({ currentRoute, onNavigate, children }) => {
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [openingPortal, setOpeningPortal] = useState(false);
  const { activeOrganization, isOwner, userRole } = useOrganization();
  const { t, locale } = useTranslation();

  const isPastDue =
    String(activeOrganization?.stripe_subscription_status || '').toLowerCase() === 'past_due';
  const canManageBilling = isOwner || userRole === 'manager';

  const handleToggleSidebar = () => {
    if (window.innerWidth < 1024) {
      setIsMobileOpen((prev) => !prev);
    } else {
      setIsCollapsed((prev) => !prev);
    }
  };

  const handleQuickUpdatePayment = async () => {
    if (!activeOrganization?.id) return;
    if (!canManageBilling) {
      onNavigate('settings/org');
      return;
    }
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
        onNavigate('settings/org');
      }
    } catch {
      onNavigate('settings/org');
    } finally {
      setOpeningPortal(false);
    }
  };

  return (
    <div className="flex h-screen w-full bg-[#fafafa] dark:bg-[#0c0d10] text-[#171717] dark:text-[#f3f4f6] font-sans antialiased selection:bg-[#171717] dark:selection:bg-neutral-100 selection:text-white dark:selection:text-neutral-900 overflow-hidden">
      {/* Sidebar */}
      <Sidebar
        currentRoute={currentRoute}
        onNavigate={onNavigate}
        isMobileOpen={isMobileOpen}
        onMobileClose={() => setIsMobileOpen(false)}
        isCollapsed={isCollapsed}
        onToggleCollapse={() => setIsCollapsed((prev) => !prev)}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-full min-w-0 overflow-hidden transition-all duration-300">
        <Header onToggleSidebar={handleToggleSidebar} onNavigate={onNavigate} />

        {/* Global Past-Due Subscription Warning Banner */}
        {isPastDue && (
          <div className="bg-rose-600 text-white px-4 py-2 text-xs flex flex-wrap items-center justify-between gap-2 shadow-xs shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span className="font-medium truncate">
                {t('settings.billingPastDueTitle')} — {t('settings.billingPastDueDesc')}
              </span>
            </div>
            {canManageBilling && (
              <button
                type="button"
                onClick={handleQuickUpdatePayment}
                disabled={openingPortal}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-white text-rose-700 hover:bg-rose-50 font-bold text-[11px] transition-colors cursor-pointer shrink-0 disabled:opacity-60"
              >
                <CreditCard className="w-3.5 h-3.5" />
                <span>
                  {openingPortal ? t('settings.openingPortal') : t('settings.updatePaymentMethodBtn')}
                </span>
              </button>
            )}
          </div>
        )}

        <main className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-4 sm:px-6 sm:py-6 lg:px-8 w-full animate-fade-in">
          <div className="max-w-7xl w-full mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
};
