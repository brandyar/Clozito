import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  FileText,
  Cookie,
  Download,
  FileSpreadsheet,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  Server,
  Lock,
  Eye,
  EyeOff,
  Globe,
  ExternalLink,
} from 'lucide-react';
import { useTranslation } from '../../i18n';
import { useOrganization } from '../../context/OrganizationContext';
import { useAuth } from '../../context/AuthContext';
import { storageManager } from '../../storage';
import { directusClient } from '../../api/directus';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { LegalModal } from '../legal/LegalDocumentView';
import { LegalDocType } from '../legal/legalContent';
import {
  getCookieConsent,
  saveCookieConsent,
  CookieConsentState,
} from '../../components/ui/CookieConsentBanner';
import { BRAND } from '../../config/brand';

function neutralizeCsvCell(raw: unknown): string {
  if (raw === null || raw === undefined) return '';
  let str = typeof raw === 'object' ? JSON.stringify(raw) : String(raw);
  // Prevent CSV / Excel formula injection
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function buildCsvString(headers: string[], rows: unknown[][]): string {
  const headerLine = headers.map(neutralizeCsvCell).join(',');
  const dataLines = rows.map((row) => row.map(neutralizeCsvCell).join(','));
  // UTF-8 BOM ensures Italian accents and Euro symbols open cleanly in Excel
  return `\uFEFF${[headerLine, ...dataLines].join('\r\n')}`;
}

function triggerFileDownload(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const PrivacyGdprCard: React.FC = () => {
  const { t, locale } = useTranslation();
  const { activeOrganization, isOwner } = useOrganization();
  const { user, isCloudAuthenticated, logout } = useAuth();

  const [legalModalDoc, setLegalModalDoc] = useState<LegalDocType | null>(null);
  const [cookieConsent, setCookieConsent] = useState<CookieConsentState | null>(() => getCookieConsent());

  // Export states
  const [isExportingJson, setIsExportingJson] = useState(false);
  const [exportingCsvKey, setExportingCsvKey] = useState<string | null>(null);
  const [exportMessage, setExportMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Right to Erasure modal state
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [showDeletePassword, setShowDeletePassword] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleteOwnedWorkspaces, setDeleteOwnedWorkspaces] = useState(true);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    const handleConsentUpdate = () => setCookieConsent(getCookieConsent());
    window.addEventListener('clozito:cookie-consent-updated', handleConsentUpdate);
    return () => window.removeEventListener('clozito:cookie-consent-updated', handleConsentUpdate);
  }, []);

  // Resolve consent acceptance timestamp (from org record or local cache)
  const resolvedConsentDate = (() => {
    if (activeOrganization?.terms_accepted_at) return activeOrganization.terms_accepted_at;
    if (typeof window !== 'undefined' && activeOrganization?.id) {
      try {
        const cached = localStorage.getItem(`clozito_gdpr_consent_${activeOrganization.id}`);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (parsed?.terms_accepted_at) return parsed.terms_accepted_at as string;
        }
      } catch {
        // Ignore malformed cache
      }
    }
    return activeOrganization?.date_created || null;
  })();

  const formatDateDisplay = (iso?: string | null) => {
    if (!iso) return '—';
    try {
      return new Intl.DateTimeFormat(locale === 'it' ? 'it-IT' : 'en-GB', {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(iso));
    } catch {
      return iso;
    }
  };

  const handleToggleOptionalCookies = () => {
    const nextPref = !(cookieConsent?.preferences ?? false);
    const saved = saveCookieConsent(nextPref);
    setCookieConsent(saved);
  };

  // GDPR Art. 20 — Complete JSON Archive
  const handleDownloadJsonArchive = async () => {
    setIsExportingJson(true);
    setExportMessage(null);
    try {
      let archive: any = null;

      if (isCloudAuthenticated) {
        try {
          archive = await directusClient.exportGdprData(activeOrganization?.id);
        } catch (cloudErr: any) {
          console.warn('[GDPR Export] Cloud export fallback to storageManager:', cloudErr?.message);
        }
      }

      if (!archive) {
        const adapter = storageManager.getAdapter();
        const orgParams = activeOrganization?.id ? { organization_id: activeOrganization.id } : undefined;
        const [
          products,
          variants,
          categories,
          brands,
          collections,
          customers,
          orders,
          suppliers,
          purchaseOrders,
          warehouses,
          inventoryItems,
          sizeGuides,
        ] = await Promise.all([
          adapter.getProducts(orgParams).catch(() => []),
          adapter.getVariants(orgParams).catch(() => []),
          adapter.getCategories(orgParams).catch(() => []),
          adapter.getBrands(orgParams).catch(() => []),
          adapter.getCollections(orgParams).catch(() => []),
          adapter.getCustomers(orgParams).catch(() => []),
          adapter.getOrders(orgParams).catch(() => []),
          adapter.getSuppliers(orgParams).catch(() => []),
          adapter.getPurchaseOrders(orgParams).catch(() => []),
          adapter.getWarehouses(orgParams).catch(() => []),
          adapter.getInventoryItems(orgParams).catch(() => []),
          adapter.getSizeGuideTemplates(orgParams).catch(() => []),
        ]);

        archive = {
          schema: 'clozito-gdpr-export-v1',
          regulation: 'Regulation (EU) 2016/679 (GDPR) — Article 20 Data Portability',
          exported_at: new Date().toISOString(),
          user: user
            ? {
                id: user.id,
                email: user.email,
                first_name: user.first_name || '',
                last_name: user.last_name || '',
                role: typeof user.role === 'object' ? user.role?.name : user.role,
              }
            : null,
          organization: activeOrganization || null,
          counts: {
            products: products.length,
            product_variants: variants.length,
            categories: categories.length,
            brands: brands.length,
            collections: collections.length,
            customers: customers.length,
            orders: orders.length,
            suppliers: suppliers.length,
            purchase_orders: purchaseOrders.length,
            warehouses: warehouses.length,
            inventory_items: inventoryItems.length,
            size_guide_templates: sizeGuides.length,
          },
          collections: {
            products,
            product_variants: variants,
            categories,
            brands,
            collections,
            customers,
            orders,
            suppliers,
            purchase_orders: purchaseOrders,
            warehouses,
            inventory_items: inventoryItems,
            size_guide_templates: sizeGuides,
          },
        };
      }

      const slug = (activeOrganization?.slug || 'workspace').replace(/[^a-z0-9-_]/gi, '-');
      const dateStr = new Date().toISOString().slice(0, 10);
      triggerFileDownload(
        JSON.stringify(archive, null, 2),
        `clozito-gdpr-export-${slug}-${dateStr}.json`,
        'application/json;charset=utf-8'
      );

      setExportMessage({
        type: 'success',
        text: t('settings.gdprExportSuccess', 'Your complete GDPR JSON archive has been downloaded.'),
      });
    } catch (err: any) {
      setExportMessage({
        type: 'error',
        text: err?.message || t('settings.gdprExportError', 'Failed to export data archive.'),
      });
    } finally {
      setIsExportingJson(false);
    }
  };

  // GDPR Art. 20 — Individual CSV Collection Exports
  const handleDownloadCsv = async (target: 'products' | 'customers' | 'orders' | 'inventory') => {
    setExportingCsvKey(target);
    setExportMessage(null);
    const slug = (activeOrganization?.slug || 'workspace').replace(/[^a-z0-9-_]/gi, '-');
    const dateStr = new Date().toISOString().slice(0, 10);

    try {
      const adapter = storageManager.getAdapter();
      const orgParams = activeOrganization?.id ? { organization_id: activeOrganization.id } : undefined;
      let csv = '';
      if (target === 'products') {
        const [products, variants] = await Promise.all([
          adapter.getProducts(orgParams).catch(() => []),
          adapter.getVariants(orgParams).catch(() => []),
        ]);
        const prodMap = new Map<number, any>(products.map((p: any): [number, any] => [Number(p.id), p]));
        csv = buildCsvString(
          ['Product ID', 'Product Name', 'Variant ID', 'SKU', 'Barcode', 'Sale Price', 'Cost Price', 'Status'],
          variants.map((v: any) => {
            const pId = typeof v.product_id === 'object' ? v.product_id?.id : v.product_id;
            const prod = prodMap.get(Number(pId));
            return [
              pId ?? '',
              prod?.name || v.product_name || '',
              v.id ?? '',
              v.sku || '',
              v.barcode || '',
              v.sale_price ?? v.price ?? '',
              v.cost_price ?? '',
              v.status || '',
            ];
          })
        );
      } else if (target === 'customers') {
        const customers = await adapter.getCustomers(orgParams).catch(() => []);
        csv = buildCsvString(
          ['ID', 'Name', 'Email', 'Phone', 'VAT Number', 'Tax Code', 'City', 'Address', 'Created At'],
          customers.map((c: any) => [
            c.id ?? '',
            c.name || `${c.first_name || ''} ${c.last_name || ''}`.trim(),
            c.email || '',
            c.phone || c.mobile || '',
            c.vat_number || '',
            c.tax_code || '',
            c.city || '',
            c.address || '',
            c.date_created || '',
          ])
        );
      } else if (target === 'orders') {
        const orders = await adapter.getOrders(orgParams).catch(() => []);
        csv = buildCsvString(
          ['Order ID', 'Order Number', 'Status', 'Payment Status', 'Currency', 'Subtotal', 'Tax', 'Total', 'Date'],
          orders.map((o: any) => [
            o.id ?? '',
            o.order_number || '',
            o.status || '',
            o.payment_status || '',
            o.currency || activeOrganization?.currency || BRAND.defaultCurrency,
            o.subtotal ?? '',
            o.tax_amount ?? '',
            o.total_amount ?? '',
            o.order_date || o.date_created || '',
          ])
        );
      } else if (target === 'inventory') {
        const items = await adapter.getInventoryItems(orgParams).catch(() => []);
        csv = buildCsvString(
          ['Inventory ID', 'Variant ID', 'Warehouse ID', 'Quantity On Hand', 'Reserved', 'Reorder Point'],
          items.map((i: any) => [
            i.id ?? '',
            typeof i.variant_id === 'object' ? i.variant_id?.id : i.variant_id ?? '',
            typeof i.warehouse_id === 'object' ? i.warehouse_id?.id : i.warehouse_id ?? '',
            i.quantity_on_hand ?? 0,
            i.quantity_reserved ?? 0,
            i.reorder_point ?? 0,
          ])
        );
      }

      triggerFileDownload(csv, `clozito-${target}-${slug}-${dateStr}.csv`, 'text/csv;charset=utf-8');
      setExportMessage({
        type: 'success',
        text: t('settings.gdprCsvSuccess', 'CSV file exported successfully.'),
      });
    } catch (err: any) {
      setExportMessage({
        type: 'error',
        text: err?.message || t('settings.gdprExportError', 'Failed to export CSV data.'),
      });
    } finally {
      setExportingCsvKey(null);
    }
  };

  // GDPR Art. 17 — Right to Erasure
  const handleConfirmAccountDeletion = async (e: React.FormEvent) => {
    e.preventDefault();
    setDeleteError(null);

    if (deleteConfirmText.trim().toUpperCase() !== 'DELETE') {
      setDeleteError(t('settings.gdprDeleteTypeError', 'Please type DELETE in uppercase to confirm.'));
      return;
    }

    if (isCloudAuthenticated && !deletePassword.trim()) {
      setDeleteError(t('settings.gdprDeletePasswordRequired', 'Please enter your current password to verify your identity.'));
      return;
    }

    setIsDeletingAccount(true);
    try {
      if (isCloudAuthenticated) {
        await directusClient.deleteUserAccount({
          password: deletePassword,
          confirmText: deleteConfirmText.trim().toUpperCase(),
          deleteOwnedWorkspaces,
          locale: locale === 'it' ? 'it' : 'en',
        });
      }

      // Wipe local storage / SQLite data on this device
      try {
        const localAdapter: any = storageManager.getLocalAdapter();
        if (typeof localAdapter?.clearAllData === 'function') {
          await localAdapter.clearAllData();
        }
      } catch {
        // Non-blocking local wipe
      }

      if (typeof window !== 'undefined' && activeOrganization?.id) {
        localStorage.removeItem(`clozito_gdpr_consent_${activeOrganization.id}`);
      }

      setIsDeleteModalOpen(false);
      await logout();
    } catch (err: any) {
      setDeleteError(err?.message || t('settings.gdprDeleteFailed', 'Could not delete account. Please verify your password and try again.'));
    } finally {
      setIsDeletingAccount(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* 1. Legal Documents & Consent Record */}
      <Card
        title={t('settings.gdprLegalTitle', 'Legal Documents & Consent Record')}
        subtitle={t(
          'settings.gdprLegalSubtitle',
          'Review our EU/GDPR legal policies, consent timestamp, and cookie storage preferences'
        )}
      >
        <div className="space-y-4">
          {/* Consent Status Banner */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-200/80 dark:border-emerald-900/60">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-bold text-emerald-900 dark:text-emerald-200">
                  {t('settings.gdprConsentRecorded', 'Terms of Service & Privacy Policy Accepted')}
                </p>
                <p className="text-[11px] text-emerald-800/80 dark:text-emerald-300/80 mt-0.5">
                  {t('settings.gdprConsentDateLabel', 'Recorded timestamp:')}{' '}
                  <span className="font-mono font-semibold">{formatDateDisplay(resolvedConsentDate)}</span>
                </p>
              </div>
            </div>
            <Badge variant="success">GDPR (EU) 2016/679</Badge>
          </div>

          {/* Policy Viewer Buttons */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              {
                doc: 'terms' as LegalDocType,
                icon: FileText,
                label: t('settings.termsOfService', 'Terms of Service'),
                path: '/legal/terms',
              },
              {
                doc: 'privacy' as LegalDocType,
                icon: ShieldCheck,
                label: t('settings.privacyPolicy', 'Privacy Policy (GDPR)'),
                path: '/legal/privacy',
              },
              {
                doc: 'cookies' as LegalDocType,
                icon: Cookie,
                label: t('settings.cookiePolicyLink', 'Cookie Policy'),
                path: '/legal/cookies',
              },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.doc}
                  className="p-3.5 rounded-xl border border-neutral-200/80 dark:border-neutral-800 bg-neutral-50/70 dark:bg-[#181a20] flex flex-col justify-between gap-3"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
                      <Icon className="w-4 h-4" />
                    </div>
                    <span className="text-xs font-bold text-neutral-900 dark:text-neutral-100">
                      {item.label}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => setLegalModalDoc(item.doc)}
                      className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                    >
                      {t('settings.readDocument', 'Read Document')}
                    </button>
                    <a
                      href={item.path}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
                      title={item.path}
                    >
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Cookie Preferences Control */}
          <div className="p-4 rounded-xl border border-neutral-200/80 dark:border-neutral-800 bg-white dark:bg-[#14161c] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Cookie className="w-4 h-4 text-amber-500" />
                <span className="text-xs font-bold text-neutral-900 dark:text-neutral-100">
                  {t('settings.cookiePrefsTitle', 'Cookie & Browser Storage Preferences')}
                </span>
              </div>
              <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                {t(
                  'settings.cookiePrefsDesc',
                  'Strictly necessary storage (authentication, language, workspace context) is always active. Toggle optional UI convenience preferences below.'
                )}
              </p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <span className="text-[11px] font-semibold text-neutral-600 dark:text-neutral-300">
                {cookieConsent?.preferences
                  ? t('settings.cookieOptionalOn', 'Optional: Enabled')
                  : t('settings.cookieOptionalOff', 'Essential Only')}
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={Boolean(cookieConsent?.preferences)}
                onClick={handleToggleOptionalCookies}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer ${
                  cookieConsent?.preferences ? 'bg-blue-600' : 'bg-neutral-300 dark:bg-neutral-700'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    cookieConsent?.preferences ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>
        </div>
      </Card>

      {/* 2. GDPR Art. 20 — Data Portability */}
      <Card
        title={t('settings.gdprPortabilityTitle', 'Data Portability (GDPR Art. 20)')}
        subtitle={t(
          'settings.gdprPortabilitySubtitle',
          'Download a complete machine-readable copy of your account and organization records anytime'
        )}
      >
        <div className="space-y-4">
          {exportMessage && (
            <div
              className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
                exportMessage.type === 'success'
                  ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                  : 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300'
              }`}
            >
              {exportMessage.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 shrink-0" />
              )}
              <span>{exportMessage.text}</span>
            </div>
          )}

          {/* Full JSON Export */}
          <div className="p-4 rounded-xl bg-neutral-50 dark:bg-[#181a20] border border-neutral-200/80 dark:border-neutral-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <h4 className="text-xs font-bold text-neutral-900 dark:text-neutral-100">
                {t('settings.gdprFullJsonTitle', 'Complete Account & Workspace Archive (JSON)')}
              </h4>
              <p className="text-[11px] text-neutral-500 dark:text-neutral-400 leading-relaxed max-w-xl">
                {t(
                  'settings.gdprFullJsonDesc',
                  'Exports your user profile, organization details, products, variants, customers, sales orders, suppliers, warehouses, inventory, expenses, and size guides in standard JSON.'
                )}
              </p>
            </div>
            <Button
              variant="primary"
              size="sm"
              onClick={handleDownloadJsonArchive}
              isLoading={isExportingJson}
              icon={<Download className="w-4 h-4" />}
              className="text-xs font-bold shrink-0"
            >
              {t('settings.gdprDownloadJsonBtn', 'Download Full JSON')}
            </Button>
          </div>

          {/* Quick CSV Exports */}
          <div className="space-y-2">
            <p className="text-[11px] font-bold text-neutral-600 dark:text-neutral-400">
              {t('settings.gdprCsvQuickTitle', 'Individual Collection Exports (UTF-8 CSV):')}
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {(
                [
                  { key: 'products', label: t('settings.backupProducts', 'Products') },
                  { key: 'customers', label: t('settings.backupCustomers', 'Customers') },
                  { key: 'orders', label: t('settings.backupOrders', 'Orders') },
                  { key: 'inventory', label: t('settings.backupInventory', 'Inventory') },
                ] as const
              ).map((item) => (
                <Button
                  key={item.key}
                  variant="outline"
                  size="sm"
                  onClick={() => handleDownloadCsv(item.key)}
                  isLoading={exportingCsvKey === item.key}
                  icon={<FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />}
                  className="text-xs font-semibold justify-center"
                >
                  {item.label} (.csv)
                </Button>
              ))}
            </div>
          </div>
        </div>
      </Card>

      {/* 3. EU Data Residency & Security Transparency */}
      <Card
        title={t('settings.gdprHostingTitle', 'EU Data Hosting & Processing Transparency')}
        subtitle={t(
          'settings.gdprHostingSubtitle',
          'Infrastructure safeguards and sub-processor summary under GDPR Articles 28 & 44–49'
        )}
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="p-3.5 rounded-xl bg-neutral-50 dark:bg-[#181a20] border border-neutral-200/80 dark:border-neutral-800 space-y-1.5">
            <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
              <Server className="w-4 h-4" />
              <span className="text-xs font-bold text-neutral-900 dark:text-neutral-100">
                {t('settings.gdprEuResidencyTitle', 'EU / EEA Infrastructure')}
              </span>
            </div>
            <p className="text-[11px] text-neutral-500 dark:text-neutral-400 leading-relaxed">
              {t(
                'settings.gdprEuResidencyDesc',
                'Cloud API, database storage, and backups are engineered for European Union hosting with strict multi-tenant organization isolation.'
              )}
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-neutral-50 dark:bg-[#181a20] border border-neutral-200/80 dark:border-neutral-800 space-y-1.5">
            <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
              <Lock className="w-4 h-4" />
              <span className="text-xs font-bold text-neutral-900 dark:text-neutral-100">
                {t('settings.gdprEncryptionTitle', 'TLS Encryption & Isolation')}
              </span>
            </div>
            <p className="text-[11px] text-neutral-500 dark:text-neutral-400 leading-relaxed">
              {t(
                'settings.gdprEncryptionDesc',
                'All cloud traffic is encrypted in transit via HTTPS/TLS. Every database query is strictly scoped to your verified organization boundary.'
              )}
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-neutral-50 dark:bg-[#181a20] border border-neutral-200/80 dark:border-neutral-800 space-y-1.5">
            <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400">
              <Globe className="w-4 h-4" />
              <span className="text-xs font-bold text-neutral-900 dark:text-neutral-100">
                {t('settings.gdprSubprocessorsTitle', 'Payment Sub-processor')}
              </span>
            </div>
            <p className="text-[11px] text-neutral-500 dark:text-neutral-400 leading-relaxed">
              {t(
                'settings.gdprSubprocessorsDesc',
                'EUR billing and EU VAT invoices are processed by Stripe Payments Europe, Ltd. (PCI-DSS Level 1). Card numbers are never stored on our servers.'
              )}
            </p>
          </div>
        </div>
      </Card>

      {/* 4. GDPR Art. 17 — Right to Erasure (Danger Zone) */}
      <Card
        title={t('settings.gdprErasureTitle', 'Right to Erasure — Delete Account (GDPR Art. 17)')}
        subtitle={t(
          'settings.gdprErasureSubtitle',
          'Permanently erase your personal account and sole-owned workspace data'
        )}
      >
        <div className="p-4 rounded-xl bg-rose-50/80 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/60 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <h4 className="text-xs font-bold text-rose-900 dark:text-rose-200">
                {t('settings.gdprErasureWarningTitle', 'Permanent & Irreversible Action')}
              </h4>
              <p className="text-[11px] text-rose-800/80 dark:text-rose-300/80 leading-relaxed max-w-xl">
                {t(
                  'settings.gdprErasureWarningDesc',
                  'Deleting your account permanently removes your profile, terminates your sessions, cancels active Pro subscriptions for sole-owned organizations, and erases associated workspace records. Download a JSON/CSV export first if you need a copy.'
                )}
              </p>
            </div>
          </div>

          <Button
            variant="danger"
            size="sm"
            onClick={() => {
              setDeletePassword('');
              setDeleteConfirmText('');
              setDeleteError(null);
              setIsDeleteModalOpen(true);
            }}
            icon={<Trash2 className="w-4 h-4" />}
            className="text-xs font-bold shrink-0"
          >
            {t('settings.gdprDeleteAccountBtn', 'Delete My Account')}
          </Button>
        </div>
      </Card>

      {/* Legal Policy Modal */}
      <LegalModal
        isOpen={legalModalDoc !== null}
        initialDoc={legalModalDoc || 'privacy'}
        onClose={() => setLegalModalDoc(null)}
      />

      {/* Right to Erasure Confirmation Modal */}
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => !isDeletingAccount && setIsDeleteModalOpen(false)}
        title={t('settings.gdprDeleteModalTitle', 'Confirm Permanent Account Erasure')}
        maxWidth="max-w-md"
      >
        <form onSubmit={handleConfirmAccountDeletion} className="space-y-4">
          <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/70 text-xs text-rose-800 dark:text-rose-300 space-y-1.5">
            <p className="font-bold flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{t('settings.gdprDeleteModalBanner', 'This action cannot be undone.')}</span>
            </p>
            <p className="text-[11px] leading-relaxed">
              {t(
                'settings.gdprDeleteModalDesc',
                'Your user credentials and personal profile will be permanently erased under GDPR Art. 17. Any active Stripe subscription for organizations where you are the sole owner will be canceled automatically.'
              )}
            </p>
          </div>

          {deleteError && (
            <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-xs text-red-700 dark:text-red-300 font-medium">
              {deleteError}
            </div>
          )}

          {isOwner && (
            <label className="flex items-start gap-2.5 p-3 rounded-xl bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 cursor-pointer">
              <input
                type="checkbox"
                checked={deleteOwnedWorkspaces}
                onChange={(e) => setDeleteOwnedWorkspaces(e.target.checked)}
                className="mt-0.5 rounded border-neutral-300 text-rose-600 focus:ring-rose-500 cursor-pointer"
              />
              <span className="text-[11px] text-neutral-700 dark:text-neutral-300 leading-relaxed">
                {t(
                  'settings.gdprDeleteOwnedOrgsCheckbox',
                  'Also permanently erase all workspace data for organizations where I am the sole Owner.'
                )}
              </span>
            </label>
          )}

          {isCloudAuthenticated && (
            <div>
              <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                {t('settings.gdprCurrentPasswordLabel', 'Current Account Password')}{' '}
                <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type={showDeletePassword ? 'text' : 'password'}
                  required
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full ps-3 pe-10 py-2 bg-white dark:bg-[#181a20] border border-neutral-200 dark:border-neutral-700 rounded-lg text-xs font-mono text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
                <button
                  type="button"
                  onClick={() => setShowDeletePassword(!showDeletePassword)}
                  className="absolute inset-y-0 end-0 pe-3 flex items-center text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 cursor-pointer"
                >
                  {showDeletePassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
              {t('settings.gdprTypeDeleteLabel', 'Type DELETE to confirm')}{' '}
              <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder="DELETE"
              className="w-full px-3 py-2 bg-white dark:bg-[#181a20] border border-neutral-200 dark:border-neutral-700 rounded-lg text-xs font-mono uppercase text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-rose-500"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-200 dark:border-neutral-800">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isDeletingAccount}
              onClick={() => setIsDeleteModalOpen(false)}
            >
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button
              type="submit"
              variant="danger"
              size="sm"
              isLoading={isDeletingAccount}
              disabled={deleteConfirmText.trim().toUpperCase() !== 'DELETE'}
              icon={<Trash2 className="w-3.5 h-3.5" />}
            >
              {t('settings.gdprConfirmEraseBtn', 'Permanently Erase Account')}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
