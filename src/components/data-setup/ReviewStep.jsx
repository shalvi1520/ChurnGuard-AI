import { useMemo, useState } from 'react';
import { AlertTriangle, Check, HelpCircle, Layers } from 'lucide-react';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import Select from '../ui/Select';
import { InfoTip } from '../ui/Tooltip';

/**
 * The exception screen — shown ONLY when ChurnGuard could not decide something
 * on its own. If every required field was matched confidently the user never
 * sees this; the flow processes straight through.
 *
 * What it deliberately does NOT do: ask the user to map every column. Columns
 * ChurnGuard has no use for are counted as "additional data" and left alone.
 * A 100-column export produces at most a handful of decisions here, never 100
 * dropdowns.
 *
 * All matching is the backend's (`backend/api/mapping.py`); this only renders
 * what it decided and lets the user override it.
 */

const LEVEL_BADGE = {
  high: { variant: 'active', text: 'Detected' },
  medium: { variant: 'accent', text: 'Detected' },
  low: { variant: 'medium', text: 'Needs a check' },
};

/** One field row: what we matched it to, why, and how to change it.
 *
 * A confidently-matched field is a statement, not a task — its picker stays
 * collapsed behind a Change link so the screen doesn't read as a form to fill
 * in. Only a field that genuinely needs a decision opens with its picker
 * showing. */
function FieldRow({ field, columns, value, onChange, needsDecision }) {
  const [changing, setChanging] = useState(false);
  const badge = field.column ? LEVEL_BADGE[field.level] || LEVEL_BADGE.low : null;
  const pickerOpen = needsDecision || changing;

  const options = useMemo(
    () => [
      ...(field.required ? [] : [{ value: '', label: "Don't use this field" }]),
      ...columns.map((c) => ({ value: c.name, label: c.name })),
    ],
    [columns, field.required]
  );

  return (
    <div
      className={`rounded-lg border p-4 ${
        needsDecision ? 'border-risk-medium/40 bg-risk-medium/[0.03]' : 'border-border bg-surface'
      }`}
    >
      <div className="flex flex-wrap items-center gap-2 mb-1">
        <h4 className="text-sm font-semibold text-text-primary">{field.label}</h4>
        {field.required ? (
          <Badge variant="default" size="xs">Required</Badge>
        ) : (
          <Badge variant="default" size="xs">Optional</Badge>
        )}
        {badge && <Badge variant={badge.variant} size="xs">{badge.text}</Badge>}
        <InfoTip content={field.description} label={`About ${field.label}`} />
      </div>

      {/* Why this field exists at all — the answer to "why are you asking me?" */}
      {needsDecision && (
        <p className="text-xs text-text-secondary leading-relaxed mb-3">{field.whyNeeded}</p>
      )}

      {/* What we found, and the evidence for it. */}
      {field.column && !needsDecision && (
        <p className="text-xs text-text-secondary leading-relaxed mb-3">
          Using your column <span className="font-medium text-text-primary">{field.column}</span>
          {field.reasons?.length > 0 && <> — {field.reasons[0]}.</>}
        </p>
      )}

      {field.blocker && (
        <p className="text-xs text-risk-high leading-relaxed mb-3">{field.blocker}</p>
      )}

      {needsDecision && (
        <p className="text-xs text-text-tertiary leading-relaxed mb-3">{field.lookFor}</p>
      )}

      {pickerOpen ? (
        <Select
          label={needsDecision ? 'Choose the column that holds this' : 'Use a different column'}
          options={options}
          value={value || ''}
          placeholder={field.required ? 'Select a column…' : 'Not used'}
          onChange={(e) => onChange(field.key, e.target.value)}
        />
      ) : (
        <button
          type="button"
          onClick={() => setChanging(true)}
          className="text-xs font-medium text-accent hover:underline cursor-pointer"
        >
          Change
        </button>
      )}
    </div>
  );
}

export default function ReviewStep({
  validation,
  overrides,
  onChange,
  onContinue,
  onStartOver,
  submitting,
}) {
  const mapping = validation.mapping;
  const columns = validation.columns || [];

  // A field needs a decision when it is required and either unmatched or only
  // weakly matched. Everything else is shown for transparency, not as a task.
  const needsDecision = (field) =>
    field.required && (!currentColumn(field) || field.level === 'low' || Boolean(field.blocker));

  function currentColumn(field) {
    return overrides[field.key] !== undefined ? overrides[field.key] : field.column;
  }

  const decisions = mapping.fields.filter(needsDecision);
  const confident = mapping.fields.filter((f) => !needsDecision(f) && currentColumn(f));
  const unusedOptional = mapping.fields.filter((f) => !f.required && !currentColumn(f));

  const unresolved = decisions.filter((f) => !currentColumn(f));
  const canContinue = unresolved.length === 0;

  return (
    <div className="space-y-5 max-w-3xl">
      {/* ---------- What needs you ---------- */}
      {decisions.length > 0 && (
        <Card>
          <div className="flex items-start gap-2.5 mb-4">
            <AlertTriangle size={16} className="text-risk-medium mt-0.5 shrink-0" />
            <div>
              <h2 className="text-base font-semibold text-text-primary">
                {decisions.length === 1
                  ? 'One field needs your input'
                  : `${decisions.length} fields need your input`}
              </h2>
              <p className="text-xs text-text-secondary mt-1 leading-relaxed">
                ChurnGuard matched everything else automatically. These are the ones it could not
                work out from your column names and values.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {decisions.map((field) => (
              <FieldRow
                key={field.key}
                field={field}
                columns={columns}
                value={currentColumn(field)}
                onChange={onChange}
                needsDecision
              />
            ))}
          </div>
        </Card>
      )}

      {/* ---------- What was worked out automatically ---------- */}
      {confident.length > 0 && (
        <Card>
          <div className="flex items-start gap-2.5 mb-4">
            <Check size={16} className="text-success mt-0.5 shrink-0" strokeWidth={2.5} />
            <div>
              <h2 className="text-base font-semibold text-text-primary">
                Detected automatically
              </h2>
              <p className="text-xs text-text-secondary mt-1 leading-relaxed">
                You do not need to do anything here. Change one only if it looks wrong.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {confident.map((field) => (
              <FieldRow
                key={field.key}
                field={field}
                columns={columns}
                value={currentColumn(field)}
                onChange={onChange}
                needsDecision={false}
              />
            ))}
          </div>
        </Card>
      )}

      {/* ---------- Everything else in the file ---------- */}
      {(mapping.unmappedColumns?.length > 0 || unusedOptional.length > 0) && (
        <Card>
          <div className="flex items-start gap-2.5">
            <Layers size={16} className="text-text-tertiary mt-0.5 shrink-0" />
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-text-primary flex items-center gap-1.5">
                Additional data
                <InfoTip content="ChurnGuard only maps the fields its model needs. Anything else in your file is kept as-is and simply not used for scoring — you never have to configure it." />
              </h3>
              {mapping.unmappedColumns?.length > 0 && (
                <p className="text-xs text-text-secondary mt-1.5 leading-relaxed">
                  <span className="font-medium text-text-primary">
                    {mapping.unmappedColumns.length}
                  </span>{' '}
                  {mapping.unmappedColumns.length === 1 ? 'column' : 'columns'} in your file
                  {mapping.unmappedColumns.length === 1 ? ' is' : ' are'} not used for churn
                  scoring: {mapping.unmappedColumns.slice(0, 6).join(', ')}
                  {mapping.unmappedColumns.length > 6 &&
                    ` and ${mapping.unmappedColumns.length - 6} more`}
                  .
                </p>
              )}
              {unusedOptional.length > 0 && (
                <p className="text-xs text-text-tertiary mt-1.5 leading-relaxed">
                  Not found in this file (optional):{' '}
                  {unusedOptional.map((f) => f.label).join(', ')}.
                </p>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* ---------- Continue ---------- */}
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={onContinue} disabled={!canContinue} loading={submitting}>
          {submitting ? 'Processing…' : 'Continue'}
        </Button>
        <Button variant="ghost" onClick={onStartOver} disabled={submitting}>
          Use different data
        </Button>
        {!canContinue && (
          <p className="text-xs text-text-tertiary flex items-center gap-1.5">
            <HelpCircle size={12} />
            Choose a column for every required field to continue.
          </p>
        )}
      </div>
    </div>
  );
}
