import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowLeft, Building2, Calendar, Mail, Phone, User, TrendingDown, TrendingUp,
  AlertTriangle, CheckCircle, Clock, MessageSquare, FileText, Activity,
  Brain, Lightbulb, Send, Edit, UserPlus, MoreHorizontal
} from 'lucide-react';
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import Card, { CardHeader, CardTitle, CardDescription } from '../components/ui/Card';
import Button from '../components/ui/Button';
import Badge, { RiskBadge, StatusBadge } from '../components/ui/Badge';
import Avatar from '../components/ui/Avatar';
import { SkeletonCard } from '../components/ui/Skeleton';
import { customerService } from '../services/api';
import { formatCurrency, formatDate, formatRelativeDate, getRiskColor, formatPercent } from '../utils/helpers';

const timelineIcons = {
  risk: AlertTriangle,
  support: MessageSquare,
  usage: Activity,
  login: User,
  contact: Phone,
  plan: FileText,
};

export default function CustomerDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [customer, setCustomer] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const data = await customerService.getCustomer(id);
        setCustomer(data);
      } catch (e) {
        console.error(e);
      }
      setLoading(false);
    }
    load();
  }, [id]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-6 w-24 bg-bg-tertiary rounded animate-pulse" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">{Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}</div>
          <SkeletonCard />
        </div>
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="text-center py-20">
        <p className="text-text-tertiary">Customer not found.</p>
        <Button variant="ghost" onClick={() => navigate('/customers')} className="mt-4">Back to Customers</Button>
      </div>
    );
  }

  const riskColor = getRiskColor(customer.riskTier);

  return (
    <div className="space-y-6">
      {/* Back + Header */}
      <button onClick={() => navigate('/customers')} className="flex items-center gap-1.5 text-sm text-text-tertiary hover:text-text-primary transition-colors cursor-pointer">
        <ArrowLeft size={16} /> Back to Customers
      </button>

      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div className="flex items-start gap-4">
          <Avatar name={customer.name} size="xl" />
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-xl font-bold text-text-primary">{customer.name}</h1>
              <RiskBadge tier={customer.riskTier} />
              <StatusBadge status={customer.status} />
            </div>
            <div className="flex items-center gap-4 mt-1.5 text-sm text-text-tertiary flex-wrap">
              <span className="flex items-center gap-1"><Building2 size={13} /> {customer.company}</span>
              <span>{customer.id}</span>
              <span>{customer.plan} Plan</span>
              <span className="flex items-center gap-1"><User size={13} /> {customer.owner}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="secondary" size="sm" icon={Brain} onClick={() => navigate(`/explainability?customer=${customer.id}`)}>Analyze</Button>
          <Button variant="secondary" size="sm" icon={Lightbulb} onClick={() => navigate(`/recommendations?customer=${customer.id}`)}>Recommend</Button>
          <Button size="sm" icon={Mail} onClick={() => navigate(`/outreach?customer=${customer.id}`)}>Draft Email</Button>
        </div>
      </div>

      {/* Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Main Info */}
        <div className="lg:col-span-2 space-y-6">
          {/* Risk Score */}
          <Card>
            <CardHeader><CardTitle>Churn Risk Assessment</CardTitle></CardHeader>
            <div className="flex flex-col md:flex-row items-center gap-8">
              {/* Radial gauge */}
              <div className="relative w-40 h-40 shrink-0">
                <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
                  <circle cx="60" cy="60" r="50" fill="none" stroke="#2A2F42" strokeWidth="8" />
                  <circle
                    cx="60" cy="60" r="50" fill="none"
                    stroke={riskColor}
                    strokeWidth="8"
                    strokeDasharray={`${customer.churnProbability * 3.14} ${314 - customer.churnProbability * 3.14}`}
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-3xl font-bold text-text-primary tabular-nums">{customer.churnProbability}%</span>
                  <span className="text-xs font-medium" style={{ color: riskColor }}>
                    {customer.riskTier === 'critical' ? 'Critical Risk' : customer.riskTier === 'high' ? 'High Risk' : customer.riskTier === 'medium' ? 'Medium Risk' : 'Low Risk'}
                  </span>
                </div>
              </div>

              {/* Health scores */}
              <div className="flex-1 grid grid-cols-2 gap-4 w-full">
                {[
                  { label: 'Engagement Score', value: customer.engagement, max: 100 },
                  { label: 'Usage Score', value: customer.usage, max: 100 },
                  { label: 'Health Score', value: customer.healthScore, max: 100 },
                  { label: 'NPS Score', value: customer.nps, max: 10 },
                ].map(score => (
                  <div key={score.label}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-text-tertiary">{score.label}</span>
                      <span className="text-xs font-semibold text-text-primary tabular-nums">{score.value}/{score.max}</span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-bg-tertiary">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${(score.value / score.max) * 100}%`,
                          backgroundColor: (score.value / score.max) > 0.6 ? '#4ADE80' : (score.value / score.max) > 0.35 ? '#FBBF24' : '#F97316'
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Card>

          {/* Risk Trend */}
          <Card>
            <CardHeader><CardTitle>Risk Trend</CardTitle></CardHeader>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={customer.riskHistory}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2A2F42" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#6B7490' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#6B7490' }} axisLine={false} tickLine={false} domain={[0, 100]} tickFormatter={v => `${v}%`} />
                  <Tooltip content={({ active, payload, label }) => active && payload?.[0] ? (
                    <div className="bg-bg-secondary border border-border rounded-lg p-2.5 shadow-xl text-xs">
                      <p className="text-text-tertiary">{label}</p>
                      <p className="text-text-primary font-semibold">{payload[0].value}%</p>
                    </div>
                  ) : null} />
                  <Line type="monotone" dataKey="risk" stroke={riskColor} strokeWidth={2.5} dot={{ r: 4, fill: riskColor }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* Account Info */}
          <Card>
            <CardHeader><CardTitle>Account Information</CardTitle></CardHeader>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'MRR', value: formatCurrency(customer.mrr) },
                { label: 'ARR', value: formatCurrency(customer.arr) },
                { label: 'Tenure', value: `${customer.tenure} months` },
                { label: 'Contract', value: customer.contractType },
                { label: 'Contact', value: customer.contactName },
                { label: 'Role', value: customer.contactRole },
                { label: 'Industry', value: customer.industry },
                { label: 'Region', value: customer.region },
                { label: 'Join Date', value: formatDate(customer.joinDate) },
                { label: 'Last Contacted', value: formatDate(customer.lastContacted) },
                { label: 'Support Tickets', value: `${customer.supportTickets} (${customer.openTickets} open)` },
                { label: 'Login Freq.', value: `${customer.loginFrequency}/week` },
              ].map(item => (
                <div key={item.label}>
                  <span className="text-[10px] text-text-tertiary uppercase tracking-wider font-medium">{item.label}</span>
                  <p className="text-sm text-text-primary font-medium mt-0.5">{item.value}</p>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Right: Timeline + Actions */}
        <div className="space-y-6">
          {/* Action Center */}
          <Card>
            <CardHeader><CardTitle>Action Center</CardTitle></CardHeader>
            <div className="space-y-2">
              {[
                { icon: Brain, label: 'Analyze Risk', color: 'text-accent', action: () => navigate(`/explainability?customer=${customer.id}`) },
                { icon: Lightbulb, label: 'Get Recommendations', color: 'text-risk-medium', action: () => navigate(`/recommendations?customer=${customer.id}`) },
                { icon: Mail, label: 'Draft Outreach Email', color: 'text-blue-400', action: () => navigate(`/outreach?customer=${customer.id}`) },
                { icon: MessageSquare, label: 'Ask AI Assistant', color: 'text-purple-400', action: () => navigate('/ai-assistant') },
                { icon: Edit, label: 'Add Note', color: 'text-text-secondary', action: () => {} },
                { icon: UserPlus, label: 'Assign Owner', color: 'text-text-secondary', action: () => {} },
              ].map(act => (
                <button
                  key={act.label}
                  onClick={act.action}
                  className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm text-text-secondary hover:text-text-primary hover:bg-bg-tertiary transition-colors cursor-pointer"
                >
                  <act.icon size={16} className={act.color} />
                  {act.label}
                </button>
              ))}
            </div>
          </Card>

          {/* Timeline */}
          <Card>
            <CardHeader><CardTitle>Activity Timeline</CardTitle></CardHeader>
            <div className="space-y-0">
              {(customer.timeline || []).map((event, i) => {
                const Icon = timelineIcons[event.type] || Activity;
                return (
                  <div key={event.id || i} className="flex gap-3 pb-4 last:pb-0">
                    <div className="flex flex-col items-center">
                      <div className="w-7 h-7 rounded-lg bg-bg-tertiary flex items-center justify-center shrink-0">
                        <Icon size={13} className={event.type === 'risk' ? 'text-risk-high' : event.type === 'support' ? 'text-risk-medium' : 'text-text-tertiary'} />
                      </div>
                      {i < (customer.timeline || []).length - 1 && <div className="w-px flex-1 bg-border mt-1" />}
                    </div>
                    <div className="pb-2">
                      <p className="text-xs font-medium text-text-primary">{event.title}</p>
                      <p className="text-[11px] text-text-tertiary mt-0.5">{event.description}</p>
                      <p className="text-[10px] text-text-tertiary mt-1">{formatRelativeDate(event.date)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
