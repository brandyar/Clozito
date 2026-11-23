import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from '../../i18n';
import { useOrganization } from '../../context/OrganizationContext';
import { storageManager } from '../../storage';
import { Order, PurchaseOrder, Customer, Supplier } from '../../types';
import { EU_VAT_PRESETS, BRAND } from '../../config/brand';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Select } from '../../components/ui/Select';
import { Badge } from '../../components/ui/Badge';
import { formatCurrency, formatDate, resolveCurrencyCode } from '../../utils/formatters';
import { printElement } from '../../utils/print';
import {
  FileText,
  Printer,
  Calendar,
  ArrowDownLeft,
  ArrowUpRight,
  TrendingDown,
  TrendingUp,
  RefreshCw,
  ShieldCheck,
  Percent,
} from 'lucide-react';

export const TaxReportsPage: React.FC = () => {
  const { t, locale } = useTranslation();
  const { activeOrganization } = useOrganization();
  const isIt = locale === 'it';
  const currency = resolveCurrencyCode(activeOrganization?.currency);

  const currentYear = new Date().getFullYear();
  const currentQuarter = (Math.floor(new Date().getMonth() / 3) + 1) as 1 | 2 | 3 | 4;

  const [loading, setLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [selectedQuarter, setSelectedQuarter] = useState<1 | 2 | 3 | 4>(currentQuarter);
  const [vatRate, setVatRate] = useState<number>(BRAND.defaultVatRate);

  const [orders, setOrders] = useState<Order[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [activeTableTab, setActiveTableTab] = useState<'sales' | 'purchases'>('sales');

  const loadData = async () => {
    try {
      setLoading(true);
      const storage = storageManager.getAdapter();
      const orgParams = activeOrganization?.id ? { organization_id: activeOrganization.id } : {};
      const [allOrders, allPos, allCusts, allSups] = await Promise.all([
        storage.getOrders(orgParams),
        storage.getPurchaseOrders(orgParams),
        storage.getCustomers(orgParams),
        storage.getSuppliers(orgParams),
      ]);

      setOrders(allOrders || []);
      setPurchaseOrders(allPos || []);
      setCustomers(allCusts || []);
      setSuppliers(allSups || []);
    } catch (err) {
      console.error('Failed to load VAT report data', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [activeOrganization?.id]);

  // Quarter Gregorian date window
  const quarterRange = useMemo(() => {
    const startMonth = (selectedQuarter - 1) * 3;
    const start = new Date(selectedYear, startMonth, 1).toISOString().slice(0, 10);
    const end = new Date(selectedYear, startMonth + 3, 0).toISOString().slice(0, 10);
    return { start, end };
  }, [selectedYear, selectedQuarter]);

  const periodOrders = useMemo(() => {
    return orders.filter((o) => {
      if (o.status === 'cancelled') return false;
      const d = (o.order_date || o.date_created || '').slice(0, 10);
      if (!d) return false;
      return d >= quarterRange.start && d <= quarterRange.end;
    });
  }, [orders, quarterRange]);

  const periodPurchases = useMemo(() => {
    return purchaseOrders.filter((po) => {
      if (po.status === 'cancelled') return false;
      const d = ((po as any).order_date || po.date_created || '').slice(0, 10);
      if (!d) return false;
      return d >= quarterRange.start && d <= quarterRange.end;
    });
  }, [purchaseOrders, quarterRange]);

  // Compute VAT summary dynamically using configured EU VAT / IVA rate
  const summary = useMemo(() => {
    const divisor = 1 + vatRate / 100;
    let salesTaxable = 0;
    let salesVat = 0;

    periodOrders.forEach((o) => {
      const total = Number(o.total) || 0;
      const explicitTax = o.tax !== undefined && o.tax !== null && Number(o.tax) > 0 ? Number(o.tax) : null;
      const taxable = explicitTax !== null ? Math.max(0, total - explicitTax) : total / divisor;
      const tax = explicitTax !== null ? explicitTax : total - taxable;
      salesTaxable += taxable;
      salesVat += tax;
    });

    let purchasesTaxable = 0;
    let purchasesVat = 0;

    periodPurchases.forEach((po) => {
      const total = Number(po.total) || 0;
      const explicitTax = po.tax !== undefined && po.tax !== null && Number(po.tax) > 0 ? Number(po.tax) : null;
      const taxable = explicitTax !== null ? Math.max(0, total - explicitTax) : total / divisor;
      const tax = explicitTax !== null ? explicitTax : total - taxable;
      purchasesTaxable += taxable;
      purchasesVat += tax;
    });

    return {
      salesTaxable,
      salesVat,
      purchasesTaxable,
      purchasesVat,
      netVatPayable: salesVat - purchasesVat,
    };
  }, [periodOrders, periodPurchases, vatRate]);

  const handlePrint = () => {
    printElement('tax-report-printable-area', {
      title: `VAT_Report_${selectedYear}_Q${selectedQuarter}`,
    });
  };

  const quarterNames: Record<1 | 2 | 3 | 4, string> = {
    1: t('accounting.spring', 'Q1 (Jan – Mar)'),
    2: t('accounting.summer', 'Q2 (Apr – Jun)'),
    3: t('accounting.autumn', 'Q3 (Jul – Sep)'),
    4: t('accounting.winter', 'Q4 (Oct – Dec)'),
  };

  const yearOptions = [currentYear, currentYear - 1, currentYear - 2];

  return (
    <div className="space-y-6">
      {/* Top Filter & Print Controls */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 sm:gap-4 bg-neutral-50 dark:bg-neutral-900/40 p-3.5 sm:p-4 rounded-xl border border-neutral-200/80 dark:border-neutral-800 print:hidden">
        <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-neutral-500" />
            <span className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
              {t('accounting.selectYear')}:
            </span>
            <Select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="w-24 h-9 text-xs"
            >
              {yearOptions.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
              {t('accounting.selectQuarter')}:
            </span>
            <Select
              value={selectedQuarter}
              onChange={(e) => setSelectedQuarter(Number(e.target.value) as 1 | 2 | 3 | 4)}
              className="w-40 sm:w-44 h-9 text-xs"
            >
              <option value={1}>{quarterNames[1]}</option>
              <option value={2}>{quarterNames[2]}</option>
              <option value={3}>{quarterNames[3]}</option>
              <option value={4}>{quarterNames[4]}</option>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <Percent className="w-3.5 h-3.5 text-neutral-500" />
            <span className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
              {isIt ? 'Aliquota IVA' : 'VAT Rate'}:
            </span>
            <Select
              value={vatRate}
              onChange={(e) => setVatRate(Number(e.target.value))}
              className="w-44 sm:w-48 h-9 text-xs"
            >
              {EU_VAT_PRESETS.map((preset) => (
                <option key={`${preset.rate}-${preset.label}`} value={preset.rate}>
                  {preset.label}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={loadData}
            disabled={loading}
            className="h-9 gap-1.5 flex-1 sm:flex-none justify-center"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">{t('common.refresh', 'Refresh')}</span>
          </Button>

          <Button
            onClick={handlePrint}
            size="sm"
            className="h-9 gap-1.5 flex-1 sm:flex-none justify-center"
          >
            <Printer className="w-4 h-4" />
            <span>{t('accounting.printTaxReport')}</span>
          </Button>
        </div>
      </div>

      {/* Official Tax Summary Header for Print / Display */}
      <Card id="tax-report-printable-area" className="p-4 sm:p-6 border-neutral-200/80 dark:border-neutral-800 space-y-5 sm:space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-4 border-b border-neutral-200/80 dark:border-neutral-800 gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              <h2 className="text-base font-bold text-neutral-900 dark:text-white">
                {t('accounting.quarterlyDeclaration')} — {quarterNames[selectedQuarter]} {selectedYear}
              </h2>
            </div>
            <p className="text-xs text-neutral-500">
              {t('accounting.vatDeclarationNote')}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Badge variant="primary" className="text-xs font-semibold px-2.5 py-1">
              {isIt ? `IVA ${vatRate}%` : `VAT ${vatRate}%`}
            </Badge>
          </div>
        </div>

        {/* 4 Core Tax KPI Blocks */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
          <div className="p-3 sm:p-4 rounded-lg bg-neutral-50 dark:bg-neutral-900/50 border border-neutral-200/80 dark:border-neutral-800 space-y-1">
            <div className="flex items-center justify-between text-neutral-500 text-xs">
              <span className="line-clamp-1">{t('accounting.salesTaxable')}</span>
              <ArrowUpRight className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-neutral-400 shrink-0" />
            </div>
            <p className="text-base sm:text-lg font-bold text-neutral-900 dark:text-white font-mono">
              {formatCurrency(summary.salesTaxable, currency)}
            </p>
            <span className="text-[10px] sm:text-[11px] text-neutral-400 block line-clamp-1">
              {periodOrders.length} {isIt ? 'fatture di vendita' : 'sales invoices'}
            </span>
          </div>

          <div className="p-3 sm:p-4 rounded-lg bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200/60 dark:border-blue-800/40 space-y-1">
            <div className="flex items-center justify-between text-blue-700 dark:text-blue-400 text-xs font-semibold">
              <span className="line-clamp-1">{t('accounting.salesVat')}</span>
              <TrendingUp className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
            </div>
            <p className="text-base sm:text-lg font-bold text-blue-950 dark:text-blue-100 font-mono">
              {formatCurrency(summary.salesVat, currency)}
            </p>
            <span className="text-[10px] sm:text-[11px] text-blue-600/70 dark:text-blue-400/60 block line-clamp-1">
              {isIt ? 'IVA incassata dai clienti' : 'Output VAT collected from customers'}
            </span>
          </div>

          <div className="p-3 sm:p-4 rounded-lg bg-neutral-50 dark:bg-neutral-900/50 border border-neutral-200/80 dark:border-neutral-800 space-y-1">
            <div className="flex items-center justify-between text-neutral-500 text-xs">
              <span className="line-clamp-1">{t('accounting.purchasesTaxable')}</span>
              <ArrowDownLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-neutral-400 shrink-0" />
            </div>
            <p className="text-base sm:text-lg font-bold text-neutral-900 dark:text-white font-mono">
              {formatCurrency(summary.purchasesTaxable, currency)}
            </p>
            <span className="text-[10px] sm:text-[11px] text-neutral-400 block line-clamp-1">
              {periodPurchases.length} {isIt ? 'fatture di acquisto' : 'purchase invoices'}
            </span>
          </div>

          <div className="p-3 sm:p-4 rounded-lg bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200/60 dark:border-emerald-800/40 space-y-1">
            <div className="flex items-center justify-between text-emerald-700 dark:text-emerald-400 text-xs font-semibold">
              <span className="line-clamp-1">{t('accounting.purchasesVat')}</span>
              <TrendingDown className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
            </div>
            <p className="text-base sm:text-lg font-bold text-emerald-950 dark:text-emerald-100 font-mono">
              {formatCurrency(summary.purchasesVat, currency)}
            </p>
            <span className="text-[10px] sm:text-[11px] text-emerald-600/70 dark:text-emerald-400/60 block line-clamp-1">
              {isIt ? 'IVA detraibile su acquisti' : 'Recoverable input VAT credit'}
            </span>
          </div>
        </div>

        {/* Final Net Tax Payable / Credit Banner */}
        <div
          className={`p-3.5 sm:p-4 rounded-xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4 ${
            summary.netVatPayable > 0
              ? 'bg-amber-500/10 border-amber-500/30 text-amber-950 dark:text-amber-200'
              : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-950 dark:text-emerald-200'
          }`}
        >
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                summary.netVatPayable > 0
                  ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400'
                  : 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'
              }`}
            >
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xs font-semibold block">
                {summary.netVatPayable > 0
                  ? t('accounting.netVatPayable')
                  : t('accounting.netVatRefundable')}
              </span>
              <span className="text-[11px] opacity-80">
                {summary.netVatPayable > 0
                  ? isIt
                    ? 'Saldo IVA a debito da versare per il periodo selezionato'
                    : 'Net VAT balance payable to the tax authority for this period'
                  : isIt
                  ? 'Credito IVA compensabile o riportabile al trimestre successivo'
                  : 'Net VAT credit refundable or carried forward to the next quarter'}
              </span>
            </div>
          </div>

          <div className="text-xl font-black font-mono">
            {formatCurrency(Math.abs(summary.netVatPayable), currency)}
          </div>
        </div>
      </Card>

      {/* Sub-Tabs: Sales vs Purchases Invoices */}
      <div className="space-y-4 print:mt-6">
        <div className="flex border-b border-neutral-200/80 dark:border-neutral-800 gap-4 print:hidden">
          <button
            onClick={() => setActiveTableTab('sales')}
            className={`pb-2.5 text-xs font-semibold border-b-2 transition-all cursor-pointer ${
              activeTableTab === 'sales'
                ? 'border-neutral-900 dark:border-white text-neutral-900 dark:text-white'
                : 'border-transparent text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200'
            }`}
          >
            {t('accounting.salesInvoicesList')} ({periodOrders.length})
          </button>

          <button
            onClick={() => setActiveTableTab('purchases')}
            className={`pb-2.5 text-xs font-semibold border-b-2 transition-all cursor-pointer ${
              activeTableTab === 'purchases'
                ? 'border-neutral-900 dark:border-white text-neutral-900 dark:text-white'
                : 'border-transparent text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200'
            }`}
          >
            {t('accounting.purchaseInvoicesList')} ({periodPurchases.length})
          </button>
        </div>

        {activeTableTab === 'sales' ? (
          <Card className="overflow-hidden border-neutral-200/80 dark:border-neutral-800">
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-xs text-start">
                <thead className="bg-neutral-50 dark:bg-neutral-900/50 border-b border-neutral-200/80 dark:border-neutral-800 text-neutral-500">
                  <tr>
                    <th className="px-4 py-3 font-semibold text-start">{isIt ? 'N. Fattura' : 'Invoice #'}</th>
                    <th className="px-4 py-3 font-semibold text-start">{t('common.date', 'Date')}</th>
                    <th className="px-4 py-3 font-semibold text-start">{isIt ? 'Cliente' : 'Customer'}</th>
                    <th className="px-4 py-3 font-semibold text-end">{isIt ? `Imponibile (${currency})` : `Taxable Net (${currency})`}</th>
                    <th className="px-4 py-3 font-semibold text-end">{isIt ? `IVA (${vatRate}%)` : `VAT (${vatRate}%)`}</th>
                    <th className="px-4 py-3 font-semibold text-end">{isIt ? 'Totale Fattura' : 'Invoice Total'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200/60 dark:divide-neutral-800">
                  {periodOrders.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-8 text-neutral-400">
                        {isIt ? 'Nessuna fattura di vendita in questo trimestre.' : 'No sales invoices found in this quarter.'}
                      </td>
                    </tr>
                  ) : (
                    periodOrders.map((order) => {
                      const cId = typeof order.customer_id === 'object' ? (order.customer_id as any)?.id : order.customer_id;
                      const customer = customers.find((c) => c.id === Number(cId));
                      const total = Number(order.total) || 0;
                      const explicitTax = order.tax && Number(order.tax) > 0 ? Number(order.tax) : null;
                      const taxable = explicitTax !== null ? Math.max(0, total - explicitTax) : total / (1 + vatRate / 100);
                      const tax = explicitTax !== null ? explicitTax : total - taxable;
                      return (
                        <tr key={order.id} className="hover:bg-neutral-50/50 dark:hover:bg-neutral-900/20">
                          <td className="px-4 py-3 font-mono font-medium text-neutral-900 dark:text-white">
                            {order.order_number || `ORD-${order.id}`}
                          </td>
                          <td className="px-4 py-3 text-neutral-500">
                            {formatDate(order.order_date || order.date_created)}
                          </td>
                          <td className="px-4 py-3 text-neutral-800 dark:text-neutral-200">
                            {customer ? customer.name : order.customer_name || (isIt ? 'Cliente di passaggio' : 'Walk-in Customer')}
                          </td>
                          <td className="px-4 py-3 text-end font-mono font-medium">
                            {formatCurrency(taxable, currency)}
                          </td>
                          <td className="px-4 py-3 text-end font-mono font-semibold text-blue-600 dark:text-blue-400">
                            {formatCurrency(tax, currency)}
                          </td>
                          <td className="px-4 py-3 text-end font-mono font-bold text-neutral-900 dark:text-white">
                            {formatCurrency(total, currency)}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <div className="md:hidden divide-y divide-neutral-100 dark:divide-neutral-800/80 p-2 space-y-2">
              {periodOrders.length === 0 ? (
                <p className="text-center py-8 text-xs text-neutral-400">
                  {isIt ? 'Nessuna fattura di vendita in questo trimestre.' : 'No sales invoices found in this quarter.'}
                </p>
              ) : (
                periodOrders.map((order) => {
                  const total = Number(order.total) || 0;
                  const explicitTax = order.tax && Number(order.tax) > 0 ? Number(order.tax) : null;
                  const taxable = explicitTax !== null ? Math.max(0, total - explicitTax) : total / (1 + vatRate / 100);
                  const tax = explicitTax !== null ? explicitTax : total - taxable;
                  return (
                    <div key={order.id} className="p-3 rounded-xl bg-neutral-50/50 dark:bg-neutral-800/40 border border-neutral-200/70 dark:border-neutral-700/60 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-bold text-xs text-neutral-900 dark:text-white">
                            {order.customer_name || (isIt ? 'Cliente di passaggio' : 'Walk-in Customer')}
                          </p>
                          <p className="text-[11px] font-mono text-neutral-500 mt-0.5">{order.order_number || `ORD-${order.id}`}</p>
                        </div>
                        <span className="font-mono text-[11px] text-neutral-400">{formatDate(order.order_date || order.date_created)}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 pt-2 border-t border-neutral-200/60 dark:border-neutral-700/60 text-xs">
                        <div>
                          <span className="text-[10px] text-neutral-400 block">{isIt ? 'IVA:' : 'VAT:'}</span>
                          <span className="font-mono font-bold text-blue-600 dark:text-blue-400">{formatCurrency(tax, currency)}</span>
                        </div>
                        <div className="text-end">
                          <span className="text-[10px] text-neutral-400 block">{isIt ? 'Totale:' : 'Total:'}</span>
                          <span className="font-mono font-bold text-neutral-900 dark:text-white">{formatCurrency(total, currency)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </Card>
        ) : (
          <Card className="overflow-hidden border-neutral-200/80 dark:border-neutral-800">
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-xs text-start">
                <thead className="bg-neutral-50 dark:bg-neutral-900/50 border-b border-neutral-200/80 dark:border-neutral-800 text-neutral-500">
                  <tr>
                    <th className="px-4 py-3 font-semibold text-start">{isIt ? 'N. Ordine Acquisto' : 'Purchase #'}</th>
                    <th className="px-4 py-3 font-semibold text-start">{t('common.date', 'Date')}</th>
                    <th className="px-4 py-3 font-semibold text-start">{isIt ? 'Fornitore' : 'Supplier'}</th>
                    <th className="px-4 py-3 font-semibold text-end">{isIt ? `Imponibile (${currency})` : `Taxable Net (${currency})`}</th>
                    <th className="px-4 py-3 font-semibold text-end">{isIt ? `IVA Detraibile (${vatRate}%)` : `Input VAT (${vatRate}%)`}</th>
                    <th className="px-4 py-3 font-semibold text-end">{isIt ? 'Totale Acquisto' : 'Purchase Total'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200/60 dark:divide-neutral-800">
                  {periodPurchases.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-8 text-neutral-400">
                        {isIt ? 'Nessuna fattura di acquisto in questo trimestre.' : 'No purchase invoices found in this quarter.'}
                      </td>
                    </tr>
                  ) : (
                    periodPurchases.map((po) => {
                      const sId = typeof po.supplier_id === 'object' ? (po.supplier_id as any)?.id : po.supplier_id;
                      const sup = suppliers.find((s) => s.id === Number(sId));
                      const total = Number(po.total) || 0;
                      const explicitTax = po.tax && Number(po.tax) > 0 ? Number(po.tax) : null;
                      const taxable = explicitTax !== null ? Math.max(0, total - explicitTax) : total / (1 + vatRate / 100);
                      const tax = explicitTax !== null ? explicitTax : total - taxable;
                      return (
                        <tr key={po.id} className="hover:bg-neutral-50/50 dark:hover:bg-neutral-900/20">
                          <td className="px-4 py-3 font-mono font-medium text-neutral-900 dark:text-white">
                            {po.purchase_number || `PO-${po.id}`}
                          </td>
                          <td className="px-4 py-3 text-neutral-500">
                            {formatDate(po.date_created)}
                          </td>
                          <td className="px-4 py-3 text-neutral-800 dark:text-neutral-200">
                            {sup?.name || po.supplier_name || (isIt ? 'Fornitore' : 'Supplier')}
                          </td>
                          <td className="px-4 py-3 text-end font-mono font-medium">
                            {formatCurrency(taxable, currency)}
                          </td>
                          <td className="px-4 py-3 text-end font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                            {formatCurrency(tax, currency)}
                          </td>
                          <td className="px-4 py-3 text-end font-mono font-bold text-neutral-900 dark:text-white">
                            {formatCurrency(total, currency)}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <div className="md:hidden divide-y divide-neutral-100 dark:divide-neutral-800/80 p-2 space-y-2">
              {periodPurchases.length === 0 ? (
                <p className="text-center py-8 text-xs text-neutral-400">
                  {isIt ? 'Nessuna fattura di acquisto in questo trimestre.' : 'No purchase invoices found in this quarter.'}
                </p>
              ) : (
                periodPurchases.map((po) => {
                  const sId = typeof po.supplier_id === 'object' ? (po.supplier_id as any)?.id : po.supplier_id;
                  const sup = suppliers.find((s) => s.id === Number(sId));
                  const total = Number(po.total) || 0;
                  const explicitTax = po.tax && Number(po.tax) > 0 ? Number(po.tax) : null;
                  const taxable = explicitTax !== null ? Math.max(0, total - explicitTax) : total / (1 + vatRate / 100);
                  const tax = explicitTax !== null ? explicitTax : total - taxable;
                  return (
                    <div key={po.id} className="p-3 rounded-xl bg-neutral-50/50 dark:bg-neutral-800/40 border border-neutral-200/70 dark:border-neutral-700/60 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-bold text-xs text-neutral-900 dark:text-white">{sup?.name || po.supplier_name || (isIt ? 'Fornitore' : 'Supplier')}</p>
                          <p className="text-[11px] font-mono text-neutral-500 mt-0.5">{po.purchase_number || `PO-${po.id}`}</p>
                        </div>
                        <span className="font-mono text-[11px] text-neutral-400">{formatDate(po.date_created)}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 pt-2 border-t border-neutral-200/60 dark:border-neutral-700/60 text-xs">
                        <div>
                          <span className="text-[10px] text-neutral-400 block">{isIt ? 'IVA Detraibile:' : 'Input VAT:'}</span>
                          <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(tax, currency)}</span>
                        </div>
                        <div className="text-end">
                          <span className="text-[10px] text-neutral-400 block">{isIt ? 'Totale:' : 'Total:'}</span>
                          <span className="font-mono font-bold text-neutral-900 dark:text-white">{formatCurrency(total, currency)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
};
