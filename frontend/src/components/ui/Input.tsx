'use client';
import { Icon } from './Icon';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  leftIcon?: string;
  error?: string;
  helperText?: string;
}

export function Input({ label, leftIcon, error, helperText, className = '', ...props }: InputProps) {
  return (
    <div className="w-full">
      {label && <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1.5">{label}</label>}
      <div className="relative">
        {leftIcon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary">
            <Icon name={leftIcon} size="xs" />
          </div>
        )}
        <input
          className={`w-full px-4 py-2.5 rounded-lg
            bg-surface dark:bg-surface-dark
            border ${error ? 'border-error focus:ring-error/50 focus:border-error' : 'border-border dark:border-border-dark focus:ring-primary/50 focus:border-primary'}
            text-text dark:text-white placeholder:text-text-secondary
            focus:outline-none focus:ring-2 transition-colors
            ${leftIcon ? 'pl-10' : ''} ${className}`}
          {...props}
        />
      </div>
      {error && <p className="mt-1 text-xs text-error">{error}</p>}
      {helperText && !error && <p className="mt-1 text-xs text-text-secondary">{helperText}</p>}
    </div>
  );
}
