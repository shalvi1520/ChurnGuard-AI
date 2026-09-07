import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Lightbulb, Check, X, AlertTriangle, Sparkles, Mail, Brain } from 'lucide-react';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Badge, { RiskBadge } from '../components/ui/Badge';
import Select from '../components/ui/Select';
import EmptyState from '../components/ui/EmptyState';
import { InfoTip } from '../components/ui/Tooltip';
import { recommendationService, customerService } from '../services/api';
import { useApp } from '../context/AppContext';
import { metric } from '../utils/glossary';

const priorityConfig = {
  critical: { color: 'critical', label: 'Critical' },
  high: { color: 'high', label: 'High' },
  medium: { color: 'medium', label: 'Medium' },
  low: { color: 'low', label: 'Low' },
};

const impactConfig = {
  high: { color: 'text-risk-low', label: 'High Impact' },
  medium: { color: 'text-risk-medium', label: 'Medium Impact' },
  low: { color: 'text-text-tertiary', label: 'Low Impact' },
};

export default function RecommendationsPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { addToast } = useApp();
  const [selectedCustomer, setSelectedCustomer] = useState(searchParams.get('customer') || '');
  const [customerOptions, setCustomerOptions] = useState([]);
  const [customer, setCustomer] = useState(null);
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function loadCustomerList() {
      try {
        const data = await customerService.getCustomers({ sortBy: 'churnProbability', sortDir: 'desc', limit: 200 });
        if (cancelled) return;
        setCustomerOptions(data.customers);
        if (!selectedCustomer && data.customers[0]) setSelectedCustomer(data.customers[0].id);
      } catch {
        // Selector stays empty; per-selection loads still show their own error state.
      }
    }
    loadCustomerList();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedCustomer) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const [customerData, data] = await Promise.all([
          customerService.getCustomer(selectedCustomer),
          recommendationService.getRecommendations(selectedCustomer),
        ]);
        if (cancelled) return;
        setCustomer(customerData);
        setRecommendations(data);
        setError(false);
      } catch {
        if (!cancelled) setError(true);
      }
      if (!cancelled) setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [selectedCustomer]);

  const handleAction = async (recId, action) => {
    try {
      await recommendationService.updateStatus(recId, action);
      setRecommendations(prev => prev.map(r => r.id === recId ? { ...r, status: action } : r));
      addToast({
        type: 'success',
        message: action === 'approved' ? 'Added to your actions' : 'Recommendation dismissed',
      });
    } catch (e) { console.error(e); }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <header className="max-w-2xl">
          <h1 className="text-xl font-bold text-text-primary tracking-tight">Recommended actions</h1>
          <p className="text-sm text-text-secondary mt-1 leading-relaxed">
            Suggested next steps for this account, each tied to the risk factors driving its score. Approve the ones
            you'll act on — nothing here reaches the customer by itself.
          </p>
        </header>
        <Select
          label="Account"
          value={selectedCustomer}
          onChange={(e) => setSelectedCustomer(e.target.value)}
          options={customerOptions.map(c => ({ value: c.id, label: c.id }))}
          placeholder=""
          className="md:w-72"
        />
      </div>

      {/* The risk these actions are responding to */}
      {customer && (
        <Card className="flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
          <div className="flex items-center gap-4 flex-wrap">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-text-tertiary">Account</p>
              <p className="text-sm font-semibold text-text-primary mt-0.5">{customer.id}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-text-tertiary inline-flex items-center gap-1">
                Churn risk
                <InfoTip content={metric('churnProbability').help} label="What churn risk means" size={11} />
              </p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-sm font-semibold text-text-primary tabular-nums">{customer.churnProbability}%</span>
                <RiskBadge tier={customer.riskTier} size="xs" />
              </div>
            </div>
          </div>
          <Button variant="ghost" size="sm" icon={Brain} onClick={() => navigate(`/explainability?customer=${selectedCustomer}`)}>
            Why is it at risk?
          </Button>
        </Card>
      )}

      {loading ? (
        <div className="space-y-4">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-40 rounded-xl bg-bg-card border border-border animate-pulse" />)}</div>
      ) : error ? (
        <EmptyState
          icon={AlertTriangle}
          title="We couldn't load recommendations"
          description="The suggestions for this account didn't come back. Try selecting the account again."
        />
      ) : recommendations.length === 0 ? (
        <EmptyState
          icon={Lightbulb}
          title="No actions suggested for this account"
          description="Nothing about this account's current signals calls for intervention. Its risk breakdown is still worth a look."
          actionLabel="See the risk breakdown"
          action={() => navigate(`/explainability?customer=${selectedCustomer}`)}
        />
      ) : (
        <div className="space-y-4">
          {recommendations.map((rec, i) => (
            <motion.div key={rec.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <Card className={rec.status === 'approved' ? 'border-risk-low/30' : rec.status === 'rejected' ? 'border-risk-critical/30 opacity-60' : ''}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center shrink-0 mt-0.5">
                      <Sparkles size={16} className="text-accent" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <h3 className="text-sm font-semibold text-text-primary">{rec.title}</h3>
                        <Badge variant={priorityConfig[rec.priority]?.color} size="xs">{priorityConfig[rec.priority]?.label} Priority</Badge>
                        <span className={`text-xs font-medium ${impactConfig[rec.expectedImpact]?.color}`}>{impactConfig[rec.expectedImpact]?.label}</span>
                      </div>
                      <p className="text-sm text-text-secondary mb-3">{rec.description}</p>
                      <div className="p-3 rounded-lg bg-bg-tertiary/30 border border-border mb-3">
                        <p className="text-xs text-text-tertiary mb-1 font-medium">Why it's being suggested</p>
                        <p className="text-xs text-text-secondary leading-relaxed">{rec.reason}</p>
                      </div>
                      <div className="p-3 rounded-lg bg-accent/5 border border-accent/10">
                        <p className="text-xs text-accent mb-1 font-medium">How to do it</p>
                        <p className="text-xs text-text-secondary leading-relaxed">{rec.suggestedAction}</p>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <div className="text-right">
                      <div className="text-xs text-text-tertiary inline-flex items-center gap-1">
                        {metric('impactScore').label}
                        <InfoTip content={metric('impactScore').help} label="What impact score means" size={11} side="bottom" />
                      </div>
                      <div className="text-lg font-bold text-accent tabular-nums">{rec.impactScore}<span className="text-xs text-text-tertiary font-normal">/100</span></div>
                    </div>
                  </div>
                </div>
                {rec.status === 'pending' && (
                  <div className="flex items-center gap-2 mt-4 pt-4 border-t border-border">
                    <Button size="sm" icon={Check} onClick={() => handleAction(rec.id, 'approved')}>I'll do this</Button>
                    <Button variant="ghost" size="sm" icon={X} onClick={() => handleAction(rec.id, 'rejected')}>Dismiss</Button>
                    <div className="flex-1" />
                    <Button variant="outline" size="sm" icon={Mail} onClick={() => navigate(`/outreach?customer=${selectedCustomer}`)}>Draft an email</Button>
                  </div>
                )}
                {rec.status !== 'pending' && (
                  <div className="mt-4 pt-3 border-t border-border">
                    <Badge variant={rec.status === 'approved' ? 'approved' : 'critical'} size="xs">
                      {rec.status === 'approved' ? 'Accepted — on your list' : 'Dismissed'}
                    </Badge>
                  </div>
                )}
              </Card>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
