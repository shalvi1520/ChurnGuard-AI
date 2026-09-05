import { clsx } from 'clsx';

/**
 * Merge class names with clsx
 */
export function cn(...inputs) {
  return clsx(inputs);
}

/**
 * Format number with commas
 */
export function formatNumber(num) {
  if (num === null || num === undefined) return '—';
  return new Intl.NumberFormat('en-US').format(num);
}

/**
 * Format currency
 */
export function formatCurrency(amount, currency = 'USD') {
  if (amount === null || amount === undefined) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Format percentage
 */
export function formatPercent(value, decimals = 1) {
  if (value === null || value === undefined) return '—';
  return `${Number(value).toFixed(decimals)}%`;
}

/**
 * Get risk tier from probability
 */
export function getRiskTier(probability) {
  if (probability >= 80) return 'critical';
  if (probability >= 60) return 'high';
  if (probability >= 35) return 'medium';
  return 'low';
}

/**
 * Get risk color by tier
 */
export function getRiskColor(tier) {
  const colors = {
    low: '#4ADE80',
    medium: '#FBBF24',
    high: '#F97316',
    critical: '#EF4444',
  };
  return colors[tier] || colors.low;
}

/**
 * Get risk label
 */
export function getRiskLabel(tier) {
  const labels = {
    low: 'Low Risk',
    medium: 'Medium Risk',
    high: 'High Risk',
    critical: 'Critical Risk',
  };
  return labels[tier] || 'Unknown';
}

/**
 * Get status color
 */
export function getStatusColor(status) {
  const colors = {
    active: '#4ADE80',
    'at-risk': '#F97316',
    dormant: '#9BA3B8',
    churned: '#EF4444',
  };
  return colors[status] || '#9BA3B8';
}

/**
 * Generate initials from name
 */
export function getInitials(name) {
  if (!name) return '?';
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

/**
 * Truncate text
 */
export function truncate(str, length = 50) {
  if (!str) return '';
  return str.length > length ? `${str.slice(0, length)}...` : str;
}

/**
 * Delay utility
 */
export function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Format date relative
 */
export function formatRelativeDate(date) {
  const now = new Date();
  const d = new Date(date);
  const diffMs = now - d;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Format date
 */
export function formatDate(date) {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Generate a random ID
 */
export function generateId() {
  return `CUST-${Math.floor(1000 + Math.random() * 9000)}`;
}

/**
 * Debounce function
 */
export function debounce(fn, ms = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}
