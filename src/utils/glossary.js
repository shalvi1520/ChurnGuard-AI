// ============================================
// ChurnGuard – Metric glossary
// ============================================
//
// One definition per metric, shared by every page that shows it (Overview,
// Analytics, Customers, Customer Detail, Executive View). Explaining the same
// number differently on two pages is exactly the redundancy this file exists to
// prevent — if a metric needs describing, add it here and import it.
//
// `label`       – the visible name
// `description` – the short line shown under the value (visible, not hover-only)
// `help`        – the extra detail behind the info icon; one or two sentences
//
// Everything here must match the actual implementation. Risk-tier cut-offs come
// from `getRiskTier()` in utils/helpers.js; the demo-data caveats are real.

export const METRICS = {
  // ---------- Portfolio KPIs (mock/dashboard.js) ----------
  totalCustomers: {
    label: 'Total Customers',
    description: 'Accounts currently monitored',
    help: 'Every customer in the connected dataset, regardless of risk level.',
  },
  customersAtRisk: {
    label: 'Customers at Risk',
    description: 'High or critical churn risk',
    help: 'Accounts with a churn probability of 60% or above. These are the ones worth acting on first.',
  },
  avgChurnRisk: {
    label: 'Average Churn Risk',
    description: 'Mean churn probability',
    help: 'The average predicted churn probability across all monitored customers. Useful as a baseline — an individual account well above it is an outlier worth a look.',
  },
  retentionRate: {
    label: 'Retention Rate',
    description: 'Customers kept this month',
    help: 'The share of customers retained in the most recent month. It is the inverse of the churn rate shown in the trend chart.',
  },
  revenueAtRisk: {
    label: 'Revenue at Risk',
    description: 'Annual value of at-risk accounts',
    help: 'Each at-risk account\'s annual contract value weighted by its churn probability, added up. It is an expected loss, not a confirmed one.',
  },

  // ---------- Customer-level fields (mock/customers.js) ----------
  churnProbability: {
    label: 'Churn Risk',
    description: 'Likelihood this account leaves',
    help: 'The predicted probability that this customer churns. Higher is worse. In this prototype the score is demo data, not a live model output.',
  },
  riskTier: {
    label: 'Risk Tier',
    description: 'Churn risk grouped into bands',
    help: 'Derived from the churn risk score: Low below 35%, Medium 35–59%, High 60–79%, Critical 80% and above.',
  },
  healthScore: {
    label: 'Health Score',
    description: 'Overall account health, 0–100',
    help: 'A single 0–100 summary of account health supplied with the customer record. Lower scores need attention sooner.',
  },
  engagement: {
    label: 'Engagement',
    description: 'How actively the team uses the product',
    help: 'A 0–100 measure of how actively this account\'s users interact with the product. Sustained drops usually precede churn.',
  },
  usage: {
    label: 'Usage',
    description: 'Share of the product in active use',
    help: 'A 0–100 measure of how much of the product this account actually uses. Declining usage is the single biggest churn driver in this dataset.',
  },
  mrr: {
    label: 'MRR',
    description: 'Monthly recurring revenue',
    help: 'What this account is billed each month. Multiply by 12 for the annual contract value.',
  },
  customerRevenueAtRisk: {
    label: 'Revenue at Risk',
    description: 'Expected loss if this account churns',
    help: 'This account\'s annual contract value weighted by its churn probability.',
  },
  nps: {
    label: 'NPS',
    description: 'Latest satisfaction score, 0–10',
    help: 'The most recent Net Promoter Score this account gave. 0–6 counts as a detractor, 9–10 as a promoter.',
  },
  tenure: {
    label: 'Tenure',
    description: 'How long they have been a customer',
    help: 'Months since the account started. Shorter tenure correlates with higher churn in this dataset.',
  },
  loginFrequency: {
    label: 'Login Frequency',
    description: 'Average logins per week',
    help: 'How often this account signs in during a typical week. A sharp fall is an early warning sign.',
  },
  supportTickets: {
    label: 'Support Tickets',
    description: 'Total raised, and how many are open',
    help: 'Unresolved tickets are a strong churn signal — the open count matters more than the total.',
  },
  status: {
    label: 'Status',
    description: 'Where the account stands today',
    help: 'Active: healthy and engaged. At Risk: flagged for attention. Dormant: little or no recent activity. Churned: no longer a customer.',
  },
  lastActive: {
    label: 'Last Active',
    description: 'Most recent product activity',
    help: 'When anyone on this account last used the product.',
  },
  plan: {
    label: 'Plan',
    description: 'Subscription tier',
    help: 'Starter, Professional or Enterprise. Lower tiers churn more often in this dataset.',
  },

  // ---------- Charts and analysis ----------
  riskDistribution: {
    label: 'Churn Risk Distribution',
    description: 'How the customer base splits across risk tiers',
    help: 'Every monitored customer falls into exactly one band, so these four numbers add up to your total customers.',
  },
  churnTrend: {
    label: 'Churn Rate Trend',
    description: 'Monthly churn rate over the last 8 months, actual vs predicted',
    help: 'The solid line is the churn rate that actually happened each month; the dashed line is what was predicted. The two tracking closely means the predictions have been reliable.',
  },
  revenueAtRiskTrend: {
    label: 'Revenue at Risk Over Time',
    description: 'At-risk revenue against total revenue, by month',
    help: 'The gap between the two areas is revenue that is currently safe. A narrowing gap means risk is growing faster than the book.',
  },
  topDrivers: {
    label: 'Top Churn Drivers',
    description: 'Behaviours pushing risk up across the whole customer base',
    help: 'Averaged across all customers. A higher bar means that behaviour moves churn risk more. Per-customer drivers live on the Explainability page.',
  },
  shapContribution: {
    label: 'Feature Contributions',
    description: 'How much each factor moves this customer\'s risk up or down',
    help: 'Each bar is one factor\'s effect on this customer\'s score. Bars to the right push risk up, bars to the left pull it down, and longer bars matter more.',
  },
  modelConfidence: {
    label: 'Model Confidence',
    description: 'How certain the prediction is',
    help: 'How consistent the underlying signals are for this customer. Lower confidence means the factors disagree and the score deserves a second look.',
  },
  impactScore: {
    label: 'Impact Score',
    description: 'Expected benefit of acting, 0–100',
    help: 'A relative estimate of how much this action should reduce churn risk compared with the other suggestions for this customer.',
  },
  riskByPlan: {
    label: 'Risk by Plan Tier',
    description: 'Total accounts vs at-risk accounts in each plan',
    help: 'Compare the pair of bars: a tall orange bar next to a short grey one means that tier is disproportionately at risk.',
  },
  riskByTenure: {
    label: 'Risk by Customer Tenure',
    description: 'Average churn risk by how long accounts have been customers',
    help: 'Average churn probability within each tenure band. Newer customers typically carry the most risk.',
  },
  riskByRegion: {
    label: 'At-Risk Accounts by Region',
    description: 'Number of at-risk accounts in each region',
    help: 'Counts, not percentages — a large region can top this chart while still being healthy in relative terms.',
  },
};

export function metric(key) {
  return METRICS[key] || { label: key, description: '', help: '' };
}
