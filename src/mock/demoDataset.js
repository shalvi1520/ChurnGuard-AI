// ============================================
// ChurnGuard – Demo dataset
// ============================================
//
// "Explore with demo data" needs to run through exactly the same upload →
// validate → map → process pipeline as a real file, so this builds a genuine
// CSV rather than a placeholder. Every statistic the setup flow reports for it
// is therefore computed from real content, not hardcoded.
//
// The shape mirrors the Telco Customer Churn reference dataset the rest of the
// prototype's mock data is modelled on. It is demo data and is labelled as such
// everywhere it surfaces in the UI.

export const DEMO_DATASET_FILENAME = 'churnguard_demo_customers.csv';
export const DEMO_DATASET_ROWS = 300;

const HEADERS = [
  'customerID', 'gender', 'SeniorCitizen', 'Partner', 'Dependents', 'tenure',
  'PhoneService', 'InternetService', 'OnlineSecurity', 'TechSupport', 'StreamingTV',
  'Contract', 'PaperlessBilling', 'PaymentMethod', 'MonthlyCharges', 'TotalCharges', 'Churn',
];

const CHOICES = {
  gender: ['Female', 'Male'],
  yesNo: ['Yes', 'No'],
  internet: ['DSL', 'Fiber optic', 'No'],
  addOn: ['Yes', 'No', 'No internet service'],
  contract: ['Month-to-month', 'One year', 'Two year'],
  payment: ['Electronic check', 'Mailed check', 'Bank transfer (automatic)', 'Credit card (automatic)'],
};

const ID_SUFFIX = ['VHVEG', 'GNVDE', 'QPYBK', 'CFOCW', 'HQITU', 'FRPML', 'RSNTM', 'JPQKD'];

/** Small deterministic PRNG so the demo file is byte-identical every run. */
function createRandom(seed = 20260906) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

const pick = (rand, list) => list[Math.floor(rand() * list.length)];

function buildRow(rand, index) {
  const tenure = Math.floor(rand() * 72) + 1;
  const internet = pick(rand, CHOICES.internet);
  const contract = pick(rand, CHOICES.contract);
  const monthly = Math.round((18.5 + rand() * 100) * 100) / 100;

  // A handful of rows deliberately leave TotalCharges blank — the same quirk the
  // real Telco dataset has for brand-new customers. Validation reports it honestly.
  const blankTotal = index % 47 === 0;
  const total = blankTotal ? '' : (Math.round(monthly * tenure * (0.92 + rand() * 0.16) * 100) / 100).toFixed(2);

  // Month-to-month customers on short tenure churn far more often — keeps the
  // demo file's churn distribution plausible rather than uniform noise.
  const churnPressure = (contract === 'Month-to-month' ? 0.42 : 0.08) + (tenure < 12 ? 0.2 : 0);
  const churn = rand() < churnPressure ? 'Yes' : 'No';

  return [
    `${7000 + index}-${ID_SUFFIX[index % ID_SUFFIX.length]}`,
    pick(rand, CHOICES.gender),
    rand() < 0.16 ? '1' : '0',
    pick(rand, CHOICES.yesNo),
    pick(rand, CHOICES.yesNo),
    String(tenure),
    pick(rand, CHOICES.yesNo),
    internet,
    internet === 'No' ? 'No internet service' : pick(rand, CHOICES.addOn),
    internet === 'No' ? 'No internet service' : pick(rand, CHOICES.addOn),
    internet === 'No' ? 'No internet service' : pick(rand, CHOICES.addOn),
    contract,
    pick(rand, CHOICES.yesNo),
    pick(rand, CHOICES.payment),
    monthly.toFixed(2),
    total,
    churn,
  ];
}

export function buildDemoDatasetCsv() {
  const rand = createRandom();
  const rows = Array.from({ length: DEMO_DATASET_ROWS }, (_, i) => buildRow(rand, i));

  // Two exact duplicates, so the duplicate-row check has something real to find
  // and the demo shows what a validation warning actually looks like.
  rows.push([...rows[12]], [...rows[101]]);

  return [HEADERS, ...rows].map((row) => row.join(',')).join('\n');
}

export function buildDemoDatasetFile() {
  return new File([buildDemoDatasetCsv()], DEMO_DATASET_FILENAME, { type: 'text/csv' });
}
