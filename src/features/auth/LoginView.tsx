import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useTranslation } from '../../i18n';
import { BRAND } from '../../config/brand';
import { Button } from '../../components/ui/Button';
import { Lock, Mail, ShieldCheck, Eye, EyeOff, AlertCircle, Shirt, User as UserIcon, Phone, Building2 } from 'lucide-react';
import { AuthLanguageDropdown } from './AuthLanguageDropdown';

interface LoginViewProps {
  onSuccess?: () => void;
}

export const LoginView: React.FC<LoginViewProps> = ({ onSuccess }) => {
  const { t, locale } = useTranslation();
  const {
    login,
    register,
    loginError,
    isLoading,
    isCloudAuthenticated,
    user,
    logout,
  } = useAuth();

  const [activeTab, setActiveTab] = useState<'login' | 'register'>('login');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [userPhone, setUserPhone] = useState('');
  const [orgName, setOrgName] = useState('');
  const [orgSlug, setOrgSlug] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [formValidationError, setFormValidationError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormValidationError(null);

    const cleanEmail = email.trim();
    const cleanPass = password;
    const cleanFirst = firstName.trim();
    const cleanLast = lastName.trim();
    const cleanPhone = userPhone.trim();
    const cleanOrg = orgName.trim() || `${cleanFirst} ${cleanLast} Store`.trim() || 'My Store';
    const cleanSlug = orgSlug.trim();

    if (activeTab === 'login') {
      if (!cleanEmail || !cleanPass) return;
      const ok = await login(cleanEmail, cleanPass);
      if (ok && onSuccess) {
        onSuccess();
      }
    } else {
      if (!cleanFirst || !cleanLast || !cleanPhone || !cleanEmail || !cleanPass) {
        setFormValidationError(t('auth.requiredFieldsError'));
        return;
      }
      if (cleanPass.length < 6) {
        setFormValidationError(t('auth.passwordMinError'));
        return;
      }
      if (cleanPass !== confirmPassword) {
        setFormValidationError(t('auth.passwordMismatchError'));
        return;
      }
      const ok = await register({
        firstName: cleanFirst,
        lastName: cleanLast,
        userPhone: cleanPhone,
        email: cleanEmail,
        pass: cleanPass,
        orgName: cleanOrg,
        orgSlug: cleanSlug || undefined,
        currency: BRAND.defaultCurrency,
        locale,
        initialCategoryName: t('auth.initialCategoryDefault'),
        initialWarehouseName: t('auth.initialWarehouseDefault'),
      });
      if (ok && onSuccess) {
        onSuccess();
      }
    }
  };

  const activeError = formValidationError || loginError;

  return (
    <div className="min-h-screen bg-[#fafafa] dark:bg-[#0f1115] flex flex-col justify-center items-center py-10 px-4 sm:px-6 lg:px-8 font-sans">
      <div className="w-full max-w-md space-y-6">
        {/* Brand Title */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 shadow-md">
            <Shirt className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-black text-neutral-900 dark:text-neutral-100 tracking-tight">
            {t('auth.loginTitle')}
          </h1>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 max-w-xs mx-auto leading-relaxed">
            {t('auth.loginSubtitle')}
          </p>
        </div>

        {/* Card */}
        <div className="bg-white dark:bg-[#16181d] border border-neutral-200/90 dark:border-neutral-800 rounded-2xl p-6 sm:p-8 shadow-xl space-y-5">
          {user ? (
            <div className="p-4 bg-emerald-50 dark:bg-emerald-950/30 rounded-xl border border-emerald-200/80 dark:border-emerald-800/60 space-y-3 text-start">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  {t('auth.activeAccount')}
                </span>
                <span className="text-[10px] font-mono bg-emerald-200/70 dark:bg-emerald-900/60 text-emerald-900 dark:text-emerald-200 px-2 py-0.5 rounded-full font-bold">
                  {isCloudAuthenticated ? t('auth.cloudConnected') : t('auth.activeUser')}
                </span>
              </div>
              <div className="text-xs text-neutral-700 dark:text-neutral-300 space-y-1 font-mono">
                <p>
                  {t('auth.userLabel')}: <strong className="text-neutral-900 dark:text-neutral-100">{user.first_name} {user.last_name}</strong>
                </p>
                <p>
                  {t('auth.email')}: <strong className="text-neutral-900 dark:text-neutral-100">{user.email}</strong>
                </p>
                <p>
                  {t('auth.roleLabel')}: <strong className="text-neutral-900 dark:text-neutral-100">{typeof user.role === 'object' ? user.role?.name : user.role || t('auth.systemUser')}</strong>
                </p>
              </div>
              <div className="pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => logout()}
                  className="w-full justify-center text-xs font-bold text-red-600 hover:bg-red-50 border-red-200"
                >
                  {t('auth.logout')}
                </Button>
              </div>
            </div>
          ) : (
            <>
              {/* Tab selector */}
              <div className="flex rounded-xl bg-neutral-100 dark:bg-neutral-800/70 p-1 border border-neutral-200 dark:border-neutral-700">
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('login');
                    setFormValidationError(null);
                  }}
                  className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
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
                    setFormValidationError(null);
                  }}
                  className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
                    activeTab === 'register'
                      ? 'bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white shadow-xs'
                      : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
                  }`}
                >
                  {t('auth.registerTab')}
                </button>
              </div>

              {activeError && (
                <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200/90 dark:border-red-800/60 text-red-700 dark:text-red-300 text-xs flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-600 dark:text-red-400 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-bold">{t('auth.authError')}</p>
                    <p className="text-[11px] text-red-600 dark:text-red-300 mt-0.5 leading-relaxed">{activeError}</p>
                  </div>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4 text-start">
                {activeTab === 'register' && (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                          {t('auth.firstName')} <span className="text-red-500">*</span>
                        </label>
                        <div className="relative">
                          <div className="absolute inset-y-0 start-0 ps-3 flex items-center pointer-events-none text-neutral-400">
                            <UserIcon className="w-4 h-4" />
                          </div>
                          <input
                            type="text"
                            required
                            value={firstName}
                            onChange={(e) => setFirstName(e.target.value)}
                            placeholder={t('auth.firstNamePlaceholder')}
                            className="w-full ps-9 pe-3 py-2 bg-white dark:bg-[#181a20] border border-neutral-200 dark:border-neutral-700 rounded-lg text-xs text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-400"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                          {t('auth.lastName')} <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          value={lastName}
                          onChange={(e) => setLastName(e.target.value)}
                          placeholder={t('auth.lastNamePlaceholder')}
                          className="w-full px-3 py-2 bg-white dark:bg-[#181a20] border border-neutral-200 dark:border-neutral-700 rounded-lg text-xs text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-400"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                        {t('auth.phone')} <span className="text-red-500">*</span>
                      </label>
                      <div className="relative">
                        <div className="absolute inset-y-0 start-0 ps-3 flex items-center pointer-events-none text-neutral-400">
                          <Phone className="w-4 h-4" />
                        </div>
                        <input
                          type="tel"
                          required
                          value={userPhone}
                          onChange={(e) => setUserPhone(e.target.value)}
                          placeholder={t('auth.phonePlaceholder')}
                          className="w-full ps-9 pe-3 py-2 bg-white dark:bg-[#181a20] border border-neutral-200 dark:border-neutral-700 rounded-lg text-xs font-mono text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-400"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                          {t('auth.orgName')}
                        </label>
                        <div className="relative">
                          <div className="absolute inset-y-0 start-0 ps-3 flex items-center pointer-events-none text-neutral-400">
                            <Building2 className="w-4 h-4" />
                          </div>
                          <input
                            type="text"
                            value={orgName}
                            onChange={(e) => setOrgName(e.target.value)}
                            placeholder={t('auth.orgNamePlaceholder')}
                            className="w-full ps-9 pe-3 py-2 bg-white dark:bg-[#181a20] border border-neutral-200 dark:border-neutral-700 rounded-lg text-xs text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-400"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                          {t('auth.orgSlug')}
                        </label>
                        <input
                          type="text"
                          value={orgSlug}
                          onChange={(e) => setOrgSlug(e.target.value)}
                          placeholder={t('auth.orgSlugPlaceholder')}
                          className="w-full px-3 py-2 bg-white dark:bg-[#181a20] border border-neutral-200 dark:border-neutral-700 rounded-lg text-xs font-mono text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-400"
                        />
                      </div>
                    </div>
                  </>
                )}

                {/* Email Field */}
                <div>
                  <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                    {t('auth.email')} <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 start-0 ps-3 flex items-center pointer-events-none text-neutral-400">
                      <Mail className="w-4 h-4" />
                    </div>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder={t('auth.emailPlaceholder')}
                      className="w-full ps-9 pe-3 py-2.5 bg-white dark:bg-[#181a20] border border-neutral-200 dark:border-neutral-700 rounded-lg text-xs font-mono text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-400"
                    />
                  </div>
                </div>

                {/* Password Field */}
                <div>
                  <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                    {t('auth.password')} <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 start-0 ps-3 flex items-center pointer-events-none text-neutral-400">
                      <Lock className="w-4 h-4" />
                    </div>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={t('auth.passwordPlaceholder')}
                      className="w-full ps-9 pe-10 py-2.5 bg-white dark:bg-[#181a20] border border-neutral-200 dark:border-neutral-700 rounded-lg text-xs font-mono text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-400"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 end-0 pe-3 flex items-center text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Confirm Password Field for Register */}
                {activeTab === 'register' && (
                  <div>
                    <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                      {t('auth.confirmPassword')} <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 start-0 ps-3 flex items-center pointer-events-none text-neutral-400">
                        <Lock className="w-4 h-4" />
                      </div>
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder={t('auth.confirmPasswordPlaceholder')}
                        className="w-full ps-9 pe-3 py-2.5 bg-white dark:bg-[#181a20] border border-neutral-200 dark:border-neutral-700 rounded-lg text-xs font-mono text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-400"
                      />
                    </div>
                  </div>
                )}

                <div className="pt-2 space-y-2">
                  <Button
                    type="submit"
                    variant="primary"
                    className="w-full justify-center py-2.5 text-xs font-bold"
                    disabled={isLoading}
                  >
                    {isLoading
                      ? t('auth.processing')
                      : activeTab === 'login'
                      ? t('auth.loginButton')
                      : t('auth.registerButton')}
                  </Button>
                </div>
              </form>
            </>
          )}
        </div>

        {/* Centered Icon-Only Language Selector */}
        <div className="flex justify-center">
          <AuthLanguageDropdown placement="down" />
        </div>

        {/* Footer */}
        <p className="text-center text-[11px] font-mono text-neutral-400">
          {BRAND.name} Platform · {t('auth.allRightsReserved')}
        </p>
      </div>
    </div>
  );
};
