import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock, FileWarning, Loader2, Sparkles } from 'lucide-react';
import Card from '../ui/Card';
import Button from '../ui/Button';
import { formatNumber } from '../../utils/helpers';

const INACTIVITY_PRESETS = [30, 60, 90];

/** status_column rule: every distinct value the column holds, each a
 * toggleable "counts as churned" checkbox — the backend's suggestion
 * (allValues split into churnValues/activeValues) pre-checks the churn
 * side, but the user can correct it before anything is derived. */
function StatusColumnOffer({ column, allValues, initialChurnValues, onDerive, deriving, error }) {
  const [checked, setChecked] = useState(() => new Set(initialChurnValues || []));

  const toggle = (value) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  };

  return (
    <>
      <p className="text-sm font-medium text-text-primary">
        No churn column, but &quot;{column}&quot; looks like an account status
      </p>
      <p className="text-xs text-text-secondary mt-1.5 leading-relaxed">
        Choose which values mean the customer has left. Everything left unchecked is treated as
        still active. This is your call, not a recorded outcome — shown as such everywhere it&apos;s used.
      </p>

      <div className="flex flex-wrap gap-2 mt-3">
        {(allValues || []).map((value) => {
          const isChecked = checked.has(value);
          return (
            <button
              key={value}
              type="button"
              onClick={() => toggle(value)}
              className={`text-xs px-2.5 py-1.5 rounded-md border transition-colors inline-flex items-center gap-1.5 ${
                isChecked
                  ? 'border-risk-critical/50 bg-risk-critical/10 text-risk-critical'
                  : 'border-border text-text-secondary hover:text-text-primary'
              }`}
            >
              {isChecked && <CheckCircle2 size={12} aria-hidden="true" />}
              {value}
            </button>
          );
        })}
      </div>

      {error && (
        <p className="text-xs text-danger mt-2.5 leading-relaxed">
          {error.message} {error.hint}
        </p>
      )}

      <Button
        size="sm"
        className="mt-3"
        disabled={deriving || checked.size === 0}
        onClick={() => onDerive({ rule: 'status_column', column, churnValues: Array.from(checked) })}
      >
        {deriving ? (
          <>
            <Loader2 size={13} className="animate-spin mr-1.5 inline" />
            Deriving and training…
          </>
        ) : (
          'Use this and continue'
        )}
      </Button>
    </>
  );
}

/** cancellation_date rule: no threshold to pick, just a plain confirmation
 * that a value in the column means "cancelled". */
function CancellationDateOffer({ column, onDerive, deriving, error }) {
  return (
    <>
      <p className="text-sm font-medium text-text-primary">
        No churn column, but &quot;{column}&quot; looks like a cancellation date
      </p>
      <p className="text-xs text-text-secondary mt-1.5 leading-relaxed">
        ChurnGuard can treat any customer with a value in this column as churned, and everyone
        else as active. This is a proxy, not a recorded churn label — shown as such everywhere
        it&apos;s used.
      </p>

      {error && (
        <p className="text-xs text-danger mt-2.5 leading-relaxed">
          {error.message} {error.hint}
        </p>
      )}

      <Button
        size="sm"
        className="mt-3"
        disabled={deriving}
        onClick={() => onDerive({ rule: 'cancellation_date', column })}
      >
        {deriving ? (
          <>
            <Loader2 size={13} className="animate-spin mr-1.5 inline" />
            Deriving and training…
          </>
        ) : (
          'Use this and continue'
        )}
      </Button>
    </>
  );
}

/** last_activity rule: an inactivity threshold against the most recent date
 * in the file. The original (and still most common) derivation offer. */
function LastActivityOffer({ column, onDerive, deriving, error }) {
  const [days, setDays] = useState(90);

  return (
    <>
      <p className="text-sm font-medium text-text-primary">
        No churn column, but &quot;{column}&quot; looks like a last-activity date
      </p>
      <p className="text-xs text-text-secondary mt-1.5 leading-relaxed">
        ChurnGuard can treat a customer as churned once they&apos;ve gone this many days without
        activity, using the most recent date in your file as &quot;today&quot;. This is an estimate you
        choose, not a recorded cancellation — shown as such everywhere it&apos;s used.
      </p>

      <div className="flex flex-wrap items-center gap-2 mt-3">
        <span className="text-xs text-text-secondary">Inactive for at least</span>
        <input
          type="number"
          min={1}
          value={days}
          onChange={(e) => setDays(Math.max(1, Number(e.target.value) || 1))}
          className="w-16 rounded-md border border-border bg-surface px-2 py-1 text-xs text-text-primary"
          aria-label="Inactivity threshold in days"
        />
        <span className="text-xs text-text-secondary">days</span>
        <div className="flex gap-1 ml-1">
          {INACTIVITY_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => setDays(preset)}
              className={`text-xs px-2 py-1 rounded-md border transition-colors ${
                days === preset
                  ? 'border-accent/50 bg-accent/10 text-accent'
                  : 'border-border text-text-tertiary hover:text-text-secondary'
              }`}
            >
              {preset}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <p className="text-xs text-danger mt-2.5 leading-relaxed">
          {error.message} {error.hint}
        </p>
      )}

      <Button
        size="sm"
        className="mt-3"
        disabled={deriving}
        onClick={() => onDerive({ rule: 'last_activity', column, inactivityDays: days })}
      >
        {deriving ? (
          <>
            <Loader2 size={13} className="animate-spin mr-1.5 inline" />
            Deriving and training…
          </>
        ) : (
          'Use this and continue'
        )}
      </Button>
    </>
  );
}

/**
 * Renders whichever derive-label rule the backend suggested
 * (validation.eligibility.suggestion.rule) — never applied until the user
 * reviews it and confirms.
 */
function ChurnDerivationOffer({ suggestion, onDerive, deriving, error }) {
  const Icon = suggestion.rule === 'status_column' ? Sparkles : Clock;
  return (
    <div className="rounded-lg border border-accent/25 bg-accent/[0.04] p-4">
      <div className="flex items-start gap-2.5">
        <Icon size={15} className="text-accent mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1">
          {suggestion.rule === 'status_column' && (
            <StatusColumnOffer
              column={suggestion.column}
              allValues={suggestion.allValues}
              initialChurnValues={suggestion.churnValues}
              onDerive={onDerive}
              deriving={deriving}
              error={error}
            />
          )}
          {suggestion.rule === 'cancellation_date' && (
            <CancellationDateOffer
              column={suggestion.column}
              onDerive={onDerive}
              deriving={deriving}
              error={error}
            />
          )}
          {suggestion.rule === 'last_activity' && (
            <LastActivityOffer
              column={suggestion.column}
              onDerive={onDerive}
              deriving={deriving}
              error={error}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Shown when the connected data can't be analysed as-is.
 *
 * Two distinct shapes, both driven by the backend rather than guessed here:
 *   - Genuinely blocked (`issues` non-empty): today's "can't be analysed"
 *     screen, one card per problem, each already phrased as what/why/what-to-do.
 *   - A derivable churn label (`eligibility.state === 'DERIVE_LABEL'`, no
 *     other issues): a lighter "one more thing" framing around the offer —
 *     this isn't a failure, just a confirmation ChurnGuard needs first.
 */
export default function IssueList({
  validation,
  onStartOver,
  onDeriveChurn,
  derivingChurn = false,
  deriveChurnError = null,
}) {
  const { issues = [], warnings = [], rows, columns, eligibility } = validation;
  const suggestion = eligibility?.state === 'DERIVE_LABEL' ? eligibility.suggestion : null;
  const onlyDerivable = issues.length === 0 && suggestion;

  return (
    <div className="space-y-5 max-w-2xl">
      <Card>
        <div className="flex items-start gap-3">
          <div
            className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
              onlyDerivable ? 'bg-accent/10' : 'bg-risk-critical/10'
            }`}
          >
            {onlyDerivable ? (
              <Sparkles size={19} className="text-accent" />
            ) : (
              <FileWarning size={19} className="text-risk-critical" />
            )}
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-text-primary">
              {onlyDerivable ? 'One more thing before ChurnGuard can analyse this' : "This data can't be analysed yet"}
            </h2>
            <p className="text-sm text-text-secondary mt-1 leading-relaxed">
              ChurnGuard read {formatNumber(rows || 0)}{' '}
              {rows === 1 ? 'row' : 'rows'} and {formatNumber(columns?.length || 0)}{' '}
              {columns?.length === 1 ? 'column' : 'columns'}.{' '}
              {onlyDerivable
                ? "It didn't find a churn outcome, but it did find something it can build one from."
                : 'It found problems that stop it training a model.'}
            </p>
          </div>
        </div>

        <ul className="mt-5 space-y-4">
          {issues.map((issue, i) => (
            <li
              key={`${issue.title}-${i}`}
              className="rounded-lg border border-risk-critical/25 bg-risk-critical/[0.04] p-4"
            >
              <div className="flex items-start gap-2.5">
                <AlertTriangle size={15} className="text-risk-critical mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-text-primary">{issue.title}</p>
                  {issue.why && (
                    <p className="text-xs text-text-secondary mt-1.5 leading-relaxed">
                      {issue.why}
                    </p>
                  )}
                  {issue.action && (
                    <p className="text-xs text-text-primary mt-2 leading-relaxed font-medium">
                      {issue.action}
                    </p>
                  )}
                </div>
              </div>
            </li>
          ))}

          {suggestion && onDeriveChurn && (
            <li>
              <ChurnDerivationOffer
                suggestion={suggestion}
                onDerive={({ rule, column, inactivityDays, churnValues }) =>
                  onDeriveChurn(rule, column, { inactivityDays, churnValues })
                }
                deriving={derivingChurn}
                error={deriveChurnError}
              />
            </li>
          )}
        </ul>

        {warnings.length > 0 && (
          <div className="mt-5 pt-5 border-t border-border">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-text-tertiary mb-2.5">
              Also worth knowing
            </h3>
            <ul className="space-y-2">
              {warnings.map((w, i) => (
                <li key={`${w.title}-${i}`} className="text-xs text-text-secondary leading-relaxed">
                  <span className="font-medium text-text-primary">{w.title}</span>
                  {w.action && <> — {w.action}</>}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-5">
          <Button onClick={onStartOver} variant={onlyDerivable ? 'secondary' : 'primary'}>
            Use different data
          </Button>
        </div>
      </Card>
    </div>
  );
}
