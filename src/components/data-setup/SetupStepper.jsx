import { Check } from 'lucide-react';
import { cn } from '../../utils/helpers';
import { SETUP_STEPS } from './steps';

function segmentTone(done, active) {
  if (done) return 'bg-accent';
  if (active) return 'bg-accent/40';
  return 'bg-border';
}

/**
 * Progress indicator for the data-setup flow.
 *
 * Five labelled columns from `sm` up; below that the labels can't fit side by
 * side without either truncating or forcing the page to scroll sideways, so
 * small screens get a compact "Step n of 5" line over the same segment bar.
 */
export default function SetupStepper({ current, complete = false }) {
  const percent = complete ? 100 : Math.round((current / SETUP_STEPS.length) * 100);

  return (
    <nav aria-label="Data setup progress">
      {/* Compact — small screens */}
      <div className="sm:hidden">
        <div className="flex items-baseline justify-between gap-3 mb-2">
          <p className="text-xs font-medium text-text-primary truncate">
            {complete ? 'Setup complete' : `Step ${current + 1} of ${SETUP_STEPS.length} · ${SETUP_STEPS[current].label}`}
          </p>
          <span className="text-[11px] text-text-tertiary tabular-nums shrink-0">{percent}%</span>
        </div>
        <div className="flex gap-1">
          {SETUP_STEPS.map((step, i) => (
            <span
              key={step.key}
              className={cn('h-1 flex-1 rounded-full', segmentTone(complete || i < current, i === current))}
            />
          ))}
        </div>
      </div>

      {/* Full — sm and up */}
      <ol className="hidden sm:flex items-stretch gap-1.5">
        {SETUP_STEPS.map((step, i) => {
          const done = complete || i < current;
          const active = !complete && i === current;

          return (
            <li key={step.key} className="flex-1 min-w-0" aria-current={active ? 'step' : undefined}>
              <div className={cn('h-1 rounded-full mb-2 transition-colors', segmentTone(done, active))} />
              <div className="flex items-start gap-1.5">
                <span
                  className={cn(
                    'w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0',
                    done
                      ? 'bg-accent text-bg-primary'
                      : active
                        ? 'bg-accent/15 text-accent border border-accent/40'
                        : 'bg-bg-tertiary text-text-tertiary'
                  )}
                >
                  {done ? <Check size={11} /> : i + 1}
                </span>
                <span
                  className={cn(
                    'text-[11px] font-medium leading-tight pt-0.5',
                    done || active ? 'text-text-primary' : 'text-text-tertiary'
                  )}
                >
                  {step.label}
                </span>
              </div>
            </li>
          );
        })}
      </ol>

      {/* What is happening right now — stated once, under the steps. */}
      <p className="text-xs text-text-tertiary mt-2.5" aria-live="polite">
        {complete
          ? 'Setup complete — your Overview is ready.'
          : SETUP_STEPS[current].hint}
      </p>
    </nav>
  );
}
