import React, { useState, useEffect } from 'react';
import { useTranslation } from '../../i18n';
import { useOrganization } from '../../context/OrganizationContext';
import { useModuleAccess } from '../../hooks/useModuleAccess';
import { storageManager } from '../../storage';
import { WooCommerceSettings, WooCommerceLog, Warehouse, FinancialAccount, ProductVariant, InventoryItem } from '../../types';
import {
  testWooCommerceConnection,
  syncStockToWooCommerce,
  syncPricesToWooCommerce,
  importOrdersFromWooCommerce,
  TestConnectionResult,
  SyncStockResult,
  SyncPricesResult,
  ImportOrdersResult,
} from '../../api/woocommerce';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Badge } from '../../components/ui/Badge';
import { ModuleLockedCard } from '../../components/modules/ModuleLockedCard';
import { formatCurrency, formatDate, resolveCurrencyCode } from '../../utils/formatters';
import { BRAND, getPublicAppOrigin } from '../../config/brand';
import {
  Globe,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Settings,
  ArrowUpDown,
  ShoppingBag,
  Boxes,
  Copy,
  Check,
  ExternalLink,
  ShieldCheck,
  HelpCircle,
  Layers,
  Clock,
  ArrowUpRight,
  ArrowDownLeft,
} from 'lucide-react';

export interface WooCommercePageProps {
  initialTab?: 'overview' | 'settings' | 'mappings' | 'logs';
  onNavigateTab?: (tab: 'overview' | 'settings' | 'mappings' | 'logs') => void;
}

export const WooCommercePage: React.FC<WooCommercePageProps> = ({
  initialTab = 'overview',
  onNavigateTab,
}) => {
  const { t, locale } = useTranslation();
  const isIt = locale === 'it';
  const { activeOrganization } = useOrganization();
  const { hasAccess } = useModuleAccess();

  const hasWcAccess = hasAccess('woocommerce');
  const activeCurrency = resolveCurrencyCode(activeOrganization?.currency);

  // Tabs
  const [activeTab, setActiveTab] = useState<'overview' | 'settings' | 'mappings' | 'logs'>(initialTab);

  useEffect(() => {
    if (initialTab && initialTab !== activeTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  const handleTabChange = (tab: 'overview' | 'settings' | 'mappings' | 'logs') => {
    setActiveTab(tab);
    onNavigateTab?.(tab);
  };

  // Data states
  const [settings, setSettings] = useState<Partial<WooCommerceSettings>>({
    site_url: '',
    consumer_key: '',
    consumer_secret: '',
    warehouse_id: null,
    financial_account_id: null,
    auto_sync_stock: true,
    auto_sync_price: false,
    auto_import_orders: true,
  });

  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [financialAccounts, setFinancialAccounts] = useState<FinancialAccount[]>([]);
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [, setInventoryItems] = useState<InventoryItem[]>([]);
  const [logs, setLogs] = useState<WooCommerceLog[]>([]);
  const [loading, setLoading] = useState(true);

  // Connection & action states
  const [isTesting, setIsTesting] = useState(false);
  const [, setTestResult] = useState<TestConnectionResult | null>(null);
  const [isSyncingStock, setIsSyncingStock] = useState(false);
  const [isSyncingPrices, setIsSyncingPrices] = useState(false);
  const [isImportingOrders, setIsImportingOrders] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<{ text: string; isError: boolean } | null>(null);
  const [copiedWebhook, setCopiedWebhook] = useState(false);
  const [searchMapping, setSearchMapping] = useState('');

  const activeOrgId = activeOrganization?.id ? Number(activeOrganization.id) : 1;

  // Webhook URL (uses live web origin or https://app.clozito.com on desktop)
  const webhookUrl = `${getPublicAppOrigin()}/api/woocommerce/webhook?org_id=${activeOrgId}`;

  // Load initial data
  const loadData = async () => {
    try {
      setLoading(true);
      const [loadedSettings, loadedWarehouses, loadedAccounts, loadedVariants, loadedInv, loadedLogs] = await Promise.all([
        storageManager.getWooCommerceSettings({ organization_id: activeOrgId }).catch(() => null),
        storageManager.getWarehouses({ organization_id: activeOrgId }).catch(() => []),
        storageManager.getFinancialAccounts({ organization_id: activeOrgId }).catch(() => []),
        storageManager.getProductVariants({ organization_id: activeOrgId }).catch(() => []),
        storageManager.getInventoryItems({ organization_id: activeOrgId }).catch(() => []),
        storageManager.getWooCommerceLogs({ organization_id: activeOrgId, limit: 100 }).catch(() => []),
      ]);

      if (loadedSettings) {
        setSettings(loadedSettings);
      }
      setWarehouses(loadedWarehouses || []);
      setFinancialAccounts(loadedAccounts || []);
      setVariants(loadedVariants || []);
      setInventoryItems(loadedInv || []);
      setLogs(loadedLogs || []);
    } catch (err: any) {
      console.error('[WooCommercePage] loadData error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [activeOrgId]);

  // Test Connection
  const handleTestConnection = async () => {
    if (!settings.site_url || !settings.consumer_key || !settings.consumer_secret) {
      setFeedbackMessage({
        text: isIt
          ? 'Compila prima URL del sito, Consumer Key e Consumer Secret nella scheda Impostazioni.'
          : 'Please complete the Site URL, Consumer Key, and Consumer Secret in the Settings tab first.',
        isError: true,
      });
      return;
    }

    setIsTesting(true);
    setTestResult(null);
    setFeedbackMessage(null);

    try {
      const res = await testWooCommerceConnection({
        site_url: settings.site_url,
        consumer_key: settings.consumer_key,
        consumer_secret: settings.consumer_secret,
      });

      setTestResult(res);
      if (res.success) {
        setFeedbackMessage({
          text: isIt
            ? `Connessione riuscita: ${res.store_name} (${res.wc_version})`
            : `Connected successfully: ${res.store_name} (${res.wc_version})`,
          isError: false,
        });
        await storageManager.saveWooCommerceSettings({
          ...settings,
          organization_id: activeOrgId,
          sync_status: 'connected',
        });
      } else {
        setFeedbackMessage({
          text: res.error || (isIt ? 'Errore di connessione a WooCommerce.' : 'Failed to connect to WooCommerce.'),
          isError: true,
        });
      }
    } catch (err: any) {
      setFeedbackMessage({
        text: err.message || (isIt ? 'Errore di comunicazione con il server.' : 'Server communication error.'),
        isError: true,
      });
    } finally {
      setIsTesting(false);
    }
  };

  // Save Settings
  const handleSaveSettings = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsSavingSettings(true);
    setFeedbackMessage(null);

    try {
      const saved = await storageManager.saveWooCommerceSettings({
        ...settings,
        organization_id: activeOrgId,
      });
      setSettings(saved);
      setFeedbackMessage({
        text: t('woocommerce.saveSuccess', isIt ? 'Impostazioni salvate con successo.' : 'Settings saved successfully.'),
        isError: false,
      });
    } catch (err: any) {
      setFeedbackMessage({
        text: err.message || (isIt ? 'Errore nel salvataggio delle impostazioni.' : 'Failed to save settings.'),
        isError: true,
      });
    } finally {
      setIsSavingSettings(false);
    }
  };

  // Sync Stock
  const handleSyncStock = async () => {
    if (!settings.site_url || !settings.consumer_key || !settings.consumer_secret) {
      setFeedbackMessage({
        text: isIt
          ? 'Le impostazioni WooCommerce sono incomplete. Compilale nella scheda Impostazioni.'
          : 'WooCommerce settings are incomplete. Please configure them in the Settings tab first.',
        isError: true,
      });
      return;
    }

    setIsSyncingStock(true);
    setFeedbackMessage(null);

    try {
      const res: SyncStockResult = await syncStockToWooCommerce({
        organization_id: activeOrgId,
        warehouse_id: settings.warehouse_id,
        site_url: settings.site_url,
        consumer_key: settings.consumer_key,
        consumer_secret: settings.consumer_secret,
      });

      if (res.success) {
        setFeedbackMessage({
          text: isIt
            ? `Giacenze sincronizzate: ${res.updatedCount} prodotti/varianti aggiornati su WooCommerce (${res.missingSkuCount} senza SKU).`
            : `Stock synced successfully: ${res.updatedCount} products/variants updated in WooCommerce (${res.missingSkuCount} skipped without SKU).`,
          isError: false,
        });
        await loadData();
      } else {
        setFeedbackMessage({
          text: res.error || (isIt ? 'Errore durante la sincronizzazione delle giacenze.' : 'Failed to sync stock to WooCommerce.'),
          isError: true,
        });
      }
    } catch (err: any) {
      setFeedbackMessage({
        text: err.message || (isIt ? 'Errore durante la sincronizzazione delle giacenze.' : 'Failed to sync stock.'),
        isError: true,
      });
    } finally {
      setIsSyncingStock(false);
    }
  };

  // Sync Prices
  const handleSyncPrices = async () => {
    if (!settings.site_url || !settings.consumer_key || !settings.consumer_secret) {
      setFeedbackMessage({
        text: isIt ? 'Impostazioni WooCommerce incomplete.' : 'WooCommerce settings are incomplete.',
        isError: true,
      });
      return;
    }

    setIsSyncingPrices(true);
    setFeedbackMessage(null);

    try {
      const res: SyncPricesResult = await syncPricesToWooCommerce({
        organization_id: activeOrgId,
        site_url: settings.site_url,
        consumer_key: settings.consumer_key,
        consumer_secret: settings.consumer_secret,
      });

      if (res.success) {
        setFeedbackMessage({
          text: isIt
            ? `Prezzi sincronizzati: ${res.updatedCount} prodotti aggiornati.`
            : `Prices synced successfully: ${res.updatedCount} products updated.`,
          isError: false,
        });
        await loadData();
      } else {
        setFeedbackMessage({
          text: res.error || (isIt ? 'Errore durante la sincronizzazione dei prezzi.' : 'Failed to sync prices to WooCommerce.'),
          isError: true,
        });
      }
    } catch (err: any) {
      setFeedbackMessage({
        text: err.message || (isIt ? 'Errore durante la sincronizzazione dei prezzi.' : 'Failed to sync prices.'),
        isError: true,
      });
    } finally {
      setIsSyncingPrices(false);
    }
  };

  // Import Orders
  const handleImportOrders = async () => {
    if (!settings.site_url || !settings.consumer_key || !settings.consumer_secret) {
      setFeedbackMessage({
        text: isIt ? 'Impostazioni WooCommerce incomplete.' : 'WooCommerce settings are incomplete.',
        isError: true,
      });
      return;
    }

    setIsImportingOrders(true);
    setFeedbackMessage(null);

    try {
      const res: ImportOrdersResult = await importOrdersFromWooCommerce({
        organization_id: activeOrgId,
        warehouse_id: settings.warehouse_id,
        financial_account_id: settings.financial_account_id,
        site_url: settings.site_url,
        consumer_key: settings.consumer_key,
        consumer_secret: settings.consumer_secret,
      });

      if (res.success) {
        setFeedbackMessage({
          text: isIt
            ? `Ordini online verificati: ${res.importedOrdersCount} nuovi ordini importati (${res.skippedCount} già registrati).`
            : `Online orders checked: ${res.importedOrdersCount} new orders imported (${res.skippedCount} already recorded).`,
          isError: false,
        });
        await loadData();
      } else {
        setFeedbackMessage({
          text: res.error || (isIt ? 'Errore durante l’importazione degli ordini.' : 'Failed to import orders from WooCommerce.'),
          isError: true,
        });
      }
    } catch (err: any) {
      setFeedbackMessage({
        text: err.message || (isIt ? 'Errore durante l’importazione degli ordini.' : 'Failed to import orders.'),
        isError: true,
      });
    } finally {
      setIsImportingOrders(false);
    }
  };

  const handleCopyWebhook = () => {
    navigator.clipboard.writeText(webhookUrl);
    setCopiedWebhook(true);
    setTimeout(() => setCopiedWebhook(false), 2500);
  };

  // If module is locked for this organization
  if (!hasWcAccess) {
    return (
      <ModuleLockedCard
        moduleSlug="woocommerce"
        moduleName={isIt ? 'Sincronizzazione WooCommerce' : 'WooCommerce Sync'}
        description={
          isIt
            ? `Connessione bidirezionale automatica tra ${BRAND.name} e il tuo negozio WooCommerce: sincronizzazione in tempo reale di giacenze, prezzi e importazione automatica degli ordini online.`
            : `Two-way automated integration between ${BRAND.name} and your WooCommerce store: real-time inventory sync, price updates, and automatic online order imports.`
        }
        onUnlocked={loadData}
      />
    );
  }

  // Variant stats
  const totalVariantsCount = variants.length;
  const withSkuCount = variants.filter((v) => (v.sku || v.barcode)?.trim()).length;
  const missingSkuCount = totalVariantsCount - withSkuCount;

  // Filtered variants for mappings tab
  const filteredVariants = variants.filter((v) => {
    if (!searchMapping.trim()) return true;
    const q = searchMapping.toLowerCase();
    return (
      (v.product_title || '').toLowerCase().includes(q) ||
      (v.sku || '').toLowerCase().includes(q) ||
      (v.barcode || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="p-3.5 sm:p-6 max-w-7xl mx-auto space-y-5 sm:space-y-6 animate-fade-in" dir="ltr">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 border-b border-neutral-800 pb-4 sm:pb-5">
        <div className="flex items-center gap-2.5 sm:gap-3">
          <div className="p-2 sm:p-2.5 rounded-xl bg-violet-500/10 text-violet-400 border border-violet-500/20 shrink-0">
            <Globe className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg sm:text-xl font-bold text-white tracking-tight">
                {t('woocommerce.title', isIt ? 'Sincronizzazione WooCommerce' : 'WooCommerce Sync')}
              </h1>
              <Badge variant="success" className="text-[10px] sm:text-xs">
                {settings.site_url
                  ? isIt ? 'Configurato' : 'Configured'
                  : isIt ? 'Configurazione richiesta' : 'Setup Required'}
              </Badge>
            </div>
            <p className="text-xs sm:text-sm text-neutral-400 mt-0.5 line-clamp-1 sm:line-clamp-none">
              {t(
                'woocommerce.subtitle',
                isIt
                  ? `Integrazione bidirezionale tra ${BRAND.name} e WooCommerce per giacenze, prezzi e ordini`
                  : `Two-way integration between ${BRAND.name} and WooCommerce for stock, prices, and orders`
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
          <Button
            variant="outline"
            size="sm"
            onClick={loadData}
            disabled={loading}
            className="text-xs border-neutral-700 hover:bg-neutral-800 flex-1 sm:flex-initial justify-center h-8 sm:h-9"
          >
            <RefreshCw className={`w-3.5 h-3.5 me-1.5 ${loading ? 'animate-spin' : ''}`} />
            <span>{isIt ? 'Aggiorna dati' : 'Refresh Data'}</span>
          </Button>

          <Button
            variant="primary"
            size="sm"
            onClick={handleTestConnection}
            disabled={isTesting || !settings.site_url}
            className="text-xs bg-violet-600 hover:bg-violet-500 text-white border-0 flex-1 sm:flex-initial justify-center h-8 sm:h-9"
          >
            <ShieldCheck className={`w-3.5 h-3.5 me-1.5 ${isTesting ? 'animate-spin' : ''}`} />
            <span>
              {isTesting
                ? isIt ? 'Verifica in corso...' : 'Testing...'
                : isIt ? 'Verifica connessione' : 'Test Connection'}
            </span>
          </Button>
        </div>
      </div>

      {/* Feedback Banner */}
      {feedbackMessage && (
        <div
          className={`p-3.5 sm:p-4 rounded-xl flex items-center justify-between border ${
            feedbackMessage.isError
              ? 'bg-rose-500/10 border-rose-500/30 text-rose-400'
              : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
          }`}
        >
          <div className="flex items-center gap-2 text-xs sm:text-sm">
            {feedbackMessage.isError ? <AlertCircle className="w-4 h-4 shrink-0" /> : <CheckCircle2 className="w-4 h-4 shrink-0" />}
            <span>{feedbackMessage.text}</span>
          </div>
          <button
            onClick={() => setFeedbackMessage(null)}
            className="text-xs opacity-70 hover:opacity-100 underline ms-4 shrink-0"
          >
            {isIt ? 'Chiudi' : 'Dismiss'}
          </button>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex border-b border-neutral-800 gap-1 sm:gap-2 overflow-x-auto pb-px scrollbar-none">
        {[
          { key: 'overview' as const, label: t('woocommerce.overviewTab', isIt ? 'Panoramica Sync' : 'Sync Overview'), icon: Boxes },
          { key: 'mappings' as const, label: t('woocommerce.mappingsTab', isIt ? 'Mappatura SKU' : 'Product & SKU Mapping'), icon: Layers },
          { key: 'logs' as const, label: t('woocommerce.logsTab', isIt ? 'Log eventi' : 'Sync Logs'), icon: Clock },
          { key: 'settings' as const, label: t('woocommerce.settingsTab', isIt ? 'Impostazioni API' : 'Connection & Settings'), icon: Settings },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => handleTabChange(tab.key)}
              className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm font-medium border-b-2 whitespace-nowrap transition-all cursor-pointer ${
                isActive
                  ? 'border-violet-500 text-violet-400 bg-violet-500/5'
                  : 'border-transparent text-neutral-400 hover:text-neutral-200 hover:border-neutral-700'
              }`}
            >
              <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
              <span>{tab.label}</span>
              {tab.key === 'logs' && logs.length > 0 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-neutral-800 text-neutral-300">
                  {logs.length}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab 1: Overview */}
      {activeTab === 'overview' && (
        <div className="space-y-4 sm:space-y-6">
          {/* Quick Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
            <Card className="p-3 sm:p-4 bg-neutral-900/60 border-neutral-800 space-y-1 sm:space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] sm:text-xs text-neutral-400 line-clamp-1">
                  {isIt ? 'Stato connessione negozio' : 'Store Connection'}
                </span>
                <Globe className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-violet-400 shrink-0" />
              </div>
              <div className="flex items-baseline gap-1.5 sm:gap-2">
                <span
                  className="text-sm sm:text-base font-bold text-white truncate max-w-[150px] sm:max-w-[200px]"
                  title={settings.site_url || (isIt ? 'Non configurato' : 'Not configured')}
                >
                  {settings.site_url ? settings.site_url.replace(/^https?:\/\//, '') : isIt ? 'Non configurato' : 'Not configured'}
                </span>
              </div>
              <div className="text-[10px] sm:text-xs text-neutral-500 flex items-center gap-1.5">
                <span className={`w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full ${settings.site_url ? 'bg-emerald-400' : 'bg-neutral-600'}`} />
                <span>
                  {settings.site_url
                    ? isIt ? 'Pronto alla sincronizzazione' : 'Ready to sync'
                    : isIt ? 'URL del negozio richiesto' : 'Store URL required'}
                </span>
              </div>
            </Card>

            <Card className="p-3 sm:p-4 bg-neutral-900/60 border-neutral-800 space-y-1 sm:space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] sm:text-xs text-neutral-400 line-clamp-1">
                  {isIt ? 'Totale varianti' : 'Total Variants'}
                </span>
                <Boxes className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-400 shrink-0" />
              </div>
              <div className="flex items-baseline gap-1.5 sm:gap-2">
                <span className="text-lg sm:text-2xl font-bold text-white">{totalVariantsCount}</span>
                <span className="text-[11px] sm:text-xs text-neutral-400">{isIt ? 'articoli' : 'items'}</span>
              </div>
              <div className="text-[10px] sm:text-xs text-emerald-400 line-clamp-1">
                {withSkuCount} {isIt ? 'con codice SKU' : 'with SKU'}
              </div>
            </Card>

            <Card className="p-3 sm:p-4 bg-neutral-900/60 border-neutral-800 space-y-1 sm:space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] sm:text-xs text-neutral-400 line-clamp-1">
                  {isIt ? 'Magazzino collegato' : 'Linked Warehouse'}
                </span>
                <ShoppingBag className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-400 shrink-0" />
              </div>
              <div className="flex items-baseline gap-1.5 sm:gap-2">
                <span className="text-sm sm:text-base font-bold text-white line-clamp-1">
                  {warehouses.find((w) => w.id === settings.warehouse_id)?.name || (isIt ? 'Tutti i magazzini' : 'All Warehouses')}
                </span>
              </div>
              <div className="text-[10px] sm:text-xs text-neutral-500 line-clamp-1">
                {isIt ? 'Scarico automatico giacenze' : 'Automatic stock deduction'}
              </div>
            </Card>

            <Card className="p-3 sm:p-4 bg-neutral-900/60 border-neutral-800 space-y-1 sm:space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] sm:text-xs text-neutral-400 line-clamp-1">
                  {isIt ? 'Eventi e log' : 'Sync Events'}
                </span>
                <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-400 shrink-0" />
              </div>
              <div className="flex items-baseline gap-1.5 sm:gap-2">
                <span className="text-lg sm:text-2xl font-bold text-white">{logs.length}</span>
                <span className="text-[11px] sm:text-xs text-neutral-400">{isIt ? 'voci' : 'records'}</span>
              </div>
              <div className="text-[10px] sm:text-xs text-neutral-500 line-clamp-1">
                {isIt ? 'Ultimo:' : 'Latest:'} {logs[0]?.date_created ? formatDate(logs[0].date_created) : isIt ? 'Nessuno' : 'None'}
              </div>
            </Card>
          </div>

          {/* Core Action Triggers */}
          <Card className="p-4 sm:p-6 bg-gradient-to-br from-neutral-900 via-neutral-900/90 to-[#18181c] border-neutral-800">
            <h2 className="text-sm sm:text-base font-bold text-white mb-1.5 sm:mb-2 flex items-center gap-2">
              <ArrowUpDown className="w-4 h-4 text-violet-400" />
              {isIt ? 'Azioni di sincronizzazione manuale' : 'Manual Instant Sync Actions'}
            </h2>
            <p className="text-xs text-neutral-400 mb-4 sm:mb-6">
              {isIt
                ? `Usa i pulsanti qui sotto per sincronizzare istantaneamente inventario, prezzi e ordini tra ${BRAND.name} e WooCommerce:`
                : `Use the controls below to immediately sync inventory, prices, and orders between ${BRAND.name} and WooCommerce:`}
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4">
              {/* Action 1: Sync Stock */}
              <div className="p-3.5 sm:p-4 rounded-xl border border-neutral-800 bg-neutral-950/60 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2 text-white font-medium text-xs sm:text-sm">
                    <Boxes className="w-4 h-4 text-blue-400 shrink-0" />
                    <span>{isIt ? 'Invia giacenze al negozio' : 'Push Stock to Store'}</span>
                  </div>
                  <p className="text-[11px] sm:text-xs text-neutral-400 mt-2 leading-relaxed">
                    {isIt
                      ? 'Calcola le giacenze disponibili nel magazzino selezionato e aggiorna i prodotti su WooCommerce tramite SKU.'
                      : 'Calculates available stock in the selected warehouse and updates matching SKU quantities in WooCommerce.'}
                  </p>
                </div>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleSyncStock}
                  disabled={isSyncingStock || !settings.site_url}
                  icon={<Boxes className={`w-3.5 h-3.5 ${isSyncingStock ? 'animate-spin' : ''}`} />}
                  className="mt-3.5 sm:mt-4 w-full justify-center bg-blue-600 hover:bg-blue-500 text-white text-xs border-0 cursor-pointer h-8 sm:h-9"
                >
                  {isSyncingStock
                    ? isIt ? 'Invio giacenze...' : 'Syncing Stock...'
                    : isIt ? 'Sincronizza giacenze' : 'Sync Inventory Stock'}
                </Button>
              </div>

              {/* Action 2: Sync Prices */}
              <div className="p-3.5 sm:p-4 rounded-xl border border-neutral-800 bg-neutral-950/60 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2 text-white font-medium text-xs sm:text-sm">
                    <ArrowUpRight className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>{isIt ? 'Invia prezzi al negozio' : 'Push Prices to Store'}</span>
                  </div>
                  <p className="text-[11px] sm:text-xs text-neutral-400 mt-2 leading-relaxed">
                    {isIt
                      ? 'Aggiorna il prezzo di listino (Regular Price) su WooCommerce con i prezzi delle varianti.'
                      : 'Pushes current variant selling prices to the Regular Price field of matching products in WooCommerce.'}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSyncPrices}
                  disabled={isSyncingPrices || !settings.site_url}
                  icon={<ArrowUpRight className={`w-3.5 h-3.5 ${isSyncingPrices ? 'animate-spin' : ''}`} />}
                  className="mt-3.5 sm:mt-4 w-full justify-center border-neutral-700 hover:bg-neutral-800 text-white text-xs cursor-pointer h-8 sm:h-9"
                >
                  {isSyncingPrices
                    ? isIt ? 'Invio prezzi...' : 'Syncing Prices...'
                    : isIt ? 'Sincronizza prezzi' : 'Sync Prices'}
                </Button>
              </div>

              {/* Action 3: Import Orders */}
              <div className="p-3.5 sm:p-4 rounded-xl border border-neutral-800 bg-neutral-950/60 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2 text-white font-medium text-xs sm:text-sm">
                    <ShoppingBag className="w-4 h-4 text-violet-400 shrink-0" />
                    <span>{isIt ? 'Importa ordini WooCommerce' : 'Import WooCommerce Orders'}</span>
                  </div>
                  <p className="text-[11px] sm:text-xs text-neutral-400 mt-2 leading-relaxed">
                    {isIt
                      ? `Importa gli ordini online nuovi e in lavorazione come ordini di vendita in ${BRAND.name}.`
                      : `Fetches new and processing storefront orders and records them as sales orders in ${BRAND.name}.`}
                  </p>
                </div>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleImportOrders}
                  disabled={isImportingOrders || !settings.site_url}
                  icon={<ShoppingBag className={`w-3.5 h-3.5 ${isImportingOrders ? 'animate-spin' : ''}`} />}
                  className="mt-3.5 sm:mt-4 w-full justify-center bg-violet-600 hover:bg-violet-500 text-white text-xs border-0 cursor-pointer h-8 sm:h-9"
                >
                  {isImportingOrders
                    ? isIt ? 'Importazione ordini...' : 'Importing Orders...'
                    : isIt ? 'Importa ordini online' : 'Import Online Orders'}
                </Button>
              </div>
            </div>
          </Card>

          {/* Missing SKU Warning Card */}
          {missingSkuCount > 0 && (
            <div className="p-3.5 sm:p-4 rounded-xl border border-amber-500/20 bg-amber-500/5 flex items-start gap-3">
              <AlertCircle className="w-4 h-4 sm:w-5 sm:h-5 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <h3 className="text-xs sm:text-sm font-bold text-amber-300">
                  {isIt
                    ? `${missingSkuCount} varianti non hanno un codice SKU o barcode`
                    : `${missingSkuCount} variants are missing an SKU or barcode`}
                </h3>
                <p className="text-[11px] sm:text-xs text-neutral-400 mt-1">
                  {isIt
                    ? 'WooCommerce abbina i prodotti tramite il campo SKU. Assegna un SKU alle varianti nella sezione Prodotti per sincronizzare automaticamente giacenze e prezzi.'
                    : 'WooCommerce matches products using the SKU field. Assign SKUs to these variants in the Products section to enable automatic stock and price syncing.'}
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleTabChange('mappings')}
                  className="mt-2 text-xs text-amber-400 hover:text-amber-300 p-0 h-auto underline"
                >
                  {isIt ? 'Visualizza articoli senza SKU nella scheda Mappatura' : 'View items missing SKU in Product Mapping'}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Settings */}
      {activeTab === 'settings' && (
        <div className="space-y-4 sm:space-y-6 max-w-4xl">
          <Card className="p-4 sm:p-6 bg-neutral-900/60 border-neutral-800">
            <h2 className="text-sm sm:text-base font-bold text-white mb-3 sm:mb-4 flex items-center gap-2">
              <Settings className="w-4 h-4 text-violet-400" />
              {isIt ? 'Credenziali WooCommerce REST API' : 'WooCommerce REST API Authentication'}
            </h2>

            <form onSubmit={handleSaveSettings} className="space-y-4 sm:space-y-5">
              {/* Site URL */}
              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                  {isIt ? 'URL del negozio (Site URL)' : 'Store Website URL'} <span className="text-rose-400">*</span>
                </label>
                <Input
                  type="url"
                  placeholder="https://yourstore.eu"
                  value={settings.site_url || ''}
                  onChange={(e) => setSettings({ ...settings, site_url: e.target.value })}
                  dir="ltr"
                  className="bg-neutral-950 border-neutral-800 text-left font-mono text-xs sm:text-sm h-9 sm:h-10"
                  required
                />
                <p className="text-[10px] sm:text-[11px] text-neutral-500 mt-1">
                  {isIt
                    ? 'Dominio completo del negozio con https:// (es. https://yourstore.eu)'
                    : 'Full store domain including https:// (e.g., https://yourstore.eu)'}
                </p>
              </div>

              {/* Consumer Key & Secret */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                    Consumer Key <span className="text-rose-400">*</span>
                  </label>
                  <Input
                    type="text"
                    placeholder="ck_xxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                    value={settings.consumer_key || ''}
                    onChange={(e) => setSettings({ ...settings, consumer_key: e.target.value })}
                    dir="ltr"
                    className="bg-neutral-950 border-neutral-800 text-left font-mono text-xs sm:text-sm h-9 sm:h-10"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                    Consumer Secret <span className="text-rose-400">*</span>
                  </label>
                  <Input
                    type="password"
                    placeholder="cs_xxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                    value={settings.consumer_secret || ''}
                    onChange={(e) => setSettings({ ...settings, consumer_secret: e.target.value })}
                    dir="ltr"
                    className="bg-neutral-950 border-neutral-800 text-left font-mono text-xs sm:text-sm h-9 sm:h-10"
                    required
                  />
                </div>
              </div>

              <div className="p-3 sm:p-3.5 rounded-xl bg-neutral-950 border border-neutral-800/80 text-[11px] sm:text-xs text-neutral-400 space-y-1">
                <span className="font-semibold text-neutral-300 flex items-center gap-1.5">
                  <HelpCircle className="w-3.5 h-3.5 text-violet-400 shrink-0" />
                  {isIt ? 'Come generare le chiavi API in WordPress:' : 'How to generate API keys in WordPress:'}
                </span>
                <p className="leading-relaxed">
                  {isIt
                    ? 'Apri WordPress Admin → WooCommerce → Impostazioni → Avanzate → REST API → "Aggiungi chiave" → imposta i permessi su "Lettura/Scrittura (Read/Write)".'
                    : 'Go to WordPress Admin → WooCommerce → Settings → Advanced → REST API → "Add key" → set Permissions to "Read/Write".'}
                </p>
              </div>

              {/* Warehouse & Financial Account selectors */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4 pt-3 border-t border-neutral-800">
                <div>
                  <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                    {isIt ? 'Magazzino collegato per giacenze e scarichi' : 'Linked Warehouse for Stock & Fulfillment'}
                  </label>
                  <select
                    value={settings.warehouse_id || ''}
                    onChange={(e) => setSettings({ ...settings, warehouse_id: e.target.value ? Number(e.target.value) : null })}
                    className="w-full h-9 sm:h-10 px-3 rounded-lg bg-neutral-950 border border-neutral-800 text-white text-xs sm:text-sm focus:outline-none focus:border-violet-500"
                  >
                    <option value="">{isIt ? 'Tutti i magazzini (giacenza aggregata)' : 'All Warehouses (Combined Stock)'}</option>
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name} {w.is_default ? (isIt ? '(Predefinito)' : '(Default)') : ''}
                      </option>
                    ))}
                  </select>
                  <p className="text-[10px] sm:text-[11px] text-neutral-500 mt-1">
                    {isIt
                      ? 'Le quantità inviate al negozio vengono calcolate da questo magazzino.'
                      : 'Inventory quantities synced to WooCommerce are read from this warehouse.'}
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                    {isIt ? 'Conto bancario predefinito per incassi online' : 'Default Settlement Bank / Gateway Account'}
                  </label>
                  <select
                    value={settings.financial_account_id || ''}
                    onChange={(e) => setSettings({ ...settings, financial_account_id: e.target.value ? Number(e.target.value) : null })}
                    className="w-full h-9 sm:h-10 px-3 rounded-lg bg-neutral-950 border border-neutral-800 text-white text-xs sm:text-sm focus:outline-none focus:border-violet-500"
                  >
                    <option value="">{isIt ? 'Nessun deposito automatico' : 'No automatic treasury deposit'}</option>
                    {financialAccounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} ({a.type})
                      </option>
                    ))}
                  </select>
                  <p className="text-[10px] sm:text-[11px] text-neutral-500 mt-1">
                    {isIt
                      ? 'Se selezionato, gli incassi degli ordini pagati online saranno accreditati automaticamente su questo conto.'
                      : 'When selected, paid online orders automatically credit this financial account.'}
                  </p>
                </div>
              </div>

              {/* Automatic toggles */}
              <div className="pt-3 border-t border-neutral-800 space-y-3">
                <h3 className="text-xs font-semibold text-neutral-300">
                  {isIt ? 'Automazione e comportamento' : 'Automation Behavior'}
                </h3>

                <label className="flex items-start sm:items-center gap-2.5 sm:gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(settings.auto_sync_stock)}
                    onChange={(e) => setSettings({ ...settings, auto_sync_stock: e.target.checked })}
                    className="rounded border-neutral-700 bg-neutral-900 text-violet-600 focus:ring-0 w-4 h-4 mt-0.5 sm:mt-0"
                  />
                  <div>
                    <span className="text-xs font-medium text-white">
                      {isIt ? 'Invia automaticamente le variazioni di giacenza' : 'Auto-push stock level changes'}
                    </span>
                    <p className="text-[10px] sm:text-[11px] text-neutral-500">
                      {isIt
                        ? 'Aggiorna WooCommerce automaticamente ad ogni movimento o vendita.'
                        : 'Automatically update WooCommerce whenever stock moves or orders are placed.'}
                    </p>
                  </div>
                </label>

                <label className="flex items-start sm:items-center gap-2.5 sm:gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(settings.auto_sync_price)}
                    onChange={(e) => setSettings({ ...settings, auto_sync_price: e.target.checked })}
                    className="rounded border-neutral-700 bg-neutral-900 text-violet-600 focus:ring-0 w-4 h-4 mt-0.5 sm:mt-0"
                  />
                  <div>
                    <span className="text-xs font-medium text-white">
                      {isIt ? 'Invia automaticamente le modifiche di prezzo' : 'Auto-push price changes'}
                    </span>
                    <p className="text-[10px] sm:text-[11px] text-neutral-500">
                      {isIt
                        ? `Quando aggiorni un prezzo in ${BRAND.name}, aggiorna il Regular Price su WooCommerce.`
                        : `When editing a product price in ${BRAND.name}, update the regular price in WooCommerce.`}
                    </p>
                  </div>
                </label>

                <label className="flex items-start sm:items-center gap-2.5 sm:gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(settings.auto_import_orders)}
                    onChange={(e) => setSettings({ ...settings, auto_import_orders: e.target.checked })}
                    className="rounded border-neutral-700 bg-neutral-900 text-violet-600 focus:ring-0 w-4 h-4 mt-0.5 sm:mt-0"
                  />
                  <div>
                    <span className="text-xs font-medium text-white">
                      {isIt ? 'Importa automaticamente i nuovi ordini (Webhook)' : 'Auto-import new orders (Webhook)'}
                    </span>
                    <p className="text-[10px] sm:text-[11px] text-neutral-500">
                      {isIt
                        ? `Crea subito l’ordine in ${BRAND.name} e scala la giacenza quando arriva un ordine su WooCommerce.`
                        : `Create orders in ${BRAND.name} and deduct stock immediately when an order is placed on WooCommerce.`}
                    </p>
                  </div>
                </label>
              </div>

              {/* Submit Buttons */}
              <div className="flex items-center gap-2.5 sm:gap-3 pt-4 border-t border-neutral-800">
                <Button
                  type="submit"
                  variant="primary"
                  disabled={isSavingSettings}
                  className="bg-violet-600 hover:bg-violet-500 text-white text-xs sm:text-sm flex-1 sm:flex-initial justify-center h-8 sm:h-9"
                >
                  {isSavingSettings
                    ? isIt ? 'Salvataggio...' : 'Saving...'
                    : isIt ? 'Salva impostazioni' : 'Save Settings'}
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  onClick={handleTestConnection}
                  disabled={isTesting || !settings.site_url}
                  className="text-xs sm:text-sm border-neutral-700 hover:bg-neutral-800 flex-1 sm:flex-initial justify-center h-8 sm:h-9"
                >
                  {isTesting
                    ? isIt ? 'Verifica...' : 'Testing...'
                    : isIt ? 'Testa connessione' : 'Test Connection'}
                </Button>
              </div>
            </form>
          </Card>

          {/* Webhook Configuration Card */}
          <Card className="p-4 sm:p-6 bg-neutral-900/60 border-neutral-800">
            <h2 className="text-sm sm:text-base font-bold text-white mb-2 flex items-center gap-2">
              <ExternalLink className="w-4 h-4 text-emerald-400" />
              {isIt ? 'Configurazione Webhook ordini in tempo reale' : 'Real-Time Order Webhook Setup'}
            </h2>
            <p className="text-[11px] sm:text-xs text-neutral-400 leading-relaxed">
              {isIt
                ? `Per ricevere istantaneamente gli ordini WooCommerce in ${BRAND.name} non appena vengono effettuati, copia l’URL qui sotto in WordPress:`
                : `To record WooCommerce orders in ${BRAND.name} instantly as soon as they are placed, copy the URL below into WordPress:`}
            </p>

            <div className="mt-3 sm:mt-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <input
                type="text"
                readOnly
                value={webhookUrl}
                dir="ltr"
                className="w-full bg-neutral-950 border border-neutral-800 px-3 py-2 rounded-lg text-xs font-mono text-neutral-300 text-left"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopyWebhook}
                className="shrink-0 border-neutral-700 hover:bg-neutral-800 text-xs text-white justify-center h-8 sm:h-9"
              >
                {copiedWebhook ? <Check className="w-3.5 h-3.5 text-emerald-400 me-1.5" /> : <Copy className="w-3.5 h-3.5 me-1.5" />}
                {copiedWebhook ? (isIt ? 'Copiato' : 'Copied') : isIt ? 'Copia URL' : 'Copy URL'}
              </Button>
            </div>

            <div className="mt-3 sm:mt-4 p-3 rounded-lg bg-neutral-950 border border-neutral-800 text-[11px] sm:text-xs text-neutral-400 space-y-1">
              <span className="font-semibold text-neutral-300">
                {isIt ? 'Passaggi in WordPress:' : 'Steps in WordPress:'}
              </span>
              <p>
                {isIt
                  ? '1. Vai su WooCommerce → Impostazioni → Avanzate → Webhook → Aggiungi webhook'
                  : '1. Go to WooCommerce → Settings → Advanced → Webhooks → Add webhook'}
              </p>
              <p>
                {isIt ? '2. Imposta lo stato su ' : '2. Set Status to '}
                <strong>{isIt ? 'Attivo (Active)' : 'Active'}</strong>.
              </p>
              <p>
                {isIt ? '3. Seleziona Topic: ' : '3. Set Topic to '}
                <strong>{isIt ? 'Ordine creato (Order created)' : 'Order created'}</strong>.
              </p>
              <p>
                {isIt
                  ? '4. Incolla l’URL sopra nel campo Delivery URL e salva.'
                  : '4. Paste the URL above into Delivery URL and save.'}
              </p>
            </div>
          </Card>
        </div>
      )}

      {/* Tab 3: SKU Mappings */}
      {activeTab === 'mappings' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-sm sm:text-base font-bold text-white">
                {isIt ? 'Mappatura prodotti e SKU' : 'Product & SKU Mapping'}
              </h2>
              <p className="text-[11px] sm:text-xs text-neutral-400">
                {isIt
                  ? `Ogni variante con codice SKU in ${BRAND.name} viene abbinata al prodotto corrispondente su WooCommerce.`
                  : `Every variant with an SKU in ${BRAND.name} is automatically matched to its corresponding WooCommerce product.`}
              </p>
            </div>

            <div className="w-full sm:w-72">
              <Input
                placeholder={isIt ? 'Cerca per nome o SKU...' : 'Search by title or SKU...'}
                value={searchMapping}
                onChange={(e) => setSearchMapping(e.target.value)}
                className="bg-neutral-900 border-neutral-800 text-xs sm:text-sm h-8 sm:h-9"
              />
            </div>
          </div>

          <Card className="bg-neutral-900/60 border-neutral-800 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-start">
                <thead className="bg-neutral-950 border-b border-neutral-800 text-neutral-400">
                  <tr>
                    <th className="py-2.5 sm:py-3 px-3 sm:px-4">ID</th>
                    <th className="py-2.5 sm:py-3 px-3 sm:px-4">{isIt ? 'Prodotto / Variante' : 'Product & Variant'}</th>
                    <th className="py-2.5 sm:py-3 px-3 sm:px-4">SKU</th>
                    <th className="py-2.5 sm:py-3 px-3 sm:px-4">{isIt ? 'Barcode' : 'Barcode'}</th>
                    <th className="py-2.5 sm:py-3 px-3 sm:px-4">{isIt ? 'Stato mappatura' : 'Sync Readiness'}</th>
                    <th className="py-2.5 sm:py-3 px-3 sm:px-4">{isIt ? `Prezzo in ${BRAND.name}` : `${BRAND.name} Price`}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800/60 text-neutral-300">
                  {filteredVariants.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-neutral-500">
                        {isIt ? 'Nessun prodotto trovato.' : 'No products found.'}
                      </td>
                    </tr>
                  ) : (
                    filteredVariants.map((v) => {
                      const sku = (v.sku || v.barcode || '').trim();
                      const hasSku = Boolean(sku);

                      return (
                        <tr key={v.id} className="hover:bg-neutral-800/30 transition-colors">
                          <td className="py-2.5 sm:py-3 px-3 sm:px-4 text-neutral-500 font-mono">#{v.id}</td>
                          <td className="py-2.5 sm:py-3 px-3 sm:px-4 font-medium text-white">
                            {v.product_title || v.sku || `${isIt ? 'Variante' : 'Variant'} #${v.id}`}
                          </td>
                          <td className="py-2.5 sm:py-3 px-3 sm:px-4 font-mono text-neutral-300" dir="ltr">
                            {v.sku || <span className="text-neutral-600">-</span>}
                          </td>
                          <td className="py-2.5 sm:py-3 px-3 sm:px-4 font-mono text-neutral-400" dir="ltr">
                            {v.barcode || <span className="text-neutral-600">-</span>}
                          </td>
                          <td className="py-2.5 sm:py-3 px-3 sm:px-4">
                            {hasSku ? (
                              <Badge variant="success" className="text-[10px]">
                                <CheckCircle2 className="w-3 h-3 me-1" />
                                {isIt ? 'Pronto per SKU sync' : 'SKU Sync Ready'}
                              </Badge>
                            ) : (
                              <Badge variant="warning" className="text-[10px]">
                                {isIt ? 'SKU mancante' : 'Missing SKU'}
                              </Badge>
                            )}
                          </td>
                          <td className="py-2.5 sm:py-3 px-3 sm:px-4 text-neutral-300 font-mono">
                            {v.price ? formatCurrency(Number(v.price), activeCurrency) : '-'}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* Tab 4: Logs */}
      {activeTab === 'logs' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 sm:gap-3">
            <div>
              <h2 className="text-sm sm:text-base font-bold text-white">
                {isIt ? 'Log eventi di sincronizzazione' : 'Sync Logs & Events'}
              </h2>
              <p className="text-[11px] sm:text-xs text-neutral-400">
                {isIt
                  ? 'Cronologia di sincronizzazioni giacenze, prezzi e importazioni ordini da WooCommerce'
                  : 'History of stock pushes, price updates, and order imports with WooCommerce'}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={loadData}
              icon={<RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />}
              className="text-xs border-neutral-700 hover:bg-neutral-800 cursor-pointer h-8 sm:h-9"
            >
              {isIt ? 'Aggiorna log' : 'Refresh Logs'}
            </Button>
          </div>

          <Card className="bg-neutral-900/60 border-neutral-800 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-start">
                <thead className="bg-neutral-950 border-b border-neutral-800 text-neutral-400">
                  <tr>
                    <th className="py-2.5 sm:py-3 px-3 sm:px-4">{isIt ? 'Data e ora' : 'Timestamp'}</th>
                    <th className="py-2.5 sm:py-3 px-3 sm:px-4">{isIt ? 'Operazione' : 'Action'}</th>
                    <th className="py-2.5 sm:py-3 px-3 sm:px-4">{isIt ? 'Direzione' : 'Direction'}</th>
                    <th className="py-2.5 sm:py-3 px-3 sm:px-4">{isIt ? 'Stato' : 'Status'}</th>
                    <th className="py-2.5 sm:py-3 px-3 sm:px-4">{isIt ? 'Dettagli' : 'Details'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800/60 text-neutral-300">
                  {logs.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-neutral-500">
                        {isIt ? 'Nessun evento WooCommerce registrato finora.' : 'No WooCommerce sync events recorded yet.'}
                      </td>
                    </tr>
                  ) : (
                    logs.map((log) => {
                      const isSuccess = log.status === 'success' || log.status === 'info';
                      return (
                        <tr key={log.id} className="hover:bg-neutral-800/30 transition-colors">
                          <td className="py-2.5 sm:py-3 px-3 sm:px-4 text-neutral-400 whitespace-nowrap font-mono">
                            {formatDate(log.date_created)}
                          </td>
                          <td className="py-2.5 sm:py-3 px-3 sm:px-4 font-medium text-white whitespace-nowrap">
                            {log.action === 'sync_stock' && (isIt ? 'Sync giacenze' : 'Stock Sync')}
                            {log.action === 'sync_prices' && (isIt ? 'Sync prezzi' : 'Price Sync')}
                            {log.action === 'import_orders' && (isIt ? 'Importazione ordini' : 'Order Import')}
                            {log.action === 'webhook_order' && (isIt ? 'Webhook ordine' : 'Order Webhook')}
                            {log.action === 'test_connection' && (isIt ? 'Test connessione' : 'Connection Test')}
                            {!['sync_stock', 'sync_prices', 'import_orders', 'webhook_order', 'test_connection'].includes(log.action) && log.action}
                          </td>
                          <td className="py-2.5 sm:py-3 px-3 sm:px-4 whitespace-nowrap">
                            {log.direction === 'inbound' ? (
                              <span className="flex items-center gap-1 text-violet-400">
                                <ArrowDownLeft className="w-3.5 h-3.5" />
                                {isIt ? `In ingresso su ${BRAND.name}` : `Inbound to ${BRAND.name}`}
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 text-blue-400">
                                <ArrowUpRight className="w-3.5 h-3.5" />
                                {isIt ? 'In uscita su WooCommerce' : 'Outbound to WooCommerce'}
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 sm:py-3 px-3 sm:px-4 whitespace-nowrap">
                            <Badge variant={isSuccess ? 'success' : 'error'} className="text-[10px]">
                              {isSuccess ? (isIt ? 'Riuscito' : 'Success') : isIt ? 'Errore' : 'Error'}
                            </Badge>
                          </td>
                          <td className="py-2.5 sm:py-3 px-3 sm:px-4 text-neutral-300 leading-relaxed">
                            {log.message}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};
