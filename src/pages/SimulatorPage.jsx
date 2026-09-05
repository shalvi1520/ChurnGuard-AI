import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { SlidersHorizontal, ArrowRight, RotateCcw, Sparkles, TrendingDown } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell } from 'recharts';
import Card, { CardHeader, CardTitle, CardDescription } from '../components/ui/Card';
import Button from '../components/ui/Button';
import Select from '../components/ui/Select';
import { simulatorService } from '../services/api';
import { mockCustomers } from '../mock/customers';
import { getRiskColor, getRiskTier, formatPercent } from '../utils/helpers';

const sliderConfig = [
  { key: 'usageImprovement', label: 'Usage Improvement', unit: '%', min: 0, max: 50, step: 5, color: '#86BC25' },
  { key: 'loginFrequency', label: 'Login Frequency', unit: '%', min: 0, max: 50, step: 5, color: '#4ADE80' },
  { key: 'featureAdoption', label: 'Feature Adoption', unit: '%', min: 0, max: 50, step: 5, color: '#FBBF24' },
  { key: 'supportResolution', label: 'Support Resolution', unit: '%', min: 0, max: 100, step: 10, color: '#F97316' },
  { key: 'engagementScore', label: 'Engagement Score', unit: '%', min: 0, max: 50, step: 5, color: '#A78BFA' },
];

export default function SimulatorPage() {
  const [searchParams] = useSearchParams();
  const [selectedCustomer, setSelectedCustomer] = useState(searchParams.get('customer') || 'CUST-1001');
  const [adjustments, setAdjustments] = useState({
    usageImprovement: 0, loginFrequency: 0, featureAdoption: 0, supportResolution: 0, engagementScore: 0,
  });
  const [result, setResult] = useState(null);
  const [simulating, setSimulating] = useState(false);

  const customer = mockCustomers.find(c => c.id === selectedCustomer);

  const handleSliderChange = (key, value) => {
    setAdjustments(prev => ({ ...prev, [key]: Number(value) }));
  };

  const handleSimulate = async () => {
    setSimulating(true);
    try {
      const data = await simulatorService.simulate(selectedCustomer, adjustments);
      setResult(data);
    } catch (e) { console.error(e); }
    setSimulating(false);
  };

  const handleReset = () => {
    setAdjustments({ usageImprovement: 0, loginFrequency: 0, featureAdoption: 0, supportResolution: 0, engagementScore: 0 });
    setResult(null);
  };

  useEffect(() => {
    if (Object.values(adjustments).some(v => v > 0)) {
      const timer = setTimeout(handleSimulate, 500);
      return () => clearTimeout(timer);
    } else {
      setResult(null);
    }
  }, [adjustments, selectedCustomer]);

  const hasAdjustments = Object.values(adjustments).some(v => v > 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-text-primary tracking-tight">What-If Simulator</h1>
          <p className="text-sm text-text-tertiary mt-0.5">Explore how improvements in customer engagement could reduce churn risk.</p>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={selectedCustomer}
            onChange={(e) => { setSelectedCustomer(e.target.value); handleReset(); }}
            options={mockCustomers.map(c => ({ value: c.id, label: `${c.name} (${formatPercent(c.churnProbability)})` }))}
            placeholder=""
          />
          <Button variant="ghost" size="sm" icon={RotateCcw} onClick={handleReset}>Reset</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Sliders */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Adjustment Controls</CardTitle>
                <CardDescription>Drag sliders to simulate customer improvements</CardDescription>
              </div>
            </CardHeader>
            <div className="space-y-5">
              {sliderConfig.map(slider => (
                <div key={slider.key}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-text-secondary font-medium">{slider.label}</span>
                    <span className="text-sm font-bold tabular-nums" style={{ color: adjustments[slider.key] > 0 ? slider.color : '#6B7490' }}>
                      +{adjustments[slider.key]}{slider.unit}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={slider.min}
                    max={slider.max}
                    step={slider.step}
                    value={adjustments[slider.key]}
                    onChange={(e) => handleSliderChange(slider.key, e.target.value)}
                    className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
                    style={{
                      background: `linear-gradient(to right, ${slider.color} 0%, ${slider.color} ${(adjustments[slider.key] / slider.max) * 100}%, #2A2F42 ${(adjustments[slider.key] / slider.max) * 100}%, #2A2F42 100%)`,
                    }}
                  />
                  <div className="flex justify-between mt-1">
                    <span className="text-[10px] text-text-tertiary">{slider.min}{slider.unit}</span>
                    <span className="text-[10px] text-text-tertiary">+{slider.max}{slider.unit}</span>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Results */}
        <div className="lg:col-span-3 space-y-4">
          {/* Current vs Projected */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="text-center">
              <span className="text-xs text-text-tertiary uppercase tracking-wider font-medium">Current Risk</span>
              <p className="text-4xl font-bold mt-2 tabular-nums" style={{ color: getRiskColor(getRiskTier(customer?.churnProbability || 0)) }}>
                {customer?.churnProbability}%
              </p>
              <span className="text-xs font-medium" style={{ color: getRiskColor(customer?.riskTier || 'low') }}>
                {customer?.riskTier === 'critical' ? 'Critical' : customer?.riskTier === 'high' ? 'High' : customer?.riskTier === 'medium' ? 'Medium' : 'Low'} Risk
              </span>
            </Card>

            <div className="flex items-center justify-center">
              <motion.div animate={{ x: hasAdjustments ? [0, 5, 0] : 0 }} transition={{ repeat: hasAdjustments ? Infinity : 0, duration: 1.5 }}>
                <ArrowRight size={24} className={hasAdjustments ? 'text-accent' : 'text-text-tertiary'} />
              </motion.div>
            </div>

            <Card className="text-center">
              <span className="text-xs text-text-tertiary uppercase tracking-wider font-medium">Projected Risk</span>
              <AnimatePresence mode="wait">
                <motion.p
                  key={result?.projectedRisk || 'none'}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-4xl font-bold mt-2 tabular-nums"
                  style={{ color: result ? getRiskColor(getRiskTier(result.projectedRisk)) : '#6B7490' }}
                >
                  {result ? `${result.projectedRisk}%` : '—'}
                </motion.p>
              </AnimatePresence>
              {result && (
                <span className="text-xs font-medium text-risk-low">
                  ↓ {result.improvement} points
                </span>
              )}
            </Card>
          </div>

          {/* Before/After Bar Chart */}
          <Card>
            <CardHeader><CardTitle>Risk Comparison</CardTitle></CardHeader>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={[
                    { label: 'Current', value: customer?.churnProbability || 0 },
                    { label: 'Projected', value: result?.projectedRisk || customer?.churnProbability || 0 },
                  ]}
                  barGap={20}
                >
                  <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#9BA3B8' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#6B7490' }} axisLine={false} tickLine={false} domain={[0, 100]} tickFormatter={v => `${v}%`} />
                  <Bar dataKey="value" radius={[8, 8, 0, 0]} barSize={60}>
                    <Cell fill={getRiskColor(getRiskTier(customer?.churnProbability || 0))} />
                    <Cell fill={result ? getRiskColor(getRiskTier(result.projectedRisk)) : '#363C52'} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* Impact Summary */}
          {result && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Sparkles size={16} className="text-accent" />
                    <CardTitle>Impact Summary</CardTitle>
                  </div>
                </CardHeader>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <span className="text-xs text-text-tertiary">Risk Reduction</span>
                    <p className="text-xl font-bold text-risk-low tabular-nums">{result.improvement} pts</p>
                  </div>
                  <div>
                    <span className="text-xs text-text-tertiary">New Risk Tier</span>
                    <p className="text-xl font-bold tabular-nums" style={{ color: getRiskColor(getRiskTier(result.projectedRisk)) }}>
                      {getRiskTier(result.projectedRisk) === 'critical' ? 'Critical' : getRiskTier(result.projectedRisk) === 'high' ? 'High' : getRiskTier(result.projectedRisk) === 'medium' ? 'Medium' : 'Low'}
                    </p>
                  </div>
                  <div>
                    <span className="text-xs text-text-tertiary">Confidence</span>
                    <p className="text-xl font-bold text-accent tabular-nums">{(result.confidence * 100).toFixed(0)}%</p>
                  </div>
                  <div>
                    <span className="text-xs text-text-tertiary">Revenue Saved</span>
                    <p className="text-xl font-bold text-risk-low tabular-nums">
                      ${Math.round((customer?.revenueAtRisk || 0) * (result.improvement / 100)).toLocaleString()}
                    </p>
                  </div>
                </div>
              </Card>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}
