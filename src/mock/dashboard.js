// ============================================
// ChurnGuard – Mock Dashboard & Analytics Data
// ============================================
//
// The headline KPIs are DERIVED from the series below rather than typed out
// separately, so the numbers on a KPI card and the chart underneath it always
// agree. Previously they didn't: "Customers at Risk" read 1,284 while the risk
// donut summed to 2,847 across four tiers, and "Revenue at Risk" read $4.28M
// while the trend chart's latest month said $2.04M.

// Single source of truth for how the customer base splits by risk tier.
// Tier cut-offs match getRiskTier() in utils/helpers.js.
const riskCounts = { low: 1205, medium: 658, high: 642, critical: 342 };

const totalCustomers = Object.values(riskCounts).reduce((a, b) => a + b, 0);
// "At risk" means High or Critical — the same 60%+ threshold the app uses
// everywhere else, and what the Customers page filters on.
const customersAtRisk = riskCounts.high + riskCounts.critical;

export const mockChurnTrend = [
  { month: 'Jan', churnRate: 4.2, predicted: 4.5, customers: 2580 },
  { month: 'Feb', churnRate: 3.8, predicted: 4.1, customers: 2620 },
  { month: 'Mar', churnRate: 5.1, predicted: 4.8, customers: 2650 },
  { month: 'Apr', churnRate: 4.6, predicted: 5.2, customers: 2690 },
  { month: 'May', churnRate: 5.8, predicted: 5.5, customers: 2710 },
  { month: 'Jun', churnRate: 6.2, predicted: 6.0, customers: 2740 },
  { month: 'Jul', churnRate: 7.1, predicted: 6.8, customers: 2790 },
  { month: 'Aug', churnRate: 8.7, predicted: 8.2, customers: totalCustomers },
];

export const mockRevenueAtRisk = [
  { month: 'Jan', revenue: 2100000, atRisk: 520000 },
  { month: 'Feb', revenue: 2200000, atRisk: 580000 },
  { month: 'Mar', revenue: 2350000, atRisk: 720000 },
  { month: 'Apr', revenue: 2500000, atRisk: 850000 },
  { month: 'May', revenue: 2650000, atRisk: 1100000 },
  { month: 'Jun', revenue: 2800000, atRisk: 1350000 },
  { month: 'Jul', revenue: 2950000, atRisk: 1680000 },
  { month: 'Aug', revenue: 3100000, atRisk: 2040000 },
];

// Month-over-month change, rounded to one decimal.
const pctChange = (series) => {
  const [prev, last] = series.slice(-2);
  return Math.round(((last - prev) / prev) * 1000) / 10;
};

const customerSeries = mockChurnTrend.map((m) => m.customers);
const atRiskSeries = [690, 726, 758, 790, 815, 838, 858, customersAtRisk];
const revenueAtRiskSeries = mockRevenueAtRisk.map((m) => m.atRisk);
const retentionSeries = mockChurnTrend.map((m) => Math.round((100 - m.churnRate) * 10) / 10);
const avgRiskSeries = [38, 37.5, 36.8, 36.2, 35.8, 35.1, 34.8, 34.2];

const trendOf = (change) => (change > 0 ? 'up' : 'down');

export const mockDashboardKPIs = {
  totalCustomers: {
    value: totalCustomers,
    change: pctChange(customerSeries),
    trend: trendOf(pctChange(customerSeries)),
  },
  customersAtRisk: {
    value: customersAtRisk,
    change: pctChange(atRiskSeries),
    trend: trendOf(pctChange(atRiskSeries)),
  },
  avgChurnRisk: {
    value: avgRiskSeries[avgRiskSeries.length - 1],
    change: pctChange(avgRiskSeries),
    trend: trendOf(pctChange(avgRiskSeries)),
  },
  retentionRate: {
    value: retentionSeries[retentionSeries.length - 1],
    change: pctChange(retentionSeries),
    trend: trendOf(pctChange(retentionSeries)),
  },
  revenueAtRisk: {
    value: revenueAtRiskSeries[revenueAtRiskSeries.length - 1],
    change: pctChange(revenueAtRiskSeries),
    trend: trendOf(pctChange(revenueAtRiskSeries)),
  },
};

export const mockSparklines = {
  totalCustomers: customerSeries,
  customersAtRisk: atRiskSeries,
  avgChurnRisk: avgRiskSeries,
  retentionRate: retentionSeries,
  revenueAtRisk: revenueAtRiskSeries,
};

export const mockRiskDistribution = [
  { name: 'Low Risk', value: riskCounts.low, color: '#4ADE80' },
  { name: 'Medium Risk', value: riskCounts.medium, color: '#FBBF24' },
  { name: 'High Risk', value: riskCounts.high, color: '#F97316' },
  { name: 'Critical', value: riskCounts.critical, color: '#EF4444' },
];

export const mockTopChurnDrivers = [
  { driver: 'Feature Usage Decline', impact: 0.31, direction: 'positive', customers: 842 },
  { driver: 'Login Frequency Drop', impact: 0.24, direction: 'positive', customers: 721 },
  { driver: 'Support Ticket Volume', impact: 0.18, direction: 'positive', customers: 534 },
  { driver: 'Engagement Score Drop', impact: 0.13, direction: 'positive', customers: 456 },
  { driver: 'Short Tenure', impact: 0.09, direction: 'positive', customers: 389 },
  { driver: 'Monthly Contract', impact: 0.07, direction: 'positive', customers: 312 },
  { driver: 'Low Subscription Value', impact: 0.05, direction: 'positive', customers: 267 },
  { driver: 'High NPS Score', impact: -0.12, direction: 'negative', customers: 1420 },
  { driver: 'Long Tenure', impact: -0.08, direction: 'negative', customers: 980 },
  { driver: 'Annual Contract', impact: -0.06, direction: 'negative', customers: 1540 },
];

export const mockSegmentation = {
  byPlan: [
    { segment: 'Starter', total: 680, atRisk: 340, avgRisk: 48.2 },
    { segment: 'Professional', total: 1120, atRisk: 520, avgRisk: 36.8 },
    { segment: 'Enterprise', total: 1047, atRisk: 424, avgRisk: 24.1 },
  ],
  byTenure: [
    { segment: '0-6 months', total: 420, atRisk: 252, avgRisk: 54.3 },
    { segment: '6-12 months', total: 560, atRisk: 268, avgRisk: 41.2 },
    { segment: '1-2 years', total: 890, atRisk: 356, avgRisk: 32.8 },
    { segment: '2-3 years', total: 580, atRisk: 174, avgRisk: 22.4 },
    { segment: '3+ years', total: 397, atRisk: 79, avgRisk: 14.6 },
  ],
  byRegion: [
    { segment: 'North America', total: 1280, atRisk: 512, avgRisk: 31.2 },
    { segment: 'Europe', total: 720, atRisk: 324, avgRisk: 35.8 },
    { segment: 'Asia Pacific', total: 480, atRisk: 240, avgRisk: 38.4 },
    { segment: 'Latin America', total: 210, atRisk: 115, avgRisk: 42.1 },
    { segment: 'Middle East & Africa', total: 157, atRisk: 93, avgRisk: 44.7 },
  ],
};

export const mockAnalyticsChurnByContract = [
  { type: 'Monthly', churnRate: 12.4, count: 820 },
  { type: 'Annual', churnRate: 4.2, count: 1680 },
  { type: 'Multi-Year', churnRate: 1.8, count: 347 },
];

export const mockAnalyticsChurnByIndustry = [
  { industry: 'Technology', churnRate: 6.8, count: 580 },
  { industry: 'Healthcare', churnRate: 8.2, count: 420 },
  { industry: 'Financial Services', churnRate: 4.1, count: 510 },
  { industry: 'Retail', churnRate: 9.5, count: 380 },
  { industry: 'Manufacturing', churnRate: 5.4, count: 290 },
  { industry: 'Education', churnRate: 11.2, count: 250 },
  { industry: 'Media', churnRate: 10.8, count: 210 },
  { industry: 'Energy', churnRate: 6.2, count: 207 },
];
