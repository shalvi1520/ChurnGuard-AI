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
    link: '/dashboard',
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
