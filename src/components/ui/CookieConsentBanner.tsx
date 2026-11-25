import React, { useState, useEffect } from 'react';
import { Cookie, ShieldCheck } from 'lucide-react';
import { useTranslation } from '../../i18n';
import { LegalModal } from '../../features/legal/LegalDocumentView';

export interface CookieConsentState {
  essential: true;
  preferences: boolean;
  updatedAt: string;
}

export const COOKIE_CONSENT_STORAGE_KEY = 'clozito_cookie_consent';

export function getCookieConsent(): CookieConsentState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(COOKIE_CONSENT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.preferences === 'boolean' && typeof parsed?.updatedAt === 'string') {
      return {
        essential: true,
        preferences: parsed.preferences,
        updatedAt: parsed.updatedAt,
      };
    }
    return null;
  } catch {
    return null;
  }
}

export function saveCookieConsent(preferences: boolean): CookieConsentState {
  const next: CookieConsentState = {
    essential: true,
    preferences,
    updatedAt: new Date().toISOString(),
  };
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(COOKIE_CONSENT_STORAGE_KEY, JSON.stringify(next));
      window.dispatchEvent(new CustomEvent('clozito:cookie-consent-updated', { detail: next }));
    } catch {
      // Ignore storage quota issues
    }
  }
  return next;
}

export const CookieConsentBanner: React.FC = () => {
  const { t } = useTranslation();
  const [visible, setVisible] = useState<boolean>(false);
  const [isPolicyOpen, setIsPolicyOpen] = useState<boolean>(false);

  useEffect(() => {
    const existing = getCookieConsent();
    if (!existing) {
      setVisible(true);
    }
    const handleUpdate = () => {
      setVisible(false);
    };
    window.addEventListener('clozito:cookie-consent-updated', handleUpdate);
    return () => window.removeEventListener('clozito:cookie-consent-updated', handleUpdate);
  }, []);

  if (!visible) return null;

  const handleChoice = (allowOptional: boolean) => {
    saveCookieConsent(allowOptional);
    setVisible(false);
  };

  return (
    <>
      <div
        role="region"
        aria-label={t('settings.cookieBannerTitle', 'Cookie & Privacy Notice')}
        className="fixed bottom-4 start-4 end-4 sm:start-auto sm:end-5 sm:max-w-md z-[90] animate-in fade-in slide-in-from-bottom-4 duration-200"
      >
        <div className="bg-white dark:bg-[#151820] border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-xl p-4 space-y-3">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200/70 dark:border-blue-800/60 flex items-center justify-center shrink-0 mt-0.5">
              <Cookie className="w-4.5 h-4.5 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="space-y-1 min-w-0">
              <h3 className="text-xs font-bold text-neutral-900 dark:text-white flex items-center gap-1.5">
                <span>{t('settings.cookieBannerTitle', 'Privacy & Cookie Preferences')}</span>
              </h3>
              <p className="text-[11px] text-neutral-600 dark:text-neutral-400 leading-relaxed">
                {t(
                  'settings.cookieBannerDesc',
                  'We use strictly necessary browser storage for authentication and workspace settings, plus optional UI preferences. No third-party advertising trackers.'
                )}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <button
              type="button"
              onClick={() => setIsPolicyOpen(true)}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>{t('settings.cookiePolicyLink', 'Cookie Policy')}</span>
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleChoice(false)}
                className="px-3 py-1.5 rounded-xl text-[11px] font-semibold border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
              >
                {t('settings.cookieEssentialOnly', 'Essential Only')}
              </button>
              <button
                type="button"
                onClick={() => handleChoice(true)}
                className="px-3 py-1.5 rounded-xl text-[11px] font-bold bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 hover:opacity-90 transition-opacity cursor-pointer"
              >
                {t('settings.cookieAcceptAll', 'Accept All')}
              </button>
            </div>
          </div>
        </div>
      </div>

      <LegalModal
        isOpen={isPolicyOpen}
        initialDoc="cookies"
        onClose={() => setIsPolicyOpen(false)}
      />
    </>
  );
};
