import { useId, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../../utils/helpers';

/**
 * The one expand/collapse affordance in the app — a labelled toggle over
 * detail that is worth keeping but not worth making everyone read.
 *
 * It existed twice as an inline copy (UploadStep's "What does ChurnGuard look
 * for in my file?" and Portfolio & Risk's "How is this calculated?") before
 * Data Management needed the same thing again; this is that pattern, once.
 *
 * Rules it carries so callers don't have to remember them:
 *  - it is a real <button> with `aria-expanded`, so its state is exposed
 *  - nothing essential belongs inside — the summary above it must stand alone
 *  - content is mounted only while open, so a collapsed panel costs nothing
 */
export default function Disclosure({
  label,
  openLabel,
  defaultOpen = false,
  className,
  contentClassName,
  children,
}) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();

  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        className={cn(
          'flex items-center gap-1.5 text-xs font-medium text-text-secondary hover:text-text-primary',
          'transition-colors cursor-pointer rounded-sm',
          'focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2'
        )}
      >
        <ChevronDown
          size={13}
          aria-hidden="true"
          className={cn('shrink-0 transition-transform', open && 'rotate-180')}
        />
        {open && openLabel ? openLabel : label}
      </button>

      {open && (
        <div id={id} className={cn('mt-3', contentClassName)}>
          {children}
        </div>
      )}
    </div>
  );
}
