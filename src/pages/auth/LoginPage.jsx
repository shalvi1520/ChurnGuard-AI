import { useEffect, useState } from 'react';
import { Link, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion } from 'framer-motion';
import { Mail, Lock } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { authService, oauthSignInUrl } from '../../services/api';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';

const schema = z.object({
  email: z.string().min(1, 'Email is required').email('Please enter a valid email'),
  password: z.string().min(1, 'Password is required'),
});

export default function LoginPage() {
  const { login, isSubmitting, error, clearError } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [remember, setRemember] = useState(false);
  // Which provider button was pressed, so only that one shows a spinner. The
  // page is about to be replaced by a full navigation to the provider, but on
  // a slow connection that gap is long enough to look unresponsive and invite
  // a second click.
  const [oauthPending, setOauthPending] = useState(null);
  const [providers, setProviders] = useState(null);

  // An OAuth attempt that failed comes back as a redirect to /login?error=...
  // -- the backend has no other way to report into a page it is handing the
  // browser to. Read once into local state.
  const [oauthError, setOauthError] = useState(() => searchParams.get('error'));

  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
    // No defaultValues. This form used to arrive prefilled with a demo email
    // and password; both are gone, along with the account they opened.
    defaultValues: { email: '', password: '' },
  });

  // Ask which providers this server can actually perform. A button for an
  // unconfigured provider is disabled and says so, rather than sending the
  // user to a 503.
  useEffect(() => {
    let cancelled = false;
    authService
      .getOAuthProviders()
      .then((data) => {
        if (!cancelled) setProviders(data.providers);
      })
      .catch(() => {
        // Backend unreachable. Leave the buttons enabled rather than
        // disabling them on a guess -- pressing one then produces a real,
        // specific error instead of a permanently dead control.
        if (!cancelled) setProviders(null);
      });
    return () => { cancelled = true; };
  }, []);

  // A stale error from a previous visit shouldn't greet the next one.
  useEffect(() => () => clearError(), [clearError]);

  const onSubmit = async (data) => {
    setOauthError(null);
    try {
      await login(data.email, data.password, remember);
      // Return the user to whatever they were trying to reach before the
      // guard sent them here; otherwise start at the data-setup step, which
      // is the first required part of the product. `replace` keeps the
      // sign-in page out of the back-button history.
      const intended = location.state?.from;
      navigate(intended || '/data-management', { replace: true });
    } catch {
      // Message is already in AuthContext's `error` and rendered below.
    }
  };

  const startOAuth = (provider) => {
    setOauthPending(provider);
    // A full-page navigation, not an XHR: the consent screen is a page the
    // user has to see, on the provider's own domain.
    window.location.href = oauthSignInUrl(provider);
  };

  const providerState = (name) => providers?.find((p) => p.name === name);
  const isProviderDisabled = (name) => {
    const state = providerState(name);
    return Boolean(oauthPending) || (state ? !state.configured : false);
  };
  const providerTitle = (name, label) => {
    const state = providerState(name);
    return state && !state.configured
      ? `${label} sign-in isn't configured on this server yet.`
      : undefined;
  };

  const banner = oauthError || error;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <h2 className="text-2xl font-bold text-text-primary tracking-tight mb-1.5">Welcome back</h2>
      <p className="text-sm text-text-tertiary mb-8">Sign in to your ChurnGuard account</p>

      {banner && (
        <div
          role="alert"
          className="mb-4 p-3 rounded-lg bg-risk-critical/10 border border-risk-critical/20 text-sm text-risk-critical"
        >
          {banner}
        </div>
      )}

      {/* noValidate hands validation to zod so the messages match the rest of
          the app instead of being the browser's own. Enter still submits: it
          is a real <form> with a submit button. */}
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <Input
          label="Email"
          type="email"
          icon={Mail}
          placeholder="you@company.com"
          autoComplete="email"
          error={errors.email?.message}
          {...register('email')}
        />

        <Input
          label="Password"
          type="password"
          icon={Lock}
          placeholder="Enter your password"
          autoComplete="current-password"
          error={errors.password?.message}
          {...register('password')}
        />

        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="w-3.5 h-3.5 rounded border-border bg-bg-tertiary text-accent focus:ring-accent"
            />
            <span className="text-xs text-text-tertiary">Remember me</span>
          </label>
          <Link to="/forgot-password" className="text-xs text-accent hover:text-accent-dim transition-colors">
            Forgot password?
          </Link>
        </div>

        {/* `loading` also sets `disabled` (see Button), which is what prevents
            a second submission while the first is in flight. */}
        <Button type="submit" className="w-full" size="lg" loading={isSubmitting} disabled={Boolean(oauthPending)}>
          {isSubmitting ? 'Signing in…' : 'Sign In'}
        </Button>
      </form>

      <div className="mt-6">
        <div className="relative">
          <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border" /></div>
          <div className="relative flex justify-center"><span className="bg-bg-primary lg:bg-transparent px-3 text-xs text-text-tertiary">or continue with</span></div>
        </div>
        <div className="grid grid-cols-1 gap-3 mt-4">
          {/* This begins a real OAuth 2.0 / OpenID Connect flow against the
              backend. It previously just resubmitted the sign-in form with
              the demo credentials, which looked like Google sign-in and was
              not. */}
          <Button
            variant="outline"
            size="md"
            type="button"
            onClick={() => startOAuth('google')}
            loading={oauthPending === 'google'}
            disabled={isSubmitting || isProviderDisabled('google')}
            title={providerTitle('google', 'Google')}
          >
            {oauthPending !== 'google' && (
              <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
            )}
            Google
          </Button>
        </div>
        {providers && providers.some((p) => !p.configured) && (
          <p className="mt-3 text-[10px] text-text-tertiary text-center leading-relaxed">
            {providers.filter((p) => !p.configured).map((p) => p.label).join(' and ')}{' '}
            sign-in {providers.filter((p) => !p.configured).length > 1 ? 'are' : 'is'} not configured
            on this server. See AUTH_SETUP.md.
          </p>
        )}
      </div>

      <p className="mt-8 text-center text-sm text-text-tertiary">
        Don't have an account?{' '}
        <Link to="/signup" className="text-accent hover:text-accent-dim font-medium transition-colors">Sign up</Link>
      </p>
    </motion.div>
  );
}
