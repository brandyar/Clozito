import React, { useState, useEffect } from 'react';
import { useTranslation } from '../../../i18n';
import { useOrganization } from '../../../context/OrganizationContext';
import { FinancialAccount, TreasuryTransaction, TreasuryTransactionType } from '../../../types/accounting';
import { formatCurrency, resolveCurrencyCode } from '../../../utils/formatters';
import { DateInput } from '../../../components/ui/DateInput';
import { X } from 'lucide-react';

interface TreasuryTransferModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialType: TreasuryTransactionType;
  defaultAccountId?: number;
  accounts: FinancialAccount[];
  onSave: (payload: Partial<TreasuryTransaction>) => Promise<void>;
}

export const TreasuryTransferModal: React.FC<TreasuryTransferModalProps> = ({
  isOpen,
  onClose,
  initialType = 'transfer',
  defaultAccountId,
  accounts,
  onSave,
}) => {
  const { t, locale } = useTranslation();
  const isIt = locale === 'it';
  const { activeOrganization } = useOrganization();
  const activeCurrency = resolveCurrencyCode(activeOrganization?.currency);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [transferType, setTransferType] = useState<TreasuryTransactionType>(initialType);
  const [sourceAccountId, setSourceAccountId] = useState<number | ''>('');
  const [destinationAccountId, setDestinationAccountId] = useState<number | ''>('');
  const [transferAmount, setTransferAmount] = useState<number | ''>('');
  const [transferTrackingCode, setTransferTrackingCode] = useState('');
  const [transferDate, setTransferDate] = useState(new Date().toISOString().split('T')[0]);
  const [transferDescription, setTransferDescription] = useState('');

  useEffect(() => {
    setTransferType(initialType);
    if (initialType === 'transfer') {
      const src = defaultAccountId || (accounts[0]?.id ?? '');
      setSourceAccountId(src);
      setDestinationAccountId(accounts.find((a) => a.id !== src)?.id ?? '');
    } else if (initialType === 'deposit') {
      setDestinationAccountId(defaultAccountId || (accounts[0]?.id ?? ''));
      setSourceAccountId('');
    } else if (initialType === 'withdrawal') {
      setSourceAccountId(defaultAccountId || (accounts[0]?.id ?? ''));
      setDestinationAccountId('');
    }
    setTransferAmount('');
    setTransferTrackingCode(`TRX-${Math.floor(100000 + Math.random() * 900000)}`);
    setTransferDate(new Date().toISOString().split('T')[0]);
    setTransferDescription('');
  }, [initialType, defaultAccountId, accounts, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferAmount || Number(transferAmount) <= 0) return;

    setIsSubmitting(true);
    try {
      const payload: Partial<TreasuryTransaction> = {
        type: transferType,
        source_account_id:
          transferType !== 'deposit' && sourceAccountId ? Number(sourceAccountId) : null,
        destination_account_id:
          transferType !== 'withdrawal' && destinationAccountId
            ? Number(destinationAccountId)
            : null,
        amount: Number(transferAmount),
        tracking_code: transferTrackingCode.trim() || undefined,
        transaction_date: transferDate,
        description: transferDescription.trim() || undefined,
      };

      await onSave(payload);
      onClose();
    } catch (err) {
      console.error('Error saving transfer:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white dark:bg-neutral-900 rounded-2xl w-full max-w-md shadow-2xl border border-neutral-200 dark:border-neutral-800 overflow-hidden">
        <form onSubmit={handleSubmit}>
          <div className="p-4 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between">
            <h3 className="text-sm font-bold text-neutral-900 dark:text-white">
              {t('accounting.treasuryTransfer')}
            </h3>
            <button
              type="button"
              onClick={onClose}
              className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 cursor-pointer p-1 rounded-lg"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-4 space-y-3.5">
            <div>
              <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                {isIt ? 'Tipo di operazione' : 'Operation Type'}
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'transfer', label: t('accounting.transfer') },
                  { id: 'deposit', label: t('accounting.deposit') },
                  { id: 'withdrawal', label: t('accounting.withdrawal') },
                ].map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    onClick={() => {
                      const newType = item.id as TreasuryTransactionType;
                      setTransferType(newType);
                      if (newType === 'deposit') {
                        setSourceAccountId('');
                        if (!destinationAccountId) setDestinationAccountId(accounts[0]?.id ?? '');
                      } else if (newType === 'withdrawal') {
                        setDestinationAccountId('');
                        if (!sourceAccountId) setSourceAccountId(accounts[0]?.id ?? '');
                      }
                    }}
                    className={`py-2 text-xs font-semibold rounded-lg border text-center transition-all cursor-pointer ${
                      transferType === item.id
                        ? 'border-neutral-900 dark:border-white bg-neutral-900 dark:bg-white text-white dark:text-neutral-900'
                        : 'border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {transferType !== 'deposit' && (
              <div>
                <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  {t('accounting.sourceAccount')} *
                </label>
                <select
                  required
                  value={sourceAccountId}
                  onChange={(e) => setSourceAccountId(Number(e.target.value))}
                  className="w-full px-3 py-2 text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg focus:outline-hidden"
                >
                  <option value="">{isIt ? 'Seleziona conto di origine...' : 'Select source account...'}</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({isIt ? 'Saldo' : 'Balance'}: {formatCurrency(a.current_balance, activeCurrency)})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {transferType !== 'withdrawal' && (
              <div>
                <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  {t('accounting.destinationAccount')} *
                </label>
                <select
                  required
                  value={destinationAccountId}
                  onChange={(e) => setDestinationAccountId(Number(e.target.value))}
                  className="w-full px-3 py-2 text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg focus:outline-hidden"
                >
                  <option value="">{isIt ? 'Seleziona conto di destinazione...' : 'Select destination account...'}</option>
                  {accounts.map((a) => (
                    <option
                      key={a.id}
                      value={a.id}
                      disabled={
                        transferType === 'transfer' && Number(a.id) === Number(sourceAccountId)
                      }
                    >
                      {a.name} ({isIt ? 'Saldo' : 'Balance'}: {formatCurrency(a.current_balance, activeCurrency)})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  {t('accounting.transferAmount')} ({activeCurrency}) *
                </label>
                <input
                  type="number"
                  required
                  min={0.01}
                  step="0.01"
                  placeholder="0.00"
                  value={transferAmount}
                  onChange={(e) =>
                    setTransferAmount(e.target.value === '' ? '' : Number(e.target.value))
                  }
                  className="w-full px-3 py-2 text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg focus:outline-hidden font-bold font-mono"
                />
              </div>

              <DateInput
                label={t('accounting.transferDate')}
                value={transferDate}
                onChange={(iso) => setTransferDate(iso)}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                {t('accounting.trackingCode')}
              </label>
              <input
                type="text"
                value={transferTrackingCode}
                onChange={(e) => setTransferTrackingCode(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg focus:outline-hidden font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                {isIt ? 'Note e descrizione' : 'Description & Notes'}
              </label>
              <textarea
                rows={2}
                placeholder={isIt ? 'Dettagli del trasferimento o operazione bancaria...' : 'Bank transfer or treasury movement notes...'}
                value={transferDescription}
                onChange={(e) => setTransferDescription(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg focus:outline-hidden resize-none"
              />
            </div>
          </div>

          <div className="p-4 border-t border-neutral-200 dark:border-neutral-800 flex justify-end gap-2 bg-neutral-50 dark:bg-neutral-800/40">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium rounded-lg text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors cursor-pointer"
            >
              {t('common.cancel', isIt ? 'Annulla' : 'Cancel')}
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 text-xs font-semibold rounded-lg bg-neutral-900 hover:bg-neutral-800 dark:bg-white dark:hover:bg-neutral-100 text-white dark:text-neutral-900 transition-colors cursor-pointer disabled:opacity-50"
            >
              {isIt ? 'Registra movimento' : 'Save Movement'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
