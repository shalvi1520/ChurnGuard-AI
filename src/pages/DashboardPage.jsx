import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Users, AlertTriangle, ShieldAlert, Target, TrendingUp, DollarSign,
  Download, Calendar, Filter, ChevronRight, Eye, Brain, Mail, MoreHorizontal
} from 'lucide-react';
import {
  PieChart, Pie, Cell, ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, AreaChart, Area, BarChart, Bar, Legend
} from 'recharts';
import MetricCard from '../components/ui/MetricCard';
import Card, { CardHeader, CardTitle } from '../components/ui/Card';
import { RiskBadge, StatusBadge } from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Select from '../components/ui/Select';
import { SkeletonCard, SkeletonChart } from '../components/ui/Skeleton';
import { dashboardService } from '../services/api';
import { formatCurrency, formatPercent, formatRelativeDate } from '../utils/helpers';
import { mockCustomers } from '../mock/customers';

const kpiConfig = [
  { key: 'totalCustomers', title: 'Total Customers', format: 'number', icon: Users },
  { key: 'customersAtRisk', title: 'Customers at Risk', format: 'number', icon: AlertTriangle },
  { key: 'highRiskCustomers', title: 'High Risk Customers', format: 'number', icon: ShieldAlert },
  { key: 'avgChurnRisk', title: 'Average Churn Risk', format: 'percent', icon: Target },
  { key: 'retentionRate', title: 'Retention Rate', format: 'percent', icon: TrendingUp },
  { key: 'revenueAtRisk', title: 'Revenue at Risk', format: 'currency', icon: DollarSign },
];

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-bg-secondary border border-border rounded-lg p-3 shadow-xl text-xs">
      <p className="text-text-tertiary mb-1.5 font-medium">{label}</p>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
          <span className="text-text-secondary">{p.name}:</span>
          <span className="text-text-primary font-medium tabular-nums">{typeof p.value === 'number' && p.value > 1000 ? formatCurrency(p.value) : p.value}</span>
        </div>
      ))}
    </div>
  );
};

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState(null);
  const [riskDistribution, setRiskDistribution] = useState([]);
  const [churnTrend, setChurnTrend] = useState([]);
  const [revenueAtRisk, setRevenueAtRisk] = useState([]);
  const [topDrivers, setTopDrivers] = useState([]);
  const [dateRange, setDateRange] = useState('30d');
  const navigate = useNavigate();

  useEffect(() => {
    async function loadData() {
      try {
        const [metricsData, risk, trend, revenue, drivers] = await Promise.all([
          dashboardService.getMetrics(),
          dashboardService.getRiskDistribution(),
          dashboardService.getChurnTrend(),
          dashboardService.getRevenueAtRisk(),
          dashboardService.getTopDrivers(),
        ]);
        setMetrics(metricsData);
        setRiskDistribution(risk);
        setChurnTrend(trend);
        setRevenueAtRisk(revenue);
        setTopDrivers(drivers);
      } catch (e) {
        console.error('Dashboard load error:', e);
      }
      setLoading(false);
    }
    loadData();
  }, []);

  const highRiskCustomers = mockCustomers
    .filter(c => c.riskTier === 'critical' || c.riskTier === 'high')
    .sort((a, b) => b.churnProbability - a.churnProbability)
    .slice(0, 8);

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <div className="h-7 w-72 bg-bg-tertiary rounded animate-pulse mb-2" />
          <div className="h-4 w-96 bg-bg-tertiary rounded animate-pulse" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <SkeletonChart />
          <SkeletonChart />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-text-primary tracking-tight">Customer Retention Intelligence</h1>
          <p className="text-sm text-text-tertiary mt-0.5">Monitor churn risk, understand customer behavior, and take action before customers leave.</p>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            options={[
              { value: '7d', label: 'Last 7 days' },
              { value: '30d', label: 'Last 30 days' },
              { value: '90d', label: 'Last 90 days' },
              { value: '6m', label: 'Last 6 months' },
              { value: '1y', label: 'Last year' },
            ]}
            placeholder=""
          />
          <Button variant="outline" size="sm" icon={Download}>Export</Button>
        </div>
      </div>

      {/* KPI Grid */}
      {metrics && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          {kpiConfig.map((kpi, i) => (
            <MetricCard
              key={kpi.key}
              title={kpi.title}
              value={metrics.kpis[kpi.key].value}
              change={metrics.kpis[kpi.key].change}
              trend={metrics.kpis[kpi.key].trend}
              format={kpi.format}
              icon={kpi.icon}
              sparklineData={metrics.sparklines[kpi.key]}
              delay={i * 0.05}
            />
          ))}
        </div>
      )}

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Risk Distribution Donut */}
        <Card>
          <CardHeader><CardTitle>Churn Risk Distribution</CardTitle></CardHeader>
          <div className="h-56 flex items-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={riskDistribution} cx="50%" cy="50%" innerRadius={60} outerRadius={85} paddingAngle={3} dataKey="value" animationDuration={500}>
                  {riskDistribution.map((entry, i) => (
                    <Cell key={i} fill={entry.color} stroke="transparent" />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-2 pr-2">
              {riskDistribution.map(d => (
                <div key={d.name} className="flex items-center gap-2 whitespace-nowrap">
                  <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: d.color }} />
                  <span className="text-xs text-text-secondary">{d.name}</span>
                  <span className="text-xs text-text-primary font-semibold tabular-nums ml-auto">{d.value.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>

        {/* Churn Trend */}
        <Card>
          <CardHeader><CardTitle>Churn Rate Trend</CardTitle></CardHeader>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={churnTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2A2F42" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#6B7490' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#6B7490' }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} />
                <Tooltip content={<CustomTooltip />} />
                <Line type="monotone" dataKey="churnRate" name="Actual" stroke="#F97316" strokeWidth={2} dot={{ r: 3, fill: '#F97316' }} animationDuration={500} />
                <Line type="monotone" dataKey="predicted" name="Predicted" stroke="#86BC25" strokeWidth={2} strokeDasharray="5 5" dot={false} animationDuration={500} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Revenue at Risk */}
        <Card>
          <CardHeader><CardTitle>Revenue at Risk</CardTitle></CardHeader>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={revenueAtRisk}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2A2F42" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#6B7490' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#6B7490' }} axisLine={false} tickLine={false} tickFormatter={v => `$${(v / 1000000).toFixed(1)}M`} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="atRisk" name="At Risk" stroke="#EF4444" fill="#EF4444" fillOpacity={0.1} strokeWidth={2} animationDuration={500} />
                <Area type="monotone" dataKey="revenue" name="Total Revenue" stroke="#86BC25" fill="#86BC25" fillOpacity={0.05} strokeWidth={1.5} animationDuration={500} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Top Churn Drivers */}
        <Card>
          <CardHeader><CardTitle>Top Churn Drivers</CardTitle></CardHeader>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topDrivers.filter(d => d.direction === 'positive').slice(0, 6)} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#2A2F42" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: '#6B7490' }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="driver" tick={{ fontSize: 10, fill: '#9BA3B8' }} width={140} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="impact" name="Impact" fill="#F97316" radius={[0, 4, 4, 0]} barSize={16} animationDuration={500} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Recent High-Risk Customers */}
      <Card padding={false}>
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <CardTitle>Recent High-Risk Customers</CardTitle>
          <Button variant="ghost" size="sm" onClick={() => navigate('/customers?risk=high')}>
            View All <ChevronRight size={14} />
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                {['Customer', 'Company', 'Risk Score', 'Risk Tier', 'Top Reason', 'Revenue at Risk', 'Last Active', 'Action'].map(h => (
                  <th key={h} className="px-5 py-2.5 text-left text-xs font-semibold text-text-tertiary uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {highRiskCustomers.map((c) => (
                <tr
                  key={c.id}
                  className="border-b border-border/50 hover:bg-bg-tertiary/30 transition-colors cursor-pointer"
                  onClick={() => navigate(`/customers/${c.id}`)}
                >
                  <td className="px-5 py-3">
                    <div className="font-medium text-text-primary">{c.name}</div>
                    <div className="text-xs text-text-tertiary">{c.id}</div>
                  </td>
                  <td className="px-5 py-3 text-text-secondary">{c.company}</td>
                  <td className="px-5 py-3">
                    <span className="text-text-primary font-semibold tabular-nums">{c.churnProbability}%</span>
                  </td>
                  <td className="px-5 py-3"><RiskBadge tier={c.riskTier} /></td>
                  <td className="px-5 py-3 text-text-secondary text-xs">
                    {c.riskTier === 'critical' ? 'Feature usage decline' : 'Reduced engagement'}
                  </td>
                  <td className="px-5 py-3 text-text-primary tabular-nums">{formatCurrency(c.revenueAtRisk)}</td>
                  <td className="px-5 py-3 text-text-tertiary text-xs">{formatRelativeDate(c.lastActive)}</td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-1">
                      <button className="p-1.5 rounded-lg hover:bg-bg-tertiary text-text-tertiary hover:text-text-primary transition-colors cursor-pointer" title="View">
                        <Eye size={14} />
                      </button>
                      <button className="p-1.5 rounded-lg hover:bg-bg-tertiary text-text-tertiary hover:text-text-primary transition-colors cursor-pointer" title="Analyze">
                        <Brain size={14} />
                      </button>
                      <button className="p-1.5 rounded-lg hover:bg-bg-tertiary text-text-tertiary hover:text-text-primary transition-colors cursor-pointer" title="Email">
                        <Mail size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
