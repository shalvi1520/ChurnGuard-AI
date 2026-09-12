import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import {
  UserX, ArrowRight, TrendingUp, TrendingDown,
} from 'lucide-react';
import Card, { CardHeader, CardTitle } from '../components/ui/Card';
import { RiskBadge, StatusBadge } from '../components/ui/Badge';
import { InfoTip } from '../components/ui/Tooltip';
import Avatar from '../components/ui/Avatar';
import EmptyState from '../components/ui/EmptyState';
import PageTrail from '../components/ui/PageTrail';
import { SkeletonCard } from '../components/ui/Skeleton';
import { customerService, explainabilityService } from '../services/api';
import { formatCurrency, getRiskColor } from '../utils/helpers';
import { metric } from '../utils/glossary';
import { useWorkflowNav, withCustomer } from '../utils/navigation';

export default function CustomerDetailPage() {
  const { id } = useParams();
  const { from, customersPath, drill, goBackTo } = useWorkflowNav();
  const [customer, setCustomer] = useState(null);
  const [explanation, setExplanation] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // A page can render once against a location that no longer matches it
    // while the route is being replaced. Measured back when page transitions
    // still ran through AnimatePresence's `mode="wait"`: `id` came back
    // undefined and this effect fetched /api/customers/undefined (a 404) on
    // every navigation away from an account. Cheap guard; keeps it from
    // coming back.
    if (!id) return undefined;

    let cancelled = false;
    async function load() {
      try {
        const data = await customerService.getCustomer(id);
        if (cancelled) return;
        setCustomer(data);
      } catch {
        // The page renders a "we couldn't find that account" state below.
      }
      setLoading(false);

      // The factor breakdown is a separate (slower, SHAP-computed) call --
      // fetched after the customer record so the header/gauge don't wait on it.
      try {
        const exp = await explainabilityService.getSHAPExplanation(id);
        if (!cancelled) setExplanation(exp);
      } catch {
        // Left null; the "top risk factors" panel renders its own empty state.
      }
    }
    load();
    return () => { cancelled = true; };
  }, [id]);

  // "Customers" returns to the list this account was opened from -- filters,
  // sort and page intact -- not a reset, unfiltered list.
  const listPath = customersPath ?? '/customers';
  const trail = (
    <PageTrail
      crumbs={[
        { label: 'Portfolio & Risk', to: '/dashboard' },
        { label: 'Customers', to: listPath },
        { label: id },
      ]}
      back={from ? { label: from.label, to: from.path } : { label: 'Customers', to: listPath }}
    />
  );
  // Explain / recommend / outreach all return here by name.
  const open = (path) => drill(path, `customer ${id}`);

  if (loading) {
    return (
      <div className="space-y-6">
        {trail}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">{Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}</div>
          <SkeletonCard />
        </div>
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="space-y-6">
        {trail}
        <EmptyState
          icon={UserX}
          title="We couldn't find that account"
          description={`No customer with the ID "${id}" exists in the connected dataset. It may have been removed, or the link may be out of date.`}
          actionLabel="Back to Customers"
          action={() => goBackTo(listPath)}
        />
      </div>
    );
  }

  const riskColor = getRiskColor(customer.riskTier);
  const topDriver = explanation?.features?.[0];

  const accountFacts = [
    { label: 'Tenure', value: customer.tenure !== null && customer.tenure !== undefined ? `${customer.tenure} months` : null, help: metric('tenure').help },
    { label: 'Monthly charges', value: customer.monthlyCharges !== null ? formatCurrency(customer.monthlyCharges) : null, help: metric('monthlyCharges').help },
    { label: 'Total charges', value: customer.totalCharges !== null && customer.totalCharges !== undefined ? formatCurrency(customer.totalCharges) : null, help: metric('totalCharges').help },
    { label: 'Contract', value: customer.contractType, help: metric('contractType').help },
    { label: 'Service tier', value: customer.serviceTier },
    { label: 'Payment method', value: customer.paymentMethod },
    {
      label: 'Already churned',
      value: customer.churned === null || customer.churned === undefined ? null : (customer.churned ? 'Yes' : 'No'),
      help: 'The churn label from your uploaded file for this account, not a prediction.',
    },
  ].filter((f) => f.value !== null && f.value !== undefined);

  return (
    <div className="space-y-6">
      {trail}

      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div className="flex items-start gap-4">
          <Avatar name={customer.id} size="xl" />
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-xl font-bold text-text-primary">{customer.id}</h1>
              <RiskBadge tier={customer.riskTier} />
              <StatusBadge status={customer.status} />
            </div>
            <div className="flex items-center gap-4 mt-1.5 text-sm text-text-tertiary flex-wrap">
              {customer.contractType && <span>{customer.contractType}</span>}
              {customer.tenure !== null && customer.tenure !== undefined && <span>{customer.tenure} months tenure</span>}
            </div>
          </div>
        </div>
      </div>

      {/* Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Main Info */}
        <div className="lg:col-span-2 space-y-6">
          {/* Risk Score */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-1.5">
                <CardTitle>Churn risk</CardTitle>
                <InfoTip content={metric('churnProbability').help} label="What churn risk means" size={12} />
              </div>
              <p className="text-xs text-text-tertiary mt-1">
                How likely this account is to leave, predicted by the model trained on your dataset.
              </p>
            </CardHeader>
            <div className="flex items-center justify-center">
              <div className="relative w-40 h-40 shrink-0">
                <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
                  <circle cx="60" cy="60" r="50" fill="none" stroke="#2A2F42" strokeWidth="8" />
                  <circle
                    cx="60" cy="60" r="50" fill="none"
                    stroke={riskColor}
                    strokeWidth="8"
                    strokeDasharray={`${customer.churnProbability * 3.14} ${314 - customer.churnProbability * 3.14}`}
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-3xl font-bold text-text-primary tabular-nums">{customer.churnProbability}%</span>
                  <span className="text-[11px] text-text-tertiary">chance of churning</span>
                </div>
              </div>
            </div>
          </Card>

          {/* Why — the bridge from "what" to "what next" */}
          <Card className="border-border">
            <CardHeader>
              <CardTitle>Why this account is scored this way</CardTitle>
            </CardHeader>
            <p className="text-sm text-text-secondary leading-relaxed">
              {topDriver ? (
                <>
                  The strongest signal on this account right now is{' '}
                  <span className="text-text-primary font-medium">{topDriver.feature.toLowerCase()}</span>{' '}
                  at <span className="text-text-primary font-medium">{topDriver.value}</span>, which{' '}
                  {topDriver.direction === 'increases' ? 'raises' : 'lowers'} its risk score.
                  {' '}Explainability breaks down every factor moving this score and by how much.
                </>
              ) : (
                <>Explainability breaks down every factor moving this score and by how much.</>
              )}
            </p>
          </Card>

          {/* The bridge into the retention workflow. Three stages in order,
              each a link — deliberately restrained: the card isn't a button
              and neither is a whole row's worth of surface. */}
          <Card>
            <CardHeader>
              <CardTitle>Retention journey</CardTitle>
              <p className="text-xs text-text-tertiary mt-1">
                Work through it in order. Nothing here contacts the customer on its own.
              </p>
            </CardHeader>
            <ol className="space-y-1">
              {[
                {
                  n: 1,
                  title: 'Understand the risk',
                  description: 'Which factors moved this score, and by how much.',
                  to: withCustomer('/explainability', customer.id),
                },
                {
                  n: 2,
                  title: 'Decide what to do',
                  description: 'Recommended retention actions, for you to approve.',
                  to: withCustomer('/recommendations', customer.id),
                },
                {
                  n: 3,
                  title: 'Reach out',
                  description: 'A drafted message you review before anything is sent.',
                  to: withCustomer('/outreach', customer.id),
                },
              ].map((stage) => (
                <li key={stage.n}>
                  <button
                    type="button"
                    onClick={() => open(stage.to)}
                    className="group flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-bg-tertiary transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
                  >
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border text-[11px] font-semibold text-text-tertiary transition-colors group-hover:border-accent/40 group-hover:text-accent">
                      {stage.n}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 text-sm font-medium text-text-primary">
                        {stage.title}
                        <ArrowRight
                          size={13}
                          className="text-text-tertiary opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
                          aria-hidden="true"
                        />
                      </span>
                      <span className="mt-0.5 block text-xs text-text-tertiary">{stage.description}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          </Card>

          {/* Account Info — only fields actually present in the uploaded dataset */}
          <Card>
            <CardHeader><CardTitle>Account details</CardTitle></CardHeader>
            {accountFacts.length === 0 ? (
              <p className="text-sm text-text-tertiary">No additional account fields were mapped for this dataset.</p>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {accountFacts.map(item => (
                  <div key={item.label}>
                    <span className="text-[10px] text-text-tertiary uppercase tracking-wider font-medium inline-flex items-center gap-1">
                      {item.label}
                      {item.help && <InfoTip content={item.help} label={`What ${item.label} means`} size={11} />}
                    </span>
                    <p className="text-sm text-text-primary font-medium mt-0.5">{item.value}</p>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Right: Top risk factors */}
        <div className="space-y-6">
          {/* Top risk factors — a compact version of the Explainability breakdown */}
          <Card>
            <CardHeader>
              <CardTitle>Top risk factors</CardTitle>
              <p className="text-xs text-text-tertiary mt-1">
                The factors moving this account's score the most, from the model's explanation.
              </p>
            </CardHeader>
            {!explanation ? (
              <p className="text-xs text-text-tertiary">
                Loading the factor breakdown for this account…
              </p>
            ) : explanation.features?.length ? (
              <div className="space-y-3">
                {explanation.features.slice(0, 5).map((f) => {
                  const Icon = f.direction === 'increases' ? TrendingUp : TrendingDown;
                  return (
                    <div key={f.feature} className="flex items-start gap-2.5">
                      <Icon size={14} className={f.direction === 'increases' ? 'text-risk-high mt-0.5' : 'text-risk-low mt-0.5'} />
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-text-primary">{f.feature} <span className="text-text-tertiary font-normal">— {f.value}</span></p>
                        <p className="text-[11px] text-text-tertiary mt-0.5">
                          {f.direction === 'increases' ? 'Raises' : 'Lowers'} risk by {Math.abs(f.contribution).toFixed(2)}
                        </p>
                      </div>
                    </div>
                  );
                })}
                <button
                  onClick={() => open(withCustomer('/explainability', customer.id))}
                  className="text-xs text-accent hover:underline cursor-pointer"
                >
                  {/* Goes where the button above goes, so it must not read as a
                      second, different action -- two controls with the same name
                      are ambiguous to anyone navigating by label. */}
                  See every factor →
                </button>
              </div>
            ) : (
              <p className="text-xs text-text-tertiary">
                We couldn't load a factor breakdown for this account.
              </p>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
