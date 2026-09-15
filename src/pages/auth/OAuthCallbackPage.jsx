import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useApp } from '../../context/AppContext';

/**
 * Where the backend sends the browser after a successful Google
 * sign-in.
 *
 * The session cookie is already set by the time this renders -- it arrived on
 * the redirect itself. But this React app never saw that request, so its
 * AuthContext still holds whatever it knew before the user left for the
 * provider (usually: signed out). This page exists to close that gap: it asks
 * the server once who is now signed in, then routes onward.
 *
 * The alternative -- redirecting straight to /data-management -- would land on
 * a guarded route whose guard reads an AuthContext that has not caught up,
 * bouncing the user back to /login moments after a successful sign-in. A
 * dedicated, unguarded landing route removes that race entirely rather than
 * trying to time around it.
 *
 * No token, code, or provider response is ever handed to this page. The URL it
 * is reached at carries nothing but the path.
 */
export default function OAuthCallbackPage() {
  const { refreshSession, isAuthenticated } = useAuth();
  const { datasetSetupComplete, datasetSetupHydrated } = useApp();
  const navigate = useNavigate();
  // StrictMode double-mounts effects in development; without this the session
  // refresh (and the navigation that follows) would fire twice.
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    let cancelled = false;
    (async () => {
      const user = await refreshSession();
      if (cancelled) return;
      if (!user) {
        navigate('/login?error=Sign-in%20could%20not%20be%20completed.', { replace: true });
      }
      // On success, the render below takes over: it waits for AppContext to
      // hydrate the dataset-setup record for this now-known user before
      // choosing a destination, since that record is what decides whether
      // this account goes to setup or straight into the product.
    })();

    return () => { cancelled = true; };
  }, [refreshSession, navigate]);

  useEffect(() => {
    // `isAuthenticated` is not redundant with `datasetSetupHydrated`.
    // AppContext marks the setup record hydrated for a signed-OUT user too
    // (it clears it and flags it resolved), so without this check a failed
    // sign-in would satisfy the condition below and navigate into the app,
    // overriding the redirect to /login above.
    if (!isAuthenticated || !datasetSetupHydrated) return;
    navigate(datasetSetupComplete ? '/dashboard' : '/data-management', { replace: true });
  }, [isAuthenticated, datasetSetupHydrated, datasetSetupComplete, navigate]);

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 rounded-full border-2 border-border border-t-accent animate-spin" />
        <p className="text-xs text-text-tertiary" aria-live="polite">Completing sign-in…</p>
      </div>
    </div>
  );
}
