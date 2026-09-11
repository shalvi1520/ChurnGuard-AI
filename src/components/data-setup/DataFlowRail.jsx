import { Check } from 'lucide-react';

/**
 * The five things that happen to a dataset, always visible on Data Management:
 *
 *   DATA → QUALITY → PROCESSING → MODEL → READY
 *
 * It answers "where am I, and what has already happened to my file?" without
 * the user having to read a progress log. `PipelineProgress` is the detailed,
 * live narration during a run; this is the constant map around it.
 *
 * Deliberately cheap: no animation on mount (it renders on first paint), no
 * shadows or filters. Below `sm` the five columns can't fit legibly, so it
 * collapses to "Step n of 5" plus the current stage — the same compact
 * treatment the old setup stepper used — rather than side-scrolling.
 */

const STAGES = [
  { key: 'data', label: 'Data', detail: 'Your file or CRM records' },
  { key: 'quality', label: 'Quality', detail: 'Rows, gaps, duplicates' },
  { key: 'processing', label: 'Processing', detail: 'Columns matched and cleaned' },
  { key: 'model', label: 'Model', detail: 'Trained on your customers' },
  { key: 'ready', label: 'Ready', detail: 'Powering the rest of ChurnGuard' },
];

export default function DataFlowRail({ current = 'data' }) {
  const currentIndex = Math.max(
    0,
    STAGES.findIndex((s) => s.key === current)
  );
  const stage = STAGES[currentIndex];
  const percent = Math.round(((currentIndex + 1) / STAGES.length) * 100);

  return (
    <nav aria-label="Data setup progress" className="rounded-xl border border-border bg-bg-card">
      {/* Compact: phones */}
      <div className="sm:hidden px-4 py-3">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-text-primary">
            {stage.label}
          </p>
          <p className="text-[11px] text-text-tertiary tabular-nums">
            Step {currentIndex + 1} of {STAGES.length}
          </p>
        </div>
        <p className="text-[11px] text-text-tertiary mt-0.5 leading-snug">{stage.detail}</p>
        <div className="h-1 rounded-full bg-border overflow-hidden mt-2" aria-hidden="true">
          <div className="h-full bg-accent transition-all duration-500" style={{ width: `${percent}%` }} />
        </div>
      </div>

      {/* Full rail: tablet and up */}
      <ol className="hidden sm:flex items-stretch gap-px">
        {STAGES.map((s, index) => {
          const done = index < currentIndex;
          const active = index === currentIndex;
          return (
            <li
              key={s.key}
              aria-current={active ? 'step' : undefined}
              // `relative` matters: the sr-only spans below are absolutely
              // positioned, and without a positioned ancestor they escape every
              // overflow container and widen the whole page at narrow widths.
              className={`relative flex-1 min-w-0 px-3 py-2.5 border-b-2 ${
                active ? 'border-accent' : done ? 'border-accent/35' : 'border-transparent'
              }`}
            >
              <div className="flex items-center gap-1.5">
                <span
                  className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0 ${
                    done
                      ? 'bg-accent/15 text-accent'
                      : active
                        ? 'bg-accent text-bg-primary'
                        : 'bg-bg-tertiary text-text-tertiary'
                  }`}
                  aria-hidden="true"
                >
                  {done ? <Check size={10} strokeWidth={3} /> : index + 1}
                </span>
                <span
                  className={`text-[11px] font-semibold uppercase tracking-wider truncate ${
                    active || done ? 'text-text-primary' : 'text-text-tertiary'
                  }`}
                >
                  {s.label}
                </span>
                {/* Position is carried by text too, not just by colour. */}
                {active && <span className="sr-only">— current step</span>}
                {done && <span className="sr-only">— done</span>}
              </div>
              <p className="text-[11px] text-text-tertiary mt-0.5 leading-snug">{s.detail}</p>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
