import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from '../../i18n';
import { storageManager } from '../../storage';
import { useOrganization } from '../../context/OrganizationContext';
import {
  Cheque,
  ChequeType,
  ChequeStatus,
  FinancialAccount,
} from '../../types/accounting';
import { Customer, Supplier } from '../../types';
import { formatCurrency, formatDate, resolveCurrencyCode } from '../../utils/formatters';
import { DateInput } from '../../components/ui/DateInput';
import {
  CheckSquare,
  Plus,
  Search,
  AlertTriangle,
  Clock,
  CheckCircle2,
  XCircle,
  ArrowUpRight,
  ArrowDownLeft,
  ArrowRightLeft,
  Copy,
  Check,
  Edit2,
  Trash2,
  RefreshCw,
  FileText,
  ShieldCheck,
} from 'lucide-react';

export const ChequesPage: React.FC = () => {
  const { t, locale } = useTranslation();
  const isIt = locale === 'it';
  const storage = storageManager.getAdapter();
  const { activeOrganization } = useOrganization();
  const currency = resolveCurrencyCode(activeOrganization?.currency);

  const [cheques, setCheques] = useState<Cheque[]>([]);
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);

  const [activeTab, setActiveTab] = useState<'all' | 'received' | 'issued' | 'alerts'>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const [isChequeModalOpen, setIsChequeModalOpen] = useState(false);
  const [editingCheque, setEditingCheque] = useState<Cheque | null>(null);

  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
  const [statusActionCheque, setStatusActionCheque] = useState<Cheque | null>(null);
  const [newStatus, setNewStatus] = useState<ChequeStatus>('cleared');
  const [targetAccountId, setTargetAccountId] = useState<number | ''>('');

  const [copiedField, setCopiedField] = useState<string | null>(null);

  const [formState, setFormState] = useState<{
    type: ChequeType;
    sayad_id: string;
    cheque_number: string;
    bank_name: string;
    branch_name: string;
    account_number: string;
    drawer_name: string;
    customer_id: number | '';
    supplier_id: number | '';
    amount: number | '';
    issue_date: string;
    due_date: string;
    alert_days_before: number;
    notes: string;
  }>({
    type: 'received',
    sayad_id: '',
    cheque_number: '',
    bank_name: '',
    branch_name: '',
    account_number: '',
    drawer_name: '',
    customer_id: '',
    supplier_id: '',
    amount: '',
    issue_date: new Date().toISOString().split('T')[0],
    due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    alert_days_before: 3,
    notes: '',
  });

  const loadData = async () => {
    if (!activeOrganization?.id) return;
    setLoading(true);
    try {
      const [chkList, accList, custList, supList] = await Promise.all([
        storage.getCheques({ organization_id: activeOrganization.id }),
        storage.getFinancialAccounts({ organization_id: activeOrganization.id }),
        storage.getCustomers({ organization_id: activeOrganization.id }),
        storage.getSuppliers({ organization_id: activeOrganization.id }),
      ]);
      setCheques(chkList);
      setAccounts(accList);
      setCustomers(custList);
      setSuppliers(supList);
    } catch (err) {
      console.error('Error loading scheduled payments:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [activeOrganization?.id]);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(id);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleOpenNewCheque = (type: ChequeType = 'received') => {
    setEditingCheque(null);
    setFormState({
      type,
      sayad_id: '',
      cheque_number: '',
      bank_name: '',
      branch_name: '',
      account_number: '',
      drawer_name: '',
      customer_id: '',
      supplier_id: '',
      amount: '',
      issue_date: new Date().toISOString().split('T')[0],
      due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      alert_days_before: 3,
      notes: '',
    });
    setIsChequeModalOpen(true);
  };

  const handleOpenEditCheque = (chk: Cheque) => {
    setEditingCheque(chk);
    const custId = typeof chk.customer_id === 'object' ? (chk.customer_id as any)?.id : chk.customer_id;
    const supId = typeof chk.supplier_id === 'object' ? (chk.supplier_id as any)?.id : chk.supplier_id;

    setFormState({
      type: (chk.type as ChequeType) || 'received',
      sayad_id: chk.sayad_id || '',
      cheque_number: chk.cheque_number || '',
      bank_name: chk.bank_name || '',
      branch_name: chk.branch_name || '',
      account_number: chk.account_number || '',
      drawer_name: chk.drawer_name || '',
      customer_id: custId || '',
      supplier_id: supId || '',
      amount: chk.amount,
      issue_date: chk.issue_date,
      due_date: chk.due_date,
      alert_days_before: chk.alert_days_before || 3,
      notes: chk.notes || '',
    });
    setIsChequeModalOpen(true);
  };

  const handleSaveCheque = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeOrganization?.id || !formState.cheque_number || !formState.amount) return;

    try {
      const refCode = formState.sayad_id.trim() || `REF-${Date.now().toString().slice(-6)}`;
      const payload: Partial<Cheque> = {
        id: editingCheque?.id,
        organization_id: activeOrganization.id,
        type: formState.type,
        sayad_id: refCode,
        cheque_number: formState.cheque_number.trim(),
        bank_name: formState.bank_name.trim(),
        branch_name: formState.branch_name.trim() || undefined,
        account_number: formState.account_number.trim() || undefined,
        drawer_name: formState.drawer_name.trim(),
        customer_id: formState.type === 'received' && formState.customer_id ? Number(formState.customer_id) : null,
        supplier_id: formState.type === 'issued' && formState.supplier_id ? Number(formState.supplier_id) : null,
        amount: Number(formState.amount),
        issue_date: formState.issue_date,
        due_date: formState.due_date,
        alert_days_before: Number(formState.alert_days_before) || 3,
        status: editingCheque ? editingCheque.status : 'registered',
        notes: formState.notes.trim() || undefined,
      };

      await storage.saveCheque(payload);
      setIsChequeModalOpen(false);
      loadData();
    } catch (err) {
      console.error('Error saving scheduled payment:', err);
    }
  };

  const handleDeleteCheque = async (id: number) => {
    if (confirm(t('accounting.deleteChequeConfirm'))) {
      try {
        await storage.deleteCheque(id);
        loadData();
      } catch (err) {
        console.error('Error deleting scheduled payment:', err);
      }
    }
  };

  const handleOpenStatusModal = (chk: Cheque) => {
    setStatusActionCheque(chk);
    setNewStatus(chk.status === 'registered' ? 'in_bank' : 'cleared');
    const defaultAcc = accounts.find((a) => a.is_default) || accounts[0];
    setTargetAccountId(defaultAcc?.id ?? '');
    setIsStatusModalOpen(true);
  };

  const handleUpdateStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!statusActionCheque?.id) return;

    try {
      await storage.updateChequeStatus(
        statusActionCheque.id,
        newStatus,
        targetAccountId ? Number(targetAccountId) : undefined
      );
      setIsStatusModalOpen(false);
      loadData();
    } catch (err) {
      console.error('Error updating payment status:', err);
    }
  };

  const stats = useMemo(() => {
    const totalReceived = cheques.filter((c) => c.type === 'received').reduce((sum, c) => sum + Number(c.amount), 0);
    const totalIssued = cheques.filter((c) => c.type === 'issued').reduce((sum, c) => sum + Number(c.amount), 0);
    const pendingClearing = cheques.filter((c) => c.status === 'in_bank').reduce((sum, c) => sum + Number(c.amount), 0);
    const bounced = cheques.filter((c) => c.status === 'bounced').reduce((sum, c) => sum + Number(c.amount), 0);
    const dueAlerts = cheques.filter((c) => {
      if (c.status === 'cleared' || c.status === 'cancelled' || c.status === 'returned') return false;
      const days = c.days_until_due ?? 0;
      return days <= (c.alert_days_before || 3);
    });

    return {
      totalReceived,
      totalIssued,
      pendingClearing,
      bounced,
      dueAlertsCount: dueAlerts.length,
      dueAlerts,
    };
  }, [cheques]);

  const filteredCheques = useMemo(() => {
    return cheques.filter((chk) => {
      if (activeTab === 'received' && chk.type !== 'received') return false;
      if (activeTab === 'issued' && chk.type !== 'issued') return false;
      if (activeTab === 'alerts') {
        if (chk.status === 'cleared' || chk.status === 'cancelled' || chk.status === 'returned') return false;
        const days = chk.days_until_due ?? 0;
        if (days > (chk.alert_days_before || 3)) return false;
      }

      if (statusFilter !== 'all' && chk.status !== statusFilter) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          (chk.sayad_id || '').toLowerCase().includes(q) ||
          (chk.cheque_number || '').toLowerCase().includes(q) ||
          (chk.bank_name || '').toLowerCase().includes(q) ||
          (chk.drawer_name || '').toLowerCase().includes(q) ||
          (chk.customer_name && chk.customer_name.toLowerCase().includes(q)) ||
          (chk.supplier_name && chk.supplier_name.toLowerCase().includes(q))
        );
      }

      return true;
    });
  }, [cheques, activeTab, statusFilter, searchQuery]);

  const getStatusBadge = (status: ChequeStatus) => {
    switch (status) {
      case 'cleared':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 className="w-3 h-3" />
            {t('accounting.statusCleared')}
          </span>
        );
      case 'in_bank':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300">
            <Clock className="w-3 h-3" />
            {t('accounting.statusInBank')}
          </span>
        );
      case 'bounced':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300">
            <XCircle className="w-3 h-3" />
            {t('accounting.statusBounced')}
          </span>
        );
      case 'transferred':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300">
            <ArrowRightLeft className="w-3 h-3" />
            {t('accounting.statusTransferred')}
          </span>
        );
      case 'cancelled':
      case 'returned':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-neutral-200 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400">
            {t('accounting.statusCancelled')}
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300">
            <FileText className="w-3 h-3" />
            {t('accounting.statusRegistered')}
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Actions */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-4">
        <div>
          <h2 className="text-base font-bold text-neutral-900 dark:text-white flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            <span>{t('accounting.chequesTitle')}</span>
          </h2>
          <p className="text-xs text-neutral-500 mt-0.5">
            {t('accounting.chequesSubtitle')}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
          <button
            onClick={() => handleOpenNewCheque('issued')}
            className="flex-1 sm:flex-none justify-center flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-800 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors cursor-pointer shadow-xs"
          >
            <ArrowUpRight className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
            <span>{isIt ? 'Nuova Scadenza Passiva' : 'New Outgoing Payable'}</span>
          </button>

          <button
            onClick={() => handleOpenNewCheque('received')}
            className="flex-1 sm:flex-none justify-center flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-neutral-900 hover:bg-neutral-800 dark:bg-white dark:hover:bg-neutral-100 text-white dark:text-neutral-900 transition-colors cursor-pointer shadow-xs"
          >
            <Plus className="w-4 h-4" />
            <span>{isIt ? 'Nuova Scadenza Attiva' : 'New Incoming Receivable'}</span>
          </button>
        </div>
      </div>

      {/* Due Date Alert Banner */}
      {stats.dueAlertsCount > 0 && (
        <div className="p-3.5 sm:p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-amber-100 dark:bg-amber-900/60 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-amber-900 dark:text-amber-200">
                {isIt
                  ? `Attenzione: ${stats.dueAlertsCount} pagamenti programmati in scadenza o scaduti!`
                  : `Attention: ${stats.dueAlertsCount} scheduled payments are due soon or overdue!`}
              </h4>
              <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-0.5">
                {isIt
                  ? 'Verifica lo stato di incasso o regolamento per evitare ritardi o insoluti.'
                  : 'Review clearing status to stay ahead of receivables and supplier due dates.'}
              </p>
            </div>
          </div>

          <button
            onClick={() => setActiveTab('alerts')}
            className="w-full sm:w-auto px-3 py-1.5 text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition-colors shrink-0 cursor-pointer shadow-xs text-center"
          >
            {isIt ? 'Mostra Scadenze' : 'View Due Alerts'}
          </button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
        <div className="p-3 sm:p-4 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200/80 dark:border-neutral-800 shadow-xs">
          <div className="flex items-center justify-between text-neutral-500 mb-1.5 sm:mb-2">
            <span className="text-[11px] sm:text-xs font-medium line-clamp-1">{t('accounting.totalReceivedAmount')}</span>
            <ArrowDownLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          </div>
          <div className="text-base sm:text-lg font-bold font-mono text-emerald-600 dark:text-emerald-400">
            {formatCurrency(stats.totalReceived, currency)}
          </div>
        </div>

        <div className="p-3 sm:p-4 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200/80 dark:border-neutral-800 shadow-xs">
          <div className="flex items-center justify-between text-neutral-500 mb-1.5 sm:mb-2">
            <span className="text-[11px] sm:text-xs font-medium line-clamp-1">{t('accounting.totalIssuedAmount')}</span>
            <ArrowUpRight className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-600 dark:text-amber-400 shrink-0" />
          </div>
          <div className="text-base sm:text-lg font-bold font-mono text-amber-600 dark:text-amber-400">
            {formatCurrency(stats.totalIssued, currency)}
          </div>
        </div>

        <div className="p-3 sm:p-4 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200/80 dark:border-neutral-800 shadow-xs">
          <div className="flex items-center justify-between text-neutral-500 mb-1.5 sm:mb-2">
            <span className="text-[11px] sm:text-xs font-medium line-clamp-1">{t('accounting.pendingClearingAmount')}</span>
            <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-600 dark:text-blue-400 shrink-0" />
          </div>
          <div className="text-base sm:text-lg font-bold font-mono text-blue-600 dark:text-blue-400">
            {formatCurrency(stats.pendingClearing, currency)}
          </div>
        </div>

        <div className="p-3 sm:p-4 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200/80 dark:border-neutral-800 shadow-xs">
          <div className="flex items-center justify-between text-neutral-500 mb-1.5 sm:mb-2">
            <span className="text-[11px] sm:text-xs font-medium line-clamp-1">{t('accounting.bouncedAmount')}</span>
            <XCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-red-600 dark:text-red-400 shrink-0" />
          </div>
          <div className="text-base sm:text-lg font-bold font-mono text-red-600 dark:text-red-400">
            {formatCurrency(stats.bounced, currency)}
          </div>
        </div>
      </div>

      {/* Filter Tabs & Search Bar */}
      <div className="space-y-3 bg-white dark:bg-neutral-900 p-3.5 sm:p-4 rounded-xl border border-neutral-200/80 dark:border-neutral-800">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto">
            {[
              { id: 'all', label: isIt ? 'Tutte le Scadenze' : 'All Payments' },
              { id: 'received', label: t('accounting.receivedCheques') },
              { id: 'issued', label: t('accounting.issuedCheques') },
              { id: 'alerts', label: `${isIt ? 'In Scadenza' : 'Due Alerts'} (${stats.dueAlertsCount})` },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                  activeTab === tab.id
                    ? 'bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 font-semibold'
                    : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200/70 dark:hover:bg-neutral-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 absolute start-3 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input
              type="text"
              placeholder={isIt ? 'Cerca riferimento SEPA/RiBa, banca, intestatario...' : 'Search SEPA/reference, document #, bank, payer...'}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full ps-9 pe-3 py-1.5 text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg focus:outline-hidden focus:ring-1 focus:ring-neutral-900 dark:focus:ring-white"
            />
          </div>
        </div>

        {/* Status Filter Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto pt-2 border-t border-neutral-100 dark:border-neutral-800">
          <span className="text-[11px] font-medium text-neutral-400 me-2 shrink-0">{t('common.status', 'Status')}:</span>
          {[
            { id: 'all', label: t('common.all', 'All') },
            { id: 'registered', label: t('accounting.statusRegistered') },
            { id: 'in_bank', label: t('accounting.statusInBank') },
            { id: 'cleared', label: t('accounting.statusCleared') },
            { id: 'bounced', label: t('accounting.statusBounced') },
            { id: 'transferred', label: t('accounting.statusTransferred') },
            { id: 'cancelled', label: t('accounting.statusCancelled') },
          ].map((st) => (
            <button
              key={st.id}
              onClick={() => setStatusFilter(st.id)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium whitespace-nowrap transition-colors cursor-pointer ${
                statusFilter === st.id
                  ? 'bg-neutral-800 text-white dark:bg-neutral-200 dark:text-neutral-900 font-bold'
                  : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'
              }`}
            >
              {st.label}
            </button>
          ))}
        </div>
      </div>

      {/* Scheduled Payments List */}
      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center text-xs text-neutral-500">
          <RefreshCw className="w-5 h-5 animate-spin mb-3 text-neutral-400" />
          <span>{t('common.loading')}</span>
        </div>
      ) : filteredCheques.length === 0 ? (
        <div className="p-12 text-center bg-white dark:bg-neutral-900 rounded-xl border border-dashed border-neutral-300 dark:border-neutral-800">
          <CheckSquare className="w-8 h-8 mx-auto text-neutral-400 mb-3" />
          <p className="text-xs text-neutral-500">{t('accounting.noCheques')}</p>
          <button
            onClick={() => handleOpenNewCheque('received')}
            className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-neutral-900 dark:text-white bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded-lg cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{t('accounting.newCheque')}</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredCheques.map((chk) => {
            const isReceived = chk.type === 'received';
            const daysLeft = chk.days_until_due ?? 0;
            const isDuePassed = chk.is_overdue;
            const isDueSoon = !isDuePassed && daysLeft <= (chk.alert_days_before || 3) && chk.status !== 'cleared' && chk.status !== 'cancelled';

            return (
              <div
                key={chk.id}
                className={`p-5 rounded-2xl border bg-white dark:bg-neutral-900 flex flex-col justify-between transition-all shadow-xs relative overflow-hidden ${
                  isDuePassed
                    ? 'border-red-300 dark:border-red-900/60 bg-red-50/20 dark:bg-red-950/10'
                    : isDueSoon
                    ? 'border-amber-300 dark:border-amber-900/60 bg-amber-50/20 dark:bg-amber-950/10'
                    : 'border-neutral-200/80 dark:border-neutral-800'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold ${
                          isReceived
                            ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                            : 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300'
                        }`}
                      >
                        {isReceived ? <ArrowDownLeft className="w-3.5 h-3.5" /> : <ArrowUpRight className="w-3.5 h-3.5" />}
                        {isReceived ? t('accounting.receivedCheques') : t('accounting.issuedCheques')}
                      </span>
                      <span className="text-xs font-bold text-neutral-800 dark:text-neutral-200">
                        {chk.bank_name} {chk.branch_name ? `(${chk.branch_name})` : ''}
                      </span>
                    </div>

                    <div>{getStatusBadge(chk.status as ChequeStatus)}</div>
                  </div>

                  {/* Payment Reference & Document Number */}
                  <div className="p-3 bg-neutral-50 dark:bg-neutral-800/60 rounded-xl border border-neutral-100 dark:border-neutral-800 space-y-2 mb-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-neutral-500 font-medium">{t('accounting.sayadId')}:</span>
                      <div className="flex items-center gap-2 font-mono font-bold text-neutral-900 dark:text-white text-xs">
                        <span>{chk.sayad_id || '—'}</span>
                        {chk.sayad_id && (
                          <button
                            onClick={() => handleCopy(chk.sayad_id, `ref-${chk.id}`)}
                            className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 cursor-pointer"
                          >
                            {copiedField === `ref-${chk.id}` ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-neutral-500">
                      <span>{t('accounting.chequeNumber')}:</span>
                      <span className="font-mono font-semibold text-neutral-700 dark:text-neutral-300">{chk.cheque_number}</span>
                    </div>
                  </div>

                  {/* Drawer & Party Details */}
                  <div className="space-y-1.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-neutral-500">{t('accounting.drawerName')}:</span>
                      <span className="font-semibold text-neutral-900 dark:text-white">{chk.drawer_name}</span>
                    </div>

                    {(chk.customer_name || chk.supplier_name) && (
                      <div className="flex items-center justify-between">
                        <span className="text-neutral-500">{isIt ? 'Controparte:' : 'Counterparty:'}</span>
                        <span className="font-semibold text-neutral-700 dark:text-neutral-300">
                          {chk.customer_name || chk.supplier_name}
                        </span>
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-1">
                      <span className="text-neutral-500">{t('accounting.dueDate')}:</span>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold font-mono text-neutral-900 dark:text-white">
                          {formatDate(chk.due_date)}
                        </span>
                        {chk.status !== 'cleared' && chk.status !== 'cancelled' && (
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                              isDuePassed
                                ? 'bg-red-600 text-white'
                                : daysLeft === 0
                                ? 'bg-amber-500 text-white'
                                : isDueSoon
                                ? 'bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-200'
                                : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400'
                            }`}
                          >
                            {isDuePassed
                              ? `${Math.abs(daysLeft)} ${t('accounting.passedDays')}`
                              : daysLeft === 0
                              ? t('accounting.todayDue')
                              : `${daysLeft} ${t('accounting.daysRemaining')}`}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Amount */}
                  <div className="mt-4 pt-3 border-t border-neutral-100 dark:border-neutral-800 flex items-baseline justify-between">
                    <span className="text-xs text-neutral-500">{t('accounting.chequeAmount')}:</span>
                    <div className="text-base font-extrabold text-neutral-900 dark:text-white font-mono">
                      {formatCurrency(chk.amount, currency)}
                    </div>
                  </div>
                </div>

                {/* Actions Footer */}
                <div className="mt-4 pt-3 border-t border-neutral-100 dark:border-neutral-800 flex items-center justify-between gap-2">
                  <button
                    onClick={() => handleOpenStatusModal(chk)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-neutral-900 hover:bg-neutral-800 dark:bg-white dark:hover:bg-neutral-100 text-white dark:text-neutral-900 transition-colors cursor-pointer shadow-xs"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>{isIt ? 'Aggiorna Stato' : 'Update Status / Settle'}</span>
                  </button>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleOpenEditCheque(chk)}
                      className="p-1.5 rounded-lg text-neutral-500 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeleteCheque(chk.id)}
                      className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create / Edit Modal */}
      {isChequeModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-neutral-900 rounded-2xl w-full max-w-xl shadow-2xl border border-neutral-200 dark:border-neutral-800 overflow-hidden">
            <form onSubmit={handleSaveCheque}>
              <div className="p-4 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between">
                <h3 className="text-sm font-bold text-neutral-900 dark:text-white">
                  {editingCheque ? t('accounting.editCheque') : t('accounting.newCheque')}
                </h3>
                <button
                  type="button"
                  onClick={() => setIsChequeModalOpen(false)}
                  className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 cursor-pointer text-xs"
                >
                  ✕
                </button>
              </div>

              <div className="p-4 space-y-3.5 max-h-[75vh] overflow-y-auto custom-scrollbar">
                <div>
                  <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                    {t('accounting.chequeType')}
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setFormState({ ...formState, type: 'received' })}
                      className={`py-2 text-xs font-bold rounded-lg border text-center transition-all cursor-pointer ${
                        formState.type === 'received'
                          ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
                          : 'border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400'
                      }`}
                    >
                      {t('accounting.receivedCheques')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormState({ ...formState, type: 'issued' })}
                      className={`py-2 text-xs font-bold rounded-lg border text-center transition-all cursor-pointer ${
                        formState.type === 'issued'
                          ? 'border-amber-600 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300'
                          : 'border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400'
                      }`}
                    >
                      {t('accounting.issuedCheques')}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                    {t('accounting.sayadId')}
                  </label>
                  <input
                    type="text"
                    placeholder={t('accounting.sayadIdPlaceholder')}
                    value={formState.sayad_id}
                    onChange={(e) => setFormState({ ...formState, sayad_id: e.target.value })}
                    className="w-full px-3 py-2 text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg focus:outline-hidden font-mono"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                      {t('accounting.chequeNumber')} *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder={isIt ? 'es. RIBA-2026-014' : 'e.g. SEPA-2026-014'}
                      value={formState.cheque_number}
                      onChange={(e) => setFormState({ ...formState, cheque_number: e.target.value })}
                      className="w-full px-3 py-2 text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg focus:outline-hidden font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                      {t('accounting.chequeAmount')} ({currency}) *
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      min={0.01}
                      placeholder="0.00"
                      value={formState.amount}
                      onChange={(e) => setFormState({ ...formState, amount: e.target.value === '' ? '' : Number(e.target.value) })}
                      className="w-full px-3 py-2 text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg focus:outline-hidden font-bold font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                      {t('accounting.bankName')} *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder={isIt ? 'es. Intesa Sanpaolo, UniCredit...' : 'e.g. UniCredit, BNP Paribas, Revolut...'}
                      value={formState.bank_name}
                      onChange={(e) => setFormState({ ...formState, bank_name: e.target.value })}
                      className="w-full px-3 py-2 text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg focus:outline-hidden"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                      {t('accounting.branchName')}
                    </label>
                    <input
                      type="text"
                      placeholder={isIt ? 'Filiale o IBAN...' : 'Branch or IBAN...'}
                      value={formState.branch_name}
                      onChange={(e) => setFormState({ ...formState, branch_name: e.target.value })}
                      className="w-full px-3 py-2 text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg focus:outline-hidden"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                      {t('accounting.drawerName')} *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder={isIt ? 'Nome intestatario / azienda...' : 'Payer or beneficiary name...'}
                      value={formState.drawer_name}
                      onChange={(e) => setFormState({ ...formState, drawer_name: e.target.value })}
                      className="w-full px-3 py-2 text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg focus:outline-hidden"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                      {formState.type === 'received'
                        ? isIt ? 'Collega Cliente' : 'Link Customer'
                        : isIt ? 'Collega Fornitore' : 'Link Supplier'}
                    </label>
                    {formState.type === 'received' ? (
                      <select
                        value={formState.customer_id}
                        onChange={(e) => setFormState({ ...formState, customer_id: Number(e.target.value) || '' })}
                        className="w-full px-3 py-2 text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg focus:outline-hidden"
                      >
                        <option value="">{isIt ? 'Seleziona cliente (opzionale)...' : 'Select customer (optional)...'}</option>
                        {customers.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name} {c.phone ? `(${c.phone})` : ''}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <select
                        value={formState.supplier_id}
                        onChange={(e) => setFormState({ ...formState, supplier_id: Number(e.target.value) || '' })}
                        className="w-full px-3 py-2 text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg focus:outline-hidden"
                      >
                        <option value="">{isIt ? 'Seleziona fornitore (opzionale)...' : 'Select supplier (optional)...'}</option>
                        {suppliers.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <DateInput
                    label={t('accounting.issueDate')}
                    value={formState.issue_date}
                    onChange={(iso) => setFormState({ ...formState, issue_date: iso })}
                  />

                  <DateInput
                    label={`${t('accounting.dueDate')} *`}
                    required
                    value={formState.due_date}
                    onChange={(iso) => setFormState({ ...formState, due_date: iso })}
                  />

                  <div>
                    <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                      {isIt ? 'Avviso Anticipo (Giorni)' : 'Reminder (Days Before)'}
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={30}
                      value={formState.alert_days_before}
                      onChange={(e) => setFormState({ ...formState, alert_days_before: Number(e.target.value) || 3 })}
                      className="w-full px-3 py-2 text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg focus:outline-hidden"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                    {t('common.notes', 'Notes')}
                  </label>
                  <textarea
                    rows={2}
                    placeholder={isIt ? 'Riferimento fattura, acconto, condizioni...' : 'Invoice settlement, deposit, payment terms...'}
                    value={formState.notes}
                    onChange={(e) => setFormState({ ...formState, notes: e.target.value })}
                    className="w-full px-3 py-2 text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg focus:outline-hidden resize-none"
                  />
                </div>
              </div>

              <div className="p-4 border-t border-neutral-200 dark:border-neutral-800 flex justify-end gap-2 bg-neutral-50 dark:bg-neutral-800/40">
                <button
                  type="button"
                  onClick={() => setIsChequeModalOpen(false)}
                  className="px-4 py-2 text-xs font-medium rounded-lg text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors cursor-pointer"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-semibold rounded-lg bg-neutral-900 hover:bg-neutral-800 dark:bg-white dark:hover:bg-neutral-100 text-white dark:text-neutral-900 transition-colors cursor-pointer"
                >
                  {editingCheque ? t('common.save') : t('accounting.newCheque')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Status Transition Modal */}
      {isStatusModalOpen && statusActionCheque && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-neutral-900 rounded-2xl w-full max-w-md shadow-2xl border border-neutral-200 dark:border-neutral-800 overflow-hidden">
            <form onSubmit={handleUpdateStatus}>
              <div className="p-4 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between">
                <h3 className="text-sm font-bold text-neutral-900 dark:text-white">
                  {isIt ? 'Aggiorna Stato Pagamento' : 'Update Payment Status'}
                </h3>
                <button
                  type="button"
                  onClick={() => setIsStatusModalOpen(false)}
                  className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 cursor-pointer text-xs"
                >
                  ✕
                </button>
              </div>

              <div className="p-4 space-y-4">
                <div className="p-3 bg-neutral-50 dark:bg-neutral-800/60 rounded-xl text-xs space-y-1">
                  <div className="flex justify-between">
                    <span className="text-neutral-500">{t('accounting.chequeNumber')}:</span>
                    <span className="font-mono font-bold text-neutral-900 dark:text-white">{statusActionCheque.cheque_number}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-neutral-500">{t('accounting.chequeAmount')}:</span>
                    <span className="font-mono font-bold text-neutral-900 dark:text-white">{formatCurrency(statusActionCheque.amount, currency)}</span>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">
                    {isIt ? 'Nuovo Stato' : 'New Status'}
                  </label>
                  <select
                    value={newStatus}
                    onChange={(e) => setNewStatus(e.target.value as ChequeStatus)}
                    className="w-full px-3 py-2 text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg focus:outline-hidden"
                  >
                    <option value="registered">{t('accounting.statusRegistered')}</option>
                    <option value="in_bank">{t('accounting.statusInBank')}</option>
                    <option value="cleared">{t('accounting.statusCleared')}</option>
                    <option value="bounced">{t('accounting.statusBounced')}</option>
                    <option value="transferred">{t('accounting.statusTransferred')}</option>
                    <option value="cancelled">{t('accounting.statusCancelled')}</option>
                  </select>
                </div>

                {newStatus === 'cleared' && (
                  <div>
                    <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">
                      {isIt ? 'Conto Bancario / Cassa di Regolamento' : 'Settlement Bank / Cash Account'}
                    </label>
                    <select
                      value={targetAccountId}
                      onChange={(e) => setTargetAccountId(Number(e.target.value) || '')}
                      className="w-full px-3 py-2 text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg focus:outline-hidden"
                    >
                      <option value="">{isIt ? 'Seleziona conto...' : 'Select account...'}</option>
                      {accounts.map((acc) => (
                        <option key={acc.id} value={acc.id}>
                          {acc.name} ({formatCurrency(acc.current_balance || 0, currency)})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div className="p-4 border-t border-neutral-200 dark:border-neutral-800 flex justify-end gap-2 bg-neutral-50 dark:bg-neutral-800/40">
                <button
                  type="button"
                  onClick={() => setIsStatusModalOpen(false)}
                  className="px-4 py-2 text-xs font-medium rounded-lg text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors cursor-pointer"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-semibold rounded-lg bg-neutral-900 hover:bg-neutral-800 dark:bg-white dark:hover:bg-neutral-100 text-white dark:text-neutral-900 transition-colors cursor-pointer"
                >
                  {t('common.save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
