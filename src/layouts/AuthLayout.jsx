import { Shield } from 'lucide-react';
import { Outlet, Link } from 'react-router-dom';

export default function AuthLayout() {
  return (
    <div className="min-h-screen bg-bg-primary flex">
      {/* Left panel – branding */}
      <div className="hidden lg:flex lg:w-1/2 xl:w-[55%] bg-bg-secondary border-r border-border relative overflow-hidden flex-col justify-between p-10">
        <div>
          <Link to="/" className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg gradient-accent flex items-center justify-center">
              <Shield size={18} className="text-bg-primary" />
            </div>
            <div>
              <div className="text-sm font-bold tracking-wider text-text-primary">CHURNGUARD</div>
              <div className="text-[10px] text-text-tertiary tracking-wider">AI-POWERED RETENTION INTELLIGENCE</div>
            </div>
          </Link>
        </div>

        <div className="max-w-lg">
          <h1 className="text-4xl font-bold text-text-primary tracking-tight leading-tight mb-4">
            Turn Churn Risk into{' '}
            <span className="text-gradient">Retention Action</span>
          </h1>
          <p className="text-text-secondary text-base leading-relaxed mb-8">
            Predict customer churn, understand why customers are at risk, and take personalized action to retain your most valuable accounts.
          </p>
          <div className="flex items-center gap-6">
            {['PREDICT', 'EXPLAIN', 'ACT'].map((step, i) => (
              <div key={step} className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center text-accent text-xs font-bold">
                  {i + 1}
                </div>
                <span className="text-sm font-semibold text-text-primary tracking-wide">{step}</span>
                {i < 2 && <div className="w-6 h-px bg-border ml-2" />}
              </div>
            ))}
          </div>
        </div>

        <p className="text-xs text-text-tertiary">
          © 2026 ChurnGuard. Deloitte Capstone Project.
        </p>

        {/* Decorative elements */}
        <div className="absolute -top-40 -right-40 w-80 h-80 rounded-full bg-accent/5 blur-3xl" />
        <div className="absolute -bottom-20 -left-20 w-60 h-60 rounded-full bg-accent/3 blur-3xl" />
      </div>

      {/* Right panel – auth form */}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-10">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-3 mb-10">
            <div className="w-9 h-9 rounded-lg gradient-accent flex items-center justify-center">
              <Shield size={18} className="text-bg-primary" />
            </div>
            <div>
              <div className="text-sm font-bold tracking-wider text-text-primary">CHURNGUARD</div>
              <div className="text-[10px] text-text-tertiary tracking-wider">RETENTION INTELLIGENCE</div>
            </div>
          </div>
          <Outlet />
        </div>
      </div>
    </div>
  );
}
