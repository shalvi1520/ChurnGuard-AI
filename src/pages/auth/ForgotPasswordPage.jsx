import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Mail, ArrowLeft, CheckCircle } from 'lucide-react';
import { authService } from '../../services/api';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email) return;
    setLoading(true);
    try {
      await authService.forgotPassword(email);
      setSent(true);
    } catch (e) {
      // handled
    }
    setLoading(false);
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
      {sent ? (
        <div className="text-center">
          <div className="w-14 h-14 rounded-2xl bg-risk-low/10 flex items-center justify-center mx-auto mb-4">
            <CheckCircle size={28} className="text-risk-low" />
          </div>
          <h2 className="text-2xl font-bold text-text-primary mb-2">Check your email</h2>
          <p className="text-sm text-text-tertiary mb-6">We've sent a password reset link to <span className="text-text-primary font-medium">{email}</span></p>
          <Link to="/login">
            <Button variant="secondary" size="md" icon={ArrowLeft}>Back to Sign In</Button>
          </Link>
        </div>
      ) : (
        <>
          <h2 className="text-2xl font-bold text-text-primary tracking-tight mb-1.5">Reset your password</h2>
          <p className="text-sm text-text-tertiary mb-8">Enter your email and we'll send you a reset link</p>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Email"
              type="email"
              icon={Mail}
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Button type="submit" className="w-full" size="lg" loading={loading}>Send Reset Link</Button>
          </form>
          <p className="mt-6 text-center">
            <Link to="/login" className="text-sm text-text-tertiary hover:text-text-primary transition-colors inline-flex items-center gap-1">
              <ArrowLeft size={14} /> Back to Sign In
            </Link>
          </p>
        </>
      )}
    </motion.div>
  );
}
