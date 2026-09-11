import { Upload, Plug, ArrowRight, History, Sparkles } from 'lucide-react';

/**
 * The first decision, and ideally the only one: where is your customer data?
 *
 * Both routes converge immediately — a file and a CRM import produce the same
 * dataset on the backend and run the same analysis afterwards.
 *
 * The short "why" above the options is deliberate: this is the first screen
 * after signing in, and every other page is locked until it is answered. A
 * user who doesn't know why they're being asked for a file is being blocked,
 * not onboarded.
 */

const OPTIONS = [
  {
    key: 'upload',
    icon: Upload,
    label: 'Upload a file',
    description: 'A customer export from your billing system, CRM or data warehouse.',
    meta: 'CSV, XLSX or XLS · demo dataset available',
  },
  {
    key: 'crm',
    icon: Plug,
    label: 'Connect a CRM',
    description: 'Pull customer records directly from a system over its API.',
    meta: 'HubSpot, HTTP endpoint',
  },
];

export default function SourceSelector({ onSelect, onViewHistory }) {
  return (
    <div className="space-y-4 max-w-2xl">
      <div className="rounded-xl border border-border bg-bg-card p-5">
        <h2 className="text-base font-semibold text-text-primary">Connect your customer data</h2>
        <p className="text-sm text-text-secondary mt-1.5 leading-relaxed">
          ChurnGuard predicts churn from your own customers, not from a generic benchmark — so
          there is nothing to show until it has them. One row per customer with a header row is
          all it needs; it works out which column is which itself.
        </p>
        <p className="text-xs text-text-tertiary mt-2 leading-relaxed">
          Your data is read by the ChurnGuard backend you are running. Nothing is shared with
          anyone else.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {OPTIONS.map(({ key, icon: Icon, label, description, meta }) => (
          <button
            key={key}
            type="button"
            onClick={() => onSelect(key)}
            className="rounded-xl border border-border bg-bg-card p-5 text-left hover:border-accent/50 hover:bg-accent/[0.03] transition-colors cursor-pointer group"
          >
            <div className="w-10 h-10 rounded-lg bg-bg-tertiary/60 flex items-center justify-center mb-3 group-hover:bg-accent/10 transition-colors">
              <Icon size={18} className="text-text-secondary group-hover:text-accent transition-colors" />
            </div>
            <h3 className="text-sm font-semibold text-text-primary flex items-center gap-1.5">
              {label}
              <ArrowRight
                size={13}
                className="text-text-tertiary group-hover:text-accent group-hover:translate-x-0.5 transition-all"
              />
            </h3>
            <p className="text-xs text-text-secondary mt-1.5 leading-relaxed">{description}</p>
            <p className="text-[11px] text-text-tertiary mt-2">{meta}</p>
          </button>
        ))}
      </div>

      {onViewHistory && (
        <div className="rounded-xl border border-border bg-bg-tertiary/25 p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-2.5 min-w-0">
            <History size={15} className="text-text-tertiary mt-0.5 shrink-0" aria-hidden="true" />
            <p className="text-xs text-text-secondary leading-relaxed">
              Connected a dataset here before? Reuse it from History instead of finding the file
              again.
            </p>
          </div>
          <button
            type="button"
            onClick={onViewHistory}
            className="text-xs font-medium text-accent hover:underline cursor-pointer shrink-0 focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2 rounded"
          >
            View saved datasets
          </button>
        </div>
      )}

      <p className="text-[11px] text-text-tertiary flex items-center gap-1.5">
        <Sparkles size={12} aria-hidden="true" />
        No dataset to hand? The upload screen offers a demo dataset that runs the same pipeline.
      </p>
    </div>
  );
}
