import { useEffect, useState } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import Button from '../ui/Button';
import { checkBackendHealth, BACKEND_START_HINT } from '../../services/api';

/**
 * Warns that the API isn't reachable *before* the user picks a file.
 *
 * Without this, the first sign of trouble was an upload failing with a message
 * about their data — which is the wrong thing to go and check. ChurnGuard can't
 * do anything at all without the backend (it holds the model, the parser and
 * the dataset), so saying so up front is the honest thing to do.
 *
 * Renders nothing when the backend is healthy, which is the normal case.
 */
export default function BackendNotice() {
  const [reachable, setReachable] = useState(null); // null = still checking
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    let cancelled = false;
    checkBackendHealth().then((health) => {
      if (!cancelled) setReachable(Boolean(health));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const recheck = async () => {
    setChecking(true);
    const health = await checkBackendHealth({ force: true });
    setReachable(Boolean(health));
    setChecking(false);
  };

  // Still checking, or everything is fine — say nothing.
  if (reachable !== false) return null;

  return (
    <div
      role="alert"
      className="rounded-xl border border-risk-critical/30 bg-risk-critical/[0.06] p-4 max-w-2xl"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle size={17} className="text-risk-critical mt-0.5 shrink-0" />
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-text-primary">
            The ChurnGuard backend isn&apos;t running
          </h2>
          <p className="text-xs text-text-secondary mt-1 leading-relaxed">
            Your data is read, validated and scored by the ChurnGuard backend, so nothing here will
            work until it is started. This is not a problem with your file.
          </p>
          <p className="text-xs text-text-tertiary mt-2 leading-relaxed break-words">
            {BACKEND_START_HINT}
          </p>
          <Button
            size="sm"
            variant="secondary"
            className="mt-3"
            onClick={recheck}
            loading={checking}
            icon={RefreshCw}
          >
            Check again
          </Button>
        </div>
      </div>
    </div>
  );
}
