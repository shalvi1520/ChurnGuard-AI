import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Users, AlertTriangle, DollarSign, TrendingUp, Shield, ArrowRight, Sparkles } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine } from 'recharts';
import Card from '../components/ui/Card';
import { dashboardService, customerService } from '../services/api';
import { formatCurrency, formatNumber, formatPercent, getRiskColor } from '../utils/helpers';

export default function ExecutiveOverviewPage() {
  const [metrics, setMetrics] = useState(null);
  const [riskDistribution, setRiskDistribution] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [topAtRisk, setTopAtRisk] = useState([]);

  useEffect(() => {
    async function load() {
      const [m, r, d, critical] = await Promise.all([
        dashboardService.getMetrics(),
        dashboardService.getRiskDistribution(),
        dashboardService.getTopDrivers(),
        customerService.getCustomers({ risk: 'critical', sortBy: 'revenueAtRisk', sortDir: 'desc', limit: 5 }),
      ]);
      setMetrics(m);
      setRiskDistribution(r);
      setDrivers(d);
      setTopAtRisk(critical.customers);
    }
    load();
  }, []);

  if (!metrics) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="w-8 h-8 rounded-full border-2 border-border border-t-accent animate-spin" />
    </div>
  );

  // The backend omits a KPI it has no data for (e.g. retention rate when no
  // customer carries a churn outcome), so each one is read defensively and
  // simply left out rather than rendered as a crash or an invented number.
  const kpis = [
    { key: 'totalCustomers', label: 'Total Customers', format: formatNumber, icon: Users, color: '#86BC25' },
    { key: 'customersAtRisk', label: 'Customers at Risk', format: formatNumber, icon: AlertTriangle, color: '#EF4444' },
    { key: 'revenueAtRisk', label: 'Revenue at Risk', format: formatCurrency, icon: DollarSign, color: '#F97316' },
    { key: 'retentionRate', label: 'Retention Rate', format: formatPercent, icon: TrendingUp, color: '#4ADE80' },
  ]
    .filter((k) => metrics.kpis[k.key] !== undefined)
    .map((k) => ({ ...k, value: k.format(metrics.kpis[k.key].value) }));
  // Both directions, strongest first. Filtering to positive-only left this
  // chart blank whenever every averaged SHAP value came out negative.
  const topDriversShown = drivers.slice(0, 5);


  return (
    <div className="space-y-8">
      {/* Title */}
      <div className="text-center">
        <div className="flex items-center justify-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl gradient-accent flex items-center justify-center">
            <Shield size={20} className="text-bg-primary" />
          </div>
        </div>
        <h1 className="text-3xl font-bold text-text-primary tracking-tighter mb-1">CHURNGUARD</h1>
        <p className="text-sm text-text-tertiary tracking-widest uppercase">AI-Powered Customer Retention Intelligence</p>
        <div className="flex items-center justify-center gap-4 mt-4">
          {['PREDICT', 'EXPLAIN', 'ACT'].map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <span className="text-sm font-bold text-accent">{s}</span>
              {i < 2 && <ArrowRight size={14} className="text-text-tertiary" />}
            </div>
          ))}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {kpis.map((kpi, i) => (
          <motion.div
            key={kpi.label}
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
          >
            <Card className="text-center py-6">
              <div className="w-10 h-10 rounded-xl mx-auto mb-3 flex items-center justify-center" style={{ backgroundColor: `${kpi.color}15` }}>
                <kpi.icon size={20} style={{ color: kpi.color }} />
              </div>
              <p className="text-3xl font-bold text-text-primary tabular-nums tracking-tight">{kpi.value}</p>
              <p className="text-xs text-text-tertiary mt-1 uppercase tracking-wider font-medium">{kpi.label}</p>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <h3 className="text-sm font-semibold text-text-primary mb-4">Risk Distribution</h3>
          <div className="h-64 flex items-center">
            <ResponsiveContainer width="50%" height="100%">
              <PieChart>
                <Pie data={riskDistribution} cx="50%" cy="50%" innerRadius={55} outerRadius={80} paddingAngle={3} dataKey="value">
                  {riskDistribution.map((e, i) => <Cell key={i} fill={e.color} stroke="transparent" />)}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-3 pr-4">
              {riskDistribution.map(d => (
                <div key={d.name} className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: d.color }} />
                  <div>
                    <span className="text-sm font-semibold text-text-primary tabular-nums">{d.value.toLocaleString()}</span>
                    <span className="text-xs text-text-tertiary ml-1">{d.name}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Card>

        <Card>
          <h3 className="text-sm font-semibold text-text-primary mb-1">Top Churn Drivers</h3>
          <p className="text-xs text-text-tertiary mb-4">
            Orange raises churn risk, green lowers it — averaged across your customers.
          </p>
          <div className="h-64">
            {topDriversShown.length === 0 ? (
              <div className="h-full flex items-center justify-center text-center px-6">
                <p className="text-xs text-text-tertiary">
                  Driver analysis isn&apos;t available for this dataset yet.
                </p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topDriversShown} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#2A2F42" horizontal={false} />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 11, fill: '#6B7490' }}
                    axisLine={false}
                    tickLine={false}
                    domain={[(min) => Math.min(0, min), (max) => Math.max(0, max)]}
                  />
                  <YAxis type="category" dataKey="driver" tick={{ fontSize: 11, fill: '#9BA3B8' }} width={150} axisLine={false} tickLine={false} />
                  <ReferenceLine x={0} stroke="#3A4056" />
                  <Bar dataKey="impact" radius={[0, 6, 6, 0]} barSize={20}>
                    {topDriversShown.map((entry) => (
                      <Cell key={entry.driver} fill={entry.direction === 'positive' ? '#F97316' : '#4ADE80'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
      </div>

      {/* Critical Accounts */}
      <Card>
        <h3 className="text-sm font-semibold text-text-primary mb-4">Critical Accounts Requiring Immediate Action</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                {['Account', 'Risk Score', 'Revenue at Risk', 'Contract'].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-text-tertiary uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {topAtRisk.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-sm text-text-tertiary">
                    No critical-risk accounts right now.
                  </td>
                </tr>
              ) : topAtRisk.map(c => (
                <tr key={c.id} className="border-b border-border/50">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-text-primary">{c.id}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-lg font-bold tabular-nums" style={{ color: getRiskColor(c.riskTier) }}>{c.churnProbability}%</span>
                  </td>
                  <td className="px-4 py-3 font-semibold text-text-primary tabular-nums">{formatCurrency(c.revenueAtRisk)}</td>
                  <td className="px-4 py-3 text-text-secondary text-xs">{c.contractType || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Footer */}
      <div className="text-center py-4">
        <p className="text-xs text-text-tertiary">ChurnGuard · AI-Powered Customer Retention Intelligence</p>
      </div>
    </div>
  );
}
