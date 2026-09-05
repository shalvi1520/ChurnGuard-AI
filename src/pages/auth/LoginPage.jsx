import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion } from 'framer-motion';
import { Mail, Lock } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';

const schema = z.object({
  email: z.string().email('Please enter a valid email'),
  password: z.string().min(1, 'Password is required'),
});

export default function LoginPage() {
  const { login, isLoading, error } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [remember, setRemember] = useState(false);
  const autoDemoTriggered = useRef(false);

  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { email: 'demo@churnguard.ai', password: 'demo2026' },
  });

  const onSubmit = async (data) => {
    try {
      await login(data.email, data.password);
      navigate('/dashboard');
    } catch (e) {
      // error handled in context
    }
  };

  // "Explore Demo" on the landing page links here with ?demo=true so judges
  // can enter the product in one click, no typing required.
  useEffect(() => {
    if (searchParams.get('demo') === 'true' && !autoDemoTriggered.current) {
      autoDemoTriggered.current = true;
      handleSubmit(onSubmit)();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <h2 className="text-2xl font-bold text-text-primary tracking-tight mb-1.5">Welcome back</h2>
      <p className="text-sm text-text-tertiary mb-8">Sign in to your ChurnGuard account</p>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-risk-critical/10 border border-risk-critical/20 text-sm text-risk-critical">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Input
          label="Email"
          type="email"
          icon={Mail}
          placeholder="you@company.com"
          error={errors.email?.message}
          {...register('email')}
        />

        <Input
          label="Password"
          type="password"
          icon={Lock}
          placeholder="Enter your password"
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

        <Button type="submit" className="w-full" size="lg" loading={isLoading}>
          Sign In
        </Button>
      </form>

      <div className="mt-6">
        <div className="relative">
          <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border" /></div>
          <div className="relative flex justify-center"><span className="bg-bg-primary lg:bg-transparent px-3 text-xs text-text-tertiary">or continue with</span></div>
        </div>
        <div className="grid grid-cols-2 gap-3 mt-4">
          <Button variant="outline" size="md" onClick={() => handleSubmit(onSubmit)()}>
            <svg className="w-4 h-4" viewBox="0 0 24 24"><path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
            Google
          </Button>
          <Button variant="outline" size="md" onClick={() => handleSubmit(onSubmit)()}>
            <svg className="w-4 h-4" viewBox="0 0 24 24"><path fill="currentColor" d="M11.4 24H0V12.6L4.8 7.8H11.4V0H24V11.4L19.2 16.2H12.6V24H11.4ZM4.8 12.6V20.4H11.4V16.2H16.2V11.4H7.8V7.8H11.4V3.6H15.6V0"/></svg>
            Microsoft
          </Button>
        </div>
      </div>

      <p className="mt-8 text-center text-sm text-text-tertiary">
        Don't have an account?{' '}
        <Link to="/signup" className="text-accent hover:text-accent-dim font-medium transition-colors">Sign up</Link>
      </p>

      <div className="mt-6 p-3 rounded-lg bg-bg-tertiary/50 border border-border">
        <p className="text-[10px] text-text-tertiary text-center">
          <span className="font-medium text-text-secondary">Demo credentials:</span> demo@churnguard.ai / demo2026
        </p>
      </div>
    </motion.div>
  );
}
