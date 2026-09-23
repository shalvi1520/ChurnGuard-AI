import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MarketImpactSection } from './DashboardPage';

// The Market Impact card leads with a conclusion and hides the working. These
// tests are about that split: what a reader sees without clicking anything,
// versus what stays available behind the toggle. The headline and action line
// are asserted against the structured fields they're built from -- if either
// ever starts being derived from `explanation`, these break.
vi.mock('../context/AppContext', () => ({
  useApp: () => ({ resolvedTheme: 'dark' }),
}));

const ESTIMATED_EXPLANATION = [
  'Your churn rate is currently 20.0% (10 of 50 customers).',
  "You didn't include a revenue field in this upload, so we've estimated the financial impact using a "
    + 'general cross-industry average of $850 per customer per year: roughly $9K per year at risk. This is '
    + 'an estimate, not your actual numbers. Connecting billing data gives a more precise figure.',
  'For context, a typical churn rate across industries is around 20-30% annually (a general reference '
    + 'figure, not live market data).',
].join('\n\n');

const REAL_EXPLANATION = [
  'Your churn rate is currently 33.0% (99 of 300 customers).',
  "If this continues unchanged, you're on track to lose approximately $137K in annual revenue from these "
    + 'customers alone.',
].join('\n\n');

/** Mirrors the backend payload shape (generic/metrics_agent.py). */
function marketImpact(overrides = {}) {
  return {
    churnRatePct: 33.0,
    atRiskCount: 99,
    totalCustomers: 3000,
    severity: 'High',
    isEstimated: false,
    hasRevenueData: true,
    projectedAnnualLoss: 137400,
    vsBenchmarkRatio: 1.32,
    benchmarkIndustry: 'telecom',
    benchmarkUsed: '20-30%',
    benchmarkLow: 20,
    benchmarkHigh: 30,
    benchmarkIsGeneric: false,
    explanation: REAL_EXPLANATION,
    ...overrides,
  };
}

const renderCard = (overrides) => render(<MarketImpactSection marketImpact={marketImpact(overrides)} />);

/** Everything the reader sees before opening the toggle. */
const visibleText = () => screen.getByRole('region', { name: /market impact/i }).textContent;

describe('Market impact card — headline and action line', () => {
  it('leads with the level and the money at stake', () => {
    renderCard();
    expect(screen.getByText('High risk — about $137K/year at stake')).toBeInTheDocument();
  });

  it.each([
    ['Low', 'Keep monitoring. No urgent action needed.'],
    ['Moderate', 'Review high-risk accounts this month.'],
    ['High', 'Act on high-risk accounts now.'],
  ])('gives %s impact its own action line', (severity, expected) => {
    renderCard({ severity });
    expect(screen.getByText(`${severity} risk — about $137K/year at stake`)).toBeInTheDocument();
    expect(screen.getByText(expected)).toBeInTheDocument();
  });

  it('treats Critical as an act-now case, not a fourth instruction', () => {
    renderCard({ severity: 'Critical' });
    expect(screen.getByText('Act on high-risk accounts now.')).toBeInTheDocument();
  });

  it('drops the money clause rather than inventing one when there is no figure', () => {
    renderCard({ projectedAnnualLoss: null, severity: 'Low' });
    expect(screen.getByText('Low risk')).toBeInTheDocument();
    expect(visibleText()).not.toContain('at stake');
  });
});

describe('Market impact card — stat tiles', () => {
  it('shows the churned count against the total, with thousands separators', () => {
    renderCard();
    expect(screen.getByText('99 of 3,000')).toBeInTheDocument();
  });

  it('names the benchmark range rather than a bare multiple', () => {
    renderCard();
    expect(screen.getByText('1.3x')).toBeInTheDocument();
    expect(screen.getByText('typical: 20–30%')).toBeInTheDocument();
  });

  it('falls back to the pre-formatted range for metrics saved before the numeric fields existed', () => {
    renderCard({ benchmarkLow: undefined, benchmarkHigh: undefined });
    expect(screen.getByText('typical: 20-30%')).toBeInTheDocument();
  });
});

describe('Market impact card — estimated revenue', () => {
  const estimated = {
    isEstimated: true,
    hasRevenueData: false,
    projectedAnnualLoss: 8500,
    explanation: ESTIMATED_EXPLANATION,
  };

  it('marks the tile and adds one muted line explaining the basis', () => {
    renderCard(estimated);
    expect(screen.getByText('estimated')).toBeInTheDocument();
    expect(screen.getByText('Estimated based on average customer value.')).toBeInTheDocument();
  });

  it('points at billing data through the info tooltip', () => {
    renderCard(estimated);
    fireEvent.focus(screen.getByRole('button', { name: /about this figure/i }));
    expect(screen.getByRole('tooltip')).toHaveTextContent('Connect billing data for a more precise figure.');
  });
});

describe('Market impact card — real revenue', () => {
  it('says nothing about estimates, and keeps the info icon without tooltip text', () => {
    renderCard();
    expect(visibleText()).not.toMatch(/estimated/i);
    expect(screen.queryByText('Estimated based on average customer value.')).not.toBeInTheDocument();

    const info = screen.getByRole('button', { name: /about this figure/i });
    expect(info).toBeInTheDocument();
    fireEvent.focus(info);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });
});

describe('Market impact card — how it is calculated', () => {
  it('is closed by default and opens on click', () => {
    renderCard();
    const toggle = screen.getByRole('button', { name: /how is this calculated/i });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText(/on track to lose approximately/i)).not.toBeInTheDocument();

    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(/on track to lose approximately/i)).toBeInTheDocument();
  });

  it('keeps every paragraph of the explanation, none dropped', () => {
    renderCard(  { isEstimated: true, hasRevenueData: false, projectedAnnualLoss: 8500, explanation: ESTIMATED_EXPLANATION });
    fireEvent.click(screen.getByRole('button', { name: /how is this calculated/i }));
    ESTIMATED_EXPLANATION.split('\n\n').forEach((paragraph) => {
      expect(screen.getByText(paragraph)).toBeInTheDocument();
    });
  });
});

describe('Market impact card — copy rules', () => {
  it.each([
    ['real revenue', {}],
    ['estimated revenue', {
      isEstimated: true, hasRevenueData: false, projectedAnnualLoss: 8500, explanation: ESTIMATED_EXPLANATION,
    }],
  ])('never tells the user to upload a revenue column while collapsed (%s)', (_label, overrides) => {
    renderCard(overrides);
    const text = visibleText();
    expect(text).not.toMatch(/upload/i);
    expect(text).not.toMatch(/revenue column/i);
  });

  it('uses no double hyphens anywhere on the card, open or closed', () => {
    renderCard();
    expect(visibleText()).not.toContain('--');
    fireEvent.click(screen.getByRole('button', { name: /how is this calculated/i }));
    expect(visibleText()).not.toContain('--');
  });

  it('still renders the reprocess notice when the section is unavailable', () => {
    render(<MarketImpactSection marketImpact={{ unavailable: true }} />);
    const region = screen.getByRole('region', { name: /market impact/i });
    expect(within(region).getByText(/wasn’t available/i)).toBeInTheDocument();
  });
});
