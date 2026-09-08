// ============================================
// ChurnGuard – Sample notifications (local only)
// ============================================
//
// There is NO notification backend. These are sample entries so the panel has
// something to show, and the panel labels them as samples — nothing here is
// presented as real activity in the user's workspace.
//
// Two rules they must keep following (both were broken until session 10, when
// they still described a 20-account SaaS mock that session 7 deleted):
//   1. **No invented customers, companies, contacts or figures.** The old
//      entries named "Acme Technologies", "DataSphere Solutions" and
//      "Dr. Ahmed Hassan", and quoted "7,043 rows" and "342 high risk" —
//      none of which exist in whatever dataset a user actually connects.
//   2. **Every `link` must be a route that exists.** Two of them pointed at
//      `/customers/CUST-1001` and `/customers/CUST-1005`, which land on the
//      "customer not found" state, because those IDs went away with the mock.
//
// So these describe *what the product does*, and link to the page that shows
// the user's own real numbers.

export const mockNotifications = [
  {
    id: 'NOTIF-001',
    type: 'risk',
    title: 'Review your highest-risk accounts',
    message: 'Customers scored High or Critical are the ones worth acting on first.',
    timestamp: '2026-08-30T08:00:00Z',
    read: false,
    priority: 'high',
    link: '/customers?risk=high',
  },
  {
    id: 'NOTIF-002',
    type: 'prediction',
    title: 'Scores come from your own data',
    message: 'Every score is produced by a model trained on the data you connected, not a benchmark.',
    timestamp: '2026-08-29T09:00:00Z',
    read: false,
    priority: 'medium',
    link: '/analytics',
  },
  {
    id: 'NOTIF-003',
    type: 'outreach',
    title: 'Drafts wait for your approval',
    message: 'ChurnGuard writes a starting point from an account’s risk factors. Nothing sends until you say so.',
    timestamp: '2026-08-28T09:00:00Z',
    read: false,
    priority: 'medium',
    link: '/outreach',
  },
  {
    id: 'NOTIF-004',
    type: 'data',
    title: 'Reuse a dataset instead of uploading it again',
    message: 'Datasets you connect are saved in this browser so you can reconnect them from History.',
    timestamp: '2026-08-27T14:30:00Z',
    read: true,
    priority: 'low',
    link: '/history',
  },
  {
    id: 'NOTIF-005',
    type: 'recommendation',
    title: 'Recommendations follow the risk factors',
    message: 'Each suggested action is tied to what actually moved an account’s score.',
    timestamp: '2026-08-26T09:00:00Z',
    read: true,
    priority: 'low',
    link: '/recommendations',
  },
];

// The assistant widget's canned replies (used whenever the live Grok proxy is
// off, which is the default). Same rules as the notifications above: it must
// not name customers that don't exist, must not quote numbers it can't know,
// and every link must go somewhere real.
//
// Until session 10 these quoted "DataSphere Solutions — 88.1%", drivers like
// "Login Frequency Drop" (not a field in the current schema at all) and linked
// to /customers/CUST-1005, which 404s into the not-found state. The assistant
// now points at the page that holds the user's own real answer instead of
// inventing one — the same correction session 6 made to the summary reply.
export const mockChatResponses = {
  'Which customers are at highest risk?': {
    message:
      "I can't read your customer list from here, so I won't guess at names or scores.\n\nCustomers, filtered to Critical, ranks every account by the churn probability the model gave it — that's the real answer for your dataset.",
    actions: [
      { label: 'Critical risk customers', link: '/customers?risk=critical' },
      { label: 'All customers', link: '/customers' },
    ],
  },
  'Why is this customer likely to churn?': {
    message:
      'Explainability breaks a single account down into the factors that pushed its score up or down, using the model\'s real SHAP values for that customer.\n\nPick the account there and you\'ll see what actually drove it, not a generic list.',
    actions: [{ label: 'Open Explainability', link: '/explainability' }],
  },
  'What are the biggest churn drivers?': {
    message:
      'Risk Analytics shows the drivers averaged across your whole customer base, computed from the model trained on your data — which fields matter, and whether each one raises or lowers risk.\n\nFor one specific account, Explainability is the place to look.',
    actions: [
      { label: 'Open Risk Analytics', link: '/analytics' },
      { label: 'Open Explainability', link: '/explainability' },
    ],
  },
  'default': {
    message:
      'I can point you to the right part of ChurnGuard. Try:\n\n• "Which customers are at highest risk?"\n• "Why is this customer likely to churn?"\n• "What are the biggest churn drivers?"\n• "Draft an outreach email"\n\nI answer from the app\'s structure, not from your data — the pages themselves hold the real numbers.',
    actions: [],
  },
};
