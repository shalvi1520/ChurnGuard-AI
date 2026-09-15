import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Mail, ArrowLeft, CheckCircle, AlertTriangle } from 'lucide-react';
import { authService } from '../../services/api';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';

// Mirrors the backend's own check (auth_routes._EMAIL_RE). Catching an obvious
// typo here saves a round trip and a 422; it is not a control, because the API
// is reachable directly and validates again on arrival.
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;

    const address = email.trim();
    if (!address) {
      setError('Enter the email address on your account.');
      return;
    }
    if (!EMAIL_RE.test(address)) {
      setError("That doesn't look like a valid email address.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      setResult(await authService.forgotPassword(address));
    } catch (err) {
      // 429 carries a real instruction — waiting is the fix, not retyping the
      // address — so it gets its own sentence rather than the generic one.
      setError(
        err.response?.status === 429
          ? err.response?.data?.message ||
            'Too many reset requests. Please wait a few minutes and try again.'
          : err.response?.data?.message || 'Could not request a reset. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  // The server tells us whether a message was actually dispatched. When no
  // mail provider is configured it says so plainly and hands back a developer
  // notice, rather than letting this page claim delivery -- the original
  // version always showed "We've sent a password reset link", which was untrue
  // in every single case, because no reset flow existed at all.
  //
  // Note this flag describes the *server's configuration*, never whether the
  // address has an account: the backend deliberately returns an identical body
  // either way, and a page that rendered differently for the two would undo
  // that at the last step.
  const delivered = result?.emailDelivered !== false;

  // Quoted from the response rather than written in here, so the number on
  // screen is the lifetime the token was actually minted with. A hardcoded 60
  // was how this page came to advertise an expiry the server had stopped using.
  const expiresInMinutes = result?.expiresInMinutes ?? 30;

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
      {result ? (
        <div className="text-center">
          <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4 ${delivered ? 'bg-risk-low/10' : 'bg-risk-medium/10'}`}>
            {delivered
              ? <CheckCircle size={28} className="text-risk-low" aria-hidden="true" />
              : <AlertTriangle size={28} className="text-risk-medium" aria-hidden="true" />}
          </div>

          <h2 className="text-2xl font-bold text-text-primary mb-2">
            {delivered ? 'Check your email' : 'Email delivery not configured'}
          </h2>

          {delivered ? (
            <p className="text-sm text-text-tertiary mb-6">
              {/* Deliberately conditional: confirming that this address has an
                  account would make this form an account-existence oracle for
                  anyone who cares to ask. */}
              We've sent a password reset link if an account exists for{' '}
              <span className="text-text-primary font-medium">{email.trim()}</span>. The link
              expires in {expiresInMinutes} minutes.
            </p>
          ) : (
            <div className="text-left mb-6">
              <p className="text-sm text-text-tertiary mb-3">
                Your request was recorded, but this server has no email provider configured, so
                nothing was sent. If an account exists for that address, its reset link was
                written to the backend log.
              </p>
              <p className="text-xs text-text-tertiary leading-relaxed p-3 rounded-lg bg-bg-tertiary/50 border border-border">
                {result.developerNotice}
              </p>
            </div>
          )}

          <Link to="/login">
            <Button variant="secondary" size="md" icon={ArrowLeft}>Back to Sign In</Button>
          </Link>
        </div>
      ) : (
        <>
          <h2 className="text-2xl font-bold text-text-primary tracking-tight mb-1.5">Reset your password</h2>
          <p className="text-sm text-text-tertiary mb-8">
            Enter the email associated with your account and we'll send you a link to reset your
            password.
          </p>

          {error && (
            <div role="alert" className="mb-4 p-3 rounded-lg bg-risk-critical/10 border border-risk-critical/20 text-sm text-risk-critical">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <Input
              label="Email"
              type="email"
              icon={Mail}
              placeholder="you@company.com"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (error) setError(null);
              }}
            />
            <Button type="submit" className="w-full" size="lg" loading={loading} disabled={!email.trim()}>
              {loading ? 'Sending…' : 'Send Reset Link'}
            </Button>
          </form>

          <p className="mt-6 text-center">
            <Link to="/login" className="text-sm text-text-tertiary hover:text-text-primary transition-colors inline-flex items-center gap-1">
              <ArrowLeft size={14} aria-hidden="true" /> Back to Sign In
            </Link>
          </p>
        </>
      )}
    </motion.div>
  );
}
