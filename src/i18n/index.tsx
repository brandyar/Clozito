import React, { createContext, useContext, useState, useEffect } from 'react';

import { commonEn } from './locales/en/common';
import { navigationEn } from './locales/en/navigation';
import { dashboardEn } from './locales/en/dashboard';
import { productsEn } from './locales/en/products';
import { ordersEn } from './locales/en/orders';
import { inventoryEn } from './locales/en/inventory';
import { purchasingEn } from './locales/en/purchasing';
import { customersEn } from './locales/en/customers';
import { sizeguidesEn } from './locales/en/sizeguides';
import { settingsEn } from './locales/en/settings';
import { authEn } from './locales/en/auth';
import { reportsEn } from './locales/en/reports';
import { modulesEn } from './locales/en/modules';
import { accountingEn } from './locales/en/accounting';
import { woocommerceEn } from './locales/en/woocommerce';
import { onboardingEn } from './locales/en/onboarding';
import { productionEn } from './locales/en/production';

import { commonIt } from './locales/it/common';
import { navigationIt } from './locales/it/navigation';
import { dashboardIt } from './locales/it/dashboard';
import { productsIt } from './locales/it/products';
import { ordersIt } from './locales/it/orders';
import { inventoryIt } from './locales/it/inventory';
import { purchasingIt } from './locales/it/purchasing';
import { customersIt } from './locales/it/customers';
import { sizeguidesIt } from './locales/it/sizeguides';
import { settingsIt } from './locales/it/settings';
import { authIt } from './locales/it/auth';
import { reportsIt } from './locales/it/reports';
import { modulesIt } from './locales/it/modules';
import { accountingIt } from './locales/it/accounting';
import { woocommerceIt } from './locales/it/woocommerce';
import { onboardingIt } from './locales/it/onboarding';
import { productionIt } from './locales/it/production';

export type Locale = 'en' | 'it';
export type Direction = 'ltr';

const translations: Record<Locale, Record<string, any>> = {
  en: {
    common: commonEn,
    navigation: navigationEn,
    dashboard: dashboardEn,
    products: productsEn,
    product: productsEn,
    orders: ordersEn,
    order: ordersEn,
    inventory: inventoryEn,
    purchasing: purchasingEn,
    customers: customersEn,
    customer: customersEn,
    sizeguides: sizeguidesEn,
    settings: settingsEn,
    auth: authEn,
    reports: reportsEn,
    modules: modulesEn,
    accounting: accountingEn,
    woocommerce: woocommerceEn,
    onboarding: onboardingEn,
    production: productionEn,
  },
  it: {
    common: commonIt,
    navigation: navigationIt,
    dashboard: dashboardIt,
    products: productsIt,
    product: productsIt,
    orders: ordersIt,
    order: ordersIt,
    inventory: inventoryIt,
    purchasing: purchasingIt,
    customers: customersIt,
    customer: customersIt,
    sizeguides: sizeguidesIt,
    settings: settingsIt,
    auth: authIt,
    reports: reportsIt,
    modules: modulesIt,
    accounting: accountingIt,
    woocommerce: woocommerceIt,
    onboarding: onboardingIt,
    production: productionIt,
  },
};

interface I18nContextType {
  locale: Locale;
  direction: Direction;
  isRtl: boolean;
  isPersian: boolean;
  isItalian: boolean;
  setLocale: (loc: Locale) => void;
  t: (path: string, paramsOrFallback?: Record<string, any> | string, fallback?: string) => string;
}

const I18nContext = createContext<I18nContextType | undefined>(undefined);

const STORAGE_LOCALE_KEY = 'clozito_locale';
const LEGACY_LOCALE_KEY = 'tankhor_locale';

function resolveInitialLocale(): Locale {
  if (typeof window === 'undefined') return 'en';
  const stored = localStorage.getItem(STORAGE_LOCALE_KEY) || localStorage.getItem(LEGACY_LOCALE_KEY);
  if (stored === 'it' || stored === 'en') {
    return stored;
  }
  return 'en';
}

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [locale, setLocaleState] = useState<Locale>(resolveInitialLocale);

  const direction: Direction = 'ltr';
  const isRtl = false;
  const isPersian = false;
  const isItalian = locale === 'it';

  useEffect(() => {
    localStorage.setItem(STORAGE_LOCALE_KEY, locale);
    localStorage.setItem(LEGACY_LOCALE_KEY, locale);
    document.documentElement.lang = locale;
    document.documentElement.dir = 'ltr';
    document.body.classList.add('font-sans-en');
    document.body.classList.remove('font-vazir');
  }, [locale]);

  const setLocale = (newLocale: Locale) => {
    if (newLocale === 'en' || newLocale === 'it') {
      setLocaleState(newLocale);
    }
  };

  const t = (
    path: string,
    paramsOrFallback?: Record<string, any> | string,
    explicitFallback?: string
  ): string => {
    const parts = path.split('.');
    let current: any = translations[locale] || translations.en;
    let resolvedString: string | null = null;
    const fallbackStr = typeof paramsOrFallback === 'string' ? paramsOrFallback : explicitFallback;
    const params = typeof paramsOrFallback === 'object' && paramsOrFallback !== null ? paramsOrFallback : undefined;

    for (const part of parts) {
      if (current && typeof current === 'object' && part in current) {
        current = current[part];
      } else {
        // Fallback to English ('en')
        let fallbackCurrent: any = translations['en'];
        for (const fPart of parts) {
          if (fallbackCurrent && typeof fallbackCurrent === 'object' && fPart in fallbackCurrent) {
            fallbackCurrent = fallbackCurrent[fPart];
          } else {
            fallbackCurrent = null;
            break;
          }
        }
        if (typeof fallbackCurrent === 'string') {
          resolvedString = fallbackCurrent;
        } else {
          resolvedString = fallbackStr || path;
        }
        break;
      }
    }

    if (resolvedString === null) {
      resolvedString = typeof current === 'string' ? current : fallbackStr || path;
    }

    if (params && typeof resolvedString === 'string') {
      for (const [key, val] of Object.entries(params)) {
        resolvedString = resolvedString.replace(new RegExp(`{${key}}`, 'g'), String(val));
      }
    }

    return resolvedString;
  };

  return (
    <I18nContext.Provider value={{ locale, direction, isRtl, isPersian, isItalian, setLocale, t }}>
      {children}
    </I18nContext.Provider>
  );
};

export const useTranslation = () => {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useTranslation must be used within an I18nProvider');
  }
  return context;
};
