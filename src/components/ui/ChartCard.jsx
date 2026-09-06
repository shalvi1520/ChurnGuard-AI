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
 */
export default function ChartCard({
  metricKey,
  title,
  description,
  help,
  action,
  isEmpty = false,
  emptyMessage = 'No data to show yet.',
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
      <div className="flex items-start justify-between gap-3 mb-4">
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
        <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-border py-10 px-4">
          <p className="text-xs text-text-tertiary text-center max-w-xs">{emptyMessage}</p>
        </div>
      ) : (
        <div className={cn('flex-1', bodyClassName)}>{children}</div>
      )}
    </Card>
  );
}
