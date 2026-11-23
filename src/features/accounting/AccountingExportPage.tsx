import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from '../../i18n';
import { useOrganization } from '../../context/OrganizationContext';
import { storageManager } from '../../storage';
import {
  AccountingJournalEntry,
  Order,
  PurchaseOrder,
  Expense,
} from '../../types';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Select } from '../../components/ui/Select';
import { formatCurrency, formatDate, formatDateNumeric, resolveCurrencyCode } from '../../utils/formatters';
import { downloadCsvContent, escapeCsvCell } from '../../utils/excelUtils';
import {
  FileSpreadsheet,
  Download,
  CheckCircle2,
  AlertTriangle,
  Calendar,
  Layers,
  RefreshCw,
  Building,
  FileCheck,
} from 'lucide-react';

type ExportFormat = 'journal' | 'xero' | 'quickbooks' | 'vat_ledger';

export const AccountingExportPage: React.FC = () => {
  const { t, locale } = useTranslation();
  const { activeOrganization } = useOrganization();
  const isIt = locale === 'it';
  const currency = resolveCurrencyCode(activeOrganization?.currency);

  const [loading, setLoading] = useState(true);
  const [exportFormat, setExportFormat] = useState<ExportFormat>('journal');
  const [periodFilter, setPeriodFilter] = useState<'all' | 'month' | 'quarter' | 'year'>('month');
  const [exportFeedback, setExportFeedback] = useState<{ type: 'success' | 'info' | 'error'; message: string } | null>(null);

  const [orders, setOrders] = useState<Order[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);

  const loadData = async () => {
    try {
      setLoading(true);
      const storage = storageManager.getAdapter();
      const orgParams = activeOrganization?.id ? { organization_id: activeOrganization.id } : {};
      const [allOrders, allPos, allExpenses] = await Promise.all([
        storage.getOrders(orgParams),
        storage.getPurchaseOrders(orgParams),
        storage.getExpenses(orgParams),
      ]);

      setOrders(allOrders || []);
      setPurchaseOrders(allPos || []);
      setExpenses(allExpenses || []);
    } catch (err) {
      console.error('Failed to load accounting data for export', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [activeOrganization?.id]);

  // Filter raw data according to Gregorian calendar period
  const filterDate = useMemo(() => {
    const now = new Date();
    if (periodFilter === 'month') {
      return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    }
    if (periodFilter === 'quarter') {
      return new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1).toISOString().split('T')[0];
    }
    if (periodFilter === 'year') {
      return new Date(now.getFullYear(), 0, 1).toISOString().split('T')[0];
    }
    return null;
  }, [periodFilter]);

  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      if (o.status === 'cancelled') return false;
      const ordDate = (o.order_date || o.date_created || '').slice(0, 10);
      if (filterDate && ordDate) return ordDate >= filterDate;
      return true;
    });
  }, [orders, filterDate]);

  const filteredExpenses = useMemo(() => {
    if (!filterDate) return expenses;
    return expenses.filter((e) => (e.expense_date ? e.expense_date.slice(0, 10) >= filterDate : true));
  }, [expenses, filterDate]);

  const filteredPurchases = useMemo(() => {
    return purchaseOrders.filter((p) => {
      if (p.status === 'cancelled') return false;
      const poDate = ((p as any).order_date || p.date_created || p.expected_date || '').slice(0, 10);
      if (filterDate && poDate) return poDate >= filterDate;
      return true;
    });
  }, [purchaseOrders, filterDate]);

  // Construct IFRS/EU Double-Entry Journal Entries
  const journalEntries: AccountingJournalEntry[] = useMemo(() => {
    const list: AccountingJournalEntry[] = [];

    // 1. Sales Entries
    filteredOrders.forEach((order) => {
      const date = (order.order_date || order.date_created || new Date().toISOString()).slice(0, 10);
      const total = Number(order.total ?? (order as any).final_amount ?? 0) || 0;
      const tax =
        order.tax !== undefined && order.tax !== null
          ? Number(order.tax) || 0
          : (order as any).tax_amount !== undefined && (order as any).tax_amount !== null
          ? Number((order as any).tax_amount) || 0
          : 0;
      const subtotal = Math.max(0, total - tax);
      const refNum = order.order_number || `ORD-${order.id}`;

      list.push({
        id: `sales-dr-${order.id}`,
        entry_number: `JRN-ORD-${order.id}`,
        entry_date: date,
        account_code: '1200',
        account_name: isIt ? 'Crediti verso Clienti' : 'Accounts Receivable',
        description: isIt ? `Fattura vendita #${refNum}` : `Sales Invoice #${refNum}`,
        debit: total,
        credit: 0,
        reference_type: 'order',
        reference_id: order.id,
      });

      list.push({
        id: `sales-cr-rev-${order.id}`,
        entry_number: `JRN-ORD-${order.id}`,
        entry_date: date,
        account_code: '4000',
        account_name: isIt ? 'Ricavi Vendite Abbigliamento' : 'Apparel Sales Revenue',
        description: isIt ? `Ricavo vendite #${refNum}` : `Sales Revenue #${refNum}`,
        debit: 0,
        credit: subtotal,
        reference_type: 'order',
        reference_id: order.id,
      });

      if (tax > 0) {
        list.push({
          id: `sales-cr-tax-${order.id}`,
          entry_number: `JRN-ORD-${order.id}`,
          entry_date: date,
          account_code: '2200',
          account_name: isIt ? 'IVA a Debito (Vendite)' : 'Output VAT Payable',
          description: isIt ? `IVA vendite #${refNum}` : `Output VAT #${refNum}`,
          debit: 0,
          credit: tax,
          reference_type: 'order',
          reference_id: order.id,
        });
      }
    });

    // 2. Operating Expenses
    filteredExpenses.forEach((exp) => {
      const date = (exp.expense_date || new Date().toISOString()).slice(0, 10);
      const amount = Number(exp.amount) || 0;

      list.push({
        id: `exp-dr-${exp.id}`,
        entry_number: `JRN-EXP-${exp.id}`,
        entry_date: date,
        account_code: '6100',
        account_name: isIt ? `Spese Operative: ${exp.title}` : `Operating Expense: ${exp.title}`,
        description: exp.description || exp.title,
        debit: amount,
        credit: 0,
        reference_type: 'expense',
        reference_id: exp.id,
      });

      list.push({
        id: `exp-cr-${exp.id}`,
        entry_number: `JRN-EXP-${exp.id}`,
        entry_date: date,
        account_code: '1000',
        account_name: isIt ? 'Cassa e Conti Bancari' : 'Cash & Bank Accounts',
        description: isIt ? `Pagamento: ${exp.title}` : `Payment for ${exp.title}`,
        debit: 0,
        credit: amount,
        reference_type: 'expense',
        reference_id: exp.id,
      });
    });

    // 3. Purchase Orders
    filteredPurchases.forEach((po) => {
      const date = (po.date_created || new Date().toISOString()).slice(0, 10);
      const total = Number(po.total) || 0;
      const tax = Number(po.tax) || 0;
      const subtotal = Math.max(0, total - tax);
      const refNum = po.purchase_number || `PO-${po.id}`;

      list.push({
        id: `po-dr-inv-${po.id}`,
        entry_number: `JRN-PO-${po.id}`,
        entry_date: date,
        account_code: '1400',
        account_name: isIt ? 'Rimanenze Merci / Magazzino' : 'Merchandise Inventory',
        description: isIt ? `Ordine acquisto #${refNum}` : `Purchase Order #${refNum}`,
        debit: subtotal,
        credit: 0,
        reference_type: 'purchase_order',
        reference_id: po.id,
      });

      if (tax > 0) {
        list.push({
          id: `po-dr-tax-${po.id}`,
          entry_number: `JRN-PO-${po.id}`,
          entry_date: date,
          account_code: '1250',
          account_name: isIt ? 'IVA a Credito (Acquisti)' : 'Input VAT Recoverable',
          description: isIt ? `IVA acquisti #${refNum}` : `Input VAT #${refNum}`,
          debit: tax,
          credit: 0,
          reference_type: 'purchase_order',
          reference_id: po.id,
        });
      }

      list.push({
        id: `po-cr-pay-${po.id}`,
        entry_number: `JRN-PO-${po.id}`,
        entry_date: date,
        account_code: '2000',
        account_name: isIt ? 'Debiti verso Fornitori' : 'Accounts Payable',
        description: isIt ? `Debito fornitore #${refNum}` : `Supplier Payable #${refNum}`,
        debit: 0,
        credit: total,
        reference_type: 'purchase_order',
        reference_id: po.id,
      });
    });

    return list;
  }, [filteredOrders, filteredExpenses, filteredPurchases, isIt]);

  const totalDebit = useMemo(() => journalEntries.reduce((acc, curr) => acc + (curr.debit || 0), 0), [journalEntries]);
  const totalCredit = useMemo(() => journalEntries.reduce((acc, curr) => acc + (curr.credit || 0), 0), [journalEntries]);
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01;

  const handleExportCsv = () => {
    setExportFeedback(null);
    const lines: string[] = [];
    const todayIso = new Date().toISOString().slice(0, 10);
    let fileName = '';

    if (exportFormat === 'vat_ledger') {
      if (filteredOrders.length === 0 && filteredPurchases.length === 0) {
        setExportFeedback({
          type: 'info',
          message: isIt
            ? 'Nessuna fattura di vendita o acquisto trovata nel periodo selezionato.'
            : 'No sales or purchase invoices found in the selected period.',
        });
        return;
      }
      fileName = `eu_vat_ledger_${todayIso}.csv`;
      lines.push(
        [
          'Type',
          'DocumentNumber',
          'Date',
          'Counterparty',
          'Currency',
          'NetAmount',
          'VatRatePct',
          'VatAmount',
          'GrossTotal',
        ]
          .map(escapeCsvCell)
          .join(',')
      );

      filteredOrders.forEach((o) => {
        const total = Number(o.total ?? (o as any).final_amount ?? 0) || 0;
        const tax = Number(o.tax ?? (o as any).tax_amount ?? 0) || 0;
        const net = Math.max(0, total - tax);
        const rate = net > 0 && tax > 0 ? ((tax / net) * 100).toFixed(1) : '0.0';
        lines.push(
          [
            escapeCsvCell('SALE'),
            escapeCsvCell(o.order_number || `ORD-${o.id}`),
            escapeCsvCell(formatDateNumeric(o.order_date || o.date_created)),
            escapeCsvCell(o.customer_name || 'Walk-in Customer'),
            escapeCsvCell(currency),
            net.toFixed(2),
            rate,
            tax.toFixed(2),
            total.toFixed(2),
          ].join(',')
        );
      });

      filteredPurchases.forEach((po) => {
        const total = Number(po.total) || 0;
        const tax = Number(po.tax) || 0;
        const net = Math.max(0, total - tax);
        const rate = net > 0 && tax > 0 ? ((tax / net) * 100).toFixed(1) : '0.0';
        lines.push(
          [
            escapeCsvCell('PURCHASE'),
            escapeCsvCell(po.purchase_number || `PO-${po.id}`),
            escapeCsvCell(formatDateNumeric(po.date_created)),
            escapeCsvCell(po.supplier_name || 'Supplier'),
            escapeCsvCell(currency),
            net.toFixed(2),
            rate,
            tax.toFixed(2),
            total.toFixed(2),
          ].join(',')
        );
      });
    } else if (exportFormat === 'xero') {
      if (filteredOrders.length === 0) {
        setExportFeedback({
          type: 'info',
          message: isIt
            ? 'Nessuna fattura di vendita disponibile per l’esportazione Xero.'
            : 'No sales invoices available for Xero CSV export in this period.',
        });
        return;
      }
      fileName = `xero_sales_invoices_${todayIso}.csv`;
      lines.push(
        [
          '*ContactName',
          '*InvoiceNumber',
          '*InvoiceDate',
          '*DueDate',
          'Description',
          '*Quantity',
          '*UnitAmount',
          '*AccountCode',
          '*TaxType',
          'Currency',
        ]
          .map(escapeCsvCell)
          .join(',')
      );
      filteredOrders.forEach((o) => {
        const dateStr = formatDateNumeric(o.order_date || o.date_created);
        const total = Number(o.total ?? (o as any).final_amount ?? 0) || 0;
        const tax = Number(o.tax ?? (o as any).tax_amount ?? 0) || 0;
        const net = Math.max(0, total - tax);
        lines.push(
          [
            escapeCsvCell(o.customer_name || 'Walk-in Customer'),
            escapeCsvCell(o.order_number || `INV-${o.id}`),
            escapeCsvCell(dateStr),
            escapeCsvCell(dateStr),
            escapeCsvCell(`Apparel Order ${o.order_number || o.id}`),
            1,
            net.toFixed(2),
            escapeCsvCell('200'),
            escapeCsvCell(tax > 0 ? 'OUTPUT' : 'NONE'),
            escapeCsvCell(currency),
          ].join(',')
        );
      });
    } else if (exportFormat === 'quickbooks') {
      if (journalEntries.length === 0) {
        setExportFeedback({
          type: 'info',
          message: isIt
            ? 'Nessuna scrittura contabile trovata per QuickBooks nel periodo selezionato.'
            : 'No journal entries found for QuickBooks CSV export in this period.',
        });
        return;
      }
      fileName = `quickbooks_journal_${todayIso}.csv`;
      lines.push(
        ['JournalNo', 'JournalDate', 'AccountName', 'Debits', 'Credits', 'Description', 'Currency']
          .map(escapeCsvCell)
          .join(',')
      );
      journalEntries.forEach((entry) => {
        lines.push(
          [
            escapeCsvCell(entry.entry_number),
            escapeCsvCell(formatDateNumeric(entry.entry_date)),
            escapeCsvCell(`${entry.account_code} ${entry.account_name}`),
            entry.debit ? entry.debit.toFixed(2) : '0.00',
            entry.credit ? entry.credit.toFixed(2) : '0.00',
            escapeCsvCell(entry.description),
            escapeCsvCell(currency),
          ].join(',')
        );
      });
    } else {
      if (journalEntries.length === 0) {
        setExportFeedback({
          type: 'info',
          message: isIt
            ? 'Nessuna scrittura contabile trovata per il Libro Giornale.'
            : 'No journal entries found for the selected period.',
        });
        return;
      }
      fileName = `general_journal_double_entry_${todayIso}.csv`;
      lines.push(
        ['EntryNumber', 'Date', 'AccountCode', 'AccountName', 'Description', `Debit (${currency})`, `Credit (${currency})`, 'ReferenceType']
          .map(escapeCsvCell)
          .join(',')
      );
      journalEntries.forEach((entry) => {
        lines.push(
          [
            escapeCsvCell(entry.entry_number),
            escapeCsvCell(formatDateNumeric(entry.entry_date)),
            escapeCsvCell(entry.account_code),
            escapeCsvCell(entry.account_name),
            escapeCsvCell(entry.description),
            entry.debit.toFixed(2),
            entry.credit.toFixed(2),
            escapeCsvCell(entry.reference_type || ''),
          ].join(',')
        );
      });
    }

    downloadCsvContent(lines.join('\n'), fileName);
    setExportFeedback({
      type: 'success',
      message: isIt
        ? `File "${fileName}" generato e scaricato con successo.`
        : `Export file "${fileName}" generated and downloaded successfully.`,
    });
  };

  return (
    <div className="space-y-6">
      {/* Format Selection Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
        <button
          type="button"
          onClick={() => setExportFormat('journal')}
          className={`p-3 sm:p-4 rounded-xl border text-start transition-all cursor-pointer ${
            exportFormat === 'journal'
              ? 'border-neutral-900 dark:border-white bg-neutral-50 dark:bg-neutral-900/60 ring-1 ring-neutral-900 dark:ring-white'
              : 'border-neutral-200/80 dark:border-neutral-800 hover:border-neutral-400'
          }`}
        >
          <div className="flex items-center gap-1.5 sm:gap-2 mb-1.5 sm:mb-2">
            <Layers className="w-4 h-4 sm:w-5 sm:h-5 text-amber-600 dark:text-amber-400 shrink-0" />
            <span className="font-bold text-xs text-neutral-900 dark:text-white line-clamp-1">
              {t('accounting.formatJournal')}
            </span>
          </div>
          <p className="text-[10px] sm:text-[11px] text-neutral-500 line-clamp-2">
            {isIt
              ? 'Scritture in partita doppia bilanciate (Dare / Avere) in formato CSV UTF-8'
              : 'Balanced IFRS double-entry debit & credit journal lines (UTF-8 CSV)'}
          </p>
        </button>

        <button
          type="button"
          onClick={() => setExportFormat('xero')}
          className={`p-3 sm:p-4 rounded-xl border text-start transition-all cursor-pointer ${
            exportFormat === 'xero'
              ? 'border-neutral-900 dark:border-white bg-neutral-50 dark:bg-neutral-900/60 ring-1 ring-neutral-900 dark:ring-white'
              : 'border-neutral-200/80 dark:border-neutral-800 hover:border-neutral-400'
          }`}
        >
          <div className="flex items-center gap-1.5 sm:gap-2 mb-1.5 sm:mb-2">
            <FileSpreadsheet className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span className="font-bold text-xs text-neutral-900 dark:text-white line-clamp-1">
              {t('accounting.formatXero', 'Xero Accounting CSV')}
            </span>
          </div>
          <p className="text-[10px] sm:text-[11px] text-neutral-500 line-clamp-2">
            {isIt
              ? 'Template compatibile con l’importazione fatture di Xero'
              : 'Ready-to-import sales invoice CSV formatted for Xero Accounting'}
          </p>
        </button>

        <button
          type="button"
          onClick={() => setExportFormat('quickbooks')}
          className={`p-3 sm:p-4 rounded-xl border text-start transition-all cursor-pointer ${
            exportFormat === 'quickbooks'
              ? 'border-neutral-900 dark:border-white bg-neutral-50 dark:bg-neutral-900/60 ring-1 ring-neutral-900 dark:ring-white'
              : 'border-neutral-200/80 dark:border-neutral-800 hover:border-neutral-400'
          }`}
        >
          <div className="flex items-center gap-1.5 sm:gap-2 mb-1.5 sm:mb-2">
            <FileCheck className="w-4 h-4 sm:w-5 sm:h-5 text-purple-600 dark:text-purple-400 shrink-0" />
            <span className="font-bold text-xs text-neutral-900 dark:text-white line-clamp-1">
              {t('accounting.formatQuickBooks', 'QuickBooks Online CSV')}
            </span>
          </div>
          <p className="text-[10px] sm:text-[11px] text-neutral-500 line-clamp-2">
            {isIt
              ? 'Registrazioni giornaliere pronte per QuickBooks Online e commercialisti'
              : 'Daily journal import format compatible with QuickBooks Online'}
          </p>
        </button>

        <button
          type="button"
          onClick={() => setExportFormat('vat_ledger')}
          className={`p-3 sm:p-4 rounded-xl border text-start transition-all cursor-pointer ${
            exportFormat === 'vat_ledger'
              ? 'border-neutral-900 dark:border-white bg-neutral-50 dark:bg-neutral-900/60 ring-1 ring-neutral-900 dark:ring-white'
              : 'border-neutral-200/80 dark:border-neutral-800 hover:border-neutral-400'
          }`}
        >
          <div className="flex items-center gap-1.5 sm:gap-2 mb-1.5 sm:mb-2">
            <Building className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600 dark:text-blue-400 shrink-0" />
            <span className="font-bold text-xs text-neutral-900 dark:text-white line-clamp-1">
              {t('accounting.formatVatLedger', 'EU VAT / IVA Ledger')}
            </span>
          </div>
          <p className="text-[10px] sm:text-[11px] text-neutral-500 line-clamp-2">
            {isIt
              ? 'Registro IVA vendite e acquisti con imponibile, aliquota e imposta'
              : 'Consolidated sales & purchase VAT register with net, rate, and tax'}
          </p>
        </button>
      </div>

      {/* Filter & Export Action Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-neutral-50 dark:bg-neutral-900/40 p-3.5 sm:p-4 rounded-xl border border-neutral-200/80 dark:border-neutral-800">
        <div className="flex items-center gap-2.5 sm:gap-3">
          <Calendar className="w-4 h-4 text-neutral-500 shrink-0" />
          <span className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 shrink-0">
            {t('accounting.exportDateRange')}:
          </span>
          <Select
            value={periodFilter}
            onChange={(e) => setPeriodFilter(e.target.value as any)}
            className="w-full sm:w-44 h-9 text-xs"
          >
            <option value="month">{t('accounting.periodThisMonth')}</option>
            <option value="quarter">{isIt ? 'Trimestre Corrente' : 'Current Quarter'}</option>
            <option value="year">{t('accounting.periodThisYear')}</option>
            <option value="all">{t('accounting.allAccountingRecords')}</option>
          </Select>
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
            onClick={handleExportCsv}
            size="sm"
            className="h-9 gap-1.5 flex-1 sm:flex-none justify-center"
          >
            <Download className="w-4 h-4" />
            <span>{t('accounting.downloadCsvBtn')}</span>
          </Button>
        </div>
      </div>

      {exportFeedback && (
        <div
          className={`p-3 rounded-xl border text-xs flex items-center justify-between gap-2 ${
            exportFeedback.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/60 text-emerald-900 dark:text-emerald-200'
              : exportFeedback.type === 'error'
              ? 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800/60 text-red-900 dark:text-red-200'
              : 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800/60 text-amber-900 dark:text-amber-200'
          }`}
        >
          <span>{exportFeedback.message}</span>
          <button
            type="button"
            onClick={() => setExportFeedback(null)}
            className="px-1.5 py-0.5 rounded hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer"
          >
            ×
          </button>
        </div>
      )}

      {/* Balance Indicator Banner */}
      <div
        className={`p-3.5 sm:p-4 rounded-xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs ${
          isBalanced
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-800 dark:text-emerald-300'
            : 'bg-red-500/10 border-red-500/30 text-red-800 dark:text-red-300'
        }`}
      >
        <div className="flex items-center gap-2 font-semibold">
          {isBalanced ? (
            <>
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>{t('accounting.balancedJournal')}</span>
            </>
          ) : (
            <>
              <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
              <span>{t('accounting.unbalancedJournal')}</span>
            </>
          )}
          <span className="text-[11px] opacity-75 ms-2">
            ({journalEntries.length} {isIt ? 'righe contabili' : 'journal lines'})
          </span>
        </div>

        <div className="flex items-center gap-4 sm:gap-6 font-mono font-bold">
          <div>
            <span className="text-neutral-500 text-[11px] me-1">{t('accounting.totalDebit')}:</span>
            <span>{formatCurrency(totalDebit, currency)}</span>
          </div>
          <div>
            <span className="text-neutral-500 text-[11px] me-1">{t('accounting.totalCredit')}:</span>
            <span>{formatCurrency(totalCredit, currency)}</span>
          </div>
        </div>
      </div>

      {/* Preview Journal Table */}
      <Card className="overflow-hidden border-neutral-200/80 dark:border-neutral-800">
        <div className="bg-neutral-50 dark:bg-neutral-900/50 px-4 py-3 border-b border-neutral-200/80 dark:border-neutral-800 flex items-center justify-between">
          <span className="text-xs font-semibold text-neutral-800 dark:text-neutral-200">
            {t('accounting.previewJournalEntries')}
          </span>
          <span className="text-[11px] text-neutral-400">
            {t('accounting.excelUtf8Notice')}
          </span>
        </div>

        <div className="overflow-x-auto max-h-[500px] custom-scrollbar">
          {/* Desktop Table View */}
          <table className="hidden md:table w-full text-xs text-start">
            <thead className="bg-neutral-100/60 dark:bg-neutral-900/40 text-neutral-500 border-b border-neutral-200/80 dark:border-neutral-800 sticky top-0 z-10 backdrop-blur-sm">
              <tr>
                <th className="px-4 py-3 font-semibold text-start">{isIt ? 'N. Scrittura / Data' : 'Entry # / Date'}</th>
                <th className="px-4 py-3 font-semibold text-start">{t('accounting.accountCode')}</th>
                <th className="px-4 py-3 font-semibold text-start">{t('accounting.accountName')}</th>
                <th className="px-4 py-3 font-semibold text-start">{t('common.description', 'Description')}</th>
                <th className="px-4 py-3 font-semibold text-end">{t('accounting.debit')} ({currency})</th>
                <th className="px-4 py-3 font-semibold text-end">{t('accounting.credit')} ({currency})</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200/60 dark:divide-neutral-800">
              {journalEntries.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-10 text-neutral-400">
                    {isIt
                      ? 'Nessuna transazione trovata nel periodo selezionato.'
                      : 'No transactions found in this period to generate journal entries.'}
                  </td>
                </tr>
              ) : (
                journalEntries.map((entry) => (
                  <tr key={entry.id} className="hover:bg-neutral-50/50 dark:hover:bg-neutral-900/20">
                    <td className="px-4 py-2.5">
                      <div className="font-mono text-neutral-800 dark:text-neutral-200 font-medium">
                        {entry.entry_number}
                      </div>
                      <div className="text-[10px] text-neutral-400">
                        {formatDate(entry.entry_date)}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-neutral-600 dark:text-neutral-400">
                      {entry.account_code}
                    </td>
                    <td className="px-4 py-2.5 font-medium text-neutral-900 dark:text-white">
                      {entry.account_name}
                    </td>
                    <td className="px-4 py-2.5 text-neutral-600 dark:text-neutral-300 max-w-xs truncate">
                      {entry.description}
                    </td>
                    <td className="px-4 py-2.5 text-end font-mono font-semibold text-neutral-900 dark:text-white">
                      {entry.debit > 0 ? formatCurrency(entry.debit, currency) : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-end font-mono font-semibold text-neutral-900 dark:text-white">
                      {entry.credit > 0 ? formatCurrency(entry.credit, currency) : '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          {/* Mobile Card List View */}
          <div className="md:hidden divide-y divide-neutral-100 dark:divide-neutral-800/80 p-2 space-y-2">
            {journalEntries.length === 0 ? (
              <p className="text-center py-8 text-xs text-neutral-400">
                {isIt
                  ? 'Nessuna transazione trovata nel periodo selezionato.'
                  : 'No transactions found in this period.'}
              </p>
            ) : (
              journalEntries.map((entry) => (
                <div key={entry.id} className="p-3 rounded-xl bg-neutral-50/50 dark:bg-neutral-800/40 border border-neutral-200/70 dark:border-neutral-700/60 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-bold text-xs text-neutral-900 dark:text-white">{entry.account_name}</p>
                      <p className="text-[11px] text-neutral-500 mt-0.5">{entry.description}</p>
                    </div>
                    <span className="font-mono text-[10px] bg-neutral-200/60 dark:bg-neutral-700/60 px-1.5 py-0.5 rounded text-neutral-600 dark:text-neutral-300 shrink-0">
                      {entry.account_code}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-neutral-200/60 dark:border-neutral-700/60 text-xs">
                    <div>
                      <span className="text-[10px] text-neutral-400 block font-mono">{entry.entry_number}</span>
                      <span className="text-[10px] text-neutral-400 font-mono">{formatDate(entry.entry_date)}</span>
                    </div>
                    <div className="text-end">
                      {entry.debit > 0 ? (
                        <span className="font-mono font-bold text-rose-600 dark:text-rose-400 block">
                          {t('accounting.debit')}: {formatCurrency(entry.debit, currency)}
                        </span>
                      ) : null}
                      {entry.credit > 0 ? (
                        <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400 block">
                          {t('accounting.credit')}: {formatCurrency(entry.credit, currency)}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </Card>
    </div>
  );
};
