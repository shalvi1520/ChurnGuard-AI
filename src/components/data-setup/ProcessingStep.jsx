import { Check, AlertTriangle, RotateCcw } from 'lucide-react';
import Card from '../ui/Card';
import Button from '../ui/Button';
import ModelArchitecture from '../ModelArchitecture';
import { cn } from '../../utils/helpers';
import { PROCESSING_STAGES } from './steps';

function StageIcon({ state }) {
  if (state === 'done') {
    return (
      <span className="w-5 h-5 rounded-full bg-accent flex items-center justify-center shrink-0">
        <Check size={12} className="text-bg-primary" />
      </span>
    );
  }
  if (state === 'error') {
    return (
      <span className="w-5 h-5 rounded-full bg-risk-critical/15 flex items-center justify-center shrink-0">
        <AlertTriangle size={12} className="text-risk-critical" />
      </span>
    );
  }
  if (state === 'active') {
    return <span className="w-5 h-5 rounded-full border-2 border-border border-t-accent animate-spin shrink-0" />;
  }
  return <span className="w-5 h-5 rounded-full border border-border shrink-0" />;
}

export default function ProcessingStep({ stageStates, error, onRetry, onBack }) {
  return (
    <div className="space-y-5">
      <Card>
        <div className="max-w-lg">
          <h2 className="text-base font-semibold text-text-primary">
            {error ? 'Processing stopped' : 'Preparing your customer analysis'}
          </h2>
          <p className="text-sm text-text-tertiary mt-1 leading-relaxed">
            {error
              ? 'Nothing was lost — your file is still here. You can try this step again.'
              : 'This usually takes a few seconds. You can watch each stage complete below.'}
          </p>
        </div>

        <ul className="mt-6 space-y-1" aria-live="polite">
          {PROCESSING_STAGES.map((stage) => {
            const state = stageStates[stage.key] || 'pending';
            return (
              <li
                key={stage.key}
                className={cn(
                  'flex items-center gap-3 py-2.5 px-3 rounded-lg transition-colors',
                  state === 'active' && 'bg-accent/[0.06]',
                  state === 'error' && 'bg-risk-critical/[0.06]'
                )}
              >
                <StageIcon state={state} />
                <span
                  className={cn(
                    'text-sm',
                    state === 'pending' && 'text-text-tertiary',
                    state === 'active' && 'text-text-primary font-medium',
                    state === 'done' && 'text-text-secondary',
                    state === 'error' && 'text-risk-critical font-medium'
                  )}
                >
                  {stage.label}
                </span>
              </li>
            );
          })}
        </ul>

        {error && (
          <div role="alert" className="mt-4 p-3 rounded-lg bg-risk-critical/10 border border-risk-critical/25">
            <p className="text-sm font-medium text-risk-critical">{error.message}</p>
            {error.hint && <p className="text-xs text-text-secondary mt-1 leading-relaxed">{error.hint}</p>}
            <div className="flex flex-wrap gap-2 mt-3">
              <Button size="sm" icon={RotateCcw} onClick={onRetry}>Try again</Button>
              <Button size="sm" variant="ghost" onClick={onBack}>Back to mapping</Button>
            </div>
          </div>
        )}

        <p className="text-[11px] text-text-tertiary mt-5 pt-4 border-t border-border leading-relaxed">
          ChurnGuard is a prototype: the risk scores it produces here are simulated demo output, not the result of a
          model trained on your file.
        </p>
      </Card>

      <ModelArchitecture />
    </div>
  );
}
