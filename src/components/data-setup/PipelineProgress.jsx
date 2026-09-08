import { Check, Loader2, AlertTriangle, Circle } from 'lucide-react';
import Card from '../ui/Card';
import Button from '../ui/Button';
import { PIPELINE_STAGES } from './steps';

/**
 * The one screen the user watches while ChurnGuard does the work.
 *
 * It replaces the old Validate → Map → Process → Predict click-through: those
 * were four buttons that asked the user to approve steps they had no input
 * into. Now the work runs automatically and this narrates it.
 *
 * Every row corresponds to real backend work, so the progress shown is honest:
 * a row is 'active' only while that call is genuinely in flight.
 */

const ICONS = {
  done: <Check size={13} className="text-success" strokeWidth={3} />,
  active: <Loader2 size={13} className="text-accent animate-spin" />,
  error: <AlertTriangle size={13} className="text-danger" />,
  pending: <Circle size={7} className="text-text-tertiary fill-current" />,
};

function StageRow({ stage, state }) {
  const isActive = state === 'active';
  const isDone = state === 'done';

  return (
    <li className="flex items-start gap-3 py-2.5">
      <span
        className={`mt-0.5 w-5 h-5 rounded-full flex items-center justify-center shrink-0 border transition-colors ${
          isDone
            ? 'bg-success/10 border-success/30'
            : isActive
              ? 'bg-accent/10 border-accent/30'
              : state === 'error'
                ? 'bg-danger/10 border-danger/30'
                : 'bg-surface border-border'
        }`}
      >
        {ICONS[state] || ICONS.pending}
      </span>
      <div className="min-w-0">
        <p
          className={`text-sm leading-tight ${
            isActive || isDone ? 'text-text-primary font-medium' : 'text-text-tertiary'
          }`}
        >
          {stage.label}
        </p>
        {/* The detail line only earns its space while the stage is running or
            has just been reached — otherwise this becomes a wall of text. */}
        {(isActive || state === 'error') && (
          <p className="text-xs text-text-tertiary mt-0.5 leading-relaxed">{stage.detail}</p>
        )}
      </div>
    </li>
  );
}

export default function PipelineProgress({
  stageStates,
  headline = 'Setting up your data',
  subhead = 'This runs on its own. You will only be asked something if a decision is genuinely needed.',
  error,
  onRetry,
  onStartOver,
}) {
  const doneCount = Object.values(stageStates).filter((s) => s === 'done').length;
  const percent = Math.round((doneCount / PIPELINE_STAGES.length) * 100);

  return (
    <Card className="max-w-2xl">
      <div className="mb-5">
        <h2 className="text-base font-semibold text-text-primary">{headline}</h2>
        <p className="text-xs text-text-secondary mt-1 leading-relaxed">{subhead}</p>
      </div>

      <div
        className="h-1 rounded-full bg-border overflow-hidden mb-1"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Setup progress"
      >
        <div
          className="h-full bg-accent transition-all duration-500 ease-out"
          style={{ width: `${percent}%` }}
        />
      </div>

      <ul className="divide-y divide-border/60">
        {PIPELINE_STAGES.map((stage) => (
          <StageRow key={stage.key} stage={stage} state={stageStates[stage.key] || 'pending'} />
        ))}
      </ul>

      {error && (
        <div className="mt-5 rounded-lg border border-danger/30 bg-danger/5 p-4">
          <div className="flex items-start gap-2.5">
            <AlertTriangle size={15} className="text-danger mt-0.5 shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-text-primary">{error.message}</p>
              {error.hint && (
                <p className="text-xs text-text-secondary mt-1 leading-relaxed">{error.hint}</p>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2 mt-4">
            {onRetry && (
              <Button size="sm" onClick={onRetry}>
                Try again
              </Button>
            )}
            {onStartOver && (
              <Button size="sm" variant="secondary" onClick={onStartOver}>
                Use different data
              </Button>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
