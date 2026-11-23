import React from 'react';

export interface DateInputProps {
  label?: string;
  value?: string; // Standard YYYY-MM-DD
  onChange: (isoDate: string) => void; // Emits standard YYYY-MM-DD
  error?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  id?: string;
  placeholder?: string;
  isPersian?: boolean; // Retained for prop compatibility
}

export const DateInput: React.FC<DateInputProps> = ({
  label,
  value,
  onChange,
  error,
  required,
  disabled,
  className = '',
  id,
  placeholder,
}) => {
  const inputId = id || (label ? `date-input-${label.replace(/\s+/g, '-')}` : undefined);
  const normalizedValue = value ? String(value).slice(0, 10) : '';

  return (
    <div className={`w-full space-y-1 ${className}`}>
      {label && (
        <label htmlFor={inputId} className="block text-xs font-medium text-neutral-700 dark:text-neutral-300">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}
      <div className="relative">
        <input
          type="date"
          id={inputId}
          value={normalizedValue}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          required={required}
          placeholder={placeholder}
          className={`w-full bg-white dark:bg-[#181a20] border border-neutral-200/90 dark:border-neutral-700/80 rounded-md text-neutral-900 dark:text-neutral-100 text-sm px-3.5 py-2 transition-all focus:outline-none focus:ring-2 focus:ring-neutral-900/10 dark:focus:ring-neutral-200/20 focus:border-neutral-900 dark:focus:border-neutral-400 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
            error ? 'border-[#ee0000]' : ''
          }`}
        />
      </div>
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  );
};
