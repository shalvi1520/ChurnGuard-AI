import { CheckCircle2, ArrowRight, Users, RefreshCw, Sparkles } from 'lucide-react';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import { formatNumber, formatRelativeDate } from '../../utils/helpers';

function Fact({ label, value }) {
  return (
    <div>
      <p className="text-[11px] text-text-tertiary uppercase tracking-wide">{label}</p>
      <p className="text-sm font-medium text-text-primary mt-1 break-words">{value}</p>
    </div>
  );
}

export default function CompleteStep({ summary, onViewOverview, onViewCustomers, onReplace }) {
  const isDemo = summary.source === 'demo';

  return (
    <div className="space-y-5">
      <Card className="border-risk-low/25 bg-risk-low/[0.04]">
        <div className="flex flex-col sm:flex-row sm:items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-risk-low/10 flex items-center justify-center shrink-0">
            <CheckCircle2 size={24} className="text-risk-low" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-semibold text-text-primary">Your dataset is ready</h2>
              {isDemo && <Badge variant="accent" size="sm">DEMO DATA</Badge>}
            </div>
            <p className="text-sm text-text-secondary mt-1.5 leading-relaxed max-w-xl">
              {formatNumber(summary.rows)} customers from{' '}
              <span className="text-text-primary font-medium">{summary.filename}</span> have been prepared and scored.
              Your Overview is now available, with customers ranked by churn risk.
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-5 pt-5 border-t border-border">
              <Fact label="Customers" value={formatNumber(summary.rows)} />
              <Fact label="Columns read" value={formatNumber(summary.columns)} />
              <Fact label="Fields mapped" value={formatNumber(summary.fieldsMapped)} />
              <Fact
                label="Already churned"
                value={
                  summary.labelledChurnCount === null || summary.labelledChurnCount === undefined
                    ? '—'
                    : `${formatNumber(summary.labelledChurnCount)} in your file`
                }
              />
            </div>

            <div className="flex flex-wrap items-center gap-3 mt-6">
              <Button size="lg" iconRight={ArrowRight} onClick={onViewOverview}>
                View Overview
              </Button>
              <Button variant="outline" icon={Users} onClick={onViewCustomers}>
                View customers
              </Button>
              <Button variant="ghost" icon={RefreshCw} onClick={onReplace}>
                Replace dataset
              </Button>
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <div className="flex gap-3">
          <Sparkles size={16} className="text-accent shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-text-primary">About these results</p>
            <p className="text-xs text-text-secondary mt-1 leading-relaxed max-w-2xl">
              Row, column and churn-label counts above are measured directly from your file. The risk scores, SHAP
              explanations and recommendations shown across the rest of ChurnGuard are simulated demo output — this
              prototype does not train a model on your data. {isDemo && 'This run used ChurnGuard\'s demo dataset of fictional customers.'}
            </p>
            {summary.completedAt && (
              <p className="text-[11px] text-text-tertiary mt-2">
                Setup completed {formatRelativeDate(summary.completedAt)}.
              </p>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
