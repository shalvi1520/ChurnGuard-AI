import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import DashboardPage from './DashboardPage';

// Portfolio & Risk is an analysis page whose job here is to hand the user off
// to the right set of accounts. These tests are about those destinations, not
// about the charts: Recharts renders into a 0x0 container under jsdom, so the
// drill-downs asserted below are deliberately the ones that exist as real
// links outside the SVG -- which is also what makes them keyboard-reachable.
vi.mock('../services/api', () => ({
  dashboardService: {
    getMetrics: vi.fn(async () => ({
      kpis: { totalCustomers: { value: 300 }, customersAtRisk: { value: 53 } },
      dataset: { source: { kind: 'upload' }, filename: 'accounts.csv' },
    })),
    getRiskDistribution: vi.fn(async () => ([
      { name: 'Low Risk', value: 200, color: '#4ADE80' },
      { name: 'Medium Risk', value: 47, color: '#FBBF24' },
      { name: 'High Risk', value: 33, color: '#F97316' },
      { name: 'Critical', value: 20, color: '#EF4444' },
    ])),
    getTopDrivers: vi.fn(async () => ([{ driver: 'Contract type', impact: 0.21, direction: 'positive' }])),
    getSegmentation: vi.fn(async () => ({
      byPlan: [
        { segment: 'Month-to-month', total: 100, atRisk: 40, avgRisk: 55 },
        { segment: 'Two year', total: 80, atRisk: 4, avgRisk: 18 },
      ],
      byTenure: [{ segment: '0-6 months', total: 40, atRisk: 20, avgRisk: 61 }],
      byServiceTier: [],
    })),
  },
}));

vi.mock('../context/AppContext', () => ({
  useApp: () => ({ resolvedTheme: 'dark' }),
}));

const renderDashboard = () => render(<MemoryRouter><DashboardPage /></MemoryRouter>);

describe('Portfolio & Risk — drill-downs into Customers', () => {
  it('opens at-risk customers from the Customers at Risk KPI', async () => {
    renderDashboard();
    const link = await screen.findByRole('link', { name: /view at-risk customers/i });
    expect(link).toHaveAttribute('href', '/customers?status=at-risk');
  });

  it('opens each risk tier from the distribution legend', async () => {
    renderDashboard();
    expect(await screen.findByRole('link', { name: /critical/i })).toHaveAttribute('href', '/customers?risk=critical');
    expect(screen.getByRole('link', { name: /high risk/i })).toHaveAttribute('href', '/customers?risk=high');
    expect(screen.getByRole('link', { name: /low risk/i })).toHaveAttribute('href', '/customers?risk=low');
  });

  it('opens a contract segment from the concentration chart', async () => {
    renderDashboard();
    const segments = await screen.findByRole('navigation', { name: /view customers by contract/i });
    expect(screen.getByRole('link', { name: /month-to-month/i })).toHaveAttribute(
      'href', '/customers?contract=Month-to-month'
    );
    expect(segments).toHaveTextContent('Two year');
  });

  it('sends the churn-driver chart to one account, not to a customer filter', async () => {
    renderDashboard();
    // A driver is a factor, not a group of accounts -- it must not pretend to be one.
    const link = await screen.findByRole('link', { name: /drivers for the highest-risk account/i });
    expect(link).toHaveAttribute('href', '/explainability');
  });

  it('names the count in the closing call to action', async () => {
    renderDashboard();
    expect(await screen.findByRole('button', { name: /view 53 at-risk customers/i })).toBeInTheDocument();
  });
});
