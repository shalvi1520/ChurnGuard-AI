import { useState, useEffect, useMemo } from 'react';
import { Users, AlertTriangle, DollarSign, TrendingUp, Shield, ArrowRight, PiggyBank } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, ReferenceLine } from 'recharts';
import Card from '../components/ui/Card';
import ChartCard from '../components/ui/ChartCard';
import EmptyState from '../components/ui/EmptyState';
import MetricCard from '../components/ui/MetricCard';
import { InfoTip } from '../components/ui/Tooltip';
import { SkeletonCard, SkeletonChart } from '../components/ui/Skeleton';
import { dashboardService, customerService } from '../services/api';
import { useApp } from '../context/AppContext';
import { formatCurrency, getRiskColor } from '../utils/helpers';
import { metric } from '../utils/glossary';

// The default assumed retention rate for the illustrative estimate below --
// a round, clearly-a-placeholder number, not a figure derived from any real
// outreach-outcome data (ChurnGuard doesn't track those yet). Adjustable so a
// stakeholder can plug in their own team's actual save rate instead.
const DEFAULT_ASSUMED_RETENTION_RATE = 30;

/** "If we act on this, what might it be worth?" -- deliberately kept apart
 * from the KPI row above: those are real, computed figures; this section is
 * always a labelled estimate built on top of one of them (Revenue at Risk),
 * multiplied by a rate the viewer sets themselves. Never rendered as if it
 * were a real, tracked number -- ChurnGuard has no record of which contacted
 * customers actually stayed.
 *
 * Laid out as a single column so it sits beside the critical-accounts table
 * in the bottom row without either card running short of width. */
function RetentionEstimate({ revenueAtRisk, customersAtRisk, className }) {
  const [rate, setRate] = useState(DEFAULT_ASSUMED_RETENTION_RATE);

  if (revenueAtRisk === undefined || !customersAtRisk) return null;

  const estimated = revenueAtRisk * (rate / 100);

  return (
    <Card className={className}>
      <div className="flex items-center gap-2">
        <PiggyBank size={16} className="text-accent shrink-0" aria-hidden="true" />
        <h3 className="text-sm font-semibold text-text-primary">What acting on this could be worth</h3>
        <InfoTip
          content="An illustration, not a forecast. It takes the Revenue at Risk figure above and applies the save rate you choose — ChurnGuard does not track which contacted customers actually stayed."
          label="How this estimate works"
          size={12}
        />
      </div>
      <p className="text-xs text-text-tertiary mt-1.5 leading-relaxed">
        Move the slider to your team&apos;s own save rate. The result is an estimate you set, not a
        measured outcome.
      </p>

      <div className="mt-4">
        <label
          htmlFor="assumed-retention-rate"
          className="flex items-center justify-between gap-3 text-xs text-text-secondary mb-1.5"
        >
          <span>Assumed save rate on at-risk customers you contact</span>
          <span className="font-semibold text-text-primary tabular-nums">{rate}%</span>
        </label>
        <input
          id="assumed-retention-rate"
          type="range"
          min={0}
          max={100}
          step={5}
          value={rate}
          onChange={(e) => setRate(Number(e.target.value))}
          className="w-full accent-accent cursor-pointer"
        />
      </div>

      <div className="mt-4 pt-4 border-t border-border">
        <p className="text-[11px] text-text-tertiary">Estimated revenue retained</p>
        <p className="text-2xl font-bold text-accent tabular-nums tracking-tight mt-0.5">
          {formatCurrency(estimated)}
        </p>
        <p className="text-[11px] text-text-tertiary mt-0.5">
          of {formatCurrency(revenueAtRisk)} at risk today
        </p>
      </div>
    </Card>
  );
}

export default function ExecutiveOverviewPage() {
  const { resolvedTheme } = useApp();
  const [metrics, setMetrics] = useState(null);
  const [riskDistribution, setRiskDistribution] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [topAtRisk, setTopAtRisk] = useState([]);
  const [loading, setLoading] = useState(true);
  // Distinct from a real failure: a 409 means the connected dataset hasn't
  // finished training yet (the same "not ready", not "broken" distinction
  // Portfolio & Risk makes for the same endpoints) -- worth its own, calmer
  // message rather than the generic "couldn't load" one.
  const [notReady, setNotReady] = useState(false);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(false);
      setNotReady(false);
      try {
        const [m, r, d, critical] = await Promise.all([
          dashboardService.getMetrics(),
          dashboardService.getRiskDistribution(),
          dashboardService.getTopDrivers(),
          customerService.getCustomers({ risk: 'critical', sortBy: 'revenueAtRisk', sortDir: 'desc', limit: 5 }),
        ]);
        if (cancelled) return;
        setMetrics(m);
        setRiskDistribution(r);
        setDrivers(d);
        setTopAtRisk(critical.customers);
      } catch (err) {
        if (cancelled) return;
        if (err?.response?.status === 409) {
          setNotReady(true);
        } else {
          setError(true);
        }
      }
      if (!cancelled) setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [reloadKey]);

  const retry = () => setReloadKey((k) => k + 1);

  // Chart fills come from the theme tokens rather than hardcoded hex, the same
  // way Portfolio & Risk does it -- the light theme darkens every risk colour,
  // so a fixed hex here would be unreadable in one of the two themes.
  const chart = useMemo(() => {
    // `theme` is carried in the object for the same reason Portfolio & Risk
    // carries it: getRiskColor() resolves against the active theme's CSS
    // tokens, which a linter can't see, so the dependency has to be visible.
    const fill = { theme: resolvedTheme, up: getRiskColor('high'), down: getRiskColor('low') };
    const total = riskDistribution.reduce((sum, d) => sum + (d.value || 0), 0);
    return {
      fill,
      total,
      distribution: riskDistribution.map((d) => ({
        ...d,
        share: total ? Math.round((d.value / total) * 100) : 0,
      })),
      // Both directions, strongest first. Filtering to positive-only left this
      // chart blank whenever every averaged SHAP value came out negative.
      drivers: drivers.slice(0, 5).map((d) => ({
        ...d,
        fill: d.direction === 'positive' ? fill.up : fill.down,
      })),
    };
    // resolvedTheme is a real input: getRiskColor() resolves against the
    // active theme's tokens, so the fills must be recomputed when it changes.
  }, [riskDistribution, drivers, resolvedTheme]);

  if (loading) {
    return (
      <div className="space-y-6" aria-busy="true">
        <SkeletonCard />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          <div className="xl:col-span-5"><SkeletonChart /></div>
          <div className="xl:col-span-7"><SkeletonChart /></div>
        </div>
      </div>
    );
  }

  if (notReady) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title="Your dataset is still being processed"
        description="Training is still running for the connected dataset. Check back in a moment."
        actionLabel="Check now"
        action={retry}
      />
    );
  }

  if (error || !metrics) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title="We couldn't load the executive overview"
        description="The portfolio figures didn't come back. Your dataset is still connected — this is usually temporary."
        actionLabel="Try again"
        action={retry}
      />
    );
  }

  // The backend omits a KPI it has no data for (e.g. retention rate when no
  // customer carries a churn outcome), so each one is read defensively and
  // simply left out rather than rendered as a crash or an invented number.
  // The KPI cards below already filter defensively on metrics.kpis; this
  // table needs its own check since it's a fixed set of columns, not a
  // filtered list -- the same `available` flags the backend computes in
  // _dataset_context() drive both, just applied differently.
  const showRevenue = metrics.dataset?.available?.revenue !== false;

  const kpis = [
    { key: 'totalCustomers', format: 'number', icon: Users },
    { key: 'customersAtRisk', format: 'number', icon: AlertTriangle },
    { key: 'revenueAtRisk', format: 'currency', icon: DollarSign },
    { key: 'retentionRate', format: 'percent', icon: TrendingUp },
  ]
    .filter((k) => metrics.kpis[k.key] !== undefined)
    .map((k) => ({ ...k, value: metrics.kpis[k.key].value }));

  const accountColumns = [
    { key: 'account', label: 'Account', help: 'The customer ID from your dataset.' },
    { key: 'risk', label: 'Churn risk', help: metric('churnProbability').help },
    ...(showRevenue
      ? [{ key: 'revenue', label: 'Revenue at risk', help: metric('customerRevenueAtRisk').help }]
      : []),
    { key: 'contract', label: 'Contract', help: metric('contractType').help },
  ];

  return (
    <div className="space-y-6">
      {/* Title — a banner rather than a centred block, so the brand keeps its
          place at the top of the page without opening a band of empty space
          above the numbers that matter. */}
      <Card className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl gradient-accent flex items-center justify-center shrink-0">
            <Shield size={20} className="text-bg-primary" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-text-primary tracking-tight">Executive View</h1>
            <p className="text-xs text-text-secondary mt-0.5">
              The retention picture in one page: how many customers are at risk, what it is worth,
              and what is driving it.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0" aria-label="ChurnGuard workflow">
          {['Predict', 'Explain', 'Act'].map((s, i) => (
            <div key={s} className="flex items-center gap-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-accent">{s}</span>
              {i < 2 && <ArrowRight size={13} className="text-text-tertiary" aria-hidden="true" />}
            </div>
          ))}
        </div>
      </Card>

      {/* KPIs — same MetricCard every other page's KPI row uses, so the same
          number is described identically wherever it's shown (glossary-driven
          description/help, not this page's own copy). */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {kpis.map((kpi, i) => {
          const g = metric(kpi.key);
          return (
            <MetricCard
              key={kpi.key}
              title={g.label}
              description={g.description}
              help={g.help}
              value={kpi.value}
              format={kpi.format}
              icon={kpi.icon}
              delay={i * 0.1}
            />
          );
        })}
      </div>

      {/* Charts — the distribution is a compact four-slice read, the drivers
          chart carries long category labels, so the width is split 5/7 rather
          than evenly. */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <ChartCard
          metricKey="riskDistribution"
          className="xl:col-span-5"
          isEmpty={chart.total === 0}
          emptyMessage="No scored customers to group yet."
        >
          {/* Stretches to the height of the drivers card beside it rather
              than leaving a band of empty card below the donut. */}
          <div className="h-full min-h-[14rem] flex items-center justify-center gap-5">
            {/* Capped rather than free-growing: below xl this card is full
                width, and a donut that spreads to fill it leaves its legend
                stranded at the far edge. */}
            <div className="h-full flex-1 min-w-0 max-w-[17rem]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={chart.distribution} cx="50%" cy="50%" innerRadius={50} outerRadius={78} paddingAngle={3} dataKey="value" animationDuration={500}>
                    {chart.distribution.map((e) => <Cell key={e.name} fill={e.color} stroke="transparent" />)}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="space-y-2.5 shrink-0">
              {chart.distribution.map((d) => (
                <li key={d.name} className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: d.color }} aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-text-primary tabular-nums leading-none">
                      {d.value.toLocaleString()}
                      <span className="text-[11px] font-normal text-text-tertiary ml-1.5">{d.share}%</span>
                    </p>
                    <p className="text-[11px] text-text-tertiary mt-0.5">{d.name}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </ChartCard>

        <ChartCard
          metricKey="topDrivers"
          className="xl:col-span-7"
          isEmpty={chart.drivers.length === 0}
          emptyMessage="Driver analysis isn't available for this dataset yet."
        >
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chart.drivers} layout="vertical" margin={{ top: 4, right: 16, left: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis
                  type="number"
                  tick={{ fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  /* Keep zero on the axis, otherwise an all-negative set of
                     drivers is drawn as full-width bars and reads as "large
                     positive effect" -- the opposite of what it means. */
                  domain={[(min) => Math.min(0, min), (max) => Math.max(0, max)]}
                />
                <YAxis
                  type="category"
                  dataKey="driver"
                  tick={{ fontSize: 11 }}
                  width={172}
                  axisLine={false}
                  tickLine={false}
                  // Long driver names get an ellipsis rather than wrapping
                  // onto two cramped lines; the full name stays in the axis
                  // data and in the caption below.
                  tickFormatter={(v) => (v.length > 24 ? `${v.slice(0, 23)}…` : v)}
                />
                <ReferenceLine x={0} stroke="var(--color-border)" />
                <Bar dataKey="impact" radius={[0, 6, 6, 0]} barSize={18} animationDuration={500}>
                  {chart.drivers.map((entry) => (
                    <Cell key={entry.driver} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="text-[11px] text-text-tertiary mt-3">
            Bars to the right raise churn risk; bars to the left lower it. Longer means a bigger
            effect.
          </p>
        </ChartCard>
      </div>

      {/* Act on it — the accounts to work first, beside what saving them could
          be worth. Paired in one row so neither is a full-width strip of
          mostly empty space. */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        <Card className="xl:col-span-7">
          <h3 className="text-sm font-semibold text-text-primary">Accounts to act on first</h3>
          <p className="text-xs text-text-tertiary mt-1 leading-snug">
            The five critical-risk accounts with the most revenue riding on them.
          </p>
          <div className="overflow-x-auto mt-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  {accountColumns.map((col) => (
                    <th
                      key={col.key}
                      className="px-4 py-2.5 text-left text-xs font-semibold text-text-tertiary uppercase tracking-wider whitespace-nowrap"
                    >
                      <span className="inline-flex items-center gap-1.5">
                        {col.label}
                        {col.help && <InfoTip content={col.help} label={`What ${col.label} means`} size={11} />}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {topAtRisk.length === 0 ? (
                  <tr>
                    <td colSpan={accountColumns.length} className="px-4 py-6 text-center text-sm text-text-tertiary">
                      No critical-risk accounts right now.
                    </td>
                  </tr>
                ) : topAtRisk.map(c => (
                  <tr key={c.id} className="border-b border-border/50 last:border-0">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-text-primary">{c.id}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-lg font-bold tabular-nums" style={{ color: getRiskColor(c.riskTier) }}>{c.churnProbability}%</span>
                    </td>
                    {showRevenue && (
                      <td className="px-4 py-3 font-semibold text-text-primary tabular-nums">{formatCurrency(c.revenueAtRisk)}</td>
                    )}
                    <td className="px-4 py-3 text-text-secondary text-xs">{c.contractType || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <RetentionEstimate
          className="xl:col-span-5"
          revenueAtRisk={metrics.kpis.revenueAtRisk?.value}
          customersAtRisk={metrics.kpis.customersAtRisk?.value}
        />
      </div>
    </div>
  );
}
