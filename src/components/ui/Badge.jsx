import React from 'react';
import { cn, getRiskLabel } from '../../utils/helpers';

export default function Badge({ children, variant = 'default', size = 'sm', className }) {
  const variants = {
    default: 'bg-bg-tertiary text-text-secondary border-border',
    accent: 'bg-accent-bg text-accent border-accent/20',
    low: 'bg-risk-low/10 text-risk-low border-risk-low/20',
    medium: 'bg-risk-medium/10 text-risk-medium border-risk-medium/20',
    high: 'bg-risk-high/10 text-risk-high border-risk-high/20',
    critical: 'bg-risk-critical/10 text-risk-critical border-risk-critical/20',
    active: 'bg-status-active/10 text-status-active border-status-active/20',
    dormant: 'bg-status-dormant/10 text-status-dormant border-status-dormant/20',
    churned: 'bg-status-churned/10 text-status-churned border-status-churned/20',
    // Outreach draft states. These use the app's own tokens rather than fixed
    // palette colours so they stay readable in both light and dark themes.
    draft: 'bg-info/10 text-info border-info/20',
    reviewed: 'bg-risk-medium/10 text-risk-medium border-risk-medium/20',
    approved: 'bg-success/10 text-success border-success/20',
    sent: 'bg-accent-bg text-accent border-accent/20',
  };

  const sizes = {
    xs: 'px-1.5 py-0.5 text-[10px]',
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-2.5 py-1 text-xs',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md border font-medium whitespace-nowrap',
        variants[variant] || variants.default,
        sizes[size],
        className
      )}
    >
      {children}
    </span>
  );
}

export function RiskBadge({ tier, size = 'sm', showDot = true }) {
  return (
    <Badge variant={tier} size={size}>
      {/* `currentColor` keeps the dot in step with the badge's own text colour,
          which is themed — a fixed hex would sit wrongly on a light surface. */}
      {showDot && (
        <span className="w-1.5 h-1.5 rounded-full mr-1.5 bg-current" aria-hidden="true" />
      )}
      {getRiskLabel(tier)}
    </Badge>
  );
}

export function StatusBadge({ status, size = 'sm' }) {
  const statusMap = {
    active: 'active',
    'at-risk': 'high',
    dormant: 'dormant',
    churned: 'churned',
  };
  const labels = {
    active: 'Active',
    'at-risk': 'At Risk',
    dormant: 'Dormant',
    churned: 'Churned',
  };

  return (
    <Badge variant={statusMap[status] || 'default'} size={size}>
      {labels[status] || status}
    </Badge>
  );
}
