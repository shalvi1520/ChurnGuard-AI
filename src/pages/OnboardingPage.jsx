import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Building2, Users, Target, Database, ArrowRight, Check, Shield } from 'lucide-react';
import Card, { CardHeader, CardTitle, CardDescription } from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import { useAuth } from '../context/AuthContext';

const steps = [
  { key: 'company', label: 'Company Setup', icon: Building2 },
  { key: 'customers', label: 'Customer Information', icon: Users },
  { key: 'goals', label: 'Retention Goals', icon: Target },
  { key: 'data', label: 'Connect Data', icon: Database },
];

export default function OnboardingPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    industry: '',
    teamSize: '',
    customerCount: '',
    avgContractValue: '',
    primaryGoal: '',
    targetChurnReduction: '',
  });

  const update = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const finish = () => navigate('/data-management');
  const skip = () => navigate('/dashboard');

  return (
    <div className="min-h-screen bg-bg-primary flex flex-col">
      <div className="h-16 flex items-center justify-between px-6 border-b border-border">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg gradient-accent flex items-center justify-center">
            <Shield size={14} className="text-bg-primary" />
          </div>
          <span className="text-xs font-bold tracking-wider text-text-primary">CHURNGUARD</span>
        </div>
        <button onClick={skip} className="text-xs text-text-tertiary hover:text-text-primary transition-colors cursor-pointer">
          Skip setup
        </button>
      </div>

      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-xl">
          {/* Progress */}
          <div className="flex items-center gap-2 mb-10">
            {steps.map((s, i) => (
              <div key={s.key} className="flex items-center flex-1">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 border ${i < step ? 'bg-accent border-accent text-bg-primary' : i === step ? 'border-accent text-accent bg-accent/10' : 'border-border text-text-tertiary'}`}>
                  {i < step ? <Check size={14} /> : <s.icon size={14} />}
                </div>
                {i < steps.length - 1 && <div className={`flex-1 h-px mx-1.5 ${i < step ? 'bg-accent' : 'bg-border'}`} />}
              </div>
            ))}
          </div>

          <motion.div key={step} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
            {step === 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Tell us about your company</CardTitle>
                  <CardDescription>Welcome{user?.name ? `, ${user.name.split(' ')[0]}` : ''} — a few quick details help us tailor ChurnGuard to your business.</CardDescription>
                </CardHeader>
                <div className="space-y-4">
                  <Select
                    label="Industry"
                    value={form.industry}
                    onChange={(e) => update('industry', e.target.value)}
                    options={[
                      { value: 'saas', label: 'SaaS / Software' },
                      { value: 'ecommerce', label: 'E-Commerce' },
                      { value: 'fintech', label: 'Fintech' },
                      { value: 'healthcare', label: 'Healthcare' },
                      { value: 'other', label: 'Other' },
                    ]}
                    placeholder="Select your industry"
                  />
                  <Select
                    label="Customer Success Team Size"
                    value={form.teamSize}
                    onChange={(e) => update('teamSize', e.target.value)}
                    options={[
                      { value: '1-5', label: '1–5 people' },
                      { value: '6-20', label: '6–20 people' },
                      { value: '21-50', label: '21–50 people' },
                      { value: '50+', label: '50+ people' },
                    ]}
                    placeholder="Select team size"
                  />
                </div>
              </Card>
            )}

            {step === 1 && (
              <Card>
                <CardHeader>
                  <CardTitle>Customer information</CardTitle>
                  <CardDescription>This helps us calibrate realistic dashboards and benchmarks for your account.</CardDescription>
                </CardHeader>
                <div className="space-y-4">
                  <Input label="Approximate active customer count" placeholder="e.g. 2,500" value={form.customerCount} onChange={(e) => update('customerCount', e.target.value)} />
                  <Input label="Average contract value (monthly)" placeholder="e.g. $1,200" value={form.avgContractValue} onChange={(e) => update('avgContractValue', e.target.value)} />
                </div>
              </Card>
            )}

            {step === 2 && (
              <Card>
                <CardHeader>
                  <CardTitle>Retention goals</CardTitle>
                  <CardDescription>What does success look like for your team?</CardDescription>
                </CardHeader>
                <div className="space-y-4">
                  <Select
                    label="Primary goal"
                    value={form.primaryGoal}
                    onChange={(e) => update('primaryGoal', e.target.value)}
                    options={[
                      { value: 'reduce_churn', label: 'Reduce overall churn rate' },
                      { value: 'protect_revenue', label: 'Protect revenue from high-value accounts' },
                      { value: 'improve_visibility', label: 'Improve visibility into at-risk accounts' },
                      { value: 'scale_cs', label: 'Scale Customer Success without adding headcount' },
                    ]}
                    placeholder="Select your primary goal"
                  />
                  <Select
                    label="Target churn reduction"
                    value={form.targetChurnReduction}
                    onChange={(e) => update('targetChurnReduction', e.target.value)}
                    options={[
                      { value: '5', label: '5%' },
                      { value: '10', label: '10%' },
                      { value: '15', label: '15%' },
                      { value: '20+', label: '20%+' },
                    ]}
                    placeholder="Select a target"
                  />
                </div>
              </Card>
            )}

            {step === 3 && (
              <Card>
                <CardHeader>
                  <CardTitle>Connect your data</CardTitle>
                  <CardDescription>Upload a customer dataset now, or explore ChurnGuard with our demo dataset first — you can always connect real data later.</CardDescription>
                </CardHeader>
                <div className="p-4 rounded-lg bg-bg-tertiary/30 border border-border text-sm text-text-secondary">
                  You're all set. Head to Data Management to upload a CSV/Excel file or load the demo dataset to see ChurnGuard's full workflow in action.
                </div>
              </Card>
            )}
          </motion.div>

          <div className="flex items-center justify-between mt-6">
            <Button variant="outline" onClick={() => setStep(s => Math.max(0, s - 1))} disabled={step === 0}>Back</Button>
            {step < steps.length - 1 ? (
              <Button iconRight={ArrowRight} onClick={() => setStep(s => s + 1)}>Continue</Button>
            ) : (
              <Button icon={Database} onClick={finish}>Go to Data Management</Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
