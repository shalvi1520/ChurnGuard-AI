import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Brain, ArrowRight, Info, Sparkles } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell, CartesianGrid, Tooltip } from 'recharts';
import Card, { CardHeader, CardTitle, CardDescription } from '../components/ui/Card';
import Button from '../components/ui/Button';
import Select from '../components/ui/Select';
import Badge from '../components/ui/Badge';
import { SkeletonChart } from '../components/ui/Skeleton';
import ModelArchitecture from '../components/ModelArchitecture';
import { explainabilityService } from '../services/api';
import { mockCustomers } from '../mock/customers';
import { formatPercent } from '../utils/helpers';

export default function ExplainabilityPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [selectedCustomer, setSelectedCustomer] = useState(searchParams.get('customer') || 'CUST-1001');
  const [explanation, setExplanation] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadExplanation();
  }, [selectedCustomer]);

  const loadExplanation = async () => {
    setLoading(true);
    try {
      const data = await explainabilityService.getSHAPExplanation(selectedCustomer);
      setExplanation(data);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const chartData = explanation?.features?.map(f => ({
    feature: f.feature,
    contribution: f.contribution,
    fill: f.direction === 'increases' ? '#F97316' : '#4ADE80',
  })) || [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-text-primary tracking-tight">Explainability & SHAP Analysis</h1>
          <p className="text-sm text-text-tertiary mt-0.5">Understand why customers are at risk using SHAP-based feature contributions.</p>
        </div>
        <Select
          value={selectedCustomer}
          onChange={(e) => setSelectedCustomer(e.target.value)}
          options={mockCustomers.map(c => ({ value: c.id, label: `${c.name} (${c.id})` }))}
          placeholder=""
        />
      </div>

      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6"><SkeletonChart /><SkeletonChart /></div>
      ) : explanation ? (
        <>
          {/* Risk Summary */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <span className="text-xs text-text-tertiary uppercase tracking-wider font-medium">Customer</span>
              <p className="text-lg font-bold text-text-primary mt-1">{explanation.customerName}</p>
              <p className="text-xs text-text-tertiary">{selectedCustomer}</p>
            </Card>
            <Card>
              <span className="text-xs text-text-tertiary uppercase tracking-wider font-medium">Churn Probability</span>
              <p className="text-3xl font-bold mt-1 tabular-nums" style={{ color: explanation.churnProbability > 70 ? '#EF4444' : explanation.churnProbability > 50 ? '#F97316' : explanation.churnProbability > 30 ? '#FBBF24' : '#4ADE80' }}>
                {explanation.churnProbability}%
              </p>
            </Card>
            <Card>
              <span className="text-xs text-text-tertiary uppercase tracking-wider font-medium">Model Confidence</span>
              <p className="text-3xl font-bold text-accent mt-1 tabular-nums">{(explanation.confidenceScore * 100).toFixed(0)}%</p>
            </Card>
          </div>

          {/* SHAP Chart */}
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Feature Contributions (SHAP Values)</CardTitle>
                <CardDescription>How each feature contributes to the churn prediction. Orange increases risk; green decreases risk.</CardDescription>
              </div>
            </CardHeader>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} layout="vertical" margin={{ left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2A2F42" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: '#6B7490' }} axisLine={false} tickLine={false} domain={[-0.15, 0.4]} />
                  <YAxis type="category" dataKey="feature" tick={{ fontSize: 12, fill: '#9BA3B8' }} width={160} axisLine={false} tickLine={false} />
                  <Tooltip content={({ active, payload }) => active && payload?.[0] ? (
                    <div className="bg-bg-secondary border border-border rounded-lg p-3 shadow-xl text-xs">
                      <p className="text-text-primary font-medium">{payload[0].payload.feature}</p>
                      <p className="text-text-secondary mt-1">Contribution: <span className="font-semibold" style={{ color: payload[0].payload.fill }}>{payload[0].value > 0 ? '+' : ''}{payload[0].value.toFixed(2)}</span></p>
                      <p className="text-text-tertiary mt-0.5">{payload[0].value > 0 ? 'Increases' : 'Decreases'} churn risk</p>
                    </div>
                  ) : null} />
                  <Bar dataKey="contribution" radius={[0, 4, 4, 0]} barSize={20}>
                    {chartData.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Feature detail table */}
            <div className="mt-4 border-t border-border pt-4">
              <div className="grid gap-2">
                {explanation.features.map((f, i) => (
                  <div key={i} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-bg-tertiary/30 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: f.direction === 'increases' ? '#F97316' : '#4ADE80' }} />
                      <div>
                        <span className="text-sm font-medium text-text-primary">{f.feature}</span>
                        <span className="text-xs text-text-tertiary ml-2">{f.value}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant={f.direction === 'increases' ? 'high' : 'low'} size="xs">
                        {f.direction === 'increases' ? '↑ Increases Risk' : '↓ Decreases Risk'}
                      </Badge>
                      <span className="text-sm font-semibold tabular-nums" style={{ color: f.direction === 'increases' ? '#F97316' : '#4ADE80' }}>
                        {f.contribution > 0 ? '+' : ''}{f.contribution.toFixed(2)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Card>

          {/* AI Explanation */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center">
                  <Sparkles size={16} className="text-accent" />
                </div>
                <div>
                  <CardTitle>AI-Generated Explanation</CardTitle>
                  <CardDescription>Natural language interpretation of the SHAP analysis</CardDescription>
                </div>
              </div>
            </CardHeader>
            <div className="p-4 rounded-lg bg-bg-tertiary/30 border border-border">
              <p className="text-sm text-text-secondary leading-relaxed">{explanation.aiExplanation}</p>
            </div>
            <div className="flex items-center gap-3 mt-4">
              <Button size="sm" icon={Sparkles} onClick={() => navigate(`/recommendations?customer=${selectedCustomer}`)}>Get Recommendations</Button>
              <Button variant="outline" size="sm" onClick={() => navigate(`/simulator?customer=${selectedCustomer}`)}>What-If Analysis</Button>
            </div>
          </Card>

          <ModelArchitecture />
        </>
      ) : (
        <Card className="py-12 text-center">
          <p className="text-text-tertiary">Select a customer to view their SHAP explanation.</p>
        </Card>
      )}
    </div>
  );
}
