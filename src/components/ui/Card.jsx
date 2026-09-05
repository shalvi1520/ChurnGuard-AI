import { cn } from '../../utils/helpers';

export default function Card({ children, className, hover = false, padding = true, ...props }) {
  return (
    <div
      className={cn(
        'rounded-xl border border-border bg-bg-card',
        padding && 'p-5',
        hover && 'hover:border-border-light hover:bg-bg-elevated transition-all duration-200 cursor-pointer',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({ children, className, action }) {
  return (
    <div className={cn('flex items-center justify-between mb-4', className)}>
      <div>{children}</div>
      {action && <div>{action}</div>}
    </div>
  );
}

export function CardTitle({ children, className }) {
  return (
    <h3 className={cn('text-sm font-semibold text-text-primary', className)}>{children}</h3>
  );
}

export function CardDescription({ children, className }) {
  return (
    <p className={cn('text-xs text-text-tertiary mt-0.5', className)}>{children}</p>
  );
}
