import { useState, useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  Users, AlertTriangle, TrendingUp, DollarSign, ArrowRight, ChevronRight, Activity,
  Gauge, CheckCircle2, XCircle, AlertCircle,
} from 'lucide-react';
import {
  PieChart, Pie, Cell, ResponsiveContainer, XAxis, YAxis,
  CartesianGrid, Tooltip, BarChart, Bar, ReferenceLine, LabelList,
  LineChart, Line, Dot,
} from 'recharts';
import MetricCard from '../components/ui/MetricCard';
import DataSourceBadge from '../components/data-setup/DataSourceBadge';
import Card from '../components/ui/Card';
import ChartCard from '../components/ui/ChartCard';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import EmptyState from '../components/ui/EmptyState';
import { InfoTip } from '../components/ui/Tooltip';
import { SkeletonCard, SkeletonChart } from '../components/ui/Skeleton';
import CountUp from '../components/ui/CountUp';
import { dashboardService } from '../services/api';
import { useApp } from '../context/AppContext';
import { cn, formatNumber, formatCurrency, formatRelativeDate, getRiskColor, getRiskTier } from '../utils/helpers';
import { metric } from '../utils/glossary';
import { customersHref, useWorkflowNav } from '../utils/navigation';

// Portfolio & Risk: the one page that answers "what is happening across the
// whole customer base". It replaced Overview and Risk Analytics, which read
// the same endpoints and answered overlapping questions (both drew Top Churn
// Drivers). Each section below owns one question; individual accounts belong
// to Customers.

// Portfolio pulse: how big, how many at risk, what that is worth, and the
// observed baseline from the file's own churn label. Average churn risk was
// dropped from this row -- the risk distribution answers "how risky is the
// portfolio" better than a mean that hides the tail.
//
// Customers at Risk is the one KPI that is itself a set of accounts, so it is
// the one that opens them. The others are totals with no list behind them.
const KPI_CONFIG = [
  { key: 'totalCustomers', format: 'number', icon: Users },
  {
    key: 'customersAtRisk', format: 'number', icon: AlertTriangle,
    drill: { to: customersHref({ status: 'at-risk' }), label: 'View at-risk customers' },
  },
  { key: 'revenueAtRisk', format: 'currency', icon: DollarSign },
  { key: 'retentionRate', format: 'percent', icon: TrendingUp },
];

// Icon + colour per plain-language tag -- generic/metrics_agent.py assigns
// one of these three to every Reliability Score component, already in
// business language (no SHAP/PSI/schema-inference jargon reaches this file).
const RELIABILITY_TAG_STYLE = {
  good: { Icon: CheckCircle2, className: 'text-risk-low' },
  caution: { Icon: AlertCircle, className: 'text-risk-medium' },
  poor: { Icon: XCircle, className: 'text-risk-high' },
};

const CONFIDENCE_LABEL = { high: 'High Confidence', moderate: 'Moderate Confidence', low: 'Low Confidence' };

// Always visible, not a click/hover reveal: this is meant to be read, not
// discovered. Keyed to whichever dataset is currently active (metrics is
// refetched on every dataset switch, same as every other section on this
// page), so it never shows a stale prior dataset's numbers.
// Datasets reopened from History can be older than this feature, or older
// than a shape change within it (see get_dashboard()'s comment in
// dataset_routes.py) -- shown plainly rather than as an empty card or a
// section that silently vanishes.
const METRICS_REPROCESS_NOTE = 'Reprocess this dataset (re-run Predict) to generate this.';

function ReliabilitySection({ reliability }) {
  if (!reliability) return null;

  if (reliability.unavailable) {
    return (
      <section aria-labelledby="reliability-score">
        <SectionHeading id="reliability-score">Reliability score</SectionHeading>
        <Card>
          <p className="text-sm text-text-secondary">
            Metrics weren&rsquo;t available when this dataset was last processed. {METRICS_REPROCESS_NOTE}
          </p>
        </Card>
      </section>
    );
  }

  const { value, confidence, breakdown } = reliability;
  const components = breakdown?.components ? Object.values(breakdown.components) : [];

  return (
    <section aria-labelledby="reliability-score">
      <SectionHeading id="reliability-score">Reliability score</SectionHeading>
      <Card>
        <div className="flex items-center gap-3 mb-1">
          <div className="p-2 rounded-lg bg-bg-tertiary text-accent shrink-0">
            <Gauge size={18} aria-hidden="true" />
          </div>
          <p className="text-lg font-bold text-text-primary tracking-tight">
            {Math.round(value)}/100 &mdash; {CONFIDENCE_LABEL[confidence] || 'Confidence'}
          </p>
        </div>
        <p className="text-sm text-text-secondary mt-1 mb-4">
          This score reflects how much you can trust these predictions.
        </p>
        {components.length > 0 ? (
          <ul className="grid gap-2.5">
            {components.map((component, i) => {
              const style = RELIABILITY_TAG_STYLE[component.tag] || RELIABILITY_TAG_STYLE.caution;
              const { Icon } = style;
              return (
                <li key={i} className="flex items-start gap-2.5">
                  <Icon size={16} className={cn('shrink-0 mt-0.5', style.className)} aria-hidden="true" />
                  <span className="text-sm text-text-secondary leading-relaxed">{component.text}</span>
                </li>
              );
            })}
          </ul>
        ) : (
          // The score itself is real (persisted), but this run predates the
          // plain-language breakdown -- say so instead of an empty list.
          <p className="text-sm text-text-tertiary">
            A detailed breakdown wasn&rsquo;t saved for this run. {METRICS_REPROCESS_NOTE}
          </p>
        )}
      </Card>
    </section>
  );
}

// Icon + colour per severity label generic/metrics_agent.py's
// _severity_label() returns ("Low" | "Moderate" | "High" | "Critical") --
// `tier` is the same key getRiskColor()/Badge's own variants use, so this
// badge is colour-identical to the Churn Risk Distribution donut above,
// never a second, competing colour language on the same page.
const MARKET_IMPACT_SEVERITY_STYLE = {
  Low: { tier: 'low', Icon: CheckCircle2 },
  Moderate: { tier: 'medium', Icon: AlertCircle },
  High: { tier: 'high', Icon: AlertTriangle },
  Critical: { tier: 'critical', Icon: XCircle },
};

// One concrete next step per severity, not just description -- a
// non-technical reader should never have to infer for themselves whether a
// number is fine or not. Keyed off the same severity classification as the
// badge above, never the raw ratio, so the two can't disagree.
const MARKET_IMPACT_ACTION_LINE = {
  Low: 'Your risk is currently manageable — keep monitoring, no urgent action needed.',
  Moderate: 'This is close to typical for your industry — worth keeping an eye on your highest-risk accounts.',
  High: 'This is running well above typical for your industry — reviewing your highest-risk accounts soon is recommended.',
  Critical: 'This is running well above typical for your industry — reviewing your highest-risk accounts soon is recommended.',
};

// The gauge's domain is 0x-2x the industry benchmark (clamped), and its zone
// boundaries are the same 0.75x/1.15x cut points generic/metrics_agent.py's
// _severity_label() classifies Low/Moderate/High on -- so the marker can
// never land in a zone that disagrees with the severity badge next to it.
// High and Critical both read as "above typical": a 3-zone gauge has no
// room for a fourth band, and the badge already carries that finer
// distinction on its own.
const MARKET_IMPACT_GAUGE_MAX_RATIO = 2;
const MARKET_IMPACT_GAUGE_ZONES = [
  { pct: 37.5, color: 'var(--color-risk-low)' },
  { pct: 20, color: 'var(--color-risk-medium)' },
  { pct: 42.5, color: 'var(--color-risk-critical)' },
];

const ESTIMATE_TOOLTIP = 'Calculated using typical revenue-per-customer for your industry, since no revenue field was included in this upload.';

// Always visible, keyed to the active dataset -- same rationale as
// ReliabilitySection above. Degraded mode (no revenue field mapped) renders
// its own clear message rather than hiding the section or showing a $0.
function MarketImpactSection({ marketImpact }) {
  if (!marketImpact) return null;

  if (marketImpact.unavailable) {
    return (
      <section aria-labelledby="market-impact">
        <SectionHeading id="market-impact">Market impact</SectionHeading>
        <Card>
          <p className="text-sm text-text-secondary">
            Market impact wasn&rsquo;t available when this dataset was last processed. {METRICS_REPROCESS_NOTE}
          </p>
        </Card>
      </section>
    );
  }

  const {
    churnRatePct, atRiskCount, totalCustomers, isEstimated, severity,
    projectedAnnualLoss, vsBenchmarkRatio, impactHeadline, explanation,
  } = marketImpact;

  // Only the fully degenerate case (no customers scored at all) ever leaves
  // this null -- a missing revenue field gets an industry-average estimate
  // instead, never a blank "Not available" (see generic/metrics_agent.py).
  const lossValue = projectedAnnualLoss == null ? 'Not available' : formatCurrency(projectedAnnualLoss);
  const lossSub = projectedAnnualLoss == null
    ? 'not enough data to estimate'
    : isEstimated
      ? 'estimated — no billing field mapped'
      : 'if at-risk customers churn';

  const sevStyle = MARKET_IMPACT_SEVERITY_STYLE[severity] || MARKET_IMPACT_SEVERITY_STYLE.Moderate;
  const actionLine = MARKET_IMPACT_ACTION_LINE[severity] || MARKET_IMPACT_ACTION_LINE.Moderate;
  const markerPct = vsBenchmarkRatio != null
    ? Math.min(100, Math.max(0, (vsBenchmarkRatio / MARKET_IMPACT_GAUGE_MAX_RATIO) * 100))
    : null;

  return (
    <section aria-labelledby="market-impact">
      <SectionHeading id="market-impact">Market impact</SectionHeading>
      <Card>
        {/* Severity, at a glance, before any number -- colour-matched to the
            Churn Risk Distribution donut so the two never read as separate
            colour systems on the same page. */}
        <div className="flex items-center gap-3 flex-wrap mb-1">
          <Badge variant={sevStyle.tier} size="md" className="inline-flex items-center gap-1.5">
            <sevStyle.Icon size={13} aria-hidden="true" />
            {severity} impact
          </Badge>
          <p className="text-lg font-bold text-text-primary tracking-tight">{churnRatePct}% churn rate</p>
        </div>
        <p className="text-sm text-text-secondary mt-1 mb-4">{impactHeadline}</p>

        {/* The primary visual: where this dataset's churn rate falls versus
            the industry, not a bare "1.3x" number. */}
        <div className="mb-5">
          <div className="relative h-2.5 rounded-full overflow-hidden flex" aria-hidden="true">
            {MARKET_IMPACT_GAUGE_ZONES.map((zone, i) => (
              <div key={i} className="h-full" style={{ width: `${zone.pct}%`, backgroundColor: zone.color }} />
            ))}
            {markerPct != null && (
              <div
                className="absolute top-1/2 h-4 w-4 -translate-y-1/2 -translate-x-1/2 rounded-full border-2 shadow-md"
                style={{ left: `${markerPct}%`, backgroundColor: 'var(--color-bg-card)', borderColor: 'var(--color-text-primary)' }}
              />
            )}
          </div>
          <div className="flex justify-between text-[10px] text-text-tertiary mt-1.5">
            <span>Below typical</span>
            <span>Typical</span>
            <span>Above typical</span>
          </div>
          <p className="sr-only">
            {vsBenchmarkRatio != null
              ? `Churn rate is ${vsBenchmarkRatio.toFixed(1)}x the typical industry rate.`
              : 'No industry benchmark comparison is available for this dataset.'}
          </p>
        </div>

        <div className="space-y-2.5">
          {explanation.split('\n\n').map((paragraph, i) => (
            <p key={i} className="text-sm text-text-secondary leading-relaxed">{paragraph}</p>
          ))}
        </div>

        {/* The one actionable line -- what a non-technical reader should
            actually do with everything above, not just more description. */}
        <p className="text-sm font-semibold text-text-primary mt-4">{actionLine}</p>

        {/* The three figures, now supporting detail behind the plain-language
            read above rather than three equally-weighted boxes. */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-5 pt-4 border-t border-border">
          <div>
            <p className="text-[11px] text-text-tertiary uppercase tracking-wider">Churn rate</p>
            <p className="text-sm font-semibold text-text-primary tabular-nums mt-0.5">{churnRatePct}%</p>
            <p className="text-[11px] text-text-tertiary mt-0.5">{atRiskCount} of {totalCustomers} customers</p>
          </div>
          <div>
            <p className="text-[11px] text-text-tertiary uppercase tracking-wider flex items-center gap-1">
              {isEstimated ? 'Projected annual loss (estimated)' : 'Projected annual loss'}
              {isEstimated && <InfoTip content={ESTIMATE_TOOLTIP} label="Why this is estimated" size={11} />}
            </p>
            <p className="text-sm font-semibold text-text-primary tabular-nums mt-0.5">{lossValue}</p>
            <p className="text-[11px] text-text-tertiary mt-0.5">{lossSub}</p>
          </div>
          <div>
            <p className="text-[11px] text-text-tertiary uppercase tracking-wider">Vs. industry benchmark</p>
            <p className="text-sm font-semibold text-text-primary tabular-nums mt-0.5">
              {vsBenchmarkRatio != null ? `${vsBenchmarkRatio.toFixed(1)}x` : '—'}
            </p>
            <p className="text-[11px] text-text-tertiary mt-0.5">typical rate for reference</p>
          </div>
        </div>
      </Card>
    </section>
  );
}

const RISK_TIERS = ['low', 'medium', 'high', 'critical'];

// "Which segment concentrates risk" is one question, so contract type and
// service tier share one chart with a switch rather than being two charts.
// Service tier is optional in the schema; its option only appears when the
// dataset actually has one. `filterKey` is the GET /customers parameter a
// segment drills into.
const SEGMENT_VIEWS = [
  { id: 'byPlan', label: 'Contract', metricKey: 'riskByPlan', filterKey: 'contract' },
  { id: 'byServiceTier', label: 'Service tier', metricKey: 'riskByServiceTier', filterKey: 'serviceTier' },
];

const LEGEND_ROW = 'flex items-center gap-2 whitespace-nowrap rounded-md px-2 py-1 -mx-2 transition-colors';
const INLINE_LINK = 'inline-flex items-center gap-1 font-medium text-accent hover:underline underline-offset-2 rounded-sm focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2';

// Same value as --color-text-tertiary in both themes, so neutral bars and the
// zero line read as context on a dark or a light card.
const NEUTRAL_FILL = '#6B7490';

const signed = (v) => `${v > 0 ? '+' : ''}${Number(v).toFixed(2)}`;

function ChartTooltip({ active, payload, label, valueFormatter, hint, extra }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-bg-secondary border border-border rounded-lg p-3 shadow-xl text-xs">
      {label && <p className="text-text-tertiary mb-1.5 font-medium">{label}</p>}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          {/* Per-bar colours live on the row (`fill`); a single-colour series on the series. */}
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.payload?.fill || p.color || p.fill }} />
          <span className="text-text-secondary">{p.name}:</span>
          <span className="text-text-primary font-medium tabular-nums">
            {valueFormatter ? valueFormatter(p.value) : formatNumber(p.value)}
          </span>
        </div>
      ))}
      {/* Per-point context that isn't itself a plotted value -- e.g. how many
          customers a driver actually affects. */}
      {extra && <p className="text-text-tertiary mt-1.5">{extra(payload[0].payload)}</p>}
      {hint && <p className="text-text-tertiary mt-1.5">{hint}</p>}
    </div>
  );
}

function ChartLegend({ items }) {
  return (
    <ul className="flex items-center gap-x-4 gap-y-1 mt-3 text-[11px] text-text-tertiary flex-wrap">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: item.color }} aria-hidden="true" />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

/** The figures behind a bar chart as text. The SVG doesn't expose them to
 *  screen readers, and its value labels alone don't say what they measure. */
function ChartFigures({ label, items }) {
  return (
    <ul className="sr-only" aria-label={label}>
      {items.map((text, i) => <li key={i}>{text}</li>)}
    </ul>
  );
}

function SectionHeading({ id, children }) {
  return (
    <h2 id={id} className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary mb-3">
      {children}
    </h2>
  );
}

// A brand-new dataset's model-health/dashboard data doesn't exist until
// training actually finishes -- every one of this page's own endpoints
// 409s ("This dataset hasn't been processed yet") until then. That is a
// normal, expected state here, not a broken page: the store's *active*
// dataset can change mid-navigation (e.g. a replacement upload started in
// Data Management while this tab is still open elsewhere), so landing on
// Portfolio & Risk while it's mid-training is a real, reachable situation,
// not just a race at initial mount. Retried automatically, capped so a
// genuinely stuck training run doesn't poll forever in a forgotten tab.
const TRAINING_POLL_INTERVAL_MS = 5000;
const MAX_TRAINING_POLL_ATTEMPTS = 12; // ~1 minute of automatic retries

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  // Distinct from `error`: a 409 means the data doesn't exist YET, not that
  // something is broken -- same distinction HistoryPage's handleOpen()
  // already makes for a 409 from POST .../reopen (an info toast, not an
  // error one). Rendered as its own friendly, self-refreshing state rather
  // than "We couldn't load Portfolio & Risk".
  const [notReady, setNotReady] = useState(false);
  const [metrics, setMetrics] = useState(null);
  const [riskDistribution, setRiskDistribution] = useState([]);
  const [topDrivers, setTopDrivers] = useState([]);
  const [segmentation, setSegmentation] = useState(null);
  const [segmentView, setSegmentView] = useState(SEGMENT_VIEWS[0].id);
  const { resolvedTheme } = useApp();
  const { stateFrom, drill } = useWorkflowNav();

  // Retry bumps `reloadKey` from the click handler, which keeps the effect
  // itself free of synchronous state updates (`loading` already starts true).
  const [reloadKey, setReloadKey] = useState(0);
  const pollAttemptsRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    let retryTimer = null;

    async function load() {
      try {
        // One parallel round, each endpoint once, for every section below.
        const [metricsData, risk, drivers, segments] = await Promise.all([
          dashboardService.getMetrics(),
          dashboardService.getRiskDistribution(),
          dashboardService.getTopDrivers(),
          dashboardService.getSegmentation(),
        ]);
        if (cancelled) return;
        setMetrics(metricsData);
        setRiskDistribution(risk);
        setTopDrivers(drivers);
        setSegmentation(segments);
        setNotReady(false);
        setLoading(false);
        pollAttemptsRef.current = 0;
      } catch (err) {
        if (cancelled) return;
        if (err?.response?.status === 409) {
          setNotReady(true);
          setLoading(false);
          if (pollAttemptsRef.current < MAX_TRAINING_POLL_ATTEMPTS) {
            pollAttemptsRef.current += 1;
            retryTimer = setTimeout(() => {
              if (!cancelled) setReloadKey((k) => k + 1);
            }, TRAINING_POLL_INTERVAL_MS);
          }
          // Past the cap: stop auto-retrying, but stay on the friendly
          // "still processing" state rather than falling through to the
          // generic error -- "Check now" below still works at any point.
        } else {
          setError(true);
          setLoading(false);
        }
      }
    }
    load();
    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [reloadKey]);

  const retry = () => {
    setLoading(true);
    setError(false);
    setNotReady(false);
    pollAttemptsRef.current = 0;
    setReloadKey((k) => k + 1);
  };

  // What the charts draw, derived once per data or theme change. Fills are
  // real colour values read from the theme tokens by getRiskColor(), so the
  // resolved theme is an input: switching appearance re-colours the charts at
  // once. Memoised so any other app-state change (a toast, the sidebar) keeps
  // the same arrays and Recharts doesn't replay its animations.
  const chart = useMemo(() => {
    const fill = { theme: resolvedTheme, ...Object.fromEntries(RISK_TIERS.map((t) => [t, getRiskColor(t)])) };
    return {
      fill,
      riskTotal: riskDistribution.reduce((sum, d) => sum + d.value, 0),
      // The backend labels tiers "Low Risk" … "Critical"; the first word is the tier key.
      distribution: riskDistribution.map((d) => {
        const tier = String(d.name ?? '').toLowerCase().split(' ')[0];
        return { ...d, tier: RISK_TIERS.includes(tier) ? tier : null, fill: fill[tier] ?? d.color };
      }),
      // Strongest drivers in BOTH directions. Filtering to positive-only silently
      // emptied this chart whenever every mean SHAP value came out negative.
      drivers: topDrivers.slice(0, 8).map((d) => ({
        ...d,
        fill: d.direction === 'positive' ? fill.high : fill.low,
      })),
      tenureRows: (segmentation?.byTenure ?? []).map((s) => ({ ...s, fill: fill[getRiskTier(s.avgRisk)] })),
    };
  }, [riskDistribution, topDrivers, segmentation, resolvedTheme]);

  const segment = useMemo(() => {
    const options = SEGMENT_VIEWS.filter((v) => segmentation?.[v.id]?.length > 0);
    const active = options.find((v) => v.id === segmentView) ?? options[0] ?? SEGMENT_VIEWS[0];
    const rows = (segmentation?.[active.id] ?? []).map((s) => ({
      ...s,
      share: s.total ? Math.round((s.atRisk / s.total) * 100) : 0,
    }));
    return { options, active, rows };
  }, [segmentation, segmentView]);

  if (loading) {
    return (
      <div className="space-y-8" aria-busy="true">
        <div>
          <div className="h-7 w-56 bg-bg-tertiary rounded animate-pulse mb-2" />
          <div className="h-4 w-full max-w-xl bg-bg-tertiary rounded animate-pulse" />
        </div>
        <div className="h-24 bg-bg-tertiary rounded-xl animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
          <div className="xl:col-span-2"><SkeletonChart /></div>
          <div className="xl:col-span-3"><SkeletonChart /></div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <SkeletonChart />
          <SkeletonChart />
        </div>
      </div>
    );
  }

  if (notReady) {
    return (
      <EmptyState
        icon={Activity}
        title="Your dataset is still being processed"
        description="Training is still running for the connected dataset. This page will refresh on its own once it's ready — no need to wait here."
        actionLabel="Check now"
        action={retry}
      />
    );
  }

  if (error) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title="We couldn't load Portfolio & Risk"
        description="The portfolio figures didn't come back. Your dataset is still connected — this is usually temporary."
        actionLabel="Try again"
        action={retry}
      />
    );
  }

  const kpis = metrics ? KPI_CONFIG.filter((kpi) => metrics.kpis?.[kpi.key] !== undefined) : [];
  const { fill, riskTotal, distribution, drivers, tenureRows } = chart;
  const { options: segmentOptions, active: activeSegment, rows: segmentRows } = segment;
  const atRiskCount = metrics?.kpis?.customersAtRisk?.value ?? 0;

  // Every drill-down carries "came from Portfolio & Risk", so Customers can
  // offer a named way back -- and the browser's Back lands here too.
  const backHere = stateFrom('Portfolio & Risk');
  const openCustomers = (filters) => drill(customersHref(filters), 'Portfolio & Risk');

  return (
    <div className="space-y-8">
      <header className="max-w-3xl">
        <h1 className="text-xl font-bold text-text-primary tracking-tight">Portfolio & Risk</h1>
        <p className="text-sm text-text-secondary mt-1 leading-relaxed">
          Your whole customer base, scored by the model trained on your connected dataset: how much is at risk,
          where that risk concentrates, what drives it, and which accounts to look at first. Every individual
          account is on Customers.
        </p>
        {/* Which data these numbers come from -- reported by the backend, so a
            real upload is never labelled as demo data or vice versa. */}
        {metrics?.dataset && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <DataSourceBadge source={metrics.dataset.source} filename={metrics.dataset.filename} />
            {metrics.dataset.uploadedAt && (
              <span className="text-[11px] text-text-tertiary">
                · Refreshed {formatRelativeDate(metrics.dataset.uploadedAt)}
              </span>
            )}
          </div>
        )}
      </header>

      {/* What this dataset means for the business, up top where a
          non-technical reader lands first -- see MarketImpactSection above. */}
      <MarketImpactSection marketImpact={metrics?.marketImpact} />

      {/* 1. What is happening */}
      {kpis.length > 0 && (
        <section aria-labelledby="portfolio-pulse">
          <SectionHeading id="portfolio-pulse">Portfolio pulse</SectionHeading>
          <div
            className={cn(
              'grid grid-cols-1 sm:grid-cols-2 gap-4',
              kpis.length >= 4 ? 'xl:grid-cols-4' : kpis.length === 3 && 'xl:grid-cols-3'
            )}
          >
            {kpis.map((kpi, i) => {
              const g = metric(kpi.key);
              const kpiData = metrics.kpis[kpi.key];
              return (
                <MetricCard
                  key={kpi.key}
                  title={g.label}
                  description={g.description}
                  help={g.help}
                  value={kpiData.value}
                  format={kpi.format}
                  icon={kpi.icon}
                  // An empty list isn't worth a link.
                  action={kpi.drill && kpiData.value > 0 ? { ...kpi.drill, state: backHere } : undefined}
                  delay={i * 0.05}
                />
              );
            })}
          </div>
        </section>
      )}

      {/* 2. How serious it is, and what drives it */}
      <section aria-labelledby="risk-profile">
        <SectionHeading id="risk-profile">Risk profile</SectionHeading>
        <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
          <ChartCard
            metricKey="riskDistribution"
            isEmpty={riskTotal === 0}
            emptyMessage="No customers have been scored for this dataset yet."
            emptyAction={{ to: '/data-management', label: 'Check your connected dataset' }}
            className="xl:col-span-2"
          >
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="h-44 sm:h-56 sm:flex-1 min-w-0 relative">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={distribution}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius="62%"
                      outerRadius="90%"
                      paddingAngle={3}
                      animationDuration={500}
                      // A mouse shortcut; the tier list beside the donut is the
                      // keyboard- and screen-reader-reachable form of the same links.
                      onClick={(_, index) => {
                        const d = distribution[index];
                        if (d?.tier && d.value > 0) openCustomers({ risk: d.tier });
                      }}
                      className="cursor-pointer"
                    >
                      {distribution.map((d) => (
                        <Cell key={d.name} fill={d.fill} stroke="transparent" className="transition-opacity hover:opacity-80" />
                      ))}
                    </Pie>
                    <Tooltip
                      content={<ChartTooltip valueFormatter={(v) => `${formatNumber(v)} customers`} hint="Click to view these customers" />}
                    />
                  </PieChart>
                </ResponsiveContainer>
                {/* Center label — the donut's hollow core shows the portfolio total. */}
                {riskTotal > 0 && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none" aria-hidden="true">
                    <div className="text-center">
                      <div className="text-lg font-bold text-text-primary tabular-nums leading-none">
                        <CountUp value={riskTotal} format={formatNumber} />
                      </div>
                      <div className="text-[10px] text-text-tertiary mt-0.5">customers</div>
                    </div>
                  </div>
                )}
              </div>
              {/* The legend carries the figures as text, so the donut is never
                  colour-only -- and each tier with accounts in it opens them. */}
              <ul className="space-y-1 sm:shrink-0" aria-label="Customers by risk tier">
                {distribution.map((d) => {
                  const figures = (
                    <>
                      <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: d.fill }} aria-hidden="true" />
                      <span className="text-xs text-text-secondary">{d.name}</span>
                      <span className="text-xs text-text-primary font-semibold tabular-nums ml-auto pl-3">{formatNumber(d.value)}</span>
                      <span className="text-[10px] text-text-tertiary tabular-nums w-9 text-right">
                        {riskTotal ? `${Math.round((d.value / riskTotal) * 100)}%` : ''}
                      </span>
                    </>
                  );
                  return (
                    <li key={d.name}>
                      {d.tier && d.value > 0 ? (
                        <Link
                          to={customersHref({ risk: d.tier })}
                          state={backHere}
                          className={cn(LEGEND_ROW, 'group hover:bg-bg-tertiary/60 focus-visible:outline-2 focus-visible:outline-accent')}
                        >
                          {figures}
                          <ChevronRight
                            size={12}
                            className="shrink-0 text-text-tertiary opacity-50 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
                            aria-hidden="true"
                          />
                          <span className="sr-only">, view these customers</span>
                        </Link>
                      ) : (
                        <div className={LEGEND_ROW}>
                          {figures}
                          <span className="w-3 shrink-0" aria-hidden="true" />
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          </ChartCard>

          <ChartCard
            metricKey="topDrivers"
            isEmpty={drivers.length === 0}
            emptyMessage="Driver analysis isn't available for this dataset yet."
            emptyAction={{ to: '/customers', label: 'View customer-level risk', state: backHere }}
            className="xl:col-span-3"
          >
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={drivers} layout="vertical" margin={{ top: 4, right: 12, left: 4, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v) => Number(v).toFixed(2)}
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
                    tick={{ fontSize: 10 }}
                    width={150}
                    axisLine={false}
                    tickLine={false}
                    // Full name is still on hover (tooltip) and for screen
                    // readers (ChartFigures below) -- this just keeps long,
                    // properly-spaced names from clipping the plot area.
                    tickFormatter={(v) => (v.length > 20 ? `${v.slice(0, 19)}…` : v)}
                  />
                  <ReferenceLine x={0} stroke={NEUTRAL_FILL} />
                  <Tooltip
                    content={
                      <ChartTooltip
                        valueFormatter={signed}
                        extra={(d) => `Affects ${formatNumber(d.customers)} at-risk customers`}
                      />
                    }
                  />
                  <Bar dataKey="impact" name="Effect on churn risk" radius={[0, 4, 4, 0]} barSize={14} animationDuration={500}>
                    {drivers.map((d) => (
                      <Cell key={d.driver} fill={d.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-wrap items-end justify-between gap-x-4">
              <ChartLegend
                items={[
                  { label: 'Raises churn risk', color: fill.high },
                  { label: 'Lowers churn risk', color: fill.low },
                ]}
              />
              {/* A driver is a factor, not a group of accounts, so it isn't a
                  customer filter. The honest next step is one account's own
                  breakdown -- Explainability opens on the highest-risk one. */}
              <Link to="/explainability" state={backHere} className={cn(INLINE_LINK, 'mt-3 text-[11px]')}>
                See drivers for the highest-risk account
                <ArrowRight size={11} aria-hidden="true" />
              </Link>
            </div>
            <ChartFigures
              label={metric('topDrivers').label}
              items={drivers.map(
                (d) => `${d.driver}: ${d.direction === 'positive' ? 'raises' : 'lowers'} churn risk for ${formatNumber(d.customers)} customers (${signed(d.impact)})`
              )}
            />
          </ChartCard>
        </div>
      </section>

      {/* 3. Where it is happening */}
      <section aria-labelledby="risk-concentration">
        <SectionHeading id="risk-concentration">Where risk concentrates</SectionHeading>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ChartCard
            metricKey={activeSegment.metricKey}
            isEmpty={segmentRows.length === 0}
            emptyMessage="This dataset has no contract or plan values to break risk down by."
            emptyAction={{ to: '/customers', label: 'View all customers', state: backHere }}
            action={segmentOptions.length > 1 && (
              <div role="group" aria-label="Break risk down by" className="inline-flex rounded-lg border border-border bg-bg-tertiary/50 p-0.5">
                {segmentOptions.map((v) => {
                  const on = v.id === activeSegment.id;
                  return (
                    <button
                      key={v.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setSegmentView(v.id)}
                      className={cn(
                        'px-2.5 py-1 rounded-md text-[11px] font-medium whitespace-nowrap transition-colors cursor-pointer',
                        'focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-1',
                        on ? 'bg-bg-card text-text-primary shadow-sm' : 'text-text-tertiary hover:text-text-secondary'
                      )}
                    >
                      {v.label}
                    </button>
                  );
                })}
              </div>
            )}
          >
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={segmentRows} margin={{ top: 18, right: 8, left: -12, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="segment" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={44} allowDecimals={false} />
                  <Tooltip
                    content={<ChartTooltip valueFormatter={(v) => `${formatNumber(v)} accounts`} hint="Click a bar to view these customers" />}
                  />
                  {/* Grey bar: every account in the group. Orange bar: only its
                      at-risk accounts -- the drill-down carries both conditions. */}
                  <Bar
                    dataKey="total"
                    name="All accounts"
                    fill={NEUTRAL_FILL}
                    radius={[4, 4, 0, 0]}
                    maxBarSize={28}
                    animationDuration={500}
                    className="cursor-pointer"
                    onClick={(_, index) => segmentRows[index] && openCustomers({ [activeSegment.filterKey]: segmentRows[index].segment })}
                  />
                  <Bar
                    dataKey="atRisk"
                    name="At risk"
                    fill={fill.high}
                    radius={[4, 4, 0, 0]}
                    maxBarSize={28}
                    animationDuration={500}
                    className="cursor-pointer"
                    onClick={(_, index) => segmentRows[index] && openCustomers({
                      [activeSegment.filterKey]: segmentRows[index].segment,
                      status: 'at-risk',
                    })}
                  >
                    <LabelList dataKey="share" position="top" formatter={(v) => `${v}%`} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <ChartLegend
              items={[
                { label: 'All accounts', color: NEUTRAL_FILL },
                { label: 'At risk (% of group)', color: fill.high },
              ]}
            />
            {/* The bars' keyboard-reachable equivalent, and a visible cue that
                each group opens its customers. */}
            <nav aria-label={`View customers by ${activeSegment.label.toLowerCase()}`} className="mt-3 flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-text-tertiary mr-0.5" aria-hidden="true">View customers:</span>
              {segmentRows.map((s) => (
                <Link
                  key={s.segment}
                  to={customersHref({ [activeSegment.filterKey]: s.segment })}
                  state={backHere}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-border bg-bg-tertiary/50 text-[11px] text-text-secondary hover:text-text-primary hover:border-border-light transition-colors focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-1"
                >
                  {s.segment}
                  <ArrowRight size={10} aria-hidden="true" />
                </Link>
              ))}
            </nav>
            <ChartFigures
              label={metric(activeSegment.metricKey).label}
              items={segmentRows.map(
                (s) => `${s.segment}: ${formatNumber(s.atRisk)} of ${formatNumber(s.total)} accounts at risk (${s.share}%)`
              )}
            />
          </ChartCard>

          <ChartCard
            metricKey="riskByTenure"
            isEmpty={tenureRows.length === 0}
            emptyAction={{ to: '/customers', label: 'View all customers', state: backHere }}
          >
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={tenureRows} margin={{ top: 18, right: 16, left: -12, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="segment" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} width={44} domain={[0, 'auto']} />
                  <Tooltip content={<ChartTooltip valueFormatter={(v) => `${v}%`} />} />
                  <Line
                    dataKey="avgRisk"
                    name="Average churn risk"
                    stroke={NEUTRAL_FILL}
                    strokeWidth={2}
                    animationDuration={500}
                    dot={({ cx, cy, payload }) => (
                      <Dot key={payload.segment} cx={cx} cy={cy} r={5} fill={payload.fill} stroke="var(--color-bg-card)" strokeWidth={2} />
                    )}
                    activeDot={{ r: 7, strokeWidth: 2, stroke: 'var(--color-bg-card)' }}
                  >
                    <LabelList dataKey="avgRisk" position="top" formatter={(v) => `${v}%`} offset={10} />
                  </Line>
                </LineChart>
              </ResponsiveContainer>
            </div>
            <ChartFigures
              label={metric('riskByTenure').label}
              items={tenureRows.map(
                (s) => `${s.segment}: average churn risk ${s.avgRisk}% across ${formatNumber(s.total)} accounts`
              )}
            />
          </ChartCard>
        </div>
      </section>

      {/* 4. Path to the account-level workspace — no customer rows here;
           individual accounts belong on Customers. */}
      <section aria-labelledby="customer-workspace-cta">
        <SectionHeading id="customer-workspace-cta">Customer workspace</SectionHeading>
        <Card className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-medium text-text-primary">
              {atRiskCount > 0
                ? `${formatNumber(atRiskCount)} ${atRiskCount === 1 ? 'customer is' : 'customers are'} at risk of churning`
                : 'No customers are at risk right now'}
            </p>
            <p className="text-xs text-text-tertiary mt-1">
              Open the customer workspace to search, filter and act on individual accounts.
            </p>
          </div>
          <Button
            onClick={() => openCustomers(atRiskCount > 0 ? { status: 'at-risk' } : {})}
            className="shrink-0"
          >
            {atRiskCount > 0 ? `View ${formatNumber(atRiskCount)} at-risk customers` : 'Open customer workspace'}
            <ArrowRight size={14} className="ml-1.5" aria-hidden="true" />
          </Button>
        </Card>
      </section>

      {/* 5. Can these numbers be trusted -- appended below every existing
          graph on this page, computed for whichever dataset is currently
          active, fresh or reopened from history (see
          reopen_dataset_history() / get_dashboard() in dataset_routes.py).
          Always-visible plain-language text, not a hover/click reveal --
          meant to be read, not discovered. */}
      <ReliabilitySection reliability={metrics?.kpis?.reliabilityScore} />
    </div>
  );
}