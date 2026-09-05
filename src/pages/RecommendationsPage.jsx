import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Lightbulb, Check, X, Edit, ArrowRight, AlertTriangle, Sparkles, Mail } from 'lucide-react';
import Card, { CardHeader, CardTitle, CardDescription } from '../components/ui/Card';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import Select from '../components/ui/Select';
import EmptyState from '../components/ui/EmptyState';
import { recommendationService } from '../services/api';
import { mockCustomers } from '../mock/customers';
import { useApp } from '../context/AppContext';

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
  const [selectedCustomer, setSelectedCustomer] = useState(searchParams.get('customer') || 'CUST-1001');
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, [selectedCustomer]);

  const load = async () => {
    setLoading(true);
    try {
      const data = await recommendationService.getRecommendations(selectedCustomer);
      setRecommendations(data);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const handleAction = async (recId, action) => {
    try {
      await recommendationService.updateStatus(recId, action);
      setRecommendations(prev => prev.map(r => r.id === recId ? { ...r, status: action } : r));
      addToast({ type: 'success', message: `Recommendation ${action}` });
    } catch (e) { console.error(e); }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-text-primary tracking-tight">AI Retention Recommendations</h1>
          <p className="text-sm text-text-tertiary mt-0.5">AI-generated actions to reduce churn risk and improve customer retention.</p>
        </div>
        <Select
          value={selectedCustomer}
          onChange={(e) => setSelectedCustomer(e.target.value)}
          options={mockCustomers.map(c => ({ value: c.id, label: `${c.name} (${c.id})` }))}
          placeholder=""
        />
      </div>

      {loading ? (
        <div className="space-y-4">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-40 rounded-xl bg-bg-card border border-border animate-pulse" />)}</div>
      ) : recommendations.length === 0 ? (
        <EmptyState icon={Lightbulb} title="No recommendations yet" description="Generate AI recommendations by analyzing a customer's risk profile." actionLabel="Analyze Customer" action={() => navigate(`/explainability?customer=${selectedCustomer}`)} />
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
                      <p className="text-sm text-text-secondary mb-2">{rec.description}</p>
                      <div className="p-3 rounded-lg bg-bg-tertiary/30 border border-border mb-3">
                        <p className="text-xs text-text-tertiary mb-1 font-medium">Why this matters:</p>
                        <p className="text-xs text-text-secondary">{rec.reason}</p>
                      </div>
                      <div className="p-3 rounded-lg bg-accent/5 border border-accent/10">
                        <p className="text-xs text-accent mb-1 font-medium">Suggested Action:</p>
                        <p className="text-xs text-text-secondary">{rec.suggestedAction}</p>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <div className="text-right">
                      <div className="text-xs text-text-tertiary">Impact Score</div>
                      <div className="text-lg font-bold text-accent tabular-nums">{rec.impactScore}</div>
                    </div>
                  </div>
                </div>
                {rec.status === 'pending' && (
                  <div className="flex items-center gap-2 mt-4 pt-4 border-t border-border">
                    <Button size="sm" icon={Check} onClick={() => handleAction(rec.id, 'approved')}>Approve</Button>
                    <Button variant="secondary" size="sm" icon={Edit} onClick={() => {}}>Edit</Button>
                    <Button variant="ghost" size="sm" icon={X} onClick={() => handleAction(rec.id, 'rejected')}>Reject</Button>
                    <div className="flex-1" />
                    <Button variant="outline" size="sm" icon={Mail} onClick={() => navigate(`/outreach?customer=${selectedCustomer}`)}>Draft Email</Button>
                  </div>
                )}
                {rec.status !== 'pending' && (
                  <div className="mt-4 pt-3 border-t border-border">
                    <Badge variant={rec.status === 'approved' ? 'approved' : 'critical'} size="xs">
                      {rec.status === 'approved' ? '✓ Approved' : '✗ Rejected'}
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
