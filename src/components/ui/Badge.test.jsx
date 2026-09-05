import React from 'react';
import { render, screen } from '@testing-library/react';
import Badge from './Badge';
import { describe, it, expect } from 'vitest';

describe('Badge Component', () => {
  it('renders children correctly', () => {
    render(<Badge>Active</Badge>);
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('applies the correct variant styles', () => {
    const { container } = render(<Badge variant="critical">Danger</Badge>);
    const badge = container.firstChild;
    expect(badge).toHaveClass('bg-risk-critical/10');
    expect(badge).toHaveClass('text-risk-critical');
  });
});
