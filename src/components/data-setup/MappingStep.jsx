import { useMemo } from 'react';
import { ArrowRight, ArrowLeft, CheckCircle2, AlertCircle, Wand2 } from 'lucide-react';
import Card, { CardHeader, CardTitle, CardDescription } from '../ui/Card';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import Select from '../ui/Select';
import { CHURNGUARD_FIELDS } from '../../mock/datasetSchema';
import { cn } from '../../utils/helpers';

const NOT_PRESENT = '';

export default function MappingStep({ validation, mappings, onChange, onSubmit, onBack, submitting }) {
  const columnNames = useMemo(() => validation.columns.map((c) => c.name), [validation.columns]);

  const options = useMemo(
    () => [
      { value: NOT_PRESENT, label: 'Not in my file' },
      ...columnNames.map((name) => ({ value: name, label: name })),
    ],
    [columnNames]
  );

  const requiredFields = CHURNGUARD_FIELDS.filter((f) => f.required);
  const missingRequired = requiredFields.filter((f) => !mappings[f.key]);

  // The same column feeding two ChurnGuard fields is almost always a mistake.
  const duplicateColumns = useMemo(() => {
    const counts = new Map();
    for (const column of Object.values(mappings)) {
      if (column) counts.set(column, (counts.get(column) || 0) + 1);
    }
    return new Set([...counts.entries()].filter(([, n]) => n > 1).map(([col]) => col));
  }, [mappings]);

  const usedColumns = new Set(Object.values(mappings).filter(Boolean));
  const unusedCount = columnNames.length - usedColumns.size;
  const canContinue = missingRequired.length === 0 && duplicateColumns.size === 0;

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>Match your columns to ChurnGuard fields</CardTitle>
          <CardDescription>
            We've suggested matches based on your column names — check them and adjust anything we got wrong.
          </CardDescription>
        </CardHeader>

        {/* Progress and reassurance on one wrapping row, so the header stays
            readable on narrow screens. */}
        <div className="flex items-center gap-2.5 flex-wrap px-3 py-2 rounded-lg bg-bg-tertiary/30 border border-border mb-4">
          <Wand2 size={14} className="text-accent shrink-0" />
          <Badge variant={missingRequired.length === 0 ? 'low' : 'medium'} size="sm">
            {requiredFields.length - missingRequired.length}/{requiredFields.length} required mapped
          </Badge>
          <p className="text-[11px] text-text-secondary leading-relaxed">
            Mapping only tells ChurnGuard which column is which — nothing in your file is changed.
          </p>
        </div>

        <div className="space-y-4">
          {CHURNGUARD_FIELDS.map((field) => {
            const value = mappings[field.key] || NOT_PRESENT;
            const isMissing = field.required && !value;
            const isDuplicate = Boolean(value) && duplicateColumns.has(value);
            const selectId = `map-${field.key}`;

            return (
              <div
                key={field.key}
                className={cn(
                  'rounded-lg border p-3 transition-colors',
                  isMissing || isDuplicate ? 'border-risk-critical/40 bg-risk-critical/[0.04]' : 'border-border bg-bg-tertiary/20'
                )}
              >
                <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] gap-3 sm:gap-4 items-center">
                  {/* Your column */}
                  <div>
                    <label htmlFor={selectId} className="block text-[10px] uppercase tracking-wide text-text-tertiary mb-1">
                      Your dataset column
                    </label>
                    <Select
                      id={selectId}
                      value={value}
                      onChange={(e) => onChange(field.key, e.target.value)}
                      options={options}
                      placeholder=""
                      aria-describedby={`${selectId}-desc`}
                      className={cn((isMissing || isDuplicate) && 'border-risk-critical')}
                    />
                  </div>

                  <ArrowRight size={16} className="text-text-tertiary justify-self-center rotate-90 sm:rotate-0 shrink-0" />

                  {/* ChurnGuard field */}
                  <div>
                    <span className="block text-[10px] uppercase tracking-wide text-text-tertiary mb-1">
                      ChurnGuard field
                    </span>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-text-primary">{field.label}</span>
                      {field.required ? (
                        <Badge variant="accent" size="xs">Required</Badge>
                      ) : (
                        <Badge variant="default" size="xs">Optional</Badge>
                      )}
                      {value && !isDuplicate && <CheckCircle2 size={14} className="text-risk-low" />}
                    </div>
                    <p id={`${selectId}-desc`} className="text-[11px] text-text-tertiary mt-1 leading-relaxed">
                      {field.description}
                    </p>
                  </div>
                </div>

                {isMissing && (
                  <p role="alert" className="flex items-center gap-1.5 text-[11px] text-risk-critical mt-2.5">
                    <AlertCircle size={12} className="shrink-0" />
                    Pick the column that holds this — ChurnGuard needs it to continue.
                  </p>
                )}
                {isDuplicate && (
                  <p role="alert" className="flex items-center gap-1.5 text-[11px] text-risk-critical mt-2.5">
                    <AlertCircle size={12} className="shrink-0" />
                    "{value}" is already used for another field. Each column can only fill one.
                  </p>
                )}
              </div>
            );
          })}
        </div>

        {unusedCount > 0 && (
          <p className="text-[11px] text-text-tertiary mt-4 pt-4 border-t border-border leading-relaxed">
            {unusedCount} other {unusedCount === 1 ? 'column stays' : 'columns stay'} with your dataset as additional
            context — you don't need to map {unusedCount === 1 ? 'it' : 'them'}.
          </p>
        )}
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <Button size="lg" iconRight={ArrowRight} onClick={onSubmit} disabled={!canContinue} loading={submitting}>
          Save mapping & process
        </Button>
        <Button variant="ghost" icon={ArrowLeft} onClick={onBack} disabled={submitting}>
          Back to validation
        </Button>
        {!canContinue && (
          <p className="text-xs text-text-tertiary">
            {missingRequired.length > 0
              ? `Still needed: ${missingRequired.map((f) => f.label).join(', ')}`
              : 'Resolve the duplicate column above to continue.'}
          </p>
        )}
      </div>
    </div>
  );
}
