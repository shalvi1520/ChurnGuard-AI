import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion } from 'framer-motion';
import { User, Building2, Mail, Lock } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import { useState } from 'react';

const schema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  company: z.string().min(2, 'Company name is required'),
  email: z.string().email('Please enter a valid work email'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string(),
  terms: z.boolean().refine(v => v, 'You must accept the terms'),
}).refine(data => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
});

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
  const { signup, isLoading } = useAuth();
  const navigate = useNavigate();
  const [terms, setTerms] = useState(false);

  const { register, handleSubmit, watch, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
  });

  const password = watch('password', '');
  const strength = getPasswordStrength(password);

  const onSubmit = async (data) => {
    try {
      await signup(data);
      navigate('/onboarding');
    } catch (e) {
      // handled
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
      <h2 className="text-2xl font-bold text-text-primary tracking-tight mb-1.5">Create your account</h2>
      <p className="text-sm text-text-tertiary mb-8">Start your free trial — no credit card required</p>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Input label="Full Name" icon={User} placeholder="Jane Smith" error={errors.name?.message} {...register('name')} />
        <Input label="Company Name" icon={Building2} placeholder="Acme Technologies" error={errors.company?.message} {...register('company')} />
        <Input label="Work Email" type="email" icon={Mail} placeholder="jane@acmetech.com" error={errors.email?.message} {...register('email')} />

        <div>
          <Input label="Password" type="password" icon={Lock} placeholder="Create a strong password" error={errors.password?.message} {...register('password')} />
          {password && (
            <div className="mt-2">
              <div className="flex gap-1">
                {[1, 2, 3, 4].map(i => (
                  <div key={i} className={`h-1 flex-1 rounded-full ${i <= strength.level ? strength.color : 'bg-bg-tertiary'}`} />
                ))}
              </div>
              <p className={`text-[10px] mt-1 ${strength.level <= 2 ? 'text-risk-high' : 'text-risk-low'}`}>{strength.label}</p>
            </div>
          )}
        </div>

        <Input label="Confirm Password" type="password" icon={Lock} placeholder="Confirm your password" error={errors.confirmPassword?.message} {...register('confirmPassword')} />

        <label className="flex items-start gap-2 cursor-pointer">
          <input type="checkbox" className="w-3.5 h-3.5 rounded border-border bg-bg-tertiary text-accent mt-0.5" {...register('terms')} />
          <span className="text-xs text-text-tertiary">
            I agree to the <a href="#" className="text-accent hover:underline">Terms of Service</a> and <a href="#" className="text-accent hover:underline">Privacy Policy</a>
          </span>
        </label>
        {errors.terms && <p className="text-xs text-risk-critical">{errors.terms.message}</p>}

        <Button type="submit" className="w-full" size="lg" loading={isLoading}>Create Account</Button>
      </form>

      <p className="mt-8 text-center text-sm text-text-tertiary">
        Already have an account? <Link to="/login" className="text-accent hover:text-accent-dim font-medium transition-colors">Sign in</Link>
      </p>
    </motion.div>
  );
}
