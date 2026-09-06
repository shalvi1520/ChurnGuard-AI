// ============================================
// ChurnGuard – Data setup step definitions
// ============================================
//
// The one definition of the setup flow's shape. `SETUP_STEPS` drives the page's
// state machine, the stepper and the breadcrumb; `PROCESSING_STAGES` drives the
// staged checklist shown while the dataset is processed.

// `hint` is the one-line answer to "what happens at this step?", shown under
// the stepper so the user always knows where they are and what comes next.
export const SETUP_STEPS = [
  { key: 'upload', label: 'Upload Dataset', short: 'Upload', hint: 'Choose a customer export from your computer, or load the demo dataset.' },
  { key: 'validate', label: 'Validate Data', short: 'Validate', hint: 'We check your file for gaps, duplicates and the fields ChurnGuard needs.' },
  { key: 'map', label: 'Map Columns', short: 'Map', hint: 'Confirm which of your columns holds each ChurnGuard field.' },
  { key: 'process', label: 'Process Dataset', short: 'Process', hint: 'Your customer records are being prepared for scoring.' },
  { key: 'predict', label: 'Generate Predictions', short: 'Predict', hint: 'Churn risk is being generated for every customer in your file.' },
];

// The first three are already complete by the time the processing screen shows;
// the rest track the service calls the page makes.
export const PROCESSING_STAGES = [
  { key: 'received', label: 'Dataset received' },
  { key: 'validated', label: 'Data validated' },
  { key: 'mapped', label: 'Columns mapped' },
  { key: 'records', label: 'Preparing customer records' },
  { key: 'predictions', label: 'Generating churn predictions' },
  { key: 'insights', label: 'Preparing risk insights' },
];
