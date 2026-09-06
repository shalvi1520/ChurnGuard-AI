import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Info } from 'lucide-react';
import { cn } from '../../utils/helpers';

// The single tooltip pattern for the app — don't add another one.
//
// Rendered into a portal with fixed positioning so it is never clipped by the
// `overflow-x-auto` wrappers our tables live in. Opens on hover *and* on focus,
// and `InfoTip` is a real <button>, so keyboard and touch users get the same
// content that mouse users get on hover. Nothing essential should live only in
// here — see the visible-description pattern used on the metric and chart cards.

const GAP = 8;
const MARGIN = 8;

function useTooltipPosition(triggerRef, open, side) {
  const [style, setStyle] = useState({ top: 0, left: 0, visibility: 'hidden' });

  useEffect(() => {
    if (!open) return undefined;

    const place = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const r = trigger.getBoundingClientRect();
      const width = Math.min(260, window.innerWidth - MARGIN * 2);

      // Use the preferred side when it has room, otherwise flip to the other.
      const spaceAbove = r.top;
      const spaceBelow = window.innerHeight - r.bottom;
      const NEEDED = 120;
      const onTop = side === 'top'
        ? spaceAbove >= NEEDED || spaceAbove > spaceBelow
        : spaceBelow < NEEDED && spaceAbove > spaceBelow;

      let left = r.left + r.width / 2 - width / 2;
      left = Math.max(MARGIN, Math.min(left, window.innerWidth - width - MARGIN));

      setStyle({
        position: 'fixed',
        width,
        left,
        ...(onTop ? { bottom: window.innerHeight - r.top + GAP } : { top: r.bottom + GAP }),
        visibility: 'visible',
      });
    };

    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open, side, triggerRef]);

  return style;
}

/**
 * Wraps a trigger element and shows `content` on hover or keyboard focus.
 * `content` should be one or two short sentences — not a paragraph.
 */
export default function Tooltip({ content, children, side = 'top', className }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef(null);
  const id = useId();
  const style = useTooltipPosition(triggerRef, open, side);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  if (!content) return children;

  return (
    <>
      <span
        ref={triggerRef}
        className={cn('inline-flex', className)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={close}
        onFocus={() => setOpen(true)}
        onBlur={close}
        aria-describedby={open ? id : undefined}
      >
        {children}
      </span>
      {open && createPortal(
        <span
          id={id}
          role="tooltip"
          style={style}
          className="z-[80] block rounded-lg border border-border bg-bg-elevated px-3 py-2 text-[11px] leading-relaxed text-text-secondary shadow-xl pointer-events-none"
        >
          {content}
        </span>,
        document.body
      )}
    </>
  );
}

/**
 * The info-icon affordance used next to metric titles, chart titles and table
 * headers. It is a button so it works on touch and with a keyboard.
 */
export function InfoTip({ content, label = 'More information', side = 'top', className, size = 13 }) {
  return (
    <Tooltip content={content} side={side}>
      <button
        type="button"
        aria-label={label}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          'inline-flex items-center justify-center rounded-full text-text-tertiary hover:text-text-secondary',
          'focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2 transition-colors cursor-help align-middle',
          className
        )}
      >
        <Info size={size} aria-hidden="true" />
      </button>
    </Tooltip>
  );
}
