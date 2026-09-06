import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users, AlertTriangle, Target, TrendingUp, DollarSign, ChevronRight, Brain, Mail,
} from 'lucide-react';
import {
  PieChart, Pie, Cell, ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, AreaChart, Area, BarChart, Bar,
} from 'recharts';
import MetricCard from '../components/ui/MetricCard';
import Card, { CardTitle } from '../components/ui/Card';
import ChartCard from '../components/ui/ChartCard';
import { InfoTip } from '../components/ui/Tooltip';
import { RiskBadge } from '../components/ui/Badge';
import Button from '../components/ui/Button';
import EmptyState from '../components/ui/EmptyState';
import { SkeletonCard, SkeletonChart } from '../components/ui/Skeleton';
import { dashboardService } from '../services/api';
import { formatCurrency, formatNumber, formatRelativeDate, getPrimaryRiskDriver } from '../utils/helpers';
import { metric } from '../utils/glossary';
import { mockCustomers } from '../mock/customers';

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
  { label: 'Weakest Signal', help: "The lowest-scoring signal in this account's own data. Open Explainability for the full factor breakdown." },
  { label: 'Revenue at Risk', help: metric('customerRevenueAtRisk').help },
  { label: 'Last Active', help: metric('lastActive').help },
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
  const navigate = useNavigate();

  // Retry bumps `reloadKey` from the click handler, which keeps the effect
  // itself free of synchronous state updates (`loading` already starts true).
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [metricsData, risk, trend, revenue, drivers] = await Promise.all([
          dashboardService.getMetrics(),
          dashboardService.getRiskDistribution(),
          dashboardService.getChurnTrend(),
          dashboardService.getRevenueAtRisk(),
          dashboardService.getTopDrivers(),
        ]);
        if (cancelled) return;
        setMetrics(metricsData);
        setRiskDistribution(risk);
        setChurnTrend(trend);
        setRevenueAtRisk(revenue);
        setTopDrivers(drivers);
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

  const atRiskCustomers = mockCustomers
    .filter((c) => c.riskTier === 'critical' || c.riskTier === 'high')
    .sort((a, b) => b.churnProbability - a.churnProbability)
    .slice(0, 8);

  const riskTotal = riskDistribution.reduce((sum, d) => sum + d.value, 0);
  const trendPeriod = churnTrend.length
    ? `${churnTrend[0].month}–${churnTrend[churnTrend.length - 1].month}`
    : '';

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
          Where your customer base stands right now: how many accounts are at risk, what it's worth, and which ones
          need attention first. Figures cover the most recent month{trendPeriod && ` of an ${churnTrend.length}-month window (${trendPeriod})`}.
        </p>
      </header>

      {/* KPIs */}
      {metrics && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
          {kpiConfig.map((kpi, i) => {
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
                sparklineData={metrics.sparklines[kpi.key]}
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

        <ChartCard metricKey="churnTrend" isEmpty={churnTrend.length === 0}>
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
          <div className="flex items-center gap-4 mt-3 text-[11px] text-text-tertiary">
            <span className="flex items-center gap-1.5"><span className="w-4 h-0.5 rounded bg-risk-high" />Actual churn rate</span>
            <span className="flex items-center gap-1.5"><span className="w-4 border-t-2 border-dashed border-accent" />Predicted</span>
          </div>
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard metricKey="revenueAtRiskTrend" isEmpty={revenueAtRisk.length === 0}>
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
          <div className="flex items-center gap-4 mt-3 text-[11px] text-text-tertiary">
            <span className="flex items-center gap-1.5"><span className="w-4 h-0.5 rounded bg-accent" />Total revenue</span>
            <span className="flex items-center gap-1.5"><span className="w-4 h-0.5 rounded bg-risk-critical" />At risk</span>
          </div>
        </ChartCard>

        <ChartCard metricKey="topDrivers" isEmpty={topDrivers.length === 0}>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={topDrivers.filter((d) => d.direction === 'positive').slice(0, 6)}
                layout="vertical"
                margin={{ top: 4, right: 12, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#2A2F42" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: '#6B7490' }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="driver" tick={{ fontSize: 10, fill: '#9BA3B8' }} width={132} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTooltip valueFormatter={(v) => `${v.toFixed(2)} effect on risk`} />} />
                <Bar dataKey="impact" name="Effect on churn risk" fill="#F97316" radius={[0, 4, 4, 0]} barSize={16} animationDuration={500} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="text-[11px] text-text-tertiary mt-3">
            Longer bar = stronger push toward churn across the base.
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
              <caption className="sr-only">Accounts with high or critical churn risk</caption>
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
                {atRiskCustomers.map((c) => {
                  const driver = getPrimaryRiskDriver(c);
                  return (
                    <tr
                      key={c.id}
                      className="border-b border-border/50 hover:bg-bg-tertiary/30 transition-colors cursor-pointer"
                      onClick={() => navigate(`/customers/${c.id}`)}
                    >
                      <td className="px-5 py-3">
                        <div className="font-medium text-text-primary">{c.name}</div>
                        <div className="text-xs text-text-tertiary">{c.id} · {c.plan}</div>
                      </td>
                      <td className="px-5 py-3">
                        <span className="text-text-primary font-semibold tabular-nums">{c.churnProbability}%</span>
                      </td>
                      <td className="px-5 py-3"><RiskBadge tier={c.riskTier} /></td>
                      <td className="px-5 py-3 text-xs">
                        {driver ? (
                          <>
                            <span className="text-text-secondary">{driver.label}</span>
                            <span className="text-text-tertiary ml-1.5 tabular-nums">{driver.display}</span>
                          </>
                        ) : (
                          <span className="text-text-tertiary">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-text-primary tabular-nums">{formatCurrency(c.revenueAtRisk)}</td>
                      <td className="px-5 py-3 text-text-tertiary text-xs">{formatRelativeDate(c.lastActive)}</td>
                      <td className="px-5 py-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => navigate(`/explainability?customer=${c.id}`)}
                            className="p-1.5 rounded-lg hover:bg-bg-tertiary text-text-tertiary hover:text-text-primary transition-colors cursor-pointer"
                            aria-label={`Explain why ${c.name} is at risk`}
                          >
                            <Brain size={14} aria-hidden="true" />
                          </button>
                          <button
                            onClick={() => navigate(`/outreach?customer=${c.id}`)}
                            className="p-1.5 rounded-lg hover:bg-bg-tertiary text-text-tertiary hover:text-text-primary transition-colors cursor-pointer"
                            aria-label={`Draft outreach for ${c.name}`}
                          >
                            <Mail size={14} aria-hidden="true" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
