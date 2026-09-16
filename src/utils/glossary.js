// ============================================
// ChurnGuard – Metric glossary
// ============================================
//
// One definition per metric, shared by every page that shows it (Portfolio &
// Risk, Customers, Customer Detail, Explainability, Recommendations).
// Explaining the same number differently on two pages is exactly the
// redundancy this file exists to prevent — if a metric needs describing, add
// it here and import it.
//
// `label`       – the visible name
// `description` – the short line shown under the value (visible, not hover-only)
// `help`        – the extra detail behind the info icon; one or two sentences
//
// Everything here must match the actual implementation: field names mirror
// CHURNGUARD_FIELDS (mock/datasetSchema.js) and the customer record shape the
// backend returns (backend/api/dataset_routes.py). Risk-tier cut-offs come
// from getRiskTier() in utils/helpers.js.

export const METRICS = {
  // ---------- Portfolio KPIs (GET /dashboard) ----------
  totalCustomers: {
    label: 'Total Customers',
    description: 'Accounts currently monitored',
    help: 'The full customer base every other number on this page is measured against — Customers at Risk, Revenue at Risk and Retention Rate are all slices of this total, not separate populations.',
  },
  customersAtRisk: {
    label: 'Customers at Risk',
    description: 'High or critical churn risk — work these first',
    help: 'Accounts with a churn probability of 60% or higher. This is the action list: start in Recommendations or Outreach here before lower-risk accounts. If it climbs past roughly a quarter of your total customers, retention effort is falling behind churn, not ahead of it.',
  },
  retentionRate: {
    label: 'Retention Rate',
    description: 'Share of customers not already labelled churned',
    help: 'Computed from your file\'s own churn label, not a prediction — it says what already happened, not what\'s coming. Only shown when a churn column was mapped. If it sits well below "100% minus Customers at Risk," churn is already showing up in outcomes, not just in the forecast.',
  },
  revenueAtRisk: {
    label: 'Revenue at Risk',
    description: 'Annual value riding on the accounts above',
    help: 'Each at-risk account\'s annual charges (monthly charges × 12) weighted by its churn probability, added up. It\'s an expected loss if nothing changes, not a confirmed one — the number to defend in a retention budget conversation.',
  },

  // ---------- Customer-level fields ----------
  churnProbability: {
    label: 'Churn Risk',
    description: 'Likelihood this account leaves',
    help: 'The predicted probability that this customer churns, from a model trained on your uploaded dataset. Higher is worse.',
  },
  riskTier: {
    label: 'Risk Tier',
    description: 'Churn risk grouped into bands',
    help: 'Derived from the churn risk score: Low below 35%, Medium 35–59%, High 60–79%, Critical 80% and above.',
  },
  tenure: {
    label: 'Tenure',
    description: 'How long they have been a customer',
    help: 'Months since the account started, from your uploaded file.',
  },
  monthlyCharges: {
    label: 'Monthly Charges',
    description: 'What the customer is billed each month',
    help: 'From your uploaded file. Multiply by 12 for the annual charge used in Revenue at Risk.',
  },
  totalCharges: {
    label: 'Total Charges',
    description: 'Total billed to date',
    help: 'Total revenue billed to this customer so far, from your uploaded file.',
  },
  contractType: {
    label: 'Contract',
    description: 'Plan or commitment length',
    help: 'The contract/plan value from your uploaded file, e.g. month-to-month or annual.',
  },
  customerRevenueAtRisk: {
    label: 'Revenue at Risk',
    description: 'Expected loss if this account churns',
    help: 'This account\'s annual charges (monthly charges × 12) weighted by its churn probability.',
  },
  status: {
    label: 'Status',
    description: 'Where the account stands today',
    help: 'Derived from risk tier: At Risk means High or Critical churn risk (60%+); Active means below that.',
  },
  impactScore: {
    label: 'Impact Score',
    description: 'How much this factor drives the account\'s risk, 0–100',
    help: 'This driver\'s SHAP effect on the account\'s score, scaled against the account\'s single strongest driver.',
  },

  // ---------- Charts and analysis ----------
  riskDistribution: {
    label: 'Churn Risk Distribution',
    description: 'How exposed your book of business is right now',
    help: 'Every monitored customer falls into exactly one tier, so the four slices add up to your total. A healthy portfolio is weighted toward Low; if High and Critical together make up a large wedge, that\'s active exposure, not a rounding error.',
  },
  churnTrend: {
    label: 'Churn Rate Trend',
    description: 'Month-by-month churn rate',
    help: 'Needs more than one dataset upload over time to compute — a single upload is a snapshot, not a history.',
  },
  revenueAtRiskTrend: {
    label: 'Revenue at Risk Over Time',
    description: 'At-risk revenue against total revenue, by month',
    help: 'Needs more than one dataset upload over time to compute — a single upload is a snapshot, not a history.',
  },
  topDrivers: {
    label: 'Top Churn Drivers',
    description: 'What\'s pushing your at-risk customers toward churn, ranked by impact',
    help: 'Drivers are ranked by their real contribution to the model\'s predictions for customers it already flags as high-risk or worse — not diluted by your healthy majority, and not guesswork. Orange factors raise risk, green ones lower it, and a longer bar means a bigger effect. A driver dominating this list points to a structural fix — pricing, onboarding, a specific plan — rather than one-by-one outreach. Drivers for one specific account live on the Explainability page.',
  },
  shapContribution: {
    label: 'Feature Contributions',
    description: 'How much each factor moves this customer\'s risk up or down',
    help: 'Each bar is one factor\'s real SHAP effect on this customer\'s score. Bars to the right push risk up, bars to the left pull it down, and longer bars matter more.',
  },
  riskByPlan: {
    label: 'Risk by Contract Type',
    description: 'Which contract types are quietly carrying the most risk',
    help: 'Total customers alongside those at High or Critical risk, per contract type. Compare the percentage above each bar, not the bar heights — groups differ in size. A contract type running well above your portfolio-wide Customers-at-Risk share points to a plan-level fix (pricing, term length, onboarding), not just individual outreach.',
  },
  riskByTenure: {
    label: 'Risk by Customer Tenure',
    description: 'Whether risk looks like an onboarding problem or a renewal problem',
    help: 'This compares customers at different tenure levels right now — a snapshot across cohorts, not a historical trend. Each point takes the colour of the risk tier its average falls in. High risk early points to onboarding; high risk late points to value or pricing fatigue near renewal.',
  },
  riskByServiceTier: {
    label: 'Risk by Service Tier',
    description: 'Which product tiers are carrying the most risk',
    help: 'Total customers alongside those at High or Critical risk, per service or product tier. Only available when a tier column was mapped. If a higher-value tier shows risk equal to or above a lower one, you\'re not just losing volume — you\'re losing your most revenue-dense accounts.',
  },
};

export function metric(key) {
  return METRICS[key] || { label: key, description: '', help: '' };
}