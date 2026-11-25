import React, { useState } from 'react';
import {
  Lock,
  KeyRound,
  CreditCard,
  Check,
  Copy,
  CheckCircle2,
  Printer,
  ScanLine,
  ShieldCheck,
  Globe,
  Sparkles,
  ShoppingBag,
  BarChart3,
  Users,
  FileSpreadsheet,
  Zap,
  Scissors,
  Boxes,
  Cloud,
} from 'lucide-react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { PageHeader } from '../ui/PageHeader';
import { useModuleAccess } from '../../hooks/useModuleAccess';
import { useTranslation } from '../../i18n';
import { formatModulePrice } from '../../utils/license';
import { PurchaseModuleModal } from '../modals/PurchaseModuleModal';
import { UpgradeToProModal } from '../modals/UpgradeToProModal';
import {
  getRequiredTierForModule,
  isModuleOfflinePurchasable,
} from '../../config/plans';

interface ModuleLockedCardProps {
  moduleSlug: string;
  moduleName: string;
  description?: string;
  onUnlocked?: () => void;
  id?: string;
}

export const ModuleLockedCard: React.FC<ModuleLockedCardProps> = ({
  moduleSlug,
  moduleName,
  description,
  onUnlocked,
  id,
}) => {
  const { t, locale } = useTranslation();
  const { systemModules, orgModules, hardwareId, activateLicense, refreshModules } = useModuleAccess();
  const isItalian = locale === 'it';

  const [licenseKey, setLicenseKey] = useState('');
  const [isActivating, setIsActivating] = useState(false);
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);
  const [copiedHwId, setCopiedHwId] = useState(false);
  const [isPurchaseModalOpen, setIsPurchaseModalOpen] = useState(false);
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);

  const matchedModule = systemModules.find((m) => m.slug === moduleSlug);
  const matchedOrgModule = orgModules.find((m) => m.slug === moduleSlug);

  const requiredTier = getRequiredTierForModule(moduleSlug);
  const canBuyOffline = isModuleOfflinePurchasable(moduleSlug);
  const formattedPrice = canBuyOffline ? formatModulePrice(matchedModule || matchedOrgModule || { slug: moduleSlug }, locale) : '';

  const tierName =
    requiredTier === 'boutique'
      ? 'Boutique Cloud'
      : isItalian
        ? 'Atelier & Produzione Cloud'
        : 'Atelier & Production Cloud';
  const tierPriceLabel = requiredTier === 'boutique' ? '€29' : '€49';

  const handleCopyHardwareId = () => {
    navigator.clipboard.writeText(hardwareId);
    setCopiedHwId(true);
    setTimeout(() => setCopiedHwId(false), 2500);
  };

  const handleActivate = async () => {
    if (!licenseKey.trim()) {
      setMessage({ text: t('modules.enterLicenseKeyAlert', 'Please enter your license key.'), isError: true });
      return;
    }

    setIsActivating(true);
    setMessage(null);

    try {
      const res = await activateLicense(licenseKey);
      if (res.success) {
        setMessage({ text: res.message, isError: false });
        await refreshModules();
        if (onUnlocked) {
          setTimeout(() => onUnlocked(), 1200);
        }
      } else {
        setMessage({ text: res.message, isError: true });
      }
    } catch (err: any) {
      setMessage({ text: err?.message || t('modules.licenseVerifyError', 'Failed to verify license key.'), isError: true });
    } finally {
      setIsActivating(false);
    }
  };

  const getFeatureHighlights = () => {
    switch (moduleSlug) {
      case 'barcode':
        return [
          {
            icon: Printer,
            title: isItalian ? 'Stampa Termica ed Etichette' : 'Thermal & Label Printing',
            description: isItalian
              ? 'Stampa rapida su stampanti termiche e per etichette standard.'
              : 'Fast printing on thermal and standard barcode label printers.',
          },
          {
            icon: ScanLine,
            title: isItalian ? 'Scansione Rapida Codici' : 'Fast Barcode Scanning',
            description: isItalian
              ? 'Scansione diretta dei codici a barre in cassa, ordini e movimenti di magazzino.'
              : 'Direct barcode scanning in POS, orders, and stock movements.',
          },
          {
            icon: ShieldCheck,
            title: isItalian ? 'Incluso in Boutique Cloud' : 'Included in Boutique Cloud',
            description: isItalian
              ? 'Sbloccato con Boutique Cloud o acquistabile una tantum per Desktop offline.'
              : 'Included with Boutique Cloud or available one-time for Desktop offline use.',
          },
        ];
      case 'online_catalog':
        return [
          {
            icon: Globe,
            title: isItalian ? 'Vetrina Digitale del Brand' : 'Digital Brand Showcase',
            description: isItalian
              ? 'Pagina web dedicata ai tuoi prodotti con link diretto e codice QR.'
              : 'Dedicated web showcase for products with direct links and QR codes.',
          },
          {
            icon: Sparkles,
            title: isItalian ? 'Trova Taglia Intelligente' : 'Smart Size Finder',
            description: isItalian
              ? 'Suggerimenti automatici della taglia basati sulle misure del capo.'
              : 'Automated size recommendations based on garment measurements.',
          },
          {
            icon: ShoppingBag,
            title: isItalian ? 'Raccolta Ordini Rapida' : 'Seamless Order Intake',
            description: isItalian
              ? 'Invio diretto del carrello su WhatsApp e sistema vendite del negozio.'
              : 'Direct shopping cart dispatch to WhatsApp and store sales.',
          },
        ];
      case 'accounting':
        return [
          {
            icon: BarChart3,
            title: isItalian ? 'Conto Economico e Tesoreria' : 'P&L & Financial Control',
            description: isItalian
              ? 'Monitoraggio automatico di ricavi, COGS, spese e conti finanziari.'
              : 'Automated tracking of revenues, COGS, expenses, and treasury.',
          },
          {
            icon: Users,
            title: isItalian ? 'Partitari Clienti e Fornitori' : 'Customer & Supplier Ledgers',
            description: isItalian
              ? 'Estratti conto dare/avere per clienti e fornitori e riconciliazione pagamenti.'
              : 'Customer and supplier debtor-creditor statements and payment reconciliation.',
          },
          {
            icon: FileSpreadsheet,
            title: isItalian ? 'Report IVA ed Esportazioni' : 'VAT Reports & Journal Exports',
            description: isItalian
              ? 'Riepiloghi IVA europei ed esportazioni CSV/contabili pronte per il commercialista.'
              : 'European VAT summaries and standard double-entry CSV exports for accountants.',
          },
        ];
      case 'woocommerce':
        return [
          {
            icon: Zap,
            title: isItalian ? 'Sincronizzazione Giacenze e Prezzi' : 'Real-time Stock & Price Sync',
            description: isItalian
              ? 'Aggiornamento in tempo reale di stock e prezzi sul tuo store WooCommerce.'
              : 'Real-time synchronization of stock and prices in WooCommerce.',
          },
          {
            icon: ShoppingBag,
            title: isItalian ? 'Importazione Automatica Ordini' : 'Automated Order Import',
            description: isItalian
              ? 'Creazione istantanea degli ordini e scarico automatico del magazzino.'
              : 'Instant order generation and automatic stock deduction upon sale.',
          },
          {
            icon: Globe,
            title: isItalian ? 'Connessione Diretta REST API' : 'Direct REST API Connection',
            description: isItalian
              ? 'Integrazione sicura bidirezionale inclusa nel piano Boutique Cloud.'
              : 'Secure two-way integration included with Boutique Cloud.',
          },
        ];
      case 'production':
      case 'produce':
        return [
          {
            icon: Boxes,
            title: isItalian ? 'Materie Prime e Distinta Base (BOM)' : 'Raw Materials & BOM Catalog',
            description: isItalian
              ? 'Gestione magazzino tessuti/accessori e distinte base con calcolo degli sfridi.'
              : 'Raw materials inventory management and Bill of Materials with waste factors.',
          },
          {
            icon: Scissors,
            title: isItalian ? 'Ordini di Produzione e Taglio' : 'Production & Cut Work Orders',
            description: isItalian
              ? 'Creazione ordini di lavoro, schede taglio, controllo carenze e avanzamento.'
              : 'Work order generation, cut slips, shortage detection, and routing.',
          },
          {
            icon: Users,
            title: isItalian ? 'Contabilità Terzisti e Costo Unitario' : 'Contractor Ledgers & COGS',
            description: isItalian
              ? 'Registrazione compensi laboratori, carico capi finiti e calcolo del costo reale.'
              : 'Automated contractor fees logging, inventory receipts, and true unit costing.',
          },
        ];
      default:
        return [
          {
            icon: Cloud,
            title: isItalian ? 'Incluso nei Piani Cloud' : 'Included in Cloud Plans',
            description: isItalian
              ? 'Sblocco istantaneo con sincronizzazione multi-utente.'
              : 'Instant activation with multi-user cloud synchronization.',
          },
          {
            icon: Globe,
            title: isItalian ? 'Ibrido Web e Desktop' : 'Web & Desktop Hybrid',
            description: isItalian
              ? 'Funzionamento sincronizzato su browser web e applicazione desktop nativa.'
              : 'Seamless operation in both web browser and native desktop.',
          },
          {
            icon: Zap,
            title: isItalian ? 'Attivazione Istantanea' : 'Instant Activation',
            description: isItalian
              ? 'Accesso immediato dopo il checkout sicuro con Stripe.'
              : 'Immediate access after secure Stripe Checkout.',
          },
        ];
    }
  };

  const featureHighlights = getFeatureHighlights();
  const effectiveTitle = moduleName || matchedModule?.name || moduleSlug;
  const effectiveSubtitle =
    description || t('modules.moduleLockedDesc', 'This section is unlocked with a Clozito Cloud plan.');

  return (
    <div id={id} className="space-y-6 max-w-4xl mx-auto">
      <PageHeader title={effectiveTitle} subtitle={effectiveSubtitle} />

      <Card className="border-amber-200/70 dark:border-amber-900/40 bg-gradient-to-b from-amber-50/20 to-white dark:from-amber-950/10 dark:to-[#13151a]">
        <div className="p-4 sm:p-6 md:p-8 space-y-6 text-neutral-900 dark:text-neutral-100">
          {/* Header Row: Lock Icon, Name, Required Tier Badge & Subscription CTA */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start sm:items-center gap-3.5 min-w-0">
              <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center border border-amber-500/20 shrink-0">
                <Lock className="w-5 h-5 sm:w-6 sm:h-6" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg sm:text-xl font-bold truncate">{effectiveTitle}</h2>
                  <Badge variant={requiredTier === 'atelier' ? 'warning' : 'info'}>
                    {requiredTier === 'boutique'
                      ? isItalian ? 'Incluso in Boutique (€29/mese)' : 'Included in Boutique (€29/mo)'
                      : isItalian ? 'Incluso in Atelier (€49/mese)' : 'Included in Atelier (€49/mo)'}
                  </Badge>
                </div>
                <p className="text-xs sm:text-sm text-neutral-500 dark:text-neutral-400 mt-1 line-clamp-2">
                  {effectiveSubtitle}
                </p>
              </div>
            </div>

            {/* Primary Subscription CTA + Optional Offline One-Time CTA */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 shrink-0 pt-2 sm:pt-0">
              <Button
                variant="primary"
                size="md"
                onClick={() => setIsUpgradeModalOpen(true)}
                className="shadow-md font-bold text-xs shrink-0 cursor-pointer w-full sm:w-auto justify-center"
                icon={<Sparkles className="w-4 h-4" />}
              >
                {isItalian
                  ? `Sblocca con ${tierName} (${tierPriceLabel}/mese)`
                  : `Unlock with ${tierName} (${tierPriceLabel}/mo)`}
              </Button>

              {canBuyOffline && formattedPrice && (
                <Button
                  variant="outline"
                  size="md"
                  onClick={() => setIsPurchaseModalOpen(true)}
                  className="font-semibold text-xs shrink-0 cursor-pointer w-full sm:w-auto justify-center"
                  icon={<CreditCard className="w-4 h-4" />}
                >
                  {isItalian
                    ? `Licenza Desktop Offline (${formattedPrice})`
                    : `Desktop Offline (${formattedPrice})`}
                </Button>
              )}
            </div>
          </div>

          {/* 3 Summary Feature Highlights */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 pt-1">
            {featureHighlights.map((feat, idx) => {
              const FeatIcon = feat.icon;
              return (
                <div
                  key={idx}
                  className="p-3.5 sm:p-4 rounded-xl bg-neutral-50 dark:bg-neutral-900/60 border border-neutral-200/70 dark:border-neutral-800 transition-all hover:border-amber-300 dark:hover:border-amber-800/60 space-y-1.5"
                >
                  <div className="flex items-center gap-2 text-xs sm:text-sm font-bold text-neutral-800 dark:text-neutral-200">
                    <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 shrink-0">
                      <FeatIcon className="w-4 h-4" />
                    </div>
                    <span className="leading-tight">{feat.title}</span>
                  </div>
                  <p className="text-[11px] sm:text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed">
                    {feat.description}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Cloud-only notice OR Offline License Key activation form */}
          {!canBuyOffline ? (
            <div className="p-4 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/25 border border-indigo-200/70 dark:border-indigo-900/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <Cloud className="w-5 h-5 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-xs sm:text-sm font-bold text-indigo-950 dark:text-indigo-200">
                    {isItalian
                      ? 'Modulo ospitato su Cloud — Incluso in Boutique e Atelier'
                      : 'Cloud-Hosted Module — Included in Boutique & Atelier'}
                  </h4>
                  <p className="text-xs text-indigo-800/80 dark:text-indigo-300/90 mt-0.5 leading-relaxed">
                    {isItalian
                      ? 'Questa funzionalità utilizza server cloud e API online continue. È inclusa automaticamente negli abbonamenti Boutique Cloud (€29/mese) e Atelier Cloud (€49/mese) senza costi extra.'
                      : 'This feature runs on continuous cloud hosting and real-time APIs. It is automatically included with Boutique Cloud (€29/mo) and Atelier Cloud (€49/mo) at no extra add-on fee.'}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-4 sm:p-5 rounded-xl bg-neutral-100/70 dark:bg-neutral-900/80 border border-neutral-200/80 dark:border-neutral-800 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs sm:text-sm font-bold text-neutral-800 dark:text-neutral-200">
                  <KeyRound className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                  <span>
                    {isItalian
                      ? 'Hai una chiave di licenza Desktop Offline?'
                      : 'Have a Desktop Offline License Token?'}
                  </span>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-stretch gap-2">
                <input
                  type="text"
                  value={licenseKey}
                  onChange={(e) => setLicenseKey(e.target.value)}
                  placeholder={t('modules.licenseTokenPlaceholder', 'Paste your license key here...')}
                  className="flex-1 px-3 py-2 text-xs font-mono bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 text-neutral-900 dark:text-neutral-100"
                />
                <Button
                  variant="primary"
                  onClick={handleActivate}
                  disabled={isActivating}
                  className="w-full sm:w-auto justify-center"
                  icon={<KeyRound className="w-4 h-4" />}
                >
                  {isActivating ? t('common.loading', 'Verifying...') : t('modules.activateButton', 'Activate License')}
                </Button>
              </div>

              <div className="pt-2 border-t border-neutral-200/60 dark:border-neutral-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-[11px] text-neutral-500 dark:text-neutral-400">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span>{t('modules.hardwareIdLabel', 'Device ID (for offline licensing):')}</span>
                  <code className="px-1.5 py-0.5 rounded bg-neutral-200/70 dark:bg-neutral-800 font-mono text-[11px] font-bold text-neutral-800 dark:text-neutral-200 select-all dir-ltr">
                    {hardwareId}
                  </code>
                </div>
                <button
                  type="button"
                  onClick={handleCopyHardwareId}
                  className="text-[11px] text-neutral-600 dark:text-neutral-300 hover:text-amber-600 dark:hover:text-amber-400 flex items-center gap-1 cursor-pointer transition-colors"
                >
                  {copiedHwId ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedHwId ? t('common.copied', 'Copied') : t('modules.copyHwId', 'Copy ID')}</span>
                </button>
              </div>

              {message && (
                <div
                  className={`p-3 rounded-lg text-xs font-medium flex items-center gap-2 ${
                    message.isError
                      ? 'bg-red-50 text-red-700 border border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-900/50'
                      : 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-900/50'
                  }`}
                >
                  {message.isError ? (
                    <Lock className="w-4 h-4 shrink-0" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  )}
                  <span>{message.text}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </Card>

      {/* Cloud Plan Upgrade Modal */}
      <UpgradeToProModal
        isOpen={isUpgradeModalOpen}
        defaultTier={requiredTier}
        onClose={() => setIsUpgradeModalOpen(false)}
        onSuccess={() => {
          setIsUpgradeModalOpen(false);
          refreshModules();
          if (onUnlocked) onUnlocked();
        }}
      />

      {/* Offline Desktop Purchase Modal (only mounted for offline-capable modules) */}
      {canBuyOffline && (
        <PurchaseModuleModal
          isOpen={isPurchaseModalOpen}
          onClose={() => setIsPurchaseModalOpen(false)}
          moduleSlug={moduleSlug}
          moduleName={effectiveTitle}
          onOpenProModal={() => {
            setIsPurchaseModalOpen(false);
            setIsUpgradeModalOpen(true);
          }}
          onSuccess={() => {
            setIsPurchaseModalOpen(false);
            refreshModules();
            if (onUnlocked) onUnlocked();
          }}
        />
      )}
    </div>
  );
};
