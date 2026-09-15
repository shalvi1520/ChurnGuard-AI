import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion } from 'framer-motion';
import { User, Building2, Mail, Lock } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';

const schema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  company: z.string().min(2, 'Company name is required'),
  email: z.string().min(1, 'Work email is required').email('Please enter a valid work email'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string().min(1, 'Please confirm your password'),
  terms: z.boolean().refine(v => v, 'You must accept the terms'),
}).refine(data => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
});

// Guidance, not a gate. The backend enforces a length floor and nothing else
// (see backend/db/security.validate_password for why composition rules are
// counterproductive) -- this meter encourages a stronger password without
// refusing a merely unfashionable one.
function getPasswordStrength(pw) {
  if (!pw) return { level: 0, label: '', color: '' };
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  if (score <= 1) return { level: 1, label: 'Weak', color: 'bg-risk-critical' };
  if (score <= 2) return { level: 2, label: 'Fair', color: 'bg-risk-high' };
  if (score <= 3) return { level: 3, label: 'Good', color: 'bg-risk-medium' };
  return { level: 4, label: 'Strong', color: 'bg-risk-low' };
}

export default function SignupPage() {
  const { signup, isSubmitting, error, clearError } = useAuth();
  const navigate = useNavigate();

  const { register, handleSubmit, watch, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { name: '', company: '', email: '', password: '', confirmPassword: '', terms: false },
  });

  const password = watch('password', '');
  const strength = getPasswordStrength(password);

  useEffect(() => () => clearError(), [clearError]);

  const onSubmit = async (data) => {
    try {
      await signup({
        name: data.name,
        company: data.company,
        email: data.email,
        password: data.password,
        // The server re-checks this; the checkbox alone is a UX affordance,
        // not a control, since the API is reachable directly.
        acceptedTerms: data.terms,
      });
      // A brand-new account has no dataset, so it starts at onboarding. The
      // route guards would send it here regardless; navigating explicitly
      // keeps the transition immediate rather than via a bounce.
      navigate('/onboarding', { replace: true });
    } catch {
      // Message is already in AuthContext's `error` and rendered below.
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
      <h2 className="text-2xl font-bold text-text-primary tracking-tight mb-1.5">Create your account</h2>
      <p className="text-sm text-text-tertiary mb-8">Start your free trial — no credit card required</p>

      {error && (
        <div
          role="alert"
          className="mb-4 p-3 rounded-lg bg-risk-critical/10 border border-risk-critical/20 text-sm text-risk-critical"
        >
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <Input label="Full Name" icon={User} placeholder="Jane Smith" autoComplete="name" error={errors.name?.message} {...register('name')} />
        <Input label="Company Name" icon={Building2} placeholder="Acme Technologies" autoComplete="organization" error={errors.company?.message} {...register('company')} />
        <Input label="Work Email" type="email" icon={Mail} placeholder="jane@acmetech.com" autoComplete="email" error={errors.email?.message} {...register('email')} />

        <div>
          <Input label="Password" type="password" icon={Lock} placeholder="Create a strong password" autoComplete="new-password" error={errors.password?.message} {...register('password')} />
          {password && (
            <div className="mt-2">
              <div className="flex gap-1" aria-hidden="true">
                {[1, 2, 3, 4].map(i => (
                  <div key={i} className={`h-1 flex-1 rounded-full ${i <= strength.level ? strength.color : 'bg-bg-tertiary'}`} />
                ))}
              </div>
              {/* The bars are decorative; this line carries the meaning, and
                  aria-live announces it as the password is typed. */}
              <p aria-live="polite" className={`text-[10px] mt-1 ${strength.level <= 2 ? 'text-risk-high' : 'text-risk-low'}`}>
                Password strength: {strength.label}
              </p>
            </div>
          )}
        </div>

        <Input label="Confirm Password" type="password" icon={Lock} placeholder="Confirm your password" autoComplete="new-password" error={errors.confirmPassword?.message} {...register('confirmPassword')} />

        <div>
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="w-3.5 h-3.5 rounded border-border bg-bg-tertiary text-accent mt-0.5"
              aria-invalid={errors.terms ? true : undefined}
              aria-describedby={errors.terms ? 'terms-error' : undefined}
              {...register('terms')}
            />
            <span className="text-xs text-text-tertiary">
              I agree to the <a href="#" className="text-accent hover:underline">Terms of Service</a> and <a href="#" className="text-accent hover:underline">Privacy Policy</a>
            </span>
          </label>
          {errors.terms && <p id="terms-error" role="alert" className="text-xs text-risk-critical mt-1">{errors.terms.message}</p>}
        </div>

        <Button type="submit" className="w-full" size="lg" loading={isSubmitting}>
          {isSubmitting ? 'Creating account…' : 'Create Account'}
        </Button>
      </form>

      <p className="mt-8 text-center text-sm text-text-tertiary">
        Already have an account? <Link to="/login" className="text-accent hover:text-accent-dim font-medium transition-colors">Sign in</Link>
      </p>
    </motion.div>
  );
}
