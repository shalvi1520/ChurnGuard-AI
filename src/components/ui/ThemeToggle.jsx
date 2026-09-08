import { Monitor, Moon, Sun } from 'lucide-react';
import Tooltip from './Tooltip';
import { cn } from '../../utils/helpers';
import { useApp } from '../../context/AppContext';

/**
 * The appearance control in the app header.
 *
 * It writes the SAME setting Settings → Appearance writes (`AppContext.theme`)
 * — there is no separate header theme state. One button rather than a popover
 * menu because the header is already busy; it cycles Light → Dark → System,
 * and the label always says what is on now and what pressing it will do, so
 * the meaning never depends on recognising the icon.
 */

const NEXT = { light: 'dark', dark: 'system', system: 'light' };
const ICONS = { light: Sun, dark: Moon, system: Monitor };
const NAMES = { light: 'Light', dark: 'Dark', system: 'System' };

export default function ThemeToggle({ className, size = 16 }) {
  const { theme, resolvedTheme, setTheme } = useApp();
  const next = NEXT[theme] || 'light';
  const Icon = ICONS[theme] || Moon;

  const current =
    theme === 'system' ? `System (currently ${NAMES[resolvedTheme]?.toLowerCase()})` : NAMES[theme];
  const label = `Appearance: ${current}. Switch to ${NAMES[next]}.`;

  return (
    <Tooltip content={label}>
      <button
        type="button"
        onClick={() => setTheme(next)}
        aria-label={label}
        className={cn(
          'p-2 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary transition-colors cursor-pointer',
          'focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2',
          className
        )}
      >
        <Icon size={size} aria-hidden="true" />
      </button>
    </Tooltip>
  );
}
