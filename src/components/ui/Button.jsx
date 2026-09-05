import React, { forwardRef } from 'react';
import { cn } from '../../utils/helpers';

const variants = {
  primary: 'bg-accent text-bg-primary hover:bg-accent-dim font-semibold',
  secondary: 'bg-bg-tertiary text-text-primary border border-border hover:bg-bg-elevated hover:border-border-light',
  ghost: 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary',
  danger: 'bg-risk-critical/10 text-risk-critical hover:bg-risk-critical/20 border border-risk-critical/20',
  success: 'bg-risk-low/10 text-risk-low hover:bg-risk-low/20 border border-risk-low/20',
  outline: 'border border-border text-text-secondary hover:text-text-primary hover:border-border-light hover:bg-bg-tertiary',
};

const sizes = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
  lg: 'px-6 py-2.5 text-sm',
  xl: 'px-8 py-3 text-base',
};

const Button = forwardRef(({ variant = 'primary', size = 'md', className, children, icon: Icon, iconRight: IconRight, loading, disabled, ...props }, ref) => {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg transition-all duration-200 font-medium cursor-pointer',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        'focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2',
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    >
      {loading ? (
        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      ) : Icon ? (
        <Icon size={16} />
      ) : null}
      {children}
      {IconRight && <IconRight size={16} />}
    </button>
  );
});

Button.displayName = 'Button';
export default Button;
