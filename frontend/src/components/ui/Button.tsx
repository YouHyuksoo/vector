'use client';
import { Icon } from './Icon';

const VARIANT = {
  primary: 'bg-primary text-primary-foreground shadow-lg shadow-primary/25 hover:bg-primary-hover hover:-translate-y-0.5',
  secondary: 'bg-card border border-border text-text dark:text-white hover:bg-card-hover',
  ghost: 'bg-transparent text-text dark:text-white hover:bg-black/5 dark:hover:bg-white/5',
  outline: 'bg-transparent border border-border text-text dark:text-white hover:bg-card-hover hover:border-border-hover',
  danger: 'bg-red-600 text-white shadow-lg shadow-red-600/25 hover:bg-red-700 hover:-translate-y-0.5',
} as const;

const SIZE = {
  sm: 'h-9 px-4 text-sm',
  md: 'h-10 px-6 text-sm',
  lg: 'h-12 px-8 text-base',
} as const;

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof VARIANT;
  size?: keyof typeof SIZE;
  leftIcon?: string;
  rightIcon?: string;
  isLoading?: boolean;
  fullWidth?: boolean;
}

export function Button({
  variant = 'primary', size = 'md',
  leftIcon, rightIcon, isLoading, fullWidth,
  className = '', children, disabled, ...props
}: ButtonProps) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-lg font-bold
        transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed
        ${VARIANT[variant]} ${SIZE[size]} ${fullWidth ? 'w-full' : ''} ${className}`}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? <Icon name="progress_activity" size="xs" className="animate-spin" /> : leftIcon && <Icon name={leftIcon} size="xs" />}
      {children}
      {rightIcon && !isLoading && <Icon name={rightIcon} size="xs" />}
    </button>
  );
}
