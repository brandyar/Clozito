import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useTranslation } from '../../i18n';
import { BRAND, SUPPORTED_CURRENCIES } from '../../config/brand';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import {
  Lock,
  Mail,
  ShieldCheck,
  Eye,
  EyeOff,
  AlertCircle,
  User as UserIcon,
  Phone,
  Building2,
  Boxes,
  Warehouse,
  ChevronRight,
  Coins,
  Sparkles,
} from 'lucide-react';
import { AuthLanguageDropdown } from './AuthLanguageDropdown';

export const LoginModal: React.FC = () => {
  const { t, locale } = useTranslation();
  const {
    isLoginModalOpen,
    closeLoginModal,
    login,
    register,
    loginError,
    isLoading,
    isCloudAuthenticated,
  } = useAuth();

  const [activeTab, setActiveTab] = useState<'login' | 'register'>('login');
  const [registerStep, setRegisterStep] = useState<1 | 2>(1);

  // Step 1: User Account Credentials
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [userPhone, setUserPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Refs for fail-safe DOM reading
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const firstNameRef = useRef<HTMLInputElement>(null);
  const lastNameRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);

  // Step 2: Organization & Initial Tenant Seed
  const [orgName, setOrgName] = useState('');
  const [orgSlug, setOrgSlug] = useState('');
  const [currency, setCurrency] = useState<string>(BRAND.defaultCurrency);
  const [initialCategoryName, setInitialCategoryName] = useState(() => t('auth.initialCategoryDefault'));
  const [initialWarehouseName, setInitialWarehouseName] = useState(() => t('auth.initialWarehouseDefault'));

  useEffect(() => {
    setInitialCategoryName(t('auth.initialCategoryDefault'));
    setInitialWarehouseName(t('auth.initialWarehouseDefault'));
  }, [locale]);

  const [formValidationError, setFormValidationError] = useState<string | null>(null);

  const getEffectiveEmail = (): string => (email || emailRef.current?.value || '').trim();
  const getEffectivePassword = (): string => password || passwordRef.current?.value || '';
  const getEffectiveFirstName = (): string => (firstName || firstNameRef.current?.value || '').trim();
  const getEffectiveLastName = (): string => (lastName || lastNameRef.current?.value || '').trim();
  const getEffectivePhone = (): string => (userPhone || phoneRef.current?.value || '').trim();

  const handleNextStep = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setFormValidationError(null);

    const effEmail = getEffectiveEmail();
    const effPass = getEffectivePassword();
    const effFirst = getEffectiveFirstName();
    const effLast = getEffectiveLastName();
    const effPhone = getEffectivePhone();

    if (!effFirst || !effLast || !effPhone || !effEmail || !effPass) {
      setFormValidationError(t('auth.requiredFieldsError'));
      return;
    }
    if (effPass.length < 6) {
      setFormValidationError(t('auth.passwordMinError'));
      return;
    }
    if (confirmPassword && effPass !== confirmPassword) {
      setFormValidationError(t('auth.passwordMismatchError'));
      return;
    }

    if (!orgName) {
      setOrgName(`${effFirst} ${effLast} Atelier`.trim());
    }
    setRegisterStep(2);
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormValidationError(null);
    const effEmail = getEffectiveEmail();
    const effPass = getEffectivePassword();
    if (!effEmail || !effPass) {
      setFormValidationError(t('auth.enterEmailPasswordError'));
      return;
    }
    await login(effEmail, effPass);
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormValidationError(null);

    const effEmail = getEffectiveEmail();
    const effPass = getEffectivePassword();
    const effFirst = getEffectiveFirstName();
    const effLast = getEffectiveLastName();
    const effPhone = getEffectivePhone();

    if (!effEmail || !effPass) {
      setFormValidationError(t('auth.invalidStep1Error'));
      setRegisterStep(1);
      return;
    }

    if (!orgName.trim()) {
      setFormValidationError(t('auth.orgNameRequiredError'));
      return;
    }

    await register({
      firstName: effFirst,
      lastName: effLast,
      userPhone: effPhone,
      email: effEmail,
      pass: effPass,
      orgName: orgName.trim(),
      orgSlug: orgSlug.trim() || undefined,
      currency,
      locale,
      initialCategoryName: initialCategoryName.trim(),
      initialWarehouseName: initialWarehouseName.trim(),
    });
  };

  if (!isLoginModalOpen) return null;

  const activeError = formValidationError || loginError;

  return (
    <Modal
      isOpen={isLoginModalOpen}
      onClose={closeLoginModal}
      title={
        activeTab === 'login'
          ? t('auth.loginTitle')
          : registerStep === 1
          ? t('auth.step1ModalTitle')
          : t('auth.step2ModalTitle')
      }
      maxWidth="max-w-lg"
    >
      <div className="space-y-4 text-neutral-900 dark:text-neutral-100 pt-1">
        {/* Top Feature Banner */}
        <div className="p-3 bg-neutral-900 text-white rounded-xl flex items-center justify-between gap-3 shadow-sm">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-white/10 p-1 flex items-center justify-center shrink-0 border border-white/20">
              <img src="/favicon.png" alt={BRAND.name} className="w-full h-full object-contain" />
            </div>
            <div>
              <p className="font-bold text-xs">{BRAND.name}</p>
              <p className="text-[10px] text-neutral-400 font-mono">{locale === 'it' ? BRAND.taglineIt : BRAND.taglineEn}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="hidden sm:inline-block text-[10px] font-mono px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
              {isCloudAuthenticated ? t('auth.cloudConnected') : t('auth.onlineSignIn')}
            </span>
          </div>
        </div>

        {/* Auth Mode Tabs */}
        <div className="flex rounded-xl bg-neutral-100 dark:bg-neutral-800/70 p-1 border border-neutral-200 dark:border-neutral-700">
          <button
            type="button"
            onClick={() => {
              setActiveTab('login');
              setRegisterStep(1);
              setFormValidationError(null);
            }}
            className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${
              activeTab === 'login'
                ? 'bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white shadow-xs'
                : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
            }`}
          >
            {t('auth.loginButton')}
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('register');
              setRegisterStep(1);
              setFormValidationError(null);
            }}
            className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${
              activeTab === 'register'
                ? 'bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white shadow-xs'
                : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
            }`}
          >
            {t('auth.registerAndOpenStore')}
          </button>
        </div>

        {/* Step Indicator when Registering */}
        {activeTab === 'register' && (
          <div className="flex items-center justify-between bg-neutral-50 dark:bg-neutral-900/50 p-2 rounded-xl border border-neutral-200 dark:border-neutral-800 text-xs">
            <div className="flex items-center gap-2">
              <span
                className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  registerStep === 1
                    ? 'bg-neutral-900 dark:bg-white text-white dark:text-neutral-900'
                    : 'bg-emerald-500 text-white'
                }`}
              >
                1
              </span>
              <span className={registerStep === 1 ? 'font-bold text-neutral-900 dark:text-white' : 'text-neutral-500'}>
                {t('auth.step1Label')}
              </span>
            </div>
            <div className="w-10 h-[1px] bg-neutral-300 dark:bg-neutral-700" />
            <div className="flex items-center gap-2">
              <span
                className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  registerStep === 2
                    ? 'bg-neutral-900 dark:bg-white text-white dark:text-neutral-900'
                    : 'bg-neutral-200 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400'
                }`}
              >
                2
              </span>
              <span className={registerStep === 2 ? 'font-bold text-neutral-900 dark:text-white' : 'text-neutral-500'}>
                {t('auth.step2Label')}
              </span>
            </div>
          </div>
        )}

        {/* Error Alert */}
        {activeError && (
          <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200/90 dark:border-red-800/60 text-red-700 dark:text-red-300 text-xs flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-600 dark:text-red-400 mt-0.5" />
            <div className="flex-1">
              <p className="font-bold">{t('auth.operationError')}</p>
              <p className="text-[11px] text-red-600 dark:text-red-300 mt-0.5 leading-relaxed">{activeError}</p>
            </div>
          </div>
        )}

        {/* LOGIN FORM */}
        {activeTab === 'login' && (
          <form onSubmit={handleLoginSubmit} className="space-y-3">
            <div>
              <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                {t('auth.email')} <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 start-0 ps-2.5 flex items-center pointer-events-none text-neutral-400">
                  <Mail className="w-3.5 h-3.5" />
                </div>
                <input
                  type="email"
                  required
                  ref={emailRef}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t('auth.emailPlaceholder')}
                  className="w-full ps-8 pe-2.5 py-1.5 bg-white dark:bg-[#181a20] border border-neutral-200 dark:border-neutral-700 rounded-lg text-xs font-mono text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-400"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                {t('auth.password')} <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 start-0 ps-2.5 flex items-center pointer-events-none text-neutral-400">
                  <Lock className="w-3.5 h-3.5" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  ref={passwordRef}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t('auth.passwordPlaceholder')}
                  className="w-full ps-8 pe-9 py-1.5 bg-white dark:bg-[#181a20] border border-neutral-200 dark:border-neutral-700 rounded-lg text-xs font-mono text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-400"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 end-0 pe-2.5 flex items-center text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            <div className="pt-2">
              <Button
                type="submit"
                variant="primary"
                className="w-full justify-center py-2 text-xs font-bold"
                disabled={isLoading}
              >
                {isLoading ? t('auth.signingIn') : t('auth.loginPanelButton')}
              </Button>
            </div>
          </form>
        )}

        {/* REGISTER MULTI-STEP FORM (Keep inputs mounted to prevent password manager unmount wipes) */}
        {activeTab === 'register' && (
          <div className="space-y-3">
            {/* STEP 1: Personal credentials */}
            <div className={registerStep === 1 ? 'space-y-3' : 'hidden'}>
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                    {t('auth.firstName')} <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 start-0 ps-2.5 flex items-center pointer-events-none text-neutral-400">
                      <UserIcon className="w-3.5 h-3.5" />
                    </div>
                    <input
                      type="text"
                      ref={firstNameRef}
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      placeholder={t('auth.firstNamePlaceholder')}
                      className="w-full ps-8 pe-2.5 py-1.5 bg-white dark:bg-[#181a20] border border-neutral-200 dark:border-neutral-700 rounded-lg text-xs text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-400"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                    {t('auth.lastName')} <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    ref={lastNameRef}
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder={t('auth.lastNamePlaceholder')}
                    className="w-full px-2.5 py-1.5 bg-white dark:bg-[#181a20] border border-neutral-200 dark:border-neutral-700 rounded-lg text-xs text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-400"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                    {t('auth.phone')} <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 start-0 ps-2.5 flex items-center pointer-events-none text-neutral-400">
                      <Phone className="w-3.5 h-3.5" />
                    </div>
                    <input
                      type="tel"
                      ref={phoneRef}
                      value={userPhone}
                      onChange={(e) => setUserPhone(e.target.value)}
                      placeholder={t('auth.phonePlaceholder')}
                      className="w-full ps-8 pe-2.5 py-1.5 bg-white dark:bg-[#181a20] border border-neutral-200 dark:border-neutral-700 rounded-lg text-xs font-mono text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-400"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                    {t('auth.email')} <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 start-0 ps-2.5 flex items-center pointer-events-none text-neutral-400">
                      <Mail className="w-3.5 h-3.5" />
                    </div>
                    <input
                      type="email"
                      ref={emailRef}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder={t('auth.emailPlaceholder')}
                      className="w-full ps-8 pe-2.5 py-1.5 bg-white dark:bg-[#181a20] border border-neutral-200 dark:border-neutral-700 rounded-lg text-xs font-mono text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-400"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                    {t('auth.password')} <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 start-0 ps-2.5 flex items-center pointer-events-none text-neutral-400">
                      <Lock className="w-3.5 h-3.5" />
                    </div>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      ref={passwordRef}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={t('auth.passwordPlaceholder')}
                      className="w-full ps-8 pe-2.5 py-1.5 bg-white dark:bg-[#181a20] border border-neutral-200 dark:border-neutral-700 rounded-lg text-xs font-mono text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-400"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                    {t('auth.confirmPassword')} <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 start-0 ps-2.5 flex items-center pointer-events-none text-neutral-400">
                      <Lock className="w-3.5 h-3.5" />
                    </div>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder={t('auth.confirmPasswordPlaceholder')}
                      className="w-full ps-8 pe-2.5 py-1.5 bg-white dark:bg-[#181a20] border border-neutral-200 dark:border-neutral-700 rounded-lg text-xs font-mono text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-400"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-2">
                <Button
                  type="button"
                  variant="primary"
                  onClick={handleNextStep}
                  className="w-full justify-center py-2 text-xs font-bold flex items-center gap-2"
                >
                  <span>{t('auth.nextStepOrg')}</span>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* STEP 2: Organization & Starter Items */}
            <div className={registerStep === 2 ? 'space-y-3' : 'hidden'}>
              <div className="p-3 bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200/80 dark:border-blue-800/60 rounded-xl text-blue-900 dark:text-blue-200 text-xs">
                <div className="flex items-center gap-1.5 font-bold mb-1">
                  <Sparkles className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  <span>{t('auth.orgSetupTitle')}</span>
                </div>
                <p className="text-[11px] text-blue-700 dark:text-blue-300 leading-relaxed">
                  {t('auth.orgSetupDesc')}
                </p>
              </div>

              {/* Organization Name */}
              <div>
                <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                  {t('auth.orgName')} <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 start-0 ps-2.5 flex items-center pointer-events-none text-neutral-400">
                    <Building2 className="w-3.5 h-3.5" />
                  </div>
                  <input
                    type="text"
                    value={orgName}
                    onChange={(e) => setOrgName(e.target.value)}
                    placeholder={t('auth.orgNamePlaceholder')}
                    className="w-full ps-8 pe-2.5 py-1.5 bg-white dark:bg-[#181a20] border border-neutral-200 dark:border-neutral-700 rounded-lg text-xs font-bold text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-400"
                  />
                </div>
              </div>

              {/* Slug & Currency */}
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                    {t('auth.orgSlug')}
                  </label>
                  <input
                    type="text"
                    value={orgSlug}
                    onChange={(e) => setOrgSlug(e.target.value)}
                    placeholder={t('auth.orgSlugPlaceholder')}
                    className="w-full px-2.5 py-1.5 bg-white dark:bg-[#181a20] border border-neutral-200 dark:border-neutral-700 rounded-lg text-xs font-mono text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-400"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                    {t('auth.defaultCurrency')}
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 start-0 ps-2.5 flex items-center pointer-events-none text-neutral-400">
                      <Coins className="w-3.5 h-3.5" />
                    </div>
                    <select
                      value={currency}
                      onChange={(e) => setCurrency(e.target.value)}
                      className="w-full ps-8 pe-2.5 py-1.5 bg-white dark:bg-[#181a20] border border-neutral-200 dark:border-neutral-700 rounded-lg text-xs font-bold text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-400 cursor-pointer"
                    >
                      {SUPPORTED_CURRENCIES.map((cur) => (
                        <option key={cur.code} value={cur.code}>
                          {locale === 'it' ? cur.labelIt : cur.labelEn}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Starter Items */}
              <div className="border-t border-neutral-200/80 dark:border-neutral-800 pt-2.5 space-y-2.5">
                <p className="text-[11px] font-bold text-neutral-600 dark:text-neutral-400">{t('auth.starterItemsTitle')}</p>

                <div>
                  <label className="block text-[11px] font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                    {t('auth.initialCategoryLabel')}
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 start-0 ps-2.5 flex items-center pointer-events-none text-neutral-400">
                      <Boxes className="w-3.5 h-3.5" />
                    </div>
                    <input
                      type="text"
                      value={initialCategoryName}
                      onChange={(e) => setInitialCategoryName(e.target.value)}
                      placeholder={t('auth.initialCategoryDefault')}
                      className="w-full ps-8 pe-2.5 py-1.5 bg-white dark:bg-[#181a20] border border-neutral-200 dark:border-neutral-700 rounded-lg text-xs text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-400"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                    {t('auth.initialWarehouseLabel')}
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 start-0 ps-2.5 flex items-center pointer-events-none text-neutral-400">
                      <Warehouse className="w-3.5 h-3.5" />
                    </div>
                    <input
                      type="text"
                      value={initialWarehouseName}
                      onChange={(e) => setInitialWarehouseName(e.target.value)}
                      placeholder={t('auth.initialWarehouseDefault')}
                      className="w-full ps-8 pe-2.5 py-1.5 bg-white dark:bg-[#181a20] border border-neutral-200 dark:border-neutral-700 rounded-lg text-xs text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-400"
                    />
                  </div>
                </div>
              </div>

              {/* Step 2 Form Buttons */}
              <div className="pt-2 flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setRegisterStep(1)}
                  className="py-2 text-xs"
                >
                  {t('auth.back')}
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  onClick={handleRegisterSubmit}
                  className="flex-1 justify-center py-2 text-xs font-bold"
                  disabled={isLoading}
                >
                  {isLoading ? t('auth.creatingWorkspace') : t('auth.completeRegistration')}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Centered Icon-Only Language Selector */}
        <div className="flex justify-center pt-1">
          <AuthLanguageDropdown placement="up" />
        </div>

        {/* Footer info */}
        <div className="text-center pt-2 border-t border-neutral-100 dark:border-neutral-800">
          <p className="text-[10px] font-mono text-neutral-400 flex items-center justify-center gap-1">
            <ShieldCheck className="w-3 h-3 text-emerald-500" />
            <span>{t('auth.multiTenantFooter')}</span>
          </p>
        </div>
      </div>
    </Modal>
  );
};
