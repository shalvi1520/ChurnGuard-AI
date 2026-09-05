import { forwardRef } from 'react';
import { cn } from '../../utils/helpers';
import { ChevronDown } from 'lucide-react';

const Select = forwardRef(({ label, error, options = [], placeholder = 'Select...', className, ...props }, ref) => {
  return (
    <div className="space-y-1.5">
      {label && (
        <label className="block text-sm font-medium text-text-secondary">{label}</label>
      )}
      <div className="relative">
        <select
          ref={ref}
          className={cn(
            'w-full rounded-lg border bg-bg-tertiary/50 px-3 py-2.5 text-sm text-text-primary appearance-none',
            'border-border focus:border-accent focus:ring-1 focus:ring-accent/30',
            'transition-colors duration-200 outline-none cursor-pointer',
            error && 'border-risk-critical',
            className
          )}
          {...props}
        >
          {placeholder && <option value="">{placeholder}</option>}
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary pointer-events-none" />
      </div>
      {error && <p className="text-xs text-risk-critical">{error}</p>}
    </div>
  );
});

Select.displayName = 'Select';
export default Select;
