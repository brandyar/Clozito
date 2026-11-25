import React, { useState, useEffect } from 'react';
import { useTranslation } from '../../i18n';
import { Organization } from '../../types';
import { useOrganization } from '../../context/OrganizationContext';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { ImageUpload } from '../../components/ui/ImageUpload';
import { BRAND, SUPPORTED_CURRENCIES, SUPPORTED_TIMEZONES } from '../../config/brand';
import {
  resolveCurrencyCode,
  getOrganizationTaxRate,
  saveOrganizationTaxRateCache,
  getFiscalMetadataCache,
  saveFiscalMetadataCache,
  roundCurrency,
} from '../../utils/formatters';
import { Save, AlertCircle, CheckCircle2, ShieldAlert } from 'lucide-react';

interface EditOrganizationModalProps {
  isOpen: boolean;
  onClose: () => void;
  organization: Organization | null;
  onSuccess?: () => void;
}

export const EditOrganizationModal: React.FC<EditOrganizationModalProps> = ({
  isOpen,
  onClose,
  organization,
  onSuccess,
}) => {
  const { t } = useTranslation();
  const { updateActiveOrganization, isOwner } = useOrganization();

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [currency, setCurrency] = useState<string>(BRAND.defaultCurrency);
  const [timezone, setTimezone] = useState<string>(BRAND.defaultTimezone);
  const [defaultTaxRate, setDefaultTaxRate] = useState<string>(String(BRAND.defaultVatRate));
  const [logo, setLogo] = useState('');
  const [signature, setSignature] = useState('');
  const [phone, setPhone] = useState('');
  const [mobile, setMobile] = useState('');
  const [address, setAddress] = useState('');
  const [vatNumber, setVatNumber] = useState('');
  const [taxCode, setTaxCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    if (organization) {
      const cachedFiscal = getFiscalMetadataCache('org', organization.id);
      setName(organization.name || '');
      setSlug(organization.slug || '');
      setCurrency(resolveCurrencyCode(organization.currency));
      const existingTz = organization.timezone || BRAND.defaultTimezone;
      setTimezone(existingTz === 'Asia/Tehran' ? BRAND.defaultTimezone : existingTz);
      setDefaultTaxRate(String(getOrganizationTaxRate(organization)));
      setLogo(organization.logo || '');
      setSignature(organization.signature || '');
      setPhone(organization.phone || '');
      setMobile(organization.mobile || '');
      setAddress(organization.address || '');
      setVatNumber(organization.vat_number || cachedFiscal.vat_number || '');
      setTaxCode(organization.tax_code || cachedFiscal.tax_code || '');
      setError(null);
      setSuccessMsg(null);
    }
  }, [organization, isOpen]);

  if (!isOpen || !organization) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isOwner) {
      setError(t('settings.ownerOnlyEdit'));
      return;
    }

    const cleanName = name.trim();
    if (!cleanName) {
      setError(t('settings.orgNameRequired'));
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const parsedTaxRate = Math.min(100, Math.max(0, roundCurrency(defaultTaxRate)));
      const cleanVat = vatNumber.trim().toUpperCase() || null;
      const cleanTaxCode = taxCode.trim().toUpperCase() || null;

      saveOrganizationTaxRateCache(organization.id, parsedTaxRate);
      saveFiscalMetadataCache('org', organization.id, {
        vat_number: cleanVat,
        tax_code: cleanTaxCode,
      });

      await updateActiveOrganization({
        name: cleanName,
        slug: slug.trim() || organization.slug,
        currency,
        timezone,
        default_tax_rate: parsedTaxRate,
        vat_number: cleanVat,
        tax_code: cleanTaxCode,
        status: organization.status,
        plan: organization.plan,
        logo: logo ? logo.trim() : null,
        signature: signature ? signature.trim() : null,
        phone: phone ? phone.trim() : null,
        mobile: mobile ? mobile.trim() : null,
        address: address ? address.trim() : null,
      });

      setSuccessMsg(t('settings.editOrgSuccess'));
      setTimeout(() => {
        onClose();
        if (onSuccess) onSuccess();
      }, 700);
    } catch (err: any) {
      setError(err?.message || t('common.error'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('settings.editOrgTitle')}
      maxWidth="xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4 pt-1">
        {!isOwner && (
          <div className="flex items-center gap-2.5 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 text-amber-900 dark:text-amber-300 text-xs rounded-xl">
            <ShieldAlert className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <span>{t('settings.ownerOnlyEdit')}</span>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/60 text-red-700 dark:text-red-300 text-xs rounded-xl">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {successMsg && (
          <div className="flex items-center gap-2 p-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 text-emerald-700 dark:text-emerald-300 text-xs rounded-xl">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Org Name & Slug Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1.5">
              {t('settings.orgName')} <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              disabled={!isOwner || isSubmitting}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('settings.orgName')}
              className="w-full px-3.5 py-2.5 bg-white dark:bg-[#181a20] border border-neutral-200 dark:border-neutral-700 rounded-xl text-xs text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-400 focus:border-transparent disabled:bg-neutral-100 dark:disabled:bg-neutral-900/60 disabled:text-neutral-400 dark:disabled:text-neutral-600 disabled:cursor-not-allowed transition-all"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1.5">
              {t('settings.orgSlug')}
            </label>
            <input
              type="text"
              disabled={!isOwner || isSubmitting}
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="slug-name"
              dir="ltr"
              className="w-full px-3.5 py-2.5 bg-white dark:bg-[#181a20] border border-neutral-200 dark:border-neutral-700 rounded-xl text-xs text-neutral-900 dark:text-neutral-100 font-mono focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-400 focus:border-transparent disabled:bg-neutral-100 dark:disabled:bg-neutral-900/60 disabled:text-neutral-400 dark:disabled:text-neutral-600 disabled:cursor-not-allowed transition-all text-start"
            />
          </div>
        </div>

        {/* Currency, Timezone & Default VAT Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1.5">{t('settings.orgCurrency')}</label>
            <select
              disabled={!isOwner || isSubmitting}
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="w-full px-3 py-2.5 bg-white dark:bg-[#181a20] border border-neutral-200 dark:border-neutral-700 rounded-xl text-xs text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-400 focus:border-transparent disabled:bg-neutral-100 dark:disabled:bg-neutral-900/60 disabled:text-neutral-400 dark:disabled:text-neutral-600 disabled:cursor-not-allowed cursor-pointer"
            >
              {SUPPORTED_CURRENCIES.map((cur) => (
                <option key={cur.code} value={cur.code} className="bg-white dark:bg-[#181a20] text-neutral-900 dark:text-neutral-100">
                  {cur.labelEn}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1.5">{t('settings.mainTimezone')}</label>
            <select
              disabled={!isOwner || isSubmitting}
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="w-full px-3 py-2.5 bg-white dark:bg-[#181a20] border border-neutral-200 dark:border-neutral-700 rounded-xl text-xs text-neutral-900 dark:text-neutral-100 font-mono text-[11px] focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-400 focus:border-transparent disabled:bg-neutral-100 dark:disabled:bg-neutral-900/60 disabled:text-neutral-400 dark:disabled:text-neutral-600 disabled:cursor-not-allowed cursor-pointer"
            >
              {SUPPORTED_TIMEZONES.map((tz) => (
                <option key={tz.value} value={tz.value} className="bg-white dark:bg-[#181a20] text-neutral-900 dark:text-neutral-100">
                  {tz.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1.5">
              {t('settings.defaultVatRate', 'Default VAT (%)')}
            </label>
            <input
              type="number"
              min="0"
              max="100"
              step="0.01"
              disabled={!isOwner || isSubmitting}
              value={defaultTaxRate}
              onChange={(e) => setDefaultTaxRate(e.target.value)}
              placeholder="22"
              className="w-full px-3 py-2.5 bg-white dark:bg-[#181a20] border border-neutral-200 dark:border-neutral-700 rounded-xl text-xs font-mono text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-400 focus:border-transparent disabled:bg-neutral-100 dark:disabled:bg-neutral-900/60 disabled:text-neutral-400 dark:disabled:text-neutral-600 disabled:cursor-not-allowed"
            />
          </div>
        </div>

        {/* Brand & Document Assets (Logo & Signature) */}
        <div>
          <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-2">
            {t('settings.brandAssetsTitle', 'Brand & Document Assets')}
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <ImageUpload
              mode="avatar"
              label={t('settings.orgLogoShort', 'Organization Logo')}
              subtitle={t('settings.orgLogoSubtitleShort', 'Invoice header & workspace')}
              placeholderText={t('settings.logo', 'Logo')}
              value={logo}
              onChange={(val) => setLogo(val)}
              helperText={t('settings.orgLogoHelperShort', 'PNG or JPG (max 5MB)')}
              uploadText={t('settings.uploadLogo', 'Upload Logo')}
              changeText={t('common.change', 'Change')}
              removeText={t('common.delete', 'Delete')}
              maxSizeInMB={5}
              disabled={!isOwner || isSubmitting}
            />

            <ImageUpload
              mode="avatar"
              label={t('settings.orgSignatureShort', 'Official Stamp & Signature')}
              subtitle={t('settings.orgSignatureSubtitleShort', 'Sales invoices & PDFs')}
              placeholderText={t('settings.signature', 'Signature')}
              value={signature}
              onChange={(val) => setSignature(val)}
              helperText={t('settings.orgSignatureHelperShort', 'Transparent PNG recommended (max 5MB)')}
              uploadText={t('settings.uploadSignature', 'Upload Signature')}
              changeText={t('common.change', 'Change')}
              removeText={t('common.delete', 'Delete')}
              maxSizeInMB={5}
              disabled={!isOwner || isSubmitting}
            />
          </div>
        </div>

        {/* Contact Numbers (Phone & Mobile) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1.5">
              {t('settings.orgPhone', 'Landline Phone')}
            </label>
            <input
              type="text"
              disabled={!isOwner || isSubmitting}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+39 02 1234567"
              dir="ltr"
              className="w-full px-3.5 py-2.5 bg-white dark:bg-[#181a20] border border-neutral-200 dark:border-neutral-700 rounded-xl text-xs text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-400 focus:border-transparent disabled:bg-neutral-100 dark:disabled:bg-neutral-900/60 disabled:text-neutral-400 dark:disabled:text-neutral-600 disabled:cursor-not-allowed transition-all text-start"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1.5">
              {t('settings.orgMobile', 'Mobile Number')}
            </label>
            <input
              type="text"
              disabled={!isOwner || isSubmitting}
              value={mobile}
              onChange={(e) => setMobile(e.target.value)}
              placeholder="+39 333 1234567"
              dir="ltr"
              className="w-full px-3.5 py-2.5 bg-white dark:bg-[#181a20] border border-neutral-200 dark:border-neutral-700 rounded-xl text-xs text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-400 focus:border-transparent disabled:bg-neutral-100 dark:disabled:bg-neutral-900/60 disabled:text-neutral-400 dark:disabled:text-neutral-600 disabled:cursor-not-allowed transition-all text-start"
            />
          </div>
        </div>

        {/* European B2B Fiscal Identifiers (VAT / Partita IVA & Tax Code / Codice Fiscale) */}
        <div className="p-3.5 rounded-xl bg-neutral-50/80 dark:bg-neutral-900/50 border border-neutral-200/80 dark:border-neutral-800 space-y-3">
          <div className="text-[11px] font-bold text-neutral-700 dark:text-neutral-300 uppercase tracking-wide">
            {t('settings.orgFiscalSectionTitle', 'Fiscal & B2B Invoicing Identifiers (EU)')}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1.5">
                {t('settings.orgVatNumber', 'VAT Number / Partita IVA')}
              </label>
              <input
                type="text"
                disabled={!isOwner || isSubmitting}
                value={vatNumber}
                onChange={(e) => setVatNumber(e.target.value)}
                placeholder={t('settings.orgVatNumberPlaceholder', 'e.g. IT01234567890')}
                dir="ltr"
                className="w-full px-3.5 py-2.5 bg-white dark:bg-[#181a20] border border-neutral-200 dark:border-neutral-700 rounded-xl text-xs font-mono uppercase text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-500 placeholder:normal-case focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-400 focus:border-transparent disabled:bg-neutral-100 dark:disabled:bg-neutral-900/60 disabled:text-neutral-400 dark:disabled:text-neutral-600 disabled:cursor-not-allowed transition-all text-start"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1.5">
                {t('settings.orgTaxCode', 'Tax Code / Codice Fiscale')}
              </label>
              <input
                type="text"
                disabled={!isOwner || isSubmitting}
                value={taxCode}
                onChange={(e) => setTaxCode(e.target.value)}
                placeholder={t('settings.orgTaxCodePlaceholder', 'e.g. RSSMRA85M01H501Z')}
                dir="ltr"
                className="w-full px-3.5 py-2.5 bg-white dark:bg-[#181a20] border border-neutral-200 dark:border-neutral-700 rounded-xl text-xs font-mono uppercase text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-500 placeholder:normal-case focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-400 focus:border-transparent disabled:bg-neutral-100 dark:disabled:bg-neutral-900/60 disabled:text-neutral-400 dark:disabled:text-neutral-600 disabled:cursor-not-allowed transition-all text-start"
              />
            </div>
          </div>
        </div>

        {/* Legal / Business Address */}
        <div>
          <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1.5">
            {t('settings.orgLegalAddress', 'Legal / Registered Address')}
          </label>
          <textarea
            rows={2}
            disabled={!isOwner || isSubmitting}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder={t('settings.orgAddressPlaceholder', 'Street, City, Postal Code, Country (shown on invoice headers)')}
            className="w-full px-3.5 py-2 bg-white dark:bg-[#181a20] border border-neutral-200 dark:border-neutral-700 rounded-xl text-xs text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-400 focus:border-transparent disabled:bg-neutral-100 dark:disabled:bg-neutral-900/60 disabled:text-neutral-400 dark:disabled:text-neutral-600 disabled:cursor-not-allowed transition-all resize-none"
          />
        </div>

        {/* Footer Actions */}
        <div className="flex flex-wrap items-center justify-end gap-2.5 pt-4 border-t border-neutral-100 dark:border-neutral-800">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isSubmitting}
            className="text-xs"
          >
            {t('common.cancel')}
          </Button>
          {isOwner && (
            <Button
              type="submit"
              variant="primary"
              isLoading={isSubmitting}
              icon={<Save className="w-4 h-4" />}
              className="text-xs font-bold bg-blue-600 hover:bg-blue-700"
            >
              {t('settings.saveOrgChanges')}
            </Button>
          )}
        </div>
      </form>
    </Modal>
  );
};
