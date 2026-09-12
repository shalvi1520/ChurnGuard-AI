import { describe, it, expect, vi, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation, useNavigationType, useSearchParams } from 'react-router-dom';
import CustomersPage from './CustomersPage';
import CustomerDetailPage from './CustomerDetailPage';
import { customerService } from '../services/api';

const CUSTOMER = vi.hoisted(() => ({
  id: '7590-VHVEG',
  tenure: 12,
  monthlyCharges: 29.85,
  totalCharges: 358.2,
  contractType: 'Month-to-month',
  serviceTier: null,
  paymentMethod: null,
  churnProbability: 84,
  riskTier: 'critical',
  status: 'at-risk',
  revenueAtRisk: 300,
  churned: false,
}));

// The page's data sources. Mocking them keeps these tests about the page
// rather than about HTTP. `getMetrics` is only read for which optional
// columns this dataset supports.
vi.mock('../services/api', () => ({
  customerService: {
    getCustomers: vi.fn(async () => ({ customers: [CUSTOMER], total: 1, totalPages: 1 })),
    getCustomer: vi.fn(async () => CUSTOMER),
  },
  dashboardService: {
    getMetrics: vi.fn(async () => ({ dataset: { available: { revenue: true } } })),
  },
  explainabilityService: {
    getSHAPExplanation: vi.fn(async () => ({
      customerId: CUSTOMER.id, churnProbability: 84, baselineRisk: 26, features: [],
    })),
  },
}));

/** Stands in for the real destination so the assertion is "we arrived, with
 *  this customer" rather than "a navigate() function was called". */
function Destination({ name }) {
  const [params] = useSearchParams();
  return <div>{`${name}:${params.get('customer')}`}</div>;
}

/** The current URL and how we got to it, so a test can tell a real history
 *  pop apart from a fresh push to the same address. */
function Probe() {
  const location = useLocation();
  return <div data-testid="probe">{`${location.pathname}${location.search} ${useNavigationType()}`}</div>;
}

const probe = () => screen.getByTestId('probe').textContent;

function renderCustomers(entry = '/customers') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Probe />
      <Routes>
        <Route path="/customers" element={<CustomersPage />} />
        <Route path="/customers/:id" element={<CustomerDetailPage />} />
        <Route path="/explainability" element={<Destination name="explainability" />} />
        <Route path="/outreach" element={<Destination name="outreach" />} />
        <Route path="/dashboard" element={<div>Portfolio and risk</div>} />
      </Routes>
    </MemoryRouter>
  );
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('Customers — account actions', () => {
  it('offers both actions per row, labelled for screen readers', async () => {
    renderCustomers();

    expect(
      await screen.findByRole('button', { name: /view explainability for 7590-VHVEG/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /create outreach for 7590-VHVEG/i })
    ).toBeInTheDocument();
  });

  it('opens explainability for that customer', async () => {
    renderCustomers();

    fireEvent.click(
      await screen.findByRole('button', { name: /view explainability for 7590-VHVEG/i })
    );

    await waitFor(() =>
      expect(screen.getByText('explainability:7590-VHVEG')).toBeInTheDocument()
    );
  });

  it('opens outreach for that customer', async () => {
    renderCustomers();

    fireEvent.click(
      await screen.findByRole('button', { name: /create outreach for 7590-VHVEG/i })
    );

    await waitFor(() => expect(screen.getByText('outreach:7590-VHVEG')).toBeInTheDocument());
  });

  it('shows the risk tier as text, not colour alone', async () => {
    renderCustomers();
    expect(await screen.findByText(/critical risk/i)).toBeInTheDocument();
  });
});

describe('Customers — filters live in the URL', () => {
  it('opens filtered to at-risk accounts when linked from Portfolio & Risk', async () => {
    renderCustomers('/customers?status=at-risk');

    expect(await screen.findByRole('button', { name: /status: at risk/i })).toBeInTheDocument();
    await waitFor(() =>
      expect(customerService.getCustomers).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'at-risk' })
      )
    );
  });

  it('applies a segment drill-down from the contract chart', async () => {
    renderCustomers('/customers?contract=Month-to-month&status=at-risk');

    expect(await screen.findByRole('button', { name: /contract: month-to-month/i })).toBeInTheDocument();
    await waitFor(() =>
      expect(customerService.getCustomers).toHaveBeenCalledWith(
        expect.objectContaining({ contract: 'Month-to-month', status: 'at-risk' })
      )
    );
  });

  it('writes a filter change to the URL without stacking history entries', async () => {
    renderCustomers();
    await screen.findByRole('button', { name: /view explainability for 7590-VHVEG/i });

    fireEvent.change(screen.getByLabelText('Risk tier'), { target: { value: 'critical' } });

    // REPLACE, not PUSH: Back should leave Customers, not walk back through
    // every filter the user tried.
    await waitFor(() => expect(probe()).toBe('/customers?risk=critical REPLACE'));
    expect(await screen.findByRole('button', { name: /risk tier: critical/i })).toBeInTheDocument();
  });

  it('ignores a risk tier the URL made up', async () => {
    renderCustomers('/customers?risk=not-a-tier');

    await waitFor(() =>
      expect(customerService.getCustomers).toHaveBeenCalledWith(expect.objectContaining({ risk: 'all' }))
    );
    expect(screen.queryByRole('button', { name: /risk tier:/i })).not.toBeInTheDocument();
  });
});

describe('Customers — drilling into an account and back', () => {
  it('returns to the filtered list it was opened from, through history', async () => {
    renderCustomers('/customers?risk=critical');

    fireEvent.click(await screen.findByRole('link', { name: '7590-VHVEG' }));

    // Customer Detail says where it came from, by name.
    const back = await screen.findByRole('link', { name: /back to customers/i });
    expect(probe()).toBe('/customers/7590-VHVEG PUSH');

    fireEvent.click(back);

    // A real history pop, so Forward still works -- and the filter survived.
    await waitFor(() => expect(probe()).toBe('/customers?risk=critical POP'));
    expect(await screen.findByRole('button', { name: /risk tier: critical/i })).toBeInTheDocument();
  });

  it('offers the workflow position as breadcrumbs', async () => {
    renderCustomers('/customers?risk=critical');
    fireEvent.click(await screen.findByRole('link', { name: '7590-VHVEG' }));

    const crumbs = await screen.findByRole('navigation', { name: /breadcrumb/i });
    expect(crumbs).toHaveTextContent('Portfolio & Risk');
    expect(crumbs).toHaveTextContent('Customers');
    // The current page is stated, not linked.
    expect(screen.getByText('7590-VHVEG', { selector: '[aria-current="page"]' })).toBeInTheDocument();
  });
});
