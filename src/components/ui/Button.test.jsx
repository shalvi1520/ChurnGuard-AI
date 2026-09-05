import React from 'react';
import { render, screen } from '@testing-library/react';
import Button from './Button';
import { describe, it, expect } from 'vitest';
import { Mail } from 'lucide-react';

describe('Button Component', () => {
  it('renders correctly with default props', () => {
    render(<Button>Click Me</Button>);
    const button = screen.getByRole('button', { name: /click me/i });
    expect(button).toBeInTheDocument();
    expect(button).toHaveClass('bg-accent'); // default variant
  });

  it('renders different variants', () => {
    render(<Button variant="danger">Delete</Button>);
    const button = screen.getByRole('button', { name: /delete/i });
    expect(button).toHaveClass('bg-risk-critical/10');
  });

  it('shows loading state and disables button', () => {
    render(<Button loading>Submit</Button>);
    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
    expect(document.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('renders an icon when provided', () => {
    render(<Button icon={Mail}>Send</Button>);
    expect(document.querySelector('.lucide-mail')).toBeInTheDocument();
  });
});
