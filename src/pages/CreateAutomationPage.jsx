import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { GitBranch, Filter, Zap, CheckCircle2, ArrowLeft, ArrowRight, Check } from 'lucide-react';
import Card, { CardHeader, CardTitle, CardDescription } from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import { useApp } from '../context/AppContext';
import { playbookService } from '../services/api';
import { triggerOptions, conditionFields, actionOptions } from '../mock/playbooks';

const steps = ['Trigger', 'Conditions', 'Action', 'Activate'];

export default function CreateAutomationPage() {
  const navigate = useNavigate();
  const { addToast } = useApp();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState(null);

  const [name, setName] = useState('');
  const [trigger, setTrigger] = useState('');
  const [conditionField, setConditionField] = useState('');
  const [conditionValue, setConditionValue] = useState('');
  const [action, setAction] = useState('');

  const triggerLabel = triggerOptions.find(t => t.value === trigger)?.label || '';
  const fieldDef = conditionFields.find(f => f.value === conditionField);
  const actionLabel = actionOptions.find(a => a.value === action)?.label || '';

  const canNext = [
    !!trigger,
    !!conditionField && !!conditionValue,
    !!action,
    true,
  ];

  const handleActivate = async () => {
    setSaving(true);
    try {
      const playbook = await playbookService.createPlaybook({
        name: name || `${triggerLabel} → ${actionLabel}`,
        description: `Automatically ${actionLabel.toLowerCase()} when ${fieldDef?.label.toLowerCase()} ${conditionValue}.`,
        trigger: triggerLabel,
        conditions: [{ field: conditionField, operator: 'condition', value: conditionValue }],
        action: actionLabel,
        outcome: 'Track intervention',
      });
      setCreated(playbook);
      addToast({ type: 'success', message: 'Playbook created' });
    } catch (e) {
      addToast({ type: 'error', message: 'Failed to create playbook' });
    }
    setSaving(false);
  };

  if (created) {
    return (
      <div className="max-w-xl mx-auto py-12">
        <Card className="text-center py-12">
          <div className="w-14 h-14 rounded-2xl bg-risk-low/10 flex items-center justify-center mx-auto mb-4">
            <Check size={28} className="text-risk-low" />
          </div>
          <h3 className="text-lg font-semibold text-text-primary mb-1">Playbook ready</h3>
          <p className="text-sm text-text-tertiary mb-6 px-6">
            "{created.name}" is now active and will run automatically when its trigger condition is met.
          </p>
          <div className="flex items-center justify-center gap-3">
            <Button onClick={() => navigate('/playbooks')}>View Playbooks</Button>
            <Button variant="outline" onClick={() => navigate('/dashboard')}>Back to Dashboard</Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <button onClick={() => navigate('/playbooks')} className="inline-flex items-center gap-1.5 text-xs text-text-tertiary hover:text-text-primary transition-colors mb-3 cursor-pointer">
          <ArrowLeft size={14} /> Back to Playbooks
        </button>
        <h1 className="text-xl font-bold text-text-primary tracking-tight">Create Automation</h1>
        <p className="text-sm text-text-tertiary mt-0.5">Build a playbook that triggers a retention action automatically. This is a prototype builder — no code required.</p>
      </div>

      {/* Stepper */}
      <div className="flex items-center gap-0">
        {steps.map((s, i) => (
          <div key={s} className="flex items-center flex-1">
            <div className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${i < step ? 'bg-accent text-bg-primary' : i === step ? 'bg-accent/20 text-accent border border-accent/40' : 'bg-bg-tertiary text-text-tertiary'}`}>
                {i < step ? <Check size={13} /> : i + 1}
              </div>
              <span className={`text-xs font-medium whitespace-nowrap ${i <= step ? 'text-text-primary' : 'text-text-tertiary'}`}>{s}</span>
            </div>
            {i < steps.length - 1 && <div className={`flex-1 h-px mx-3 ${i < step ? 'bg-accent' : 'bg-border'}`} />}
          </div>
        ))}
      </div>

      <motion.div key={step} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
        {step === 0 && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center"><GitBranch size={16} className="text-accent" /></div>
                <div>
                  <CardTitle>When should this playbook run?</CardTitle>
                  <CardDescription>Choose the event that triggers this automation.</CardDescription>
                </div>
              </div>
            </CardHeader>
            <div className="space-y-4">
              <Input label="Playbook Name (optional)" placeholder="e.g. High-Risk Follow-Up" value={name} onChange={(e) => setName(e.target.value)} />
              <Select label="Trigger" value={trigger} onChange={(e) => setTrigger(e.target.value)} options={triggerOptions} placeholder="Select a trigger event" />
            </div>
          </Card>
        )}

        {step === 1 && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-risk-medium/10 flex items-center justify-center"><Filter size={16} className="text-risk-medium" /></div>
                <div>
                  <CardTitle>Under what condition?</CardTitle>
                  <CardDescription>Narrow down exactly when the trigger should fire.</CardDescription>
                </div>
              </div>
            </CardHeader>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Select
                label="Condition Field"
                value={conditionField}
                onChange={(e) => { setConditionField(e.target.value); setConditionValue(''); }}
                options={conditionFields.map(f => ({ value: f.value, label: f.label }))}
                placeholder="Select a field"
              />
              <Select
                label="Value"
                value={conditionValue}
                onChange={(e) => setConditionValue(e.target.value)}
                options={(fieldDef?.options || []).map(o => ({ value: o, label: o }))}
                placeholder="Select a value"
                disabled={!fieldDef}
              />
            </div>
          </Card>
        )}

        {step === 2 && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-risk-low/10 flex items-center justify-center"><Zap size={16} className="text-risk-low" /></div>
                <div>
                  <CardTitle>What should happen?</CardTitle>
                  <CardDescription>Choose the action ChurnGuard should take automatically.</CardDescription>
                </div>
              </div>
            </CardHeader>
            <Select label="Action" value={action} onChange={(e) => setAction(e.target.value)} options={actionOptions} placeholder="Select an action" />
            <p className="text-xs text-text-tertiary mt-3">
              Outreach-related actions always require human review before anything is sent — this playbook only drafts or flags, it never sends automatically.
            </p>
          </Card>
        )}

        {step === 3 && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center"><CheckCircle2 size={16} className="text-accent" /></div>
                <div>
                  <CardTitle>Review & Activate</CardTitle>
                  <CardDescription>Confirm the rule before turning it on.</CardDescription>
                </div>
              </div>
            </CardHeader>
            <div className="flex flex-col gap-3">
              {[
                { icon: GitBranch, label: 'Trigger', value: triggerLabel, color: 'text-accent' },
                { icon: Filter, label: 'Condition', value: `${fieldDef?.label} ${conditionValue}`, color: 'text-risk-medium' },
                { icon: Zap, label: 'Action', value: actionLabel, color: 'text-risk-low' },
              ].map((row, i) => (
                <div key={row.label} className="flex items-center gap-3">
                  <div className="flex items-center gap-2.5 p-3 rounded-lg bg-bg-tertiary/30 border border-border flex-1">
                    <row.icon size={14} className={row.color} />
                    <span className="text-xs text-text-tertiary uppercase tracking-wider font-medium w-20 shrink-0">{row.label}</span>
                    <span className="text-sm text-text-primary font-medium">{row.value}</span>
                  </div>
                  {i < 2 && <ArrowRight size={14} className="text-text-tertiary shrink-0" />}
                </div>
              ))}
            </div>
          </Card>
        )}
      </motion.div>

      <div className="flex items-center justify-between">
        <Button variant="outline" onClick={() => setStep(s => Math.max(0, s - 1))} disabled={step === 0}>Back</Button>
        {step < steps.length - 1 ? (
          <Button iconRight={ArrowRight} onClick={() => setStep(s => s + 1)} disabled={!canNext[step]}>Continue</Button>
        ) : (
          <Button icon={CheckCircle2} loading={saving} onClick={handleActivate}>Activate Playbook</Button>
        )}
      </div>
    </div>
  );
}
