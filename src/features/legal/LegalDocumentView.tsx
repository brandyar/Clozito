import React, { useState, useEffect } from 'react';
import {
  FileText,
  ShieldCheck,
  Cookie,
  X,
  ArrowLeft,
  Globe,
  Printer,
  Mail,
  CheckCircle2,
} from 'lucide-react';
import { useTranslation } from '../../i18n';
import { BRAND } from '../../config/brand';
import { getLegalDocument, LegalDocType, LegalLocale } from './legalContent';

interface LegalModalProps {
  isOpen: boolean;
  initialDoc: LegalDocType;
  onClose: () => void;
}

const DOC_TABS: Array<{ id: LegalDocType; icon: React.ComponentType<{ className?: string }>; labelEn: string; labelIt: string }> = [
  { id: 'terms', icon: FileText, labelEn: 'Terms of Service', labelIt: 'Termini di Servizio' },
  { id: 'privacy', icon: ShieldCheck, labelEn: 'Privacy Policy (GDPR)', labelIt: 'Privacy (GDPR)' },
  { id: 'cookies', icon: Cookie, labelEn: 'Cookie Policy', labelIt: 'Cookie Policy' },
];

export const LegalModal: React.FC<LegalModalProps> = ({ isOpen, initialDoc, onClose }) => {
  const { locale: activeLocale, setLocale } = useTranslation();
  const [activeDoc, setActiveDoc] = useState<LegalDocType>(initialDoc);
  const locale: LegalLocale = activeLocale === 'it' ? 'it' : 'en';

  useEffect(() => {
    if (isOpen) {
      setActiveDoc(initialDoc);
    }
  }, [isOpen, initialDoc]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const doc = getLegalDocument(activeDoc, locale);

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-6">
      <div
        className="fixed inset-0 bg-neutral-950/70 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-3xl max-h-[88vh] bg-white dark:bg-[#13151a] rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-5 py-4 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between gap-3 bg-neutral-50/70 dark:bg-[#16181f]">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/50 border border-blue-200/70 dark:border-blue-800/60 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-4.5 h-4.5 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-bold text-neutral-900 dark:text-white truncate">
                {doc.title}
              </h2>
              <p className="text-[11px] text-neutral-500 dark:text-neutral-400 truncate">
                {BRAND.name} • {doc.effectiveLabel}: {doc.lastUpdated}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setLocale(locale === 'en' ? 'it' : 'en')}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
              title="Switch language"
            >
              <Globe className="w-3.5 h-3.5" />
              <span>{locale === 'en' ? 'EN' : 'IT'}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-800 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Document Switcher Tabs */}
        <div className="px-5 pt-3 pb-2 border-b border-neutral-200/80 dark:border-neutral-800/80 flex items-center gap-1.5 overflow-x-auto">
          {DOC_TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeDoc === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveDoc(tab.id)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap cursor-pointer ${
                  isActive
                    ? 'bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 shadow-xs'
                    : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{locale === 'it' ? tab.labelIt : tab.labelEn}</span>
              </button>
            );
          })}
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-5 sm:px-7 py-5 space-y-5">
          <p className="text-xs sm:text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed bg-neutral-50 dark:bg-[#1a1d24] p-3.5 rounded-xl border border-neutral-200/70 dark:border-neutral-800">
            {doc.subtitle}
          </p>

          {doc.sections.map((section) => (
            <section key={section.id} className="space-y-2">
              <h3 className="text-sm font-bold text-neutral-900 dark:text-neutral-100">
                {section.heading}
              </h3>
              {section.paragraphs.map((p, idx) => (
                <p
                  key={idx}
                  className="text-xs sm:text-[13px] text-neutral-600 dark:text-neutral-300 leading-relaxed"
                >
                  {p}
                </p>
              ))}
              {section.bullets && section.bullets.length > 0 && (
                <ul className="space-y-1.5 ps-4 list-disc text-xs sm:text-[13px] text-neutral-600 dark:text-neutral-300 leading-relaxed">
                  {section.bullets.map((b, bIdx) => (
                    <li key={bIdx}>{b}</li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-neutral-200 dark:border-neutral-800 bg-neutral-50/70 dark:bg-[#16181f] flex flex-wrap items-center justify-between gap-2">
          <a
            href={`mailto:${BRAND.supportEmail}`}
            className="inline-flex items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
          >
            <Mail className="w-3.5 h-3.5" />
            <span>{BRAND.supportEmail}</span>
          </a>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl text-xs font-bold bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 hover:opacity-90 transition-opacity cursor-pointer"
          >
            {locale === 'it' ? 'Chiudi' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
};

interface LegalDocumentPageProps {
  initialDoc: LegalDocType;
  onExit: () => void;
}

export const LegalDocumentPage: React.FC<LegalDocumentPageProps> = ({ initialDoc, onExit }) => {
  const { locale: activeLocale, setLocale } = useTranslation();
  const [activeDoc, setActiveDoc] = useState<LegalDocType>(initialDoc);
  const locale: LegalLocale = activeLocale === 'it' ? 'it' : 'en';

  useEffect(() => {
    setActiveDoc(initialDoc);
  }, [initialDoc]);

  const handleSelectDoc = (docType: LegalDocType) => {
    setActiveDoc(docType);
    try {
      window.history.replaceState({}, '', `/legal/${docType}`);
    } catch {
      // Ignore history restrictions in sandboxed frames
    }
  };

  const doc = getLegalDocument(activeDoc, locale);

  return (
    <div className="min-h-screen bg-[#f6f7f9] dark:bg-[#0d0f14] text-neutral-900 dark:text-neutral-100">
      {/* Top Bar */}
      <header className="sticky top-0 z-20 bg-white/90 dark:bg-[#13151a]/90 backdrop-blur-md border-b border-neutral-200/80 dark:border-neutral-800">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={onExit}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-neutral-600 dark:text-neutral-300 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>{locale === 'it' ? `Torna a ${BRAND.name}` : `Back to ${BRAND.name}`}</span>
            </button>
            <span className="hidden sm:inline text-xs font-bold text-neutral-400">•</span>
            <span className="hidden sm:inline text-xs font-semibold text-neutral-600 dark:text-neutral-400 truncate">
              {locale === 'it' ? 'Centro Legale e Privacy UE' : 'EU Legal & Privacy Center'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setLocale(locale === 'en' ? 'it' : 'en')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
            >
              <Globe className="w-3.5 h-3.5" />
              <span>{locale === 'en' ? 'English (EN)' : 'Italiano (IT)'}</span>
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>{locale === 'it' ? 'Stampa' : 'Print'}</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {/* Document Switcher */}
        <div className="flex flex-wrap items-center gap-2">
          {DOC_TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeDoc === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleSelectDoc(tab.id)}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  isActive
                    ? 'bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 shadow-sm'
                    : 'bg-white dark:bg-[#13151a] text-neutral-600 dark:text-neutral-400 border border-neutral-200/80 dark:border-neutral-800 hover:border-neutral-300 dark:hover:border-neutral-700'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{locale === 'it' ? tab.labelIt : tab.labelEn}</span>
              </button>
            );
          })}
        </div>

        {/* Document Card */}
        <article className="bg-white dark:bg-[#13151a] rounded-2xl border border-neutral-200/80 dark:border-neutral-800 shadow-xs p-6 sm:p-10 space-y-6">
          <div className="border-b border-neutral-200/80 dark:border-neutral-800 pb-5 space-y-2">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 text-[11px] font-semibold">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>EU / GDPR Regulation (EU) 2016/679</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-neutral-900 dark:text-white">
              {doc.title}
            </h1>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">{doc.subtitle}</p>
            <p className="text-xs text-neutral-400 dark:text-neutral-500">
              {doc.effectiveLabel}: {doc.lastUpdated}
            </p>
          </div>

          <div className="space-y-6">
            {doc.sections.map((section) => (
              <section key={section.id} className="space-y-2.5">
                <h2 className="text-base font-bold text-neutral-900 dark:text-neutral-100">
                  {section.heading}
                </h2>
                {section.paragraphs.map((p, idx) => (
                  <p
                    key={idx}
                    className="text-sm text-neutral-600 dark:text-neutral-300 leading-relaxed"
                  >
                    {p}
                  </p>
                ))}
                {section.bullets && section.bullets.length > 0 && (
                  <ul className="space-y-1.5 ps-5 list-disc text-sm text-neutral-600 dark:text-neutral-300 leading-relaxed">
                    {section.bullets.map((b, bIdx) => (
                      <li key={bIdx}>{b}</li>
                    ))}
                  </ul>
                )}
              </section>
            ))}
          </div>

          <div className="pt-6 border-t border-neutral-200/80 dark:border-neutral-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-neutral-500 dark:text-neutral-400">
            <span>
              © {new Date().getFullYear()} {BRAND.name} •{' '}
              {locale === 'it' ? 'Tutti i diritti riservati' : 'All Rights Reserved'}
            </span>
            <a
              href={`mailto:${BRAND.supportEmail}`}
              className="inline-flex items-center gap-1.5 font-medium text-blue-600 dark:text-blue-400 hover:underline"
            >
              <Mail className="w-3.5 h-3.5" />
              <span>{BRAND.supportEmail}</span>
            </a>
          </div>
        </article>
      </main>
    </div>
  );
};
