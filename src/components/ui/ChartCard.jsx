import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import Card from './Card';
import { InfoTip } from './Tooltip';
import { cn } from '../../utils/helpers';
import { metric } from '../../utils/glossary';

/**
 * The standard frame for every chart in the app: title, an always-visible
 * one-line description of what the chart shows, an info icon for the extra
 * detail, and a built-in empty state.
 *
 * Pass `metricKey` to pull all three strings from utils/glossary.js so the same
 * chart is described identically wherever it appears. `title`/`description`/
 * `help` can override individually.
 *
 * `emptyAction` ({ to, label, state }) gives the empty state a next step, so a
 * chart with nothing to draw is never a dead end.
 */
export default function ChartCard({
  metricKey,
  title,
  description,
  help,
  action,
  isEmpty = false,
  emptyMessage = 'No data to show yet.',
  emptyAction,
  className,
  bodyClassName,
  children,
}) {
  const g = metricKey ? metric(metricKey) : {};
  const heading = title ?? g.label;
  const sub = description ?? g.description;
  const detail = help ?? g.help;

  return (
    <Card className={cn('flex flex-col', className)}>
      {/* Wraps so an `action` drops below the title on a narrow card instead
          of squeezing the title and description into a sliver beside it. */}
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2 mb-4">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <h3 className="text-sm font-semibold text-text-primary">{heading}</h3>
            {detail && <InfoTip content={detail} label={`How to read ${heading}`} size={12} />}
          </div>
          {sub && <p className="text-xs text-text-tertiary mt-1 leading-snug">{sub}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>

      {isEmpty ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-10 px-4">
          <p className="text-xs text-text-tertiary text-center max-w-xs">{emptyMessage}</p>
          {emptyAction && (
            <Link
              to={emptyAction.to}
              state={emptyAction.state}
              className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline underline-offset-2 rounded-sm focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
            >
              {emptyAction.label}
              <ArrowRight size={12} aria-hidden="true" />
            </Link>
          )}
        </div>
      ) : (
        <div className={cn('flex-1', bodyClassName)}>{children}</div>
      )}
    </Card>
  );
}
