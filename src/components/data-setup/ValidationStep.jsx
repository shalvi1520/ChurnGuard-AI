import { useState } from 'react';
import { CheckCircle2, AlertTriangle, XCircle, ArrowRight, RotateCcw, ChevronDown } from 'lucide-react';
import Card, { CardHeader, CardTitle, CardDescription } from '../ui/Card';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import { cn, formatNumber } from '../../utils/helpers';

const STATUS = {
  ready: {
    icon: CheckCircle2,
    title: 'Your data is ready',
    tone: 'text-risk-low',
    ring: 'border-risk-low/25 bg-risk-low/[0.06]',
    label: 'Ready',
    badge: 'low',
  },
  warning: {
    icon: AlertTriangle,
    title: 'Ready to continue, with a few things to know',
    tone: 'text-risk-medium',
    ring: 'border-risk-medium/25 bg-risk-medium/[0.06]',
    label: 'Needs attention',
    badge: 'medium',
  },
  blocked: {
    icon: XCircle,
    title: "We can't analyse this file",
    tone: 'text-risk-critical',
    ring: 'border-risk-critical/25 bg-risk-critical/[0.06]',
    label: 'Cannot continue',
    badge: 'critical',
  },
};

const TYPE_LABELS = {
  numeric: 'Number',
  categorical: 'Category',
  identifier: 'Identifier',
  text: 'Text',
  empty: 'Empty',
};

function Metric({ label, value, sub, tone = 'text-text-primary' }) {
  return (
    <Card className="py-4">
      <p className="text-[11px] text-text-tertiary uppercase tracking-wide">{label}</p>
      <p className={cn('text-2xl font-bold mt-1 tabular-nums', tone)}>{value}</p>
      {sub && <p className="text-[11px] text-text-tertiary mt-0.5">{sub}</p>}
    </Card>
  );
}

export default function ValidationStep({ dataset, validation, onContinue, onRestart }) {
  const [showColumns, setShowColumns] = useState(false);
  const status = STATUS[validation.status] || STATUS.warning;
  const StatusIcon = status.icon;
  const blocked = validation.status === 'blocked';
  const notes = blocked ? validation.issues : validation.warnings;

  return (
    <div className="space-y-5">
      {/* Summary banner */}
      <div className={cn('rounded-xl border p-4 flex items-start gap-3', status.ring)}>
        <StatusIcon size={20} className={cn('shrink-0 mt-0.5', status.tone)} />
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-sm font-semibold text-text-primary">{status.title}</h2>
            <Badge variant={status.badge} size="xs">{status.label}</Badge>
          </div>
          <p className="text-xs text-text-secondary mt-1 leading-relaxed">
            We read <span className="text-text-primary font-medium">{dataset.filename}</span>
            {dataset.sheetName && (
              <> — sheet <span className="text-text-primary font-medium">{dataset.sheetName}</span>
                {dataset.sheetCount > 1 && ` of ${dataset.sheetCount}`}</>
            )}
            {' '}and checked every row and column. Everything below is measured from your file.
          </p>
        </div>
      </div>

      {/* Measured facts */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Metric label="Customers" value={formatNumber(dataset.rows)} sub="rows of data" />
        <Metric label="Columns" value={formatNumber(dataset.columns)} sub="detected in your file" />
        <Metric
          label="Missing values"
          value={`${validation.missingPercent}%`}
          sub={`${formatNumber(validation.missingCells)} empty cells`}
          tone={validation.missingCells > 0 ? 'text-risk-medium' : 'text-risk-low'}
        />
        <Metric
          label="Duplicate rows"
          value={formatNumber(validation.duplicateRows)}
          sub={validation.duplicateRows > 0 ? 'identical entries' : 'none found'}
          tone={validation.duplicateRows > 0 ? 'text-risk-high' : 'text-risk-low'}
        />
        <Metric
          label="Required fields"
          value={`${validation.requiredDetected}/${validation.requiredTotal}`}
          sub="matched automatically"
          tone={validation.requiredDetected === validation.requiredTotal ? 'text-risk-low' : 'text-risk-medium'}
        />
      </div>

      {/* What it means */}
      {notes.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{blocked ? 'What needs fixing' : 'Worth knowing before you continue'}</CardTitle>
            <CardDescription>
              {blocked
                ? 'These problems stop the analysis from running.'
                : 'None of these block you — they just affect how complete the results will be.'}
            </CardDescription>
          </CardHeader>
          <ul className="space-y-3">
            {notes.map((note) => (
              <li
                key={note.title}
                className="flex gap-3 p-3 rounded-lg bg-bg-tertiary/25 border border-border"
              >
                {blocked ? (
                  <XCircle size={15} className="text-risk-critical shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle size={15} className="text-risk-medium shrink-0 mt-0.5" />
                )}
                <div className="min-w-0">
                  <p className="text-xs font-medium text-text-primary">{note.title}</p>
                  <p className="text-[11px] text-text-secondary mt-1 leading-relaxed">{note.why}</p>
                  <p className="text-[11px] text-text-tertiary mt-1 leading-relaxed">
                    <span className="font-medium text-text-secondary">What to do: </span>
                    {note.action}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Detected columns */}
      <Card padding={false}>
        <button
          type="button"
          onClick={() => setShowColumns((v) => !v)}
          aria-expanded={showColumns}
          className="w-full flex items-center justify-between p-4 text-left cursor-pointer hover:bg-bg-tertiary/30 transition-colors rounded-xl"
        >
          <div>
            <p className="text-sm font-semibold text-text-primary">
              Detected columns ({formatNumber(validation.columns.length)})
            </p>
            <p className="text-xs text-text-tertiary mt-0.5">
              Every column we found, with its type and how complete it is.
            </p>
          </div>
          <ChevronDown size={16} className={cn('text-text-tertiary transition-transform shrink-0', showColumns && 'rotate-180')} />
        </button>

        {showColumns && (
          <div className="border-t border-border overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-text-tertiary">
                  <th scope="col" className="px-4 py-2 text-left font-semibold">Column</th>
                  <th scope="col" className="px-4 py-2 text-left font-semibold">Type</th>
                  <th scope="col" className="px-4 py-2 text-right font-semibold">Distinct values</th>
                  <th scope="col" className="px-4 py-2 text-right font-semibold">Missing</th>
                </tr>
              </thead>
              <tbody>
                {validation.columns.map((col) => (
                  <tr key={col.name} className="border-b border-border/50 last:border-0">
                    <td className="px-4 py-2 text-text-primary font-medium whitespace-nowrap">{col.name}</td>
                    <td className="px-4 py-2 text-text-tertiary">{TYPE_LABELS[col.type] || col.type}</td>
                    <td className="px-4 py-2 text-right text-text-secondary tabular-nums">{formatNumber(col.unique)}</td>
                    <td className={cn('px-4 py-2 text-right tabular-nums', col.missing > 0 ? 'text-risk-medium' : 'text-text-tertiary')}>
                      {col.missing > 0 ? formatNumber(col.missing) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Preview */}
      {validation.preview.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>First rows of your file</CardTitle>
            <CardDescription>A quick check that we read your columns the way you expect.</CardDescription>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  {Object.keys(validation.preview[0]).map((header) => (
                    <th key={header} scope="col" className="px-3 py-2 text-left font-semibold text-text-tertiary whitespace-nowrap">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {validation.preview.map((row, i) => (
                  <tr key={i} className="border-b border-border/50 last:border-0">
                    {Object.entries(row).map(([key, value]) => (
                      <td key={key} className="px-3 py-2 text-text-secondary tabular-nums whitespace-nowrap">
                        {String(value).trim() === '' ? <span className="text-text-tertiary/60">empty</span> : String(value)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button size="lg" iconRight={ArrowRight} onClick={onContinue} disabled={blocked}>
          Continue to column mapping
        </Button>
        <Button variant="ghost" icon={RotateCcw} onClick={onRestart}>
          Use a different file
        </Button>
      </div>
    </div>
  );
}
