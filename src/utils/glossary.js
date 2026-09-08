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
// Everything here must match the actual implementation: field names mirror
// CHURNGUARD_FIELDS (mock/datasetSchema.js) and the customer record shape the
// backend returns (backend/api/dataset_routes.py). Risk-tier cut-offs come
// from getRiskTier() in utils/helpers.js.

export const METRICS = {
  // ---------- Portfolio KPIs (GET /dashboard) ----------
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
    description: 'Share of customers not already labelled churned',
    help: 'Computed from your file\'s churn label, not a prediction. Only shown when your dataset had a churn column mapped.',
  },
  revenueAtRisk: {
    label: 'Revenue at Risk',
    description: 'Annual value of at-risk accounts',
    help: 'Each at-risk account\'s annual charges (monthly charges × 12) weighted by its churn probability, added up. It is an expected loss, not a confirmed one.',
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
    description: 'How the customer base splits across risk tiers',
    help: 'Every monitored customer falls into exactly one band, so these four numbers add up to your total customers.',
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
    description: 'The factors moving churn risk most across the whole customer base',
    help: 'Averaged SHAP effect over a sample of your customers. Orange factors raise churn risk, green ones lower it, and a longer bar means a bigger effect either way. Drivers for one specific account live on the Explainability page.',
  },
  shapContribution: {
    label: 'Feature Contributions',
    description: 'How much each factor moves this customer\'s risk up or down',
    help: 'Each bar is one factor\'s real SHAP effect on this customer\'s score. Bars to the right push risk up, bars to the left pull it down, and longer bars matter more.',
  },
  riskByPlan: {
    label: 'Risk by Contract Type',
    description: 'Total accounts vs at-risk accounts by contract',
    help: 'Compare the pair of bars: a tall orange bar next to a short grey one means that contract type is disproportionately at risk.',
  },
  riskByTenure: {
    label: 'Risk by Customer Tenure',
    description: 'Average churn risk by how long accounts have been customers',
    help: 'Average churn probability within each tenure band, computed from your uploaded data.',
  },
  riskByServiceTier: {
    label: 'At-Risk Accounts by Service Tier',
    description: 'Number of at-risk accounts on each service/product tier',
    help: 'Only available when a service/product tier column was mapped during data setup.',
  },
};

export function metric(key) {
  return METRICS[key] || { label: key, description: '', help: '' };
}
