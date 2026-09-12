import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useLocation } from 'react-router-dom';
import { AlertTriangle, ArrowRight, Sparkles, ChevronDown } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell, CartesianGrid, Tooltip, ReferenceLine } from 'recharts';
import Card, { CardHeader, CardTitle } from '../components/ui/Card';
import ChartCard from '../components/ui/ChartCard';
import Button from '../components/ui/Button';
import Select from '../components/ui/Select';
import Badge, { RiskBadge } from '../components/ui/Badge';
import { InfoTip } from '../components/ui/Tooltip';
import EmptyState from '../components/ui/EmptyState';
import PageTrail from '../components/ui/PageTrail';
import RetentionFlow from '../components/ui/RetentionFlow';
import { SkeletonChart } from '../components/ui/Skeleton';
import ModelArchitecture from '../components/ModelArchitecture';
import { explainabilityService, customerService } from '../services/api';
import { getRiskTier } from '../utils/helpers';
import { metric } from '../utils/glossary';
import { useWorkflowNav, withCustomer } from '../utils/navigation';

/**
 * Stage 1 of the retention workflow: WHY is this account at risk.
 *
 * The page answers, in order: who is this account, how risky is it, why is it
 * risky, and what happens next. It deliberately owns the *why* alone — the
 * actions live on Recommendations and the message on Outreach, which only
 * carry a compact summary of what is shown here.
 */
export default function ExplainabilityPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const { from, customersPath, drill, goBackTo } = useWorkflowNav();
  // The account is part of the URL, so a refresh, a shared link and Back all
  // show the same one. Switching accounts refines this page rather than
  // leaving it: it replaces the entry and keeps the drill-down context.
  const selectedCustomer = searchParams.get('customer') || '';
  const selectCustomer = useCallback(
    (customerId) => setSearchParams(
      customerId ? { customer: customerId } : {},
      { replace: true, state: location.state, preventScrollReset: true }
    ),
    [setSearchParams, location.state]
  );
  const [customerOptions, setCustomerOptions] = useState([]);
  const [explanation, setExplanation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [openFeature, setOpenFeature] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function loadCustomerList() {
      try {
        const data = await customerService.getCustomers({ sortBy: 'churnProbability', sortDir: 'desc', limit: 200 });
        if (cancelled) return;
        setCustomerOptions(data.customers);
        if (!selectedCustomer && data.customers[0]) selectCustomer(data.customers[0].id);
      } catch {
        // The account selector just stays empty; the page's error state still works per-selection.
      }
    }
    loadCustomerList();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedCustomer) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const data = await explainabilityService.getSHAPExplanation(selectedCustomer);
        if (cancelled) return;
        setExplanation(data);
        setError(false);
      } catch {
        if (!cancelled) setError(true);
      }
      if (!cancelled) setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [selectedCustomer]);

  const chartData = explanation?.features?.map(f => ({
    feature: f.feature,
    contribution: f.contribution,
    fill: f.direction === 'increases' ? '#F97316' : '#4ADE80',
  })) || [];

  // The selector lists the 200 riskiest accounts; one opened from Customers
  // may be outside that, and must still show as the selected option.
  const accountOptions = customerOptions.map(c => ({ value: c.id, label: c.id }));
  if (selectedCustomer && !accountOptions.some((o) => o.value === selectedCustomer)) {
    accountOptions.unshift({ value: selectedCustomer, label: selectedCustomer });
  }

  const goToRecommendations = () =>
    drill(withCustomer('/recommendations', selectedCustomer), 'Explainability');

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <PageTrail
          crumbs={selectedCustomer ? [
            { label: 'Customers', to: customersPath ?? '/customers' },
            { label: selectedCustomer, to: `/customers/${selectedCustomer}` },
            { label: 'Explainability' },
          ] : []}
          back={from && { label: from.label, to: from.path }}
        />
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <header className="max-w-2xl">
            <h1 className="text-xl font-bold text-text-primary tracking-tight">Why this account is at risk</h1>
            <p className="text-sm text-text-secondary mt-1 leading-relaxed">
              Every customer's risk score is built from a handful of signals. This page shows which ones pushed this
              account's score up, which held it down, and by how much.
            </p>
          </header>
          <Select
            label="Account"
            value={selectedCustomer}
            onChange={(e) => selectCustomer(e.target.value)}
            options={accountOptions}
            placeholder=""
            className="md:w-72"
          />
        </div>
      </div>

      <RetentionFlow customerId={selectedCustomer} stage="explain" />

      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6"><SkeletonChart /><SkeletonChart /></div>
      ) : error ? (
        <EmptyState
          icon={AlertTriangle}
          title="We couldn't load this explanation"
          description="The factor breakdown for this account didn't come back. Try another account, or reload the page."
          actionLabel={selectedCustomer ? 'Back to the account' : undefined}
          action={selectedCustomer ? () => goBackTo(`/customers/${selectedCustomer}`) : undefined}
        />
      ) : explanation ? (
        <>
          {/* Who this is and how risky they are — the context the factors below
              explain. Kept to one compact row: the account's own page owns the
              full record. */}
          <Card className="flex flex-wrap items-center gap-x-8 gap-y-4">
            <div>
              <span className="text-[10px] text-text-tertiary uppercase tracking-wider font-medium">Account</span>
              <p className="text-sm font-semibold text-text-primary mt-0.5">{explanation.customerId}</p>
            </div>
            <div>
              <span className="text-[10px] text-text-tertiary uppercase tracking-wider font-medium inline-flex items-center gap-1">
                Churn risk
                <InfoTip content={metric('churnProbability').help} label="What churn risk means" size={11} />
              </span>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-sm font-semibold text-text-primary tabular-nums">{explanation.churnProbability}%</span>
                <RiskBadge tier={getRiskTier(explanation.churnProbability)} size="xs" />
              </div>
            </div>
            <div className="min-w-0">
              <span className="text-[10px] text-text-tertiary uppercase tracking-wider font-medium">Model baseline</span>
              <p className="text-sm text-text-secondary mt-0.5 tabular-nums">
                {explanation.baselineRisk}%
                <span className="text-[11px] text-text-tertiary ml-1.5">before this account's own factors</span>
              </p>
            </div>
          </Card>

          {/* Factor contributions */}
          <ChartCard metricKey="shapContribution" isEmpty={chartData.length === 0}>
            <div className="flex flex-wrap items-center gap-4 mb-3 text-[11px] text-text-tertiary">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-risk-high" /> Pushes risk up
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-risk-low" /> Pulls risk down
              </span>
              <span>Longer bar = bigger effect on the score.</span>
            </div>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} layout="vertical" margin={{ left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2A2F42" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: '#6B7490' }} axisLine={false} tickLine={false} domain={[-0.15, 0.4]} />
                  <ReferenceLine x={0} stroke="#6B7490" strokeWidth={1} />
                  <YAxis type="category" dataKey="feature" tick={{ fontSize: 12, fill: '#9BA3B8' }} width={160} axisLine={false} tickLine={false} />
                  <Tooltip content={({ active, payload }) => active && payload?.[0] ? (
                    <div className="bg-bg-secondary border border-border rounded-lg p-3 shadow-xl text-xs max-w-[240px]">
                      <p className="text-text-primary font-medium">{payload[0].payload.feature}</p>
                      <p className="text-text-secondary mt-1">
                        Effect on risk:{' '}
                        <span className="font-semibold" style={{ color: payload[0].payload.fill }}>
                          {payload[0].value > 0 ? '+' : ''}{payload[0].value.toFixed(2)}
                        </span>
                      </p>
                      <p className="text-text-tertiary mt-0.5">
                        {payload[0].value > 0 ? 'Pushes this account toward churning' : 'Holds this account back from churning'}
                      </p>
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

            {/* Factor list - open one to see what was actually measured */}
            <div className="mt-5 border-t border-border pt-4">
              <p className="text-xs text-text-tertiary mb-2">Select a factor to see what was measured.</p>
              <ul className="grid gap-1.5">
                {explanation.features.map((f, i) => {
                  const isOpen = openFeature === i;
                  return (
                    <li key={`${f.feature}-${i}`} className="rounded-lg border border-border/60 bg-bg-tertiary/20">
                      <button
                        type="button"
                        onClick={() => setOpenFeature(isOpen ? null : i)}
                        aria-expanded={isOpen}
                        className="w-full flex items-center justify-between gap-3 py-2.5 px-3 text-left cursor-pointer hover:bg-bg-tertiary/40 rounded-lg transition-colors"
                      >
                        <span className="flex items-center gap-3 min-w-0">
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: f.direction === 'increases' ? '#F97316' : '#4ADE80' }} />
                          <span className="min-w-0">
                            <span className="text-sm font-medium text-text-primary">{f.feature}</span>
                            <span className="text-xs text-text-tertiary ml-2">{f.value}</span>
                          </span>
                        </span>
                        <span className="flex items-center gap-3 shrink-0">
                          <Badge variant={f.direction === 'increases' ? 'high' : 'low'} size="xs">
                            {f.direction === 'increases' ? 'Raises risk' : 'Lowers risk'}
                          </Badge>
                          <span className="text-sm font-semibold tabular-nums" style={{ color: f.direction === 'increases' ? '#F97316' : '#4ADE80' }}>
                            {f.contribution > 0 ? '+' : ''}{f.contribution.toFixed(2)}
                          </span>
                          <ChevronDown size={14} className={`text-text-tertiary transition-transform ${isOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
                        </span>
                      </button>
                      {isOpen && f.description && (
                        <p className="px-3 pb-3 text-xs text-text-secondary leading-relaxed">{f.description}</p>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          </ChartCard>

          {/* AI Explanation */}
          {explanation.aiExplanation && (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center">
                    <Sparkles size={16} className="text-accent" />
                  </div>
                  <div>
                    <CardTitle>The same analysis, in plain English</CardTitle>
                    <p className="text-xs text-text-tertiary mt-0.5">
                      An LLM-written summary of the real factors above — it can only reference what's shown here.
                    </p>
                  </div>
                </div>
              </CardHeader>
              <div className="p-4 rounded-lg bg-bg-tertiary/30 border border-border">
                <p className="text-sm text-text-secondary leading-relaxed">{explanation.aiExplanation}</p>
              </div>
            </Card>
          )}

          {/* Stage 1 → stage 2. The handover is the point of the page ending. */}
          <Card className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium text-text-primary">Understand the risk. Now decide what to do.</p>
              <p className="text-xs text-text-tertiary mt-1">
                Recommendations turns these factors into specific actions you can approve.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <Button variant="ghost" size="sm" onClick={() => goBackTo(`/customers/${selectedCustomer}`)}>
                Back to the account
              </Button>
              <Button size="sm" iconRight={ArrowRight} onClick={goToRecommendations}>
                Continue to recommendations
              </Button>
            </div>
          </Card>

          <ModelArchitecture />
        </>
      ) : (
        <EmptyState
          icon={AlertTriangle}
          title="No explanation available for this account"
          description="Pick a different account from the selector above to see its risk breakdown."
        />
      )}
    </div>
  );
}
