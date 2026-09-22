import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// The connector list comes from the backend, which still serves the HTTP
// endpoint connector. This screen is expected to filter it out without the
// backend changing, so the mock deliberately returns both.
vi.mock('../../services/api', () => ({
  connectorService: {
    listConnectors: vi.fn(() =>
      Promise.resolve({
        connectors: [
          { id: 'hubspot', label: 'HubSpot', description: 'Import from HubSpot.', status: 'available' },
          {
            id: 'http_endpoint',
            label: 'HTTP endpoint (CSV or JSON)',
            description: 'Pull records from any URL.',
            status: 'available',
          },
        ],
        defaultLimit: 5000,
        maxLimit: 20000,
      })
    ),
  },
}));

import CrmConnectStep from './CrmConnectStep';

describe('CrmConnectStep provider list', () => {
  beforeEach(() => vi.clearAllMocks());

  it('offers HubSpot but not the HTTP endpoint connector', async () => {
    render(<CrmConnectStep onBack={() => {}} onImported={() => {}} />);

    expect(await screen.findByText('HubSpot')).toBeInTheDocument();

    // Neither the card, nor its description, nor a second "Available" badge.
    expect(screen.queryByText('HTTP endpoint (CSV or JSON)')).not.toBeInTheDocument();
    expect(screen.queryByText('Pull records from any URL.')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByText('Available')).toHaveLength(1));
  });

  it('drops the two-column grid when only one connector remains', async () => {
    const { container } = render(<CrmConnectStep onBack={() => {}} onImported={() => {}} />);
    await screen.findByText('HubSpot');

    const grid = container.querySelector('div.grid');
    expect(grid).toBeTruthy();
    // A 2-col grid with one card is exactly the half-width gap this avoids.
    expect(grid.className).not.toMatch(/sm:grid-cols-2/);
  });
});
