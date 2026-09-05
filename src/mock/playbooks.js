// ============================================
// ChurnGuard – Mock Playbooks / Automation Data
// ============================================

export const mockPlaybooks = [
  {
    id: 'PB-001',
    name: 'High-Risk Customer Follow-Up',
    description: 'Automatically create a Customer Success task when an account crosses into High or Critical risk.',
    trigger: 'Customer becomes at-risk',
    conditions: [{ field: 'riskTier', operator: 'equals', value: 'high' }],
    action: 'Create Customer Success task',
    outcome: 'Track intervention',
    status: 'active',
    runsCount: 41,
    lastRun: '2026-08-31T09:12:00Z',
    createdAt: '2026-06-02T10:00:00Z',
  },
  {
    id: 'PB-002',
    name: 'Feature Adoption Nudge',
    description: 'When feature usage drops sharply, trigger an automated feature-adoption check-in email draft for review.',
    trigger: 'Feature usage declines > 30% in 30 days',
    conditions: [{ field: 'featureAdoption', operator: 'drops_below', value: '40%' }],
    action: 'Draft feature adoption outreach email',
    outcome: 'Awaiting human approval',
    status: 'active',
    runsCount: 27,
    lastRun: '2026-08-29T14:45:00Z',
    createdAt: '2026-06-10T10:00:00Z',
  },
  {
    id: 'PB-003',
    name: 'Unresolved Support Escalation',
    description: 'Escalate accounts with multiple unresolved support tickets to account leadership.',
    trigger: 'Open support tickets ≥ 3',
    conditions: [{ field: 'openTickets', operator: 'gte', value: 3 }],
    action: 'Notify account leadership',
    outcome: 'Track resolution',
    status: 'paused',
    runsCount: 9,
    lastRun: '2026-08-15T11:30:00Z',
    createdAt: '2026-07-01T10:00:00Z',
  },
  {
    id: 'PB-004',
    name: 'Critical Risk Renewal Alert',
    description: 'Alert the account owner when a critical-risk customer is within 60 days of contract renewal.',
    trigger: 'Renewal within 60 days AND risk = Critical',
    conditions: [
      { field: 'riskTier', operator: 'equals', value: 'critical' },
      { field: 'daysToRenewal', operator: 'lte', value: 60 },
    ],
    action: 'Notify account owner',
    outcome: 'Track intervention',
    status: 'active',
    runsCount: 15,
    lastRun: '2026-08-30T08:00:00Z',
    createdAt: '2026-07-18T10:00:00Z',
  },
];

export const triggerOptions = [
  { value: 'becomes_at_risk', label: 'Customer becomes at-risk' },
  { value: 'usage_declines', label: 'Feature usage declines' },
  { value: 'login_drops', label: 'Login frequency drops' },
  { value: 'support_tickets_open', label: 'Support tickets remain unresolved' },
  { value: 'renewal_approaching', label: 'Contract renewal approaching' },
];

export const conditionFields = [
  { value: 'riskTier', label: 'Risk Level', options: ['low', 'medium', 'high', 'critical'] },
  { value: 'featureAdoption', label: 'Feature Adoption %', options: ['< 20%', '< 40%', '< 60%'] },
  { value: 'openTickets', label: 'Open Support Tickets', options: ['≥ 1', '≥ 3', '≥ 5'] },
  { value: 'daysToRenewal', label: 'Days to Renewal', options: ['≤ 30', '≤ 60', '≤ 90'] },
];

export const actionOptions = [
  { value: 'create_task', label: 'Create Customer Success task' },
  { value: 'draft_email', label: 'Draft personalized outreach email' },
  { value: 'notify_owner', label: 'Notify account owner' },
  { value: 'notify_leadership', label: 'Notify account leadership' },
  { value: 'flag_dashboard', label: 'Flag on dashboard' },
];
