// ============================================
// ChurnGuard – Mock Notifications Data
// ============================================

export const mockNotifications = [
  {
    id: 'NOTIF-001',
    type: 'risk',
    title: '12 customers moved to High Risk',
    message: '12 customers have transitioned from Medium to High Risk tier in the past 7 days.',
    timestamp: '2026-08-30T08:00:00Z',
    read: false,
    priority: 'high',
    link: '/customers?risk=high',
  },
  {
    id: 'NOTIF-002',
    type: 'risk',
    title: 'Acme Technologies reached 82% churn probability',
    message: 'Critical risk alert: Acme Technologies (CUST-1001) churn probability increased to 82.4%.',
    timestamp: '2026-08-28T10:30:00Z',
    read: false,
    priority: 'critical',
    link: '/customers/CUST-1001',
  },
  {
    id: 'NOTIF-003',
    type: 'outreach',
    title: 'AI outreach draft awaiting approval',
    message: 'Retention email for Zenith Healthcare has been reviewed and is ready for approval.',
    timestamp: '2026-08-28T09:00:00Z',
    read: false,
    priority: 'medium',
    link: '/outreach',
  },
  {
    id: 'NOTIF-004',
    type: 'data',
    title: 'Dataset processing completed',
    message: 'Customer churn dataset (7,043 rows) has been processed and predictions are ready.',
    timestamp: '2026-08-27T14:30:00Z',
    read: true,
    priority: 'low',
    link: '/data-management',
  },
  {
    id: 'NOTIF-005',
    type: 'prediction',
    title: 'Model prediction completed',
    message: 'Churn prediction model has finished processing. 342 customers identified as high risk.',
    timestamp: '2026-08-27T14:00:00Z',
    read: true,
    priority: 'medium',
    link: '/analytics',
  },
  {
    id: 'NOTIF-006',
    type: 'risk',
    title: 'DataSphere churn probability at 88%',
    message: 'DataSphere Solutions (CUST-1005) has the highest churn probability in your portfolio.',
    timestamp: '2026-08-27T08:00:00Z',
    read: true,
    priority: 'critical',
    link: '/customers/CUST-1005',
  },
  {
    id: 'NOTIF-007',
    type: 'outreach',
    title: 'Email sent to Zenith Healthcare',
    message: 'Retention email has been successfully sent to Dr. Ahmed Hassan.',
    timestamp: '2026-08-26T15:00:00Z',
    read: true,
    priority: 'low',
    link: '/outreach',
  },
  {
    id: 'NOTIF-008',
    type: 'recommendation',
    title: '4 new AI recommendations generated',
    message: 'AI has generated new retention recommendations for Acme Technologies, Nova Systems, Pulse Media, and EduCore.',
    timestamp: '2026-08-26T09:00:00Z',
    read: true,
    priority: 'medium',
    link: '/recommendations',
  },
];

export const mockChatResponses = {
  'Which customers are at highest risk?': {
    message: 'Based on the latest predictions, here are the customers with the highest churn probability:\n\n1. **DataSphere Solutions** — 88.1% (Critical)\n2. **Zenith Healthcare** — 84.6% (Critical)\n3. **Acme Technologies** — 82.4% (Critical)\n4. **Pulse Media** — 79.8% (High)\n5. **EduCore** — 73.5% (High)\n\nI recommend prioritizing DataSphere and Zenith Healthcare for immediate outreach, as both have critical risk scores with multiple compounding factors.',
    actions: [
      { label: 'View DataSphere', link: '/customers/CUST-1005' },
      { label: 'View Zenith Healthcare', link: '/customers/CUST-1019' },
    ],
  },
  'Why is this customer likely to churn?': {
    message: 'The top churn drivers across your portfolio are:\n\n1. **Feature Usage Decline** (31% impact) — Customers reducing product usage\n2. **Login Frequency Drop** (24% impact) — Decreasing login activity\n3. **Support Ticket Volume** (18% impact) — Rising support complaints\n4. **Engagement Score Drop** (13% impact) — Overall engagement declining\n\nFor a specific customer analysis, please navigate to their profile and I can provide personalized SHAP-based explanations.',
    actions: [
      { label: 'View Explainability', link: '/explainability' },
    ],
  },
  'What are the biggest churn drivers?': {
    message: 'The most impactful churn drivers across your customer base are:\n\n| Driver | Impact | Affected Customers |\n|--------|--------|--------------------|\n| Feature Usage Decline | +0.31 | 842 |\n| Login Frequency Drop | +0.24 | 721 |\n| Support Complaints | +0.18 | 534 |\n| Engagement Score Drop | +0.13 | 456 |\n| Short Tenure | +0.09 | 389 |\n\nConversely, **High NPS Score** (-0.12), **Long Tenure** (-0.08), and **Annual Contracts** (-0.06) are the strongest retention factors.',
    actions: [
      { label: 'View Analytics', link: '/analytics' },
    ],
  },
  'default': {
    message: 'I can help you with customer retention insights. Here are some things you can ask me:\n\n• "Which customers are at highest risk?"\n• "Why is [customer] likely to churn?"\n• "What are the biggest churn drivers?"\n• "How many high-risk customers do we have?"\n• "Summarize today\'s retention risks"\n• "Draft an outreach email for [customer]"\n\nFeel free to ask any question about your customer data!',
    actions: [],
  },
};
