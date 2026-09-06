// ============================================
// ChurnGuard – Dataset field schema
// ============================================
//
// The single source of truth for "what ChurnGuard expects in a customer
// dataset". Used in three places, deliberately defined only once:
//   1. `DataManagementPage` – the "Before you upload" requirements list
//   2. `services/api.js`    – auto-detecting columns during validation
//   3. `MappingStep`        – the column-mapping UI and its required-field rule
//
// These fields mirror the Telco Customer Churn reference dataset the rest of
// the prototype's mock data is modelled on — they are not invented ML features.

export const CHURNGUARD_FIELDS = [
  {
    key: 'customer_id',
    label: 'Customer ID',
    description: 'A unique reference for each customer or account.',
    example: '7590-VHVEG',
    required: true,
    aliases: ['customerid', 'customer', 'accountid', 'account', 'id', 'userid', 'subscriberid'],
  },
  {
    key: 'tenure',
    label: 'Tenure (months)',
    description: 'How long the customer has been with you, in months.',
    example: '34',
    required: true,
    aliases: ['tenure', 'tenuremonths', 'months', 'monthsactive', 'customerage', 'subscriptionmonths'],
  },
  {
    key: 'monthly_charges',
    label: 'Monthly charges',
    description: 'What the customer is billed each month.',
    example: '56.95',
    required: true,
    aliases: ['monthlycharges', 'monthlycharge', 'mrr', 'monthlyrevenue', 'monthlyfee', 'arpu'],
  },
  {
    key: 'contract_type',
    label: 'Contract type',
    description: 'The plan or commitment length, e.g. month-to-month or annual.',
    example: 'One year',
    required: true,
    aliases: ['contract', 'contracttype', 'plan', 'plantype', 'subscriptiontype', 'term'],
  },
  {
    key: 'churn',
    label: 'Churn label',
    description: 'Whether the customer has already left. ChurnGuard learns your churn patterns from this column.',
    example: 'Yes / No',
    required: true,
    aliases: ['churn', 'churned', 'ischurn', 'ischurned', 'attrition', 'exited', 'cancelled', 'canceled'],
  },
  {
    key: 'total_charges',
    label: 'Total charges',
    description: 'Total revenue billed to the customer so far.',
    example: '1889.50',
    required: false,
    aliases: ['totalcharges', 'totalcharge', 'totalrevenue', 'lifetimevalue', 'ltv'],
  },
  {
    key: 'service_tier',
    label: 'Service / product tier',
    description: 'Which product or service line the customer is on.',
    example: 'Fiber optic',
    required: false,
    aliases: ['internetservice', 'service', 'servicetier', 'product', 'producttier', 'tier', 'package'],
  },
  {
    key: 'payment_method',
    label: 'Payment method',
    description: 'How the customer pays — card, bank transfer, invoice, and so on.',
    example: 'Electronic check',
    required: false,
    aliases: ['paymentmethod', 'payment', 'billingmethod', 'paymenttype'],
  },
];

export const REQUIRED_FIELDS = CHURNGUARD_FIELDS.filter((f) => f.required);

export function getField(key) {
  return CHURNGUARD_FIELDS.find((f) => f.key === key) || null;
}

/** Lowercases and strips separators so `Monthly_Charges` matches `monthlycharges`. */
export function normalizeColumnName(name) {
  return String(name ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Best-effort match of a dataset's column names onto ChurnGuard fields.
 * Returns `{ [fieldKey]: columnName }` — only confident matches are included,
 * so the user always confirms the mapping before processing.
 */
export function suggestMappings(columnNames = []) {
  const normalized = columnNames.map((name) => ({ name, key: normalizeColumnName(name) }));
  const taken = new Set();
  const suggestions = {};

  for (const field of CHURNGUARD_FIELDS) {
    const match =
      normalized.find((c) => !taken.has(c.name) && c.key === normalizeColumnName(field.key)) ||
      normalized.find((c) => !taken.has(c.name) && field.aliases.includes(c.key));
    if (match) {
      suggestions[field.key] = match.name;
      taken.add(match.name);
    }
  }

  return suggestions;
}
