import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users, AlertTriangle, Target, TrendingUp, DollarSign, ChevronRight, Brain, Mail,
} from 'lucide-react';
import {
  PieChart, Pie, Cell, ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, AreaChart, Area, BarChart, Bar, ReferenceLine,
} from 'recharts';
import MetricCard from '../components/ui/MetricCard';
import DataSourceBadge from '../components/data-setup/DataSourceBadge';
import Card, { CardTitle } from '../components/ui/Card';
import ChartCard from '../components/ui/ChartCard';
import { InfoTip } from '../components/ui/Tooltip';
import { RiskBadge } from '../components/ui/Badge';
import Button from '../components/ui/Button';
import EmptyState from '../components/ui/EmptyState';
import { SkeletonCard, SkeletonChart } from '../components/ui/Skeleton';
import { dashboardService, customerService } from '../services/api';
import { formatCurrency, formatNumber } from '../utils/helpers';
import { metric } from '../utils/glossary';

// Five differentiated KPIs. "High Risk Customers" used to sit alongside
// "Customers at Risk" saying almost the same thing — it's now one metric that
// reconciles with the risk-distribution chart below it.
const kpiConfig = [
  { key: 'totalCustomers', format: 'number', icon: Users },
  { key: 'customersAtRisk', format: 'number', icon: AlertTriangle },
  { key: 'avgChurnRisk', format: 'percent', icon: Target },
  { key: 'retentionRate', format: 'percent', icon: TrendingUp },
  { key: 'revenueAtRisk', format: 'currency', icon: DollarSign },
];

const TABLE_COLUMNS = [
  { label: 'Customer' },
  { label: 'Churn Risk', help: metric('churnProbability').help },
  { label: 'Risk Tier', help: metric('riskTier').help },
  { label: 'Revenue at Risk', help: metric('customerRevenueAtRisk').help },
  { label: 'Actions' },
];

function ChartTooltip({ active, payload, label, valueFormatter }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-bg-secondary border border-border rounded-lg p-3 shadow-xl text-xs">
      {label && <p className="text-text-tertiary mb-1.5 font-medium">{label}</p>}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color || p.fill }} />
          <span className="text-text-secondary">{p.name}:</span>
          <span className="text-text-primary font-medium tabular-nums">
            {valueFormatter ? valueFormatter(p.value) : p.value}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [metrics, setMetrics] = useState(null);
  const [riskDistribution, setRiskDistribution] = useState([]);
  const [churnTrend, setChurnTrend] = useState([]);
  const [revenueAtRisk, setRevenueAtRisk] = useState([]);
  const [topDrivers, setTopDrivers] = useState([]);
  const [atRiskCustomers, setAtRiskCustomers] = useState([]);
  const navigate = useNavigate();

  // Retry bumps `reloadKey` from the click handler, which keeps the effect
  // itself free of synchronous state updates (`loading` already starts true).
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [metricsData, risk, trend, revenue, drivers, triage] = await Promise.all([
          dashboardService.getMetrics(),
          dashboardService.getRiskDistribution(),
          dashboardService.getChurnTrend(),
          dashboardService.getRevenueAtRisk(),
          dashboardService.getTopDrivers(),
          customerService.getCustomers({ sortBy: 'churnProbability', sortDir: 'desc', limit: 20 }),
        ]);
        if (cancelled) return;
        setMetrics(metricsData);
        setRiskDistribution(risk);
        setChurnTrend(trend);
        setRevenueAtRisk(revenue);
        setTopDrivers(drivers);
        setAtRiskCustomers(triage.customers.filter((c) => c.riskTier === 'high' || c.riskTier === 'critical').slice(0, 8));
      } catch {
        if (!cancelled) setError(true);
      }
      if (!cancelled) setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [reloadKey]);

  const retry = () => {
    setLoading(true);
    setError(false);
    setReloadKey((k) => k + 1);
  };

  const riskTotal = riskDistribution.reduce((sum, d) => sum + d.value, 0);

  // Show the strongest drivers in BOTH directions. Filtering to positive-only
  // silently emptied this chart whenever the sampled customers skewed toward
  // staying (every mean SHAP value negative) -- the card rendered blank while
  // `isEmpty` was false, so not even the empty state appeared.
  const topDriversShown = topDrivers.slice(0, 6);

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <div className="h-7 w-72 bg-bg-tertiary rounded animate-pulse mb-2" />
          <div className="h-4 w-96 bg-bg-tertiary rounded animate-pulse" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <SkeletonChart />
          <SkeletonChart />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title="We couldn't load your retention overview"
        description="The dashboard data didn't come back. Your dataset is still connected — this is usually temporary."
        actionLabel="Try again"
        action={retry}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="max-w-3xl">
        <h1 className="text-xl font-bold text-text-primary tracking-tight">Retention Overview</h1>
        <p className="text-sm text-text-secondary mt-1 leading-relaxed">
          Where your customer base stands right now, based on the model trained on your connected dataset: how many
          accounts are at risk, what it's worth, and which ones need attention first.
        </p>
        {/* Which data these numbers come from -- reported by the backend, so a
            real upload is never labelled as demo data or vice versa. */}
        {metrics?.dataset && (
          <div className="mt-3">
            <DataSourceBadge source={metrics.dataset.source} filename={metrics.dataset.filename} />
          </div>
        )}
      </header>

      {/* KPIs */}
      {metrics && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
          {kpiConfig
            .filter((kpi) => metrics.kpis[kpi.key] !== undefined)
            .map((kpi, i) => {
              const g = metric(kpi.key);
              return (
                <MetricCard
                  key={kpi.key}
                  title={g.label}
                  description={g.description}
                  help={g.help}
                  value={metrics.kpis[kpi.key].value}
                  change={metrics.kpis[kpi.key].change}
                  trend={metrics.kpis[kpi.key].trend}
                  format={kpi.format}
                  icon={kpi.icon}
                  sparklineData={metrics.sparklines?.[kpi.key]}
                  delay={i * 0.05}
                />
              );
            })}
        </div>
      )}

      {/* Portfolio shape */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard metricKey="riskDistribution" isEmpty={riskDistribution.length === 0}>
          <div className="h-full min-h-[14rem] flex items-center gap-2">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={riskDistribution} cx="50%" cy="50%" innerRadius={58} outerRadius={84} paddingAngle={3} dataKey="value" animationDuration={500}>
                  {riskDistribution.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} stroke="transparent" />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip valueFormatter={(v) => `${formatNumber(v)} customers`} />} />
              </PieChart>
            </ResponsiveContainer>
            <ul className="space-y-2 pr-1 shrink-0">
              {riskDistribution.map((d) => (
                <li key={d.name} className="flex items-center gap-2 whitespace-nowrap">
                  <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: d.color }} />
                  <span className="text-xs text-text-secondary">{d.name}</span>
                  <span className="text-xs text-text-primary font-semibold tabular-nums ml-auto">{formatNumber(d.value)}</span>
                  <span className="text-[10px] text-text-tertiary tabular-nums w-9 text-right">
                    {riskTotal ? `${Math.round((d.value / riskTotal) * 100)}%` : ''}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </ChartCard>

        <ChartCard
          metricKey="churnTrend"
          isEmpty={churnTrend.length === 0}
          emptyMessage="An uploaded dataset is a single snapshot, not a time series — a churn trend needs repeated uploads over time to compute."
        >
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={churnTrend} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2A2F42" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#6B7490' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#6B7490' }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} width={44} />
                <Tooltip content={<ChartTooltip valueFormatter={(v) => `${v}% churn`} />} />
                <Line type="monotone" dataKey="churnRate" name="Actual churn" stroke="#F97316" strokeWidth={2} dot={{ r: 3, fill: '#F97316' }} animationDuration={500} />
                <Line type="monotone" dataKey="predicted" name="Predicted" stroke="#86BC25" strokeWidth={2} strokeDasharray="5 5" dot={false} animationDuration={500} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard
          metricKey="revenueAtRiskTrend"
          isEmpty={revenueAtRisk.length === 0}
          emptyMessage="An uploaded dataset is a single snapshot, not a time series — this needs repeated uploads over time to compute."
        >
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={revenueAtRisk} margin={{ top: 4, right: 8, left: -4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2A2F42" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#6B7490' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#6B7490' }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${(v / 1000000).toFixed(1)}M`} width={48} />
                <Tooltip content={<ChartTooltip valueFormatter={(v) => formatCurrency(v)} />} />
                <Area type="monotone" dataKey="revenue" name="Total revenue" stroke="#86BC25" fill="#86BC25" fillOpacity={0.05} strokeWidth={1.5} animationDuration={500} />
                <Area type="monotone" dataKey="atRisk" name="At risk" stroke="#EF4444" fill="#EF4444" fillOpacity={0.12} strokeWidth={2} animationDuration={500} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard metricKey="topDrivers" isEmpty={topDrivers.length === 0}>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topDriversShown} layout="vertical" margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2A2F42" horizontal={false} />
                <XAxis
                  type="number"
                  tick={{ fontSize: 11, fill: '#6B7490' }}
                  axisLine={false}
                  tickLine={false}
                  /* Keep zero on the axis, otherwise an all-negative set of
                     drivers is drawn as full-width bars and reads as "large
                     positive effect" -- the opposite of what it means. */
                  domain={[(min) => Math.min(0, min), (max) => Math.max(0, max)]}
                />
                <YAxis type="category" dataKey="driver" tick={{ fontSize: 10, fill: '#9BA3B8' }} width={132} axisLine={false} tickLine={false} />
                <ReferenceLine x={0} stroke="#3A4056" />
                <Tooltip content={<ChartTooltip valueFormatter={(v) => `${v > 0 ? '+' : ''}${v.toFixed(2)} effect on risk`} />} />
                <Bar dataKey="impact" name="Effect on churn risk" radius={[0, 4, 4, 0]} barSize={16} animationDuration={500}>
                  {topDriversShown.map((entry) => (
                    <Cell key={entry.driver} fill={entry.direction === 'positive' ? '#F97316' : '#4ADE80'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="text-[11px] text-text-tertiary mt-3">
            Bars to the right (orange) push churn risk up; bars to the left (green) hold it down.
            Averaged over a sample of your customers.
          </p>
        </ChartCard>
      </div>

      {/* Triage table */}
      <Card padding={false}>
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3">
          <div>
            <CardTitle>Accounts needing attention</CardTitle>
            <p className="text-xs text-text-tertiary mt-1">
              The highest-risk accounts right now, most at-risk first. Select one to see the full picture.
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => navigate('/customers?risk=critical')}>
            View all <ChevronRight size={14} />
          </Button>
        </div>

        {atRiskCustomers.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No accounts are at risk"
            description="Nothing in your dataset is above the 60% churn-risk threshold right now."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">Accounts with critical churn risk</caption>
              <thead>
                <tr className="border-b border-border">
                  {TABLE_COLUMNS.map((col) => (
                    <th key={col.label} scope="col" className="px-5 py-2.5 text-left text-xs font-semibold text-text-tertiary uppercase tracking-wider">
                      <span className="inline-flex items-center gap-1">
                        {col.label}
                        {col.help && <InfoTip content={col.help} label={`What ${col.label} means`} size={12} />}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {atRiskCustomers.map((c) => (
                  <tr
                    key={c.id}
                    className="border-b border-border/50 hover:bg-bg-tertiary/30 transition-colors cursor-pointer"
                    onClick={() => navigate(`/customers/${c.id}`)}
                  >
                    <td className="px-5 py-3">
                      <div className="font-medium text-text-primary">{c.id}</div>
                      {c.contractType && <div className="text-xs text-text-tertiary">{c.contractType}</div>}
                    </td>
                    <td className="px-5 py-3">
                      <span className="text-text-primary font-semibold tabular-nums">{c.churnProbability}%</span>
                    </td>
                    <td className="px-5 py-3"><RiskBadge tier={c.riskTier} /></td>
                    <td className="px-5 py-3 text-text-primary tabular-nums">{formatCurrency(c.revenueAtRisk)}</td>
                    <td className="px-5 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => navigate(`/explainability?customer=${c.id}`)}
                          className="p-1.5 rounded-lg hover:bg-bg-tertiary text-text-tertiary hover:text-text-primary transition-colors cursor-pointer"
                          aria-label={`Explain why ${c.id} is at risk`}
                        >
                          <Brain size={14} aria-hidden="true" />
                        </button>
                        <button
                          onClick={() => navigate(`/outreach?customer=${c.id}`)}
                          className="p-1.5 rounded-lg hover:bg-bg-tertiary text-text-tertiary hover:text-text-primary transition-colors cursor-pointer"
                          aria-label={`Draft outreach for ${c.id}`}
                        >
                          <Mail size={14} aria-hidden="true" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
