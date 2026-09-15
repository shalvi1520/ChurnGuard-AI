import { forwardRef, useId, useState } from 'react';
import { cn } from '../../utils/helpers';
import { Eye, EyeOff } from 'lucide-react';

const Input = forwardRef(({ label, error, hint, icon: Icon, type = 'text', className, containerClassName, id, ...props }, ref) => {
  const [showPassword, setShowPassword] = useState(false);
  const isPassword = type === 'password';
  const inputType = isPassword ? (showPassword ? 'text' : 'password') : type;

  // The label used to be a bare <label> with no `htmlFor`, which looks correct
  // but associates with nothing: a screen reader announces the field as
  // unlabelled, and clicking the text doesn't focus the input. useId gives a
  // stable, collision-free id per instance, and a caller-supplied `id` still
  // wins so existing usages can address a field by a known id.
  const generatedId = useId();
  const inputId = id || generatedId;
  const errorId = `${inputId}-error`;
  const hintId = `${inputId}-hint`;

  const describedBy = [error ? errorId : null, hint && !error ? hintId : null]
    .filter(Boolean)
    .join(' ') || undefined;

  return (
    <div className={cn('space-y-1.5', containerClassName)}>
      {label && (
        <label htmlFor={inputId} className="block text-sm font-medium text-text-secondary">
          {label}
        </label>
      )}
      <div className="relative">
        {Icon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary">
            <Icon size={16} aria-hidden="true" />
          </div>
        )}
        <input
          ref={ref}
          id={inputId}
          type={inputType}
          // aria-invalid is what actually tells assistive tech the field is in
          // error; the red border only says so visually. aria-describedby ties
          // the message below to the field, so it is read out on focus instead
          // of being stranded as unrelated text.
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
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
          // Previously `tabIndex={-1}` and unlabelled: a keyboard user could
          // never reach it, and a screen reader announced an anonymous button.
          // It is a real control, so it is reachable and named -- and
          // aria-pressed reports which state it is currently in.
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            aria-pressed={showPassword}
            aria-controls={inputId}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-secondary transition-colors rounded focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
          >
            {showPassword ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
          </button>
        )}
      </div>
      {/* role="alert" so a validation message that appears after submit is
          announced, rather than silently rendering. */}
      {error && <p id={errorId} role="alert" className="text-xs text-risk-critical">{error}</p>}
      {hint && !error && <p id={hintId} className="text-xs text-text-tertiary">{hint}</p>}
    </div>
  );
});

Input.displayName = 'Input';
export default Input;
