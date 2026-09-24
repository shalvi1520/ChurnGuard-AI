import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import CompleteStep from './CompleteStep';

// The connected-dataset view has two audiences at once: someone who only needs
// to know the data is ready, and someone who wants to see exactly what was done
// to their file. These tests pin that split — the summary is always visible,
// the processing detail is behind one control, and nothing is lost by being
// collapsed.

const summary = {
  filename: 'accounts.csv',
  rows: 298,
  datasetRows: 302,
  columns: 21,
  fieldsMapped: 5,
  requiredTotal: 5,
  optionalDetected: 2,
  optionalTotal: 3,
  missingCells: 11,
  duplicateRows: 2,
  labelledChurnCount: 80,
  mappedColumns: [
    { key: 'customerId', label: 'Customer ID', column: 'customerID', required: true, matchedBy: 'auto' },
    { key: 'tenure', label: 'Tenure', column: 'tenure_months', required: true, matchedBy: 'ai' },
    { key: 'totalCharges', label: 'Total charges', column: 'TotalCharges', required: false, matchedBy: 'auto' },
  ],
  extraColumnsUsed: ['SupportCalls'],
  extraColumnsSkipped: [
    { column: 'agent_name', reason: "this looks like a person's name, not a predictive feature" },
    { column: 'rep_name', reason: "this looks like a person's name, not a predictive feature" },
    { column: 'updated_at', reason: 'a date/time column, not used as a feature in this version' },
  ],
  cleaning: [{ action: 'fill_missing', detail: 'Filled 11 blank values with each column’s median.' }],
  source: { kind: 'upload' },
};

const renderStep = (overrides = {}) =>
  render(<CompleteStep summary={{ ...summary, ...overrides }} onViewOverview={() => {}} onViewCustomers={() => {}} />);

describe('Connected dataset — the summary everyone sees', () => {
  it('states the measured facts without anything being expanded', () => {
    renderStep();

    expect(screen.getByText('Dataset summary')).toBeInTheDocument();
    // Rows in the file, and customers that survived cleaning, are different
    // numbers and both are shown.
    expect(screen.getByText('302')).toBeInTheDocument();
    expect(screen.getByText('298')).toBeInTheDocument();
    expect(screen.getByText('Blank values')).toBeInTheDocument();
    expect(screen.getByText('Duplicate rows')).toBeInTheDocument();
    expect(screen.getByText('Past churn examples')).toBeInTheDocument();
  });

  it('answers "what happened to my data" in counts, before any detail is opened', () => {
    renderStep();

    expect(screen.getByText('Required fields matched')).toBeInTheDocument();
    expect(screen.getByText('5 of 5')).toBeInTheDocument();
    expect(screen.getByText('Optional fields found')).toBeInTheDocument();
    expect(screen.getByText('2 of 3')).toBeInTheDocument();
    expect(screen.getByText('Columns left out')).toBeInTheDocument();
    expect(screen.getByText('3 columns')).toBeInTheDocument();
  });
});

describe('Connected dataset — processing details', () => {
  it('keeps the detail collapsed until asked for', () => {
    renderStep();

    const toggle = screen.getByRole('button', { name: /view processing details/i });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('customerID')).not.toBeInTheDocument();
    expect(screen.queryByText(/Filled 11 blank values/)).not.toBeInTheDocument();
    expect(screen.queryByText(/agent_name/)).not.toBeInTheDocument();
  });

  it('shows the full field mapping, the excluded columns and the cleaning once expanded', () => {
    renderStep();
    const toggle = screen.getByRole('button', { name: /view processing details/i });
    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    // Which of the user's columns filled which ChurnGuard field.
    expect(screen.getByText('customerID')).toBeInTheDocument();
    expect(screen.getByText('tenure_months')).toBeInTheDocument();
    expect(screen.getByText('AI-matched')).toBeInTheDocument();

    // Extra columns, and the ones left out -- grouped so a shared reason is
    // stated once rather than once per column.
    expect(screen.getByText(/SupportCalls/)).toBeInTheDocument();
    expect(screen.getAllByText(/this looks like a person's name/i)).toHaveLength(1);
    expect(screen.getByText(/agent_name, rep_name/)).toBeInTheDocument();

    // And the automatic cleaning.
    expect(screen.getByText(/Filled 11 blank values/)).toBeInTheDocument();
  });

  it('offers no details control for a dataset that has none to show', () => {
    render(
      <CompleteStep
        summary={{ filename: 'bare.csv', rows: 10, columns: 3 }}
        onViewOverview={() => {}}
        onViewCustomers={() => {}}
      />
    );

    expect(screen.queryByRole('button', { name: /processing details/i })).not.toBeInTheDocument();
  });
});
