import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion } from 'framer-motion';
import { Lock, ArrowLeft, CheckCircle } from 'lucide-react';
import { authService } from '../../services/api';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';

// The same floor `security.validate_password` enforces on the backend (8
// characters, 72 bytes). Duplicated rather than fetched because a sign-up form
// that has to ask the server before it can say "too short" is a worse form --
// but the backend validates again regardless, so this is an affordance, not a
// control. If the rule there changes, change it here too.
const MIN_PASSWORD_LENGTH = 8;

const schema = z.object({
  password: z
    .string()
    .min(MIN_PASSWORD_LENGTH, 'Password does not meet the required security requirements.')
    .refine(
      value => new TextEncoder().encode(value).length <= 72,
      'Password must be 72 bytes or fewer.'
    ),
  confirmPassword: z.string().min(1, 'Please confirm your password.'),
}).refine(data => data.password === data.confirmPassword, {
  message: 'Passwords do not match.',
  path: ['confirmPassword'],
});

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { password: '', confirmPassword: '' },
  });

  const onSubmit = async (data) => {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await authService.resetPassword(token, data.password);
      setDone(true);
    } catch (err) {
      const status = err.response?.status;
      if (status === 429) {
        // Waiting is the fix here, so don't offer a new link -- requesting one
        // is the very thing being rate-limited.
        setError({
          message:
            err.response?.data?.message ||
            'Too many attempts. Please wait a few minutes and try again.',
          offerNewLink: false,
        });
      } else if (status === 422) {
        // The backend re-validates the password. Reaching this means the two
        // rule sets have drifted, so show what the server actually said.
        setError({
          message:
            err.response?.data?.message ||
            'Password does not meet the required security requirements.',
          offerNewLink: false,
        });
      } else {
        // 400 is the only thing the redeem endpoint says about a bad token,
        // and it says the same thing for unknown, spent and expired -- so this
        // is the whole vocabulary of link failure, and a new link is the fix.
        setError({
          message:
            err.response?.data?.message ||
            'This password reset link is invalid or has expired. Please request a new one.',
          offerNewLink: true,
        });
      }
    } finally {
      setSubmitting(false);
    }
  };

  // Someone opening /reset-password directly, with no link. Say so rather
  // than showing a form that cannot possibly work.
  if (!token) {
    return (
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <h2 className="text-2xl font-bold text-text-primary tracking-tight mb-1.5">Reset link required</h2>
        <p className="text-sm text-text-tertiary mb-6">
          This page needs the link from your password reset email. Request a new one to continue.
        </p>
        <Link to="/forgot-password">
          <Button variant="secondary" size="md" icon={ArrowLeft}>Request a reset link</Button>
        </Link>
      </motion.div>
    );
  }

  if (done) {
    return (
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="text-center">
        <div className="w-14 h-14 rounded-2xl bg-risk-low/10 flex items-center justify-center mx-auto mb-4">
          <CheckCircle size={28} className="text-risk-low" aria-hidden="true" />
        </div>
        <h2 className="text-2xl font-bold text-text-primary mb-2">Password reset successful</h2>
        <p className="text-sm text-text-tertiary mb-6">
          {/* Stated because it is surprising otherwise: a reset ends every
              session, including ones the user may have open elsewhere. That is
              the point -- whoever prompted the reset may have been signed in. */}
          Your password has been updated. You can now sign in with your new password. Any other
          devices that were signed in have been signed out.
        </p>
        <Button size="md" onClick={() => navigate('/login', { replace: true })}>Go to Sign In</Button>
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
      <h2 className="text-2xl font-bold text-text-primary tracking-tight mb-1.5">Create a new password</h2>
      <p className="text-sm text-text-tertiary mb-8">Pick something you don't use anywhere else.</p>

      {error && (
        <div role="alert" className="mb-4 p-3 rounded-lg bg-risk-critical/10 border border-risk-critical/20 text-sm text-risk-critical">
          {error.message}
          {error.offerNewLink && (
            <Link to="/forgot-password" className="block mt-1 underline hover:no-underline">
              Request a new reset link
            </Link>
          )}
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <Input
          label="New Password"
          type="password"
          icon={Lock}
          placeholder="At least 8 characters"
          autoComplete="new-password"
          error={errors.password?.message}
          {...register('password')}
        />
        <Input
          label="Confirm Password"
          type="password"
          icon={Lock}
          placeholder="Re-enter your new password"
          autoComplete="new-password"
          error={errors.confirmPassword?.message}
          {...register('confirmPassword')}
        />
        <Button type="submit" className="w-full" size="lg" loading={submitting}>
          {submitting ? 'Updating…' : 'Update Password'}
        </Button>
      </form>

      <p className="mt-6 text-center">
        <Link to="/login" className="text-sm text-text-tertiary hover:text-text-primary transition-colors inline-flex items-center gap-1">
          <ArrowLeft size={14} aria-hidden="true" /> Back to Sign In
        </Link>
      </p>
    </motion.div>
  );
}
