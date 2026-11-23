import React, { useState, useRef, useEffect } from 'react';
import { Globe, Check } from 'lucide-react';
import { useTranslation, Locale } from '../../i18n';

interface AuthLanguageDropdownProps {
  /** Direction the menu opens relative to the icon trigger */
  placement?: 'up' | 'down';
}

const LANGUAGE_OPTIONS: { code: Locale; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'it', label: 'Italiano' },
];

export const AuthLanguageDropdown: React.FC<AuthLanguageDropdownProps> = ({
  placement = 'down',
}) => {
  const { locale, setLocale } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const handleSelect = (code: Locale) => {
    setLocale(code);
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className="relative inline-flex justify-center">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-label="Language"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        title={locale === 'it' ? 'Italiano' : 'English'}
        className={`w-9 h-9 rounded-full inline-flex items-center justify-center border transition-all cursor-pointer ${
          isOpen
            ? 'bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 border-neutral-900 dark:border-white shadow-sm'
            : 'bg-white dark:bg-[#16181d] text-neutral-500 dark:text-neutral-400 border-neutral-200 dark:border-neutral-800 hover:text-neutral-900 dark:hover:text-white hover:border-neutral-300 dark:hover:border-neutral-700'
        }`}
      >
        <Globe className="w-4 h-4" />
      </button>

      {isOpen && (
        <div
          role="menu"
          className={`absolute left-1/2 -translate-x-1/2 z-50 w-36 rounded-xl bg-white dark:bg-[#181a20] border border-neutral-200 dark:border-neutral-700 shadow-lg py-1 ${
            placement === 'up' ? 'bottom-full mb-2' : 'top-full mt-2'
          }`}
        >
          {LANGUAGE_OPTIONS.map((option) => {
            const isActive = locale === option.code;
            return (
              <button
                key={option.code}
                type="button"
                role="menuitem"
                onClick={() => handleSelect(option.code)}
                className={`w-full px-3 py-2 text-xs flex items-center justify-between transition-colors cursor-pointer ${
                  isActive
                    ? 'font-bold text-neutral-900 dark:text-white bg-neutral-100/80 dark:bg-neutral-800/80'
                    : 'font-medium text-neutral-600 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800/50 hover:text-neutral-900 dark:hover:text-white'
                }`}
              >
                <span>{option.label}</span>
                {isActive && <Check className="w-3.5 h-3.5 text-neutral-900 dark:text-white" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
