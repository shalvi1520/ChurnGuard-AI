import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ExecutiveOverviewPage from './ExecutiveOverviewPage';

// The Executive View is a one-page read for someone who will not scroll
// through the rest of the app. These tests cover what has to be on it --
// the KPI row, the accounts to act on, and the clearly-labelled estimate --
// not the charts, which Recharts renders into a 0x0 container under jsdom.

vi.mock('../services/api', () => ({
  dashboardService: {
    getMetrics: vi.fn(async () => ({
      kpis: {
        totalCustomers: { value: 300 },
        customersAtRisk: { value: 53 },
        revenueAtRisk: { value: 120000 },
      },
      dataset: { available: { revenue: true } },
    })),
    getRiskDistribution: vi.fn(async () => ([
      { name: 'Low Risk', value: 200, color: '#4ADE80' },
      { name: 'Critical', value: 100, color: '#EF4444' },
    ])),
    getTopDrivers: vi.fn(async () => ([
      { driver: 'Contract type', impact: 0.21, direction: 'positive' },
    ])),
  },
  customerService: {
    getCustomers: vi.fn(async () => ({
      customers: [
        { id: 'CUST-1001', churnProbability: 91, riskTier: 'critical', revenueAtRisk: 14400, contractType: 'Month-to-month' },
      ],
    })),
  },
}));

vi.mock('../context/AppContext', () => ({
  useApp: () => ({ resolvedTheme: 'dark' }),
}));

const renderPage = () => render(<MemoryRouter><ExecutiveOverviewPage /></MemoryRouter>);

describe('Executive View', () => {
  it('leads with the portfolio KPIs, described the same way as everywhere else', async () => {
    renderPage();

    expect(await screen.findByText('Total Customers')).toBeInTheDocument();
    expect(screen.getByText('Customers at Risk')).toBeInTheDocument();
    expect(screen.getByText('Revenue at Risk')).toBeInTheDocument();
    // Glossary-driven supporting text, not this page's own copy.
    expect(screen.getByText('Accounts currently monitored')).toBeInTheDocument();
  });

  it('names the accounts to work first', async () => {
    renderPage();

    expect(await screen.findByText('Accounts to act on first')).toBeInTheDocument();
    expect(screen.getByText('CUST-1001')).toBeInTheDocument();
    expect(screen.getByText('91%')).toBeInTheDocument();
  });

  it('keeps the retention figure labelled as an estimate the viewer sets', async () => {
    renderPage();

    expect(await screen.findByText('What acting on this could be worth')).toBeInTheDocument();
    const slider = screen.getByRole('slider', { name: /assumed save rate/i });
    expect(slider).toHaveValue('30');
  });
});
