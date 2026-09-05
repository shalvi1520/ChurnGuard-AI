// ============================================
// ChurnGuard – Mock Outreach Data
// ============================================

export const mockOutreachEmails = [
  {
    id: 'OUT-001',
    customerId: 'CUST-1001',
    customerName: 'Acme Technologies',
    contactName: 'Sarah Chen',
    contactEmail: 'sarah.chen@acmetech.com',
    subject: 'Maximizing Your ChurnGuard Investment — Let\'s Connect',
    body: `Dear Sarah,

I hope this message finds you well. I wanted to reach out personally because we've noticed some changes in your team's usage patterns, and I want to make sure you're getting the most value from your ChurnGuard subscription.

Over the past month, we've released several new features that I believe could significantly benefit Acme Technologies:

• **Advanced Analytics Dashboard** — Real-time insights into customer behavior patterns
• **Automated Alert System** — Proactive notifications when key metrics shift
• **Custom Report Builder** — Generate tailored reports for your executive team

I'd love to schedule a 30-minute call to walk you through these features and discuss how they align with your team's goals. I've also noticed a few open support tickets that I want to ensure are being addressed promptly.

Would any of the following times work for a quick conversation?
- Tuesday, September 2nd at 10:00 AM EST
- Wednesday, September 3rd at 2:00 PM EST
- Thursday, September 4th at 11:00 AM EST

Looking forward to hearing from you.

Best regards,
Michael Torres
Customer Success Manager
ChurnGuard`,
    status: 'draft',
    tone: 'professional',
    createdAt: '2026-08-28T11:00:00Z',
    updatedAt: '2026-08-28T11:00:00Z',
    auditTrail: [
      { action: 'AI generated draft', user: 'System', timestamp: '2026-08-28T11:00:00Z' },
    ],
  },
  {
    id: 'OUT-002',
    customerId: 'CUST-1005',
    customerName: 'DataSphere',
    contactName: 'Anna Martinez',
    contactEmail: 'anna.martinez@datasphere.io',
    subject: 'Unlock the Full Potential of Your Data Platform',
    body: `Hi Anna,

Thank you for choosing ChurnGuard for DataSphere Solutions. As your dedicated Customer Success Manager, I wanted to check in and share some resources that I think your team would find valuable.

We've noticed that there are several powerful features in the platform that your team hasn't explored yet. Based on DataSphere's focus on data services, here are three features I'd recommend:

1. **Predictive Analytics Module** — Forecast customer behavior with 94% accuracy
2. **Integration Hub** — Connect seamlessly with your existing data stack
3. **Team Collaboration Tools** — Share insights across departments instantly

I'd like to offer a complimentary onboarding session to help your team get the most out of these capabilities. This is a dedicated, hands-on walkthrough tailored to your specific use case.

Would you be open to a 45-minute session next week? I promise it will be time well spent.

Warm regards,
Sarah Kim
Customer Success Manager
ChurnGuard`,
    status: 'reviewed',
    tone: 'friendly',
    createdAt: '2026-08-27T09:00:00Z',
    updatedAt: '2026-08-27T14:00:00Z',
    auditTrail: [
      { action: 'AI generated draft', user: 'System', timestamp: '2026-08-27T09:00:00Z' },
      { action: 'Reviewed by CSM', user: 'Sarah Kim', timestamp: '2026-08-27T14:00:00Z' },
    ],
  },
  {
    id: 'OUT-003',
    customerId: 'CUST-1019',
    customerName: 'Zenith Healthcare',
    contactName: 'Dr. Ahmed Hassan',
    contactEmail: 'dr.ahmed.hassan@zenithhc.com',
    subject: 'Addressing Your Concerns — Priority Support Update',
    body: `Dear Dr. Hassan,

I'm writing to personally address the support issues your team has experienced recently. Your satisfaction is our top priority, and I want to assure you that we're taking immediate action.

Here's what we've done:

✅ Assigned a senior support engineer to resolve your open tickets within 48 hours
✅ Scheduled a technical deep-dive with our engineering team
✅ Prepared a dedicated healthcare-specific configuration guide

I understand that as a healthcare organization, system reliability is critical. We're committed to ensuring ChurnGuard meets the rigorous standards Zenith Healthcare requires.

I'd like to schedule a call with you and our Head of Engineering to discuss a long-term support plan. Would Thursday or Friday this week work?

Sincerely,
Sarah Kim
Customer Success Manager
ChurnGuard`,
    status: 'approved',
    tone: 'professional',
    createdAt: '2026-08-26T10:00:00Z',
    updatedAt: '2026-08-28T09:00:00Z',
    auditTrail: [
      { action: 'AI generated draft', user: 'System', timestamp: '2026-08-26T10:00:00Z' },
      { action: 'Edited by CSM', user: 'Sarah Kim', timestamp: '2026-08-27T11:00:00Z' },
      { action: 'Reviewed by manager', user: 'Emily Rodriguez', timestamp: '2026-08-27T16:00:00Z' },
      { action: 'Approved for sending', user: 'Emily Rodriguez', timestamp: '2026-08-28T09:00:00Z' },
    ],
  },
];

export const mockEmailTemplates = {
  professional: {
    greeting: 'Dear {contactName},',
    closing: 'Best regards,',
  },
  friendly: {
    greeting: 'Hi {contactName},',
    closing: 'Warm regards,',
  },
  formal: {
    greeting: 'Dear {contactName},',
    closing: 'Sincerely,',
  },
};
