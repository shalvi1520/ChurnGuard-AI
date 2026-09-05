import { forwardRef, useState } from 'react';
import { cn } from '../../utils/helpers';
import { Eye, EyeOff } from 'lucide-react';

const Input = forwardRef(({ label, error, hint, icon: Icon, type = 'text', className, containerClassName, ...props }, ref) => {
  const [showPassword, setShowPassword] = useState(false);
  const isPassword = type === 'password';
  const inputType = isPassword ? (showPassword ? 'text' : 'password') : type;

  return (
    <div className={cn('space-y-1.5', containerClassName)}>
      {label && (
        <label className="block text-sm font-medium text-text-secondary">
          {label}
        </label>
      )}
      <div className="relative">
        {Icon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary">
            <Icon size={16} />
          </div>
        )}
        <input
          ref={ref}
          type={inputType}
          className={cn(
            'w-full rounded-lg border bg-bg-tertiary/50 px-3 py-2.5 text-sm text-text-primary',
            'placeholder:text-text-tertiary',
            'border-border focus:border-accent focus:ring-1 focus:ring-accent/30',
            'transition-colors duration-200 outline-none',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            Icon && 'pl-10',
            isPassword && 'pr-10',
            error && 'border-risk-critical focus:border-risk-critical focus:ring-risk-critical/30',
            className
          )}
          {...props}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-secondary transition-colors"
            tabIndex={-1}
          >
            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        )}
      </div>
      {error && <p className="text-xs text-risk-critical">{error}</p>}
      {hint && !error && <p className="text-xs text-text-tertiary">{hint}</p>}
    </div>
  );
});

Input.displayName = 'Input';
export default Input;
