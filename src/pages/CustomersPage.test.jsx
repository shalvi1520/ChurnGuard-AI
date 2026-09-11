import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useSearchParams } from 'react-router-dom';
import CustomersPage from './CustomersPage';

// The page's only data source. Mocking it keeps this test about the Actions
// column rather than about HTTP.
vi.mock('../services/api', () => ({
  customerService: {
    getCustomers: vi.fn(async () => ({
      customers: [
        {
          id: '7590-VHVEG',
          tenure: 12,
          monthlyCharges: 29.85,
          contractType: 'Month-to-month',
          churnProbability: 84,
          riskTier: 'critical',
          status: 'at-risk',
        },
      ],
      total: 1,
      totalPages: 1,
    })),
  },
}));

/** Stands in for the real destination so the assertion is "we arrived, with
 *  this customer" rather than "a navigate() function was called". */
function Destination({ name }) {
  const [params] = useSearchParams();
  return <div>{`${name}:${params.get('customer')}`}</div>;
}

function renderCustomers() {
  return render(
    <MemoryRouter initialEntries={['/customers']}>
      <Routes>
        <Route path="/customers" element={<CustomersPage />} />
        <Route path="/explainability" element={<Destination name="explainability" />} />
        <Route path="/outreach" element={<Destination name="outreach" />} />
      </Routes>
    </MemoryRouter>
  );
}

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
