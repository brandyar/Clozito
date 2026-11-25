import React, { useState, useMemo } from 'react';
import { useTranslation } from '../../../i18n';
import { PosShift, Organization } from '../../../types';
import { Button } from '../../ui/Button';
import { Badge } from '../../ui/Badge';
import { formatCurrency, formatDate, resolveCurrencyCode, roundCurrency } from '../../../utils/formatters';
import {
  Clock,
  Printer,
  Info,
  User,
  Building2,
  Wallet,
  Receipt,
  Banknote,
  CreditCard,
  ShoppingBag,
  StopCircle,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';

interface PosShiftActiveViewProps {
  displayedShift: PosShift;
  myOpenShift: PosShift | null;
  user: any;
  activeOrganization: Organization | null;
  hasAccounting: boolean;
  onPrintZReport: (shift: PosShift) => void;
  onCloseShift: (params: {
    closingBalance: number;
    closingNotes: string;
    isOtherCashierShift: boolean;
  }) => Promise<void>;
}

export const PosShiftActiveView: React.FC<PosShiftActiveViewProps> = ({
  displayedShift,
  myOpenShift,
  user,
  activeOrganization,
  hasAccounting,
  onPrintZReport,
  onCloseShift,
}) => {
  const { locale } = useTranslation();
  const isIt = locale === 'it';
  const activeCurrency = resolveCurrencyCode(activeOrganization?.currency);

  const [closingBalance, setClosingBalance] = useState<string>('');
  const [closingNotes, setClosingNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const cashRefunds = Number(displayedShift.total_cash_refund_amount) || 0;
  const exchangeCashIn = Number(displayedShift.total_exchange_cash_in_amount) || 0;
  const returnsCount = Number(displayedShift.total_returns_count) || 0;
  const totalRefunds = Number(displayedShift.total_refund_amount) || 0;

  const expectedCash = useMemo(() => {
    const opening = Number(displayedShift.opening_balance) || 0;
    const cashSales = Number(displayedShift.total_cash_amount) || 0;
    return roundCurrency(opening + cashSales - cashRefunds + exchangeCashIn);
  }, [displayedShift, cashRefunds, exchangeCashIn]);

  const countedCash = roundCurrency(parseFloat(closingBalance.replace(/,/g, '')) || 0);
  const cashDiscrepancy = roundCurrency(countedCash - expectedCash);

  const handleSubmitClose = async (e: React.FormEvent) => {
    e.preventDefault();
    if (closingBalance.trim() === '') {
      alert(isIt ? 'Inserisci il saldo contanti contato.' : 'Please enter counted cash balance.');
      return;
    }

    const cleanClosing = roundCurrency(parseFloat(closingBalance.replace(/,/g, '')) || 0);
    const isOtherCashierShift = displayedShift.id !== myOpenShift?.id;
    const confirmMsg = isIt
      ? `Confermi di voler chiudere il turno #${displayedShift.id} con saldo contato di ${formatCurrency(
          cleanClosing,
          activeCurrency
        )}?`
      : `Are you sure you want to close shift #${displayedShift.id} with counted balance of ${formatCurrency(
          cleanClosing,
          activeCurrency
        )}?`;

    if (!window.confirm(confirmMsg)) return;

    setIsSubmitting(true);
    try {
      await onCloseShift({
        closingBalance: cleanClosing,
        closingNotes,
        isOtherCashierShift,
      });
    } catch (err: any) {
      alert(isIt ? `Errore nella chiusura del turno: ${err.message}` : `Error closing shift: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header Status Card */}
      <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-500/10 via-teal-500/10 to-emerald-500/5 dark:from-emerald-950/40 dark:via-teal-950/30 dark:to-emerald-950/20 border border-emerald-500/30 dark:border-emerald-500/20 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500 text-white flex items-center justify-center shadow-xs">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-black text-neutral-900 dark:text-neutral-100">
                {isIt ? `Turno Aperto #${displayedShift.id}` : `Open Shift #${displayedShift.id}`}
              </h4>
              <Badge variant="success">{isIt ? 'Attivo' : 'Active'}</Badge>
              {displayedShift.id !== myOpenShift?.id && (
                <Badge variant="neutral">{isIt ? 'Turno Collega' : 'Colleague Shift'}</Badge>
              )}
            </div>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
              {isIt ? 'Aperto alle:' : 'Opened at:'}{' '}
              <span className="font-mono">{formatDate(displayedShift.opened_at || '')}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPrintZReport(displayedShift)}
            icon={<Printer className="w-3.5 h-3.5" />}
          >
            {isIt ? 'Anteprima Report Z' : 'Preview Z-Report'}
          </Button>
        </div>
      </div>

      {/* Notice when manager is inspecting another cashier's shift */}
      {displayedShift.id !== myOpenShift?.id && (
        <div className="p-3 rounded-xl bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 flex items-start gap-2.5 text-xs text-amber-900 dark:text-amber-200">
          <Info className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
          <div className="leading-relaxed">
            <span className="font-bold">{isIt ? 'Nota Gestionale:' : 'Management Note:'}</span>{' '}
            {isIt
              ? `Visualizzazione live delle metriche per il cassiere ${
                  displayedShift.user_name || displayedShift.user_email
                }.`
              : `Viewing live metrics for cashier ${
                  displayedShift.user_name || displayedShift.user_email
                }.`}
          </div>
        </div>
      )}

      {/* Shift Assigned Metadata */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-3 rounded-xl bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200/80 dark:border-neutral-800">
          <div className="text-[11px] text-neutral-500 dark:text-neutral-400 flex items-center gap-1.5 mb-1">
            <User className="w-3.5 h-3.5 text-indigo-500" />
            <span>{isIt ? 'Cassiere' : 'Cashier'}</span>
          </div>
          <div className="text-xs font-bold text-neutral-900 dark:text-neutral-100 truncate">
            {displayedShift.user_name ||
              displayedShift.user_email ||
              user?.email ||
              'System User'}
          </div>
        </div>

        <div className="p-3 rounded-xl bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200/80 dark:border-neutral-800">
          <div className="text-[11px] text-neutral-500 dark:text-neutral-400 flex items-center gap-1.5 mb-1">
            <Building2 className="w-3.5 h-3.5 text-purple-500" />
            <span>{isIt ? 'Magazzino' : 'Warehouse'}</span>
          </div>
          <div className="text-xs font-bold text-neutral-900 dark:text-neutral-100 truncate">
            {displayedShift.warehouse_name || (isIt ? 'Tutti i Magazzini' : 'All Warehouses')}
          </div>
        </div>

        <div className="p-3 rounded-xl bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200/80 dark:border-neutral-800">
          <div className="text-[11px] text-neutral-500 dark:text-neutral-400 flex items-center gap-1.5 mb-1">
            <Wallet className="w-3.5 h-3.5 text-amber-500" />
            <span>{isIt ? 'Cassa / Conto' : 'Cashbox / Account'}</span>
          </div>
          <div className="text-xs font-bold text-neutral-900 dark:text-neutral-100 truncate">
            {displayedShift.account_name ||
              (hasAccounting ? (isIt ? 'Predefinito' : 'Default') : (isIt ? 'Disabilitato' : 'Disabled'))}
          </div>
        </div>
      </div>

      {/* Real-time Sales Summary Grid */}
      <div className="p-4 rounded-2xl bg-neutral-50 dark:bg-[#14161d] border border-neutral-200 dark:border-neutral-800 space-y-3">
        <div className="flex items-center justify-between">
          <h5 className="text-xs font-bold text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
            <Receipt className="w-4 h-4 text-indigo-500" />
            <span>{isIt ? 'Riepilogo Vendite Live' : 'Live Sales Breakdown'}</span>
          </h5>
          <span className="text-[11px] text-neutral-500 dark:text-neutral-400 font-bold">
            {displayedShift.total_orders_count || 0} {isIt ? 'Ordini' : 'Orders'}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <div className="p-2.5 rounded-xl bg-white dark:bg-[#181a20] border border-neutral-200/60 dark:border-neutral-800">
            <span className="text-[10px] text-neutral-500 dark:text-neutral-400 block mb-0.5">
              {isIt ? 'Saldo Iniziale' : 'Opening Balance'}
            </span>
            <span className="text-xs font-black text-neutral-900 dark:text-neutral-100 font-mono">
              {formatCurrency(Number(displayedShift.opening_balance) || 0, activeCurrency)}
            </span>
          </div>

          <div className="p-2.5 rounded-xl bg-white dark:bg-[#181a20] border border-neutral-200/60 dark:border-neutral-800">
            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 block mb-0.5 flex items-center gap-1">
              <Banknote className="w-3 h-3" />
              <span>{isIt ? 'Vendite Contanti' : 'Cash Sales'}</span>
            </span>
            <span className="text-xs font-black text-emerald-600 dark:text-emerald-400 font-mono">
              {formatCurrency(Number(displayedShift.total_cash_amount) || 0, activeCurrency)}
            </span>
          </div>

          <div className="p-2.5 rounded-xl bg-white dark:bg-[#181a20] border border-neutral-200/60 dark:border-neutral-800">
            <span className="text-[10px] text-blue-600 dark:text-blue-400 block mb-0.5 flex items-center gap-1">
              <CreditCard className="w-3 h-3" />
              <span>{isIt ? 'Vendite POS / Carta' : 'POS Sales'}</span>
            </span>
            <span className="text-xs font-black text-blue-600 dark:text-blue-400 font-mono">
              {formatCurrency(Number(displayedShift.total_pos_amount) || 0, activeCurrency)}
            </span>
          </div>

          <div className="p-2.5 rounded-xl bg-white dark:bg-[#181a20] border border-neutral-200/60 dark:border-neutral-800">
            <span className="text-[10px] text-purple-600 dark:text-purple-400 block mb-0.5 flex items-center gap-1">
              <ShoppingBag className="w-3 h-3" />
              <span>{isIt ? 'Totale Vendite' : 'Total Sales'}</span>
            </span>
            <span className="text-xs font-black text-purple-600 dark:text-purple-400 font-mono">
              {formatCurrency(Number(displayedShift.total_sales_amount) || 0, activeCurrency)}
            </span>
          </div>
        </div>

        {/* Returns & Refunds Summary inside Shift (shown when > 0) */}
        {(returnsCount > 0 || cashRefunds > 0 || exchangeCashIn > 0) && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <div className="p-2.5 rounded-xl bg-rose-50/70 dark:bg-rose-950/20 border border-rose-200/70 dark:border-rose-900/50">
              <span className="text-[10px] text-rose-600 dark:text-rose-400 block mb-0.5">
                {isIt ? `Resi / Cambi (${returnsCount})` : `Returns / Exchanges (${returnsCount})`}
              </span>
              <span className="text-xs font-black text-rose-700 dark:text-rose-300 font-mono">
                {formatCurrency(totalRefunds, activeCurrency)}
              </span>
            </div>
            <div className="p-2.5 rounded-xl bg-rose-50/70 dark:bg-rose-950/20 border border-rose-200/70 dark:border-rose-900/50">
              <span className="text-[10px] text-rose-600 dark:text-rose-400 block mb-0.5">
                {isIt ? 'Rimborsi in Contanti' : 'Cash Refunds Out'}
              </span>
              <span className="text-xs font-black text-rose-700 dark:text-rose-300 font-mono">
                - {formatCurrency(cashRefunds, activeCurrency)}
              </span>
            </div>
            <div className="p-2.5 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-200/70 dark:border-emerald-900/50">
              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 block mb-0.5">
                {isIt ? 'Differenza Contanti Cambio' : 'Exchange Cash In'}
              </span>
              <span className="text-xs font-black text-emerald-700 dark:text-emerald-300 font-mono">
                + {formatCurrency(exchangeCashIn, activeCurrency)}
              </span>
            </div>
          </div>
        )}

        {/* Expected Cash in drawer */}
        <div className="p-3 rounded-xl bg-indigo-50/80 dark:bg-indigo-950/30 border border-indigo-200/80 dark:border-indigo-800/60 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <Wallet className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <span className="font-bold text-neutral-800 dark:text-neutral-200">
              {isIt ? 'Contanti Attesi in Cassa:' : 'Expected Cash in Drawer:'}
            </span>
          </div>
          <span className="text-sm font-black text-indigo-700 dark:text-indigo-300 font-mono">
            {formatCurrency(expectedCash, activeCurrency)}
          </span>
        </div>
      </div>

      {/* Close Shift Form */}
      <form
        onSubmit={handleSubmitClose}
        className="p-4 rounded-2xl bg-neutral-50/80 dark:bg-[#14161d] border border-neutral-200 dark:border-neutral-800 space-y-3"
      >
        <h5 className="text-xs font-bold text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
          <StopCircle className="w-4 h-4 text-rose-500" />
          <span>{isIt ? 'Chiusura Turno e Quadratura Cassa' : 'Close Shift & Cash Balancing'}</span>
        </h5>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-neutral-800 dark:text-neutral-200 mb-1">
              {isIt ? 'Contanti Fisici Contati *' : 'Counted Physical Cash *'}
            </label>
            <div className="relative">
              <input
                type="text"
                value={closingBalance}
                onChange={(e) => setClosingBalance(e.target.value)}
                placeholder="0"
                className="w-full ps-3 pe-12 py-2 text-xs bg-white dark:bg-[#181a20] border border-neutral-200 dark:border-neutral-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500 text-neutral-900 dark:text-neutral-100 font-mono tracking-wider transition-all"
                required
              />
              <span className="absolute end-3 top-1/2 -translate-y-1/2 text-[11px] text-neutral-400 font-bold">
                {activeCurrency}
              </span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-neutral-800 dark:text-neutral-200 mb-1">
              {isIt ? 'Note di Chiusura (Opzionale)' : 'Closing Notes (Optional)'}
            </label>
            <input
              type="text"
              value={closingNotes}
              onChange={(e) => setClosingNotes(e.target.value)}
              placeholder={isIt ? 'Note sul passaggio turno...' : 'Shift handover notes...'}
              className="w-full px-3 py-2 text-xs bg-white dark:bg-[#181a20] border border-neutral-200 dark:border-neutral-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-neutral-900 dark:text-neutral-100 transition-all"
            />
          </div>
        </div>

        {/* Discrepancy indicator */}
        {closingBalance.trim() !== '' && (
          <div
            className={`p-3 rounded-xl border flex items-center justify-between text-xs transition-all ${
              cashDiscrepancy === 0
                ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
                : cashDiscrepancy < 0
                ? 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200'
                : 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-200'
            }`}
          >
            <div className="flex items-center gap-2">
              {cashDiscrepancy === 0 ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <AlertTriangle className="w-4 h-4" />
              )}
              <span className="font-bold">
                {cashDiscrepancy === 0
                  ? isIt
                    ? 'La cassa quadra perfettamente.'
                    : 'Cashbox is perfectly balanced.'
                  : cashDiscrepancy < 0
                  ? isIt
                    ? 'Avviso ammanco contanti:'
                    : 'Cash Shortage Warning:'
                  : isIt
                  ? 'Eccedenza contanti:'
                  : 'Cash Surplus:'}
              </span>
            </div>

            <span className="font-mono font-black text-sm">
              {cashDiscrepancy === 0
                ? '0'
                : formatCurrency(Math.abs(cashDiscrepancy), activeCurrency)}
            </span>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-2">
          <Button
            variant="danger"
            type="submit"
            isLoading={isSubmitting}
            icon={<StopCircle className="w-4 h-4" />}
          >
            {displayedShift.id !== myOpenShift?.id
              ? isIt
                ? 'Chiudi Turno Collega'
                : 'Close Colleague Shift'
              : isIt
              ? 'Chiudi e Finalizza Turno'
              : 'Close & Finalize Shift'}
          </Button>
        </div>
      </form>
    </div>
  );
};
