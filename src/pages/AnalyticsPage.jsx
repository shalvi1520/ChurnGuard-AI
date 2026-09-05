import { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip, PieChart, Pie, Cell, LineChart, Line } from 'recharts';
import Card, { CardHeader, CardTitle } from '../components/ui/Card';
import MetricCard from '../components/ui/MetricCard';
import Select from '../components/ui/Select';
import { SkeletonChart, SkeletonCard } from '../components/ui/Skeleton';
import { dashboardService } from '../services/api';
import { AlertTriangle, BarChart3, TrendingUp, Users } from 'lucide-react';

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-bg-secondary border border-border rounded-lg p-3 shadow-xl text-xs">
      <p className="text-text-tertiary mb-1.5 font-medium">{label}</p>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color || p.fill }} />
          <span className="text-text-secondary">{p.name}:</span>
          <span className="text-text-primary font-medium tabular-nums">{typeof p.value === 'number' ? p.value.toLocaleString() : p.value}</span>
        </div>
      ))}
    </div>
  );
};

export default function AnalyticsPage() {
  const [loading, setLoading] = useState(true);
  const [segmentation, setSegmentation] = useState(null);
  const [drivers, setDrivers] = useState([]);
  const [churnTrend, setChurnTrend] = useState([]);

  useEffect(() => {
    async function load() {
      try {
        const [seg, drv, trend] = await Promise.all([
          dashboardService.getSegmentation(),
          dashboardService.getTopDrivers(),
          dashboardService.getChurnTrend(),
        ]);
        setSegmentation(seg);
        setDrivers(drv);
        setChurnTrend(trend);
      } catch (e) { console.error(e); }
      setLoading(false);
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-7 w-48 bg-bg-tertiary rounded animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonChart key={i} />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-text-primary tracking-tight">Churn Risk Analytics</h1>
        <p className="text-sm text-text-tertiary mt-0.5">Comprehensive analysis of customer churn patterns, segments, and drivers.</p>
      </div>

      {/* Segmentation Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* By Plan */}
        <Card>
          <CardHeader><CardTitle>Risk by Plan Tier</CardTitle></CardHeader>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={segmentation?.byPlan}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2A2F42" />
                <XAxis dataKey="segment" tick={{ fontSize: 11, fill: '#6B7490' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#6B7490' }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="total" name="Total" fill="#363C52" radius={[4, 4, 0, 0]} barSize={24} />
                <Bar dataKey="atRisk" name="At Risk" fill="#F97316" radius={[4, 4, 0, 0]} barSize={24} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* By Tenure */}
        <Card>
          <CardHeader><CardTitle>Risk by Customer Tenure</CardTitle></CardHeader>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={segmentation?.byTenure}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2A2F42" />
                <XAxis dataKey="segment" tick={{ fontSize: 10, fill: '#6B7490' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#6B7490' }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="avgRisk" name="Avg Risk %" fill="#FBBF24" radius={[4, 4, 0, 0]} barSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* By Region */}
        <Card>
          <CardHeader><CardTitle>Risk by Region</CardTitle></CardHeader>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={segmentation?.byRegion} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#2A2F42" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: '#6B7490' }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="segment" tick={{ fontSize: 10, fill: '#9BA3B8' }} width={120} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="atRisk" name="At Risk" fill="#EF4444" radius={[0, 4, 4, 0]} barSize={16} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Churn Drivers */}
        <Card>
          <CardHeader><CardTitle>Churn Drivers: Positive vs Negative</CardTitle></CardHeader>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={drivers.slice(0, 10)} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#2A2F42" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: '#6B7490' }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="driver" tick={{ fontSize: 10, fill: '#9BA3B8' }} width={140} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="impact" name="Impact" radius={[0, 4, 4, 0]} barSize={14}>
                  {drivers.slice(0, 10).map((entry, i) => (
                    <Cell key={i} fill={entry.direction === 'positive' ? '#F97316' : '#4ADE80'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Trend */}
      <Card>
        <CardHeader><CardTitle>Monthly Churn Rate Trend</CardTitle></CardHeader>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={churnTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2A2F42" />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#6B7490' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#6B7490' }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} />
              <Tooltip content={<CustomTooltip />} />
              <Line type="monotone" dataKey="churnRate" name="Actual" stroke="#F97316" strokeWidth={2.5} dot={{ r: 4 }} />
              <Line type="monotone" dataKey="predicted" name="Predicted" stroke="#86BC25" strokeWidth={2} strokeDasharray="5 5" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  );
}
