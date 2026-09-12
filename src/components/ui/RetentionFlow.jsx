import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { cn } from '../../utils/helpers';
import { useWorkflowNav, withCustomer } from '../../utils/navigation';

/**
 * The retention workflow, shown on the three pages that make it up. Acting on
 * an at-risk account is one task in three stages, not three destinations:
 *
 *   1 Explain   — why is this account at risk?      (Explainability owns WHY)
 *   2 Recommend — what should I do about it?        (Recommendations owns WHAT)
 *   3 Outreach  — how should I say it?              (Outreach owns HOW)
 *
 * This is the position indicator only. Each page renders its own primary
 * "continue to the next stage" action, because what that action means differs
 * per stage (and on Outreach it is the human approval step, not a link).
 */
// Module-local on purpose: exporting a constant beside a component trips
// oxlint's react(only-export-components), and nothing outside this file needs
// the list.
const RETENTION_STAGES = [
  { key: 'explain', step: 1, label: 'Explain', path: '/explainability' },
  { key: 'recommend', step: 2, label: 'Recommend', path: '/recommendations' },
  { key: 'outreach', step: 3, label: 'Outreach', path: '/outreach' },
];

const STAGE_BASE = 'inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium transition-colors';
const FOCUS = 'rounded-md focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2';

export default function RetentionFlow({ customerId, stage, className }) {
  const { from, drill, goBackTo } = useWorkflowNav();

  // Opened without an account (the Outreach queue straight from the sidebar,
  // before a draft is picked) there is no workflow to be part of yet.
  if (!customerId) return null;

  const currentIndex = RETENTION_STAGES.findIndex((s) => s.key === stage);
  const current = RETENTION_STAGES[currentIndex];

  // Stepping back to a stage the user came from is a history pop, so Back and
  // Forward keep working; jumping to one they haven't visited is a normal
  // push that still carries the drill-down context onward.
  const go = (to) => {
    if (from?.path === to) goBackTo(to);
    else drill(to, current?.label ?? 'Retention');
  };

  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-lg border border-border bg-bg-tertiary/25 px-3 py-2',
        className
      )}
    >
      <p className="text-[11px] text-text-tertiary min-w-0">
        Retention workflow for{' '}
        <Link
          to={`/customers/${customerId}`}
          className={cn('text-text-primary font-medium hover:text-accent hover:underline underline-offset-2', FOCUS)}
        >
          {customerId}
        </Link>
      </p>

      <ol className="flex flex-wrap items-center gap-x-1 gap-y-1" aria-label="Retention workflow stages">
        {RETENTION_STAGES.map((s, i) => {
          const isCurrent = i === currentIndex;
          const isPast = i < currentIndex;
          const to = withCustomer(s.path, customerId);

          return (
            <li key={s.key} className="flex items-center gap-1">
              {isPast ? (
                <Link
                  to={to}
                  onClick={(e) => {
                    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                    e.preventDefault();
                    go(to);
                  }}
                  className={cn(STAGE_BASE, 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary', FOCUS)}
                >
                  <span className="text-text-tertiary">{s.step}</span>
                  {s.label}
                </Link>
              ) : (
                <span
                  aria-current={isCurrent ? 'step' : undefined}
                  className={cn(
                    STAGE_BASE,
                    isCurrent ? 'bg-accent/10 text-accent' : 'text-text-tertiary/70'
                  )}
                >
                  <span className={isCurrent ? 'text-accent/70' : 'text-text-tertiary/70'}>{s.step}</span>
                  {s.label}
                  {/* Position is carried by more than colour and weight. */}
                  {isCurrent && <span className="sr-only">(current stage)</span>}
                </span>
              )}
              {i < RETENTION_STAGES.length - 1 && (
                <ChevronRight size={12} className="text-text-tertiary/50 shrink-0" aria-hidden="true" />
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
