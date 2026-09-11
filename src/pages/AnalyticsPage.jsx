import { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip, Cell } from 'recharts';
import { AlertTriangle } from 'lucide-react';
import ChartCard from '../components/ui/ChartCard';
import EmptyState from '../components/ui/EmptyState';
import { SkeletonChart } from '../components/ui/Skeleton';
import { dashboardService } from '../services/api';
import { formatNumber } from '../utils/helpers';

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
            {valueFormatter ? valueFormatter(p.value) : formatNumber(p.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

function Legend({ items }) {
  return (
    <div className="flex items-center gap-4 mt-3 text-[11px] text-text-tertiary flex-wrap">
      {items.map((item) => (
        <span key={item.label} className="flex items-center gap-1.5">
          <span
            className={item.dashed ? 'w-4 border-t-2 border-dashed' : 'w-4 h-0.5 rounded'}
            style={item.dashed ? { borderColor: item.color } : { backgroundColor: item.color }}
          />
          {item.label}
        </span>
      ))}
    </div>
  );
}

export default function AnalyticsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [segmentation, setSegmentation] = useState(null);
  const [drivers, setDrivers] = useState([]);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [seg, drv] = await Promise.all([
          dashboardService.getSegmentation(),
          dashboardService.getTopDrivers(),
        ]);
        if (cancelled) return;
        setSegmentation(seg);
        setDrivers(drv);
        setError(false);
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

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-7 w-48 bg-bg-tertiary rounded animate-pulse" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonChart key={i} />)}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title="We couldn't load your analytics"
        description="The segment breakdowns didn't come back. Your dataset is still connected — this is usually temporary."
        actionLabel="Try again"
        action={retry}
      />
    );
  }

  const topDrivers = drivers.slice(0, 10);

  return (
    <div className="space-y-6">
      <header className="max-w-3xl">
        <h1 className="text-xl font-bold text-text-primary tracking-tight">Risk Analytics</h1>
        <p className="text-sm text-text-secondary mt-1 leading-relaxed">
          Where churn risk concentrates across your customer base — by plan, by how long accounts have been with you,
          by region, and by behaviour. Use it to decide where to focus, not which individual account to call.
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard metricKey="riskByPlan" isEmpty={!segmentation?.byPlan?.length}>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={segmentation?.byPlan} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2A2F42" />
                <XAxis dataKey="segment" tick={{ fontSize: 11, fill: '#6B7490' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#6B7490' }} axisLine={false} tickLine={false} width={44} />
                <Tooltip content={<ChartTooltip valueFormatter={(v) => `${formatNumber(v)} accounts`} />} />
                <Bar dataKey="total" name="All accounts" fill="#363C52" radius={[4, 4, 0, 0]} barSize={24} animationDuration={500} />
                <Bar dataKey="atRisk" name="At risk" fill="#F97316" radius={[4, 4, 0, 0]} barSize={24} animationDuration={500} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <Legend items={[{ label: 'All accounts', color: '#363C52' }, { label: 'At risk', color: '#F97316' }]} />
        </ChartCard>

        <ChartCard metricKey="riskByTenure" isEmpty={!segmentation?.byTenure?.length}>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={segmentation?.byTenure} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2A2F42" />
                <XAxis dataKey="segment" tick={{ fontSize: 10, fill: '#6B7490' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#6B7490' }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} width={44} />
                <Tooltip content={<ChartTooltip valueFormatter={(v) => `${v}% average churn risk`} />} />
                <Bar dataKey="avgRisk" name="Average churn risk" fill="#FBBF24" radius={[4, 4, 0, 0]} barSize={28} animationDuration={500} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="text-[11px] text-text-tertiary mt-3">Percentages are the average churn risk of accounts in each band.</p>
        </ChartCard>

        {segmentation?.byServiceTier?.length > 0 && (
          <ChartCard metricKey="riskByServiceTier">
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={segmentation.byServiceTier} layout="vertical" margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2A2F42" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: '#6B7490' }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="segment" tick={{ fontSize: 10, fill: '#9BA3B8' }} width={116} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip valueFormatter={(v) => `${formatNumber(v)} at-risk accounts`} />} />
                  <Bar dataKey="atRisk" name="At-risk accounts" fill="#EF4444" radius={[0, 4, 4, 0]} barSize={16} animationDuration={500} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
        )}

        <ChartCard
          metricKey="topDrivers"
          title="What moves risk, up and down"
          description="The behaviours that push churn risk up (orange) and the ones that hold it down (green)"
          help="Averaged across every customer. Longer bars have more effect on the score. Factors for one specific account live on the Explainability page."
          isEmpty={topDrivers.length === 0}
        >
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topDrivers} layout="vertical" margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2A2F42" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: '#6B7490' }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="driver" tick={{ fontSize: 10, fill: '#9BA3B8' }} width={132} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTooltip valueFormatter={(v) => `${v > 0 ? '+' : ''}${v.toFixed(2)} effect on risk`} />} />
                <Bar dataKey="impact" name="Effect on risk" radius={[0, 4, 4, 0]} barSize={14} animationDuration={500}>
                  {topDrivers.map((entry) => (
                    <Cell key={entry.driver} fill={entry.direction === 'positive' ? '#F97316' : '#4ADE80'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <Legend items={[{ label: 'Raises churn risk', color: '#F97316' }, { label: 'Lowers churn risk', color: '#4ADE80' }]} />
        </ChartCard>
      </div>
    </div>
  );
}