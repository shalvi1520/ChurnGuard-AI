// ============================================
// ChurnGuard – Data setup stage definitions
// ============================================
//
// The setup flow is automatic: the user provides data, and everything after
// that runs without further clicks unless a decision is genuinely needed.
// These stages are what the progress view narrates while that happens.
//
// `label` is written in the present tense because it is shown while the stage
// is running. `detail` answers "what is it actually doing?" in one line — the
// user should never be watching an opaque spinner.
//
// Each stage maps to real work. Nothing here is a decorative delay: if a stage
// is on screen, the operation it names is either running or finished.

export const PIPELINE_STAGES = [
  {
    key: 'reading',
    label: 'Reading your data',
    detail: 'Parsing the file and counting rows and columns.',
  },
  {
    key: 'understanding',
    label: 'Understanding your columns',
    detail: 'Matching your column names and values against the fields ChurnGuard needs.',
  },
  {
    key: 'validating',
    label: 'Validating records',
    detail: 'Checking for gaps, duplicates and values that cannot be used.',
  },
  {
    key: 'preparing',
    label: 'Preparing the model',
    detail: 'Cleaning the mapped columns and training on your customers.',
  },
  {
    key: 'predicting',
    label: 'Generating predictions',
    detail: 'Scoring every customer for churn risk.',
  },
  {
    key: 'insights',
    label: 'Building insights',
    detail: 'Working out which factors drive risk across your customer base.',
  },
];

export const IDLE_STAGES = Object.fromEntries(PIPELINE_STAGES.map((s) => [s.key, 'pending']));

/** The two ways a user can provide customer data. */
export const DATA_SOURCES = [
  {
    key: 'upload',
    label: 'Upload a file',
    description: 'A customer export from your billing, CRM or data warehouse.',
  },
  {
    key: 'crm',
    label: 'Connect a CRM',
    description: 'Pull customer records directly from a system over its API.',
  },
];
