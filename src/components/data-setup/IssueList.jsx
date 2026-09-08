import { AlertTriangle, FileWarning } from 'lucide-react';
import Card from '../ui/Card';
import Button from '../ui/Button';
import { formatNumber } from '../../utils/helpers';

/**
 * Shown when the connected data can't be analysed at all.
 *
 * Each issue comes from the backend already phrased as what/why/what-to-do,
 * because "Validation failed" tells the user nothing they can act on. Nothing
 * here is generic: the titles name the actual column or count that is wrong.
 */
export default function IssueList({ validation, onStartOver }) {
  const { issues = [], warnings = [], rows, columns } = validation;

  return (
    <div className="space-y-5 max-w-2xl">
      <Card>
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-risk-critical/10 flex items-center justify-center shrink-0">
            <FileWarning size={19} className="text-risk-critical" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-text-primary">
              This data can&apos;t be analysed yet
            </h2>
            <p className="text-sm text-text-secondary mt-1 leading-relaxed">
              ChurnGuard read {formatNumber(rows || 0)}{' '}
              {rows === 1 ? 'row' : 'rows'} and {formatNumber(columns?.length || 0)}{' '}
              {columns?.length === 1 ? 'column' : 'columns'}, but found problems that stop it
              training a model.
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
          <Button onClick={onStartOver}>Use different data</Button>
        </div>
      </Card>
    </div>
  );
}
