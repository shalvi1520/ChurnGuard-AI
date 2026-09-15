import { useEffect, useState } from 'react';
import { animate, useMotionValue } from 'framer-motion';

/**
 * Animates a headline number counting up from 0 to `value` over ~700ms,
 * re-running whenever `value` changes (fresh data, a retry). A visual-only
 * wrapper: `format` is the exact same formatter (formatNumber/formatCurrency/
 * formatPercent, etc.) the caller would otherwise apply to the static value,
 * so the animation lands on the identical final string.
 *
 * Renders the plain final text (no animation) for anything that isn't a
 * finite number -- "—", null, a loading placeholder -- so this is a safe
 * drop-in wherever a formatted number is shown today.
 */
export default function CountUp({ value, format, duration = 0.7, className }) {
  const numeric = typeof value === 'number' && Number.isFinite(value) ? value : null;
  const motionValue = useMotionValue(0);
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (numeric === null) return undefined;
    motionValue.set(0);
    const controls = animate(motionValue, numeric, {
      duration,
      ease: 'easeOut',
      onUpdate: (v) => setDisplay(v),
    });
    return () => controls.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- motionValue is a stable ref, not a real dependency
  }, [numeric, duration]);

  if (numeric === null) {
    return <span className={className}>{format ? format(value) : value}</span>;
  }
  return <span className={className}>{format ? format(display) : Math.round(display)}</span>;
}
