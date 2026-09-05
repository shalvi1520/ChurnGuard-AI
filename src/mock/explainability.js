// ============================================
// ChurnGuard – Mock Explainability Data
// ============================================

export const mockSHAPExplanations = {
  'CUST-1001': {
    customerId: 'CUST-1001',
    customerName: 'Acme Technologies',
    churnProbability: 82.4,
    baselineRisk: 34.2,
    features: [
      { feature: 'Feature Usage', value: '34%', contribution: 0.31, direction: 'increases', description: '42% decline in feature usage over the last 30 days' },
      { feature: 'Login Frequency', value: '2.1/week', contribution: 0.24, direction: 'increases', description: 'Login frequency dropped from 12 to 2.1 times per week' },
      { feature: 'Support Complaints', value: '8 tickets', contribution: 0.18, direction: 'increases', description: '3 unresolved support tickets in the last 14 days' },
      { feature: 'Engagement Score', value: '28/100', contribution: 0.13, direction: 'increases', description: 'Overall engagement declined by 35% this quarter' },
      { feature: 'Contract Type', value: 'Annual', contribution: -0.08, direction: 'decreases', description: 'Annual contracts have lower churn than monthly' },
      { feature: 'Tenure', value: '24 months', contribution: -0.06, direction: 'decreases', description: 'Longer tenure correlates with lower churn' },
      { feature: 'Subscription Value', value: '$12,500/mo', contribution: -0.04, direction: 'decreases', description: 'Higher-value accounts are less likely to churn' },
    ],
    aiExplanation: 'Acme Technologies is at critical churn risk (82.4%) primarily driven by a significant 42% decline in feature usage over the past 30 days, combined with a sharp drop in login frequency from 12 to just 2.1 times per week. The account has 3 unresolved support tickets indicating potential product dissatisfaction. The engagement score has dropped to 28/100, suggesting the customer is not finding ongoing value. While the annual contract and 24-month tenure provide some stability, these positive factors are being overwhelmed by the recent behavioral decline. Immediate intervention is recommended before the upcoming contract renewal in 60 days.',
    confidenceScore: 0.91,
  },
  'CUST-1005': {
    customerId: 'CUST-1005',
    customerName: 'DataSphere',
    churnProbability: 88.1,
    baselineRisk: 34.2,
    features: [
      { feature: 'Feature Usage', value: '22%', contribution: 0.35, direction: 'increases', description: 'Only using 22% of available features' },
      { feature: 'Login Frequency', value: '1.2/week', contribution: 0.28, direction: 'increases', description: 'Minimal login activity — less than twice per week' },
      { feature: 'Tenure', value: '6 months', contribution: 0.12, direction: 'increases', description: 'Short tenure customers have higher churn risk' },
      { feature: 'Contract Type', value: 'Monthly', contribution: 0.10, direction: 'increases', description: 'Monthly contracts have 3× higher churn than annual' },
      { feature: 'NPS Score', value: '3/10', contribution: 0.08, direction: 'increases', description: 'Very low satisfaction score' },
      { feature: 'Support Tickets', value: '4 tickets', contribution: 0.05, direction: 'increases', description: '2 unresolved issues pending' },
      { feature: 'Subscription Value', value: '$1,200/mo', contribution: 0.02, direction: 'increases', description: 'Lower-value accounts churn more frequently' },
    ],
    aiExplanation: 'DataSphere Solutions is at critical churn risk (88.1%) with multiple compounding risk factors. The customer is only utilizing 22% of available features, suggesting poor onboarding or product-market misfit. Login activity is minimal at 1.2 times per week. As a relatively new customer (6 months) on a monthly contract, there are no long-term commitment barriers. The NPS score of 3/10 indicates significant dissatisfaction. The combination of low engagement, short tenure, monthly billing, and low satisfaction creates a very high churn probability. Urgent action is needed — consider a dedicated onboarding session and a free trial extension of premium features.',
    confidenceScore: 0.94,
  },
  'CUST-1019': {
    customerId: 'CUST-1019',
    customerName: 'Zenith Healthcare',
    churnProbability: 84.6,
    baselineRisk: 34.2,
    features: [
      { feature: 'Support Complaints', value: '11 tickets', contribution: 0.29, direction: 'increases', description: '5 unresolved support tickets — highest in account base' },
      { feature: 'Feature Usage', value: '33%', contribution: 0.26, direction: 'increases', description: 'Significant decline in reporting module usage' },
      { feature: 'Login Frequency', value: '1.8/week', contribution: 0.22, direction: 'increases', description: 'Key stakeholders have stopped logging in' },
      { feature: 'NPS Score', value: '2/10', contribution: 0.12, direction: 'increases', description: 'Lowest satisfaction score in portfolio' },
      { feature: 'Engagement Score', value: '27/100', contribution: 0.09, direction: 'increases', description: 'Engagement has declined steadily for 3 months' },
      { feature: 'Contract Type', value: 'Annual', contribution: -0.06, direction: 'decreases', description: 'Annual commitment provides some buffer' },
      { feature: 'Industry Fit', value: 'Healthcare', contribution: -0.03, direction: 'decreases', description: 'Healthcare customers have moderate retention rates' },
    ],
    aiExplanation: 'Zenith Healthcare Systems is at critical risk (84.6%) with the highest number of unresolved support tickets (5 of 11 total) in the customer portfolio. This signals deep product dissatisfaction. Feature usage has dropped to 33%, with the reporting module — previously their most-used feature — showing a 60% decline. Key decision-makers have stopped logging in regularly (1.8/week down from 8+). The NPS score of 2/10 is the lowest across all accounts. Despite the annual contract providing a retention buffer, the severity of dissatisfaction suggests the customer may not renew. Immediate escalation to account leadership is recommended.',
    confidenceScore: 0.89,
  },
};

// Default SHAP explanation for customers not in the mock
export const getDefaultSHAPExplanation = (customer) => ({
  customerId: customer.id,
  customerName: customer.name,
  churnProbability: customer.churnProbability,
  baselineRisk: 34.2,
  features: [
    { feature: 'Feature Usage', value: `${customer.featureAdoption}%`, contribution: customer.churnProbability > 50 ? 0.25 : -0.10, direction: customer.churnProbability > 50 ? 'increases' : 'decreases', description: `Current feature adoption at ${customer.featureAdoption}%` },
    { feature: 'Login Frequency', value: `${customer.loginFrequency}/week`, contribution: customer.loginFrequency < 5 ? 0.20 : -0.08, direction: customer.loginFrequency < 5 ? 'increases' : 'decreases', description: `${customer.loginFrequency} logins per week` },
    { feature: 'Support Tickets', value: `${customer.supportTickets} tickets`, contribution: customer.openTickets > 2 ? 0.15 : -0.05, direction: customer.openTickets > 2 ? 'increases' : 'decreases', description: `${customer.openTickets} open tickets` },
    { feature: 'Engagement Score', value: `${customer.engagement}/100`, contribution: customer.engagement < 50 ? 0.12 : -0.10, direction: customer.engagement < 50 ? 'increases' : 'decreases', description: `Engagement score at ${customer.engagement}/100` },
    { feature: 'Tenure', value: `${customer.tenure} months`, contribution: customer.tenure < 12 ? 0.08 : -0.06, direction: customer.tenure < 12 ? 'increases' : 'decreases', description: `${customer.tenure} month customer relationship` },
    { feature: 'Contract Type', value: customer.contractType, contribution: customer.contractType === 'Monthly' ? 0.07 : -0.05, direction: customer.contractType === 'Monthly' ? 'increases' : 'decreases', description: `${customer.contractType} billing cycle` },
  ],
  aiExplanation: `${customer.name} has a churn probability of ${customer.churnProbability}%. ${customer.churnProbability > 60 ? 'The primary risk drivers are reduced product engagement and declining usage patterns.' : 'The account shows moderate health with some areas requiring attention.'} Feature adoption is at ${customer.featureAdoption}% with ${customer.openTickets} unresolved support tickets. ${customer.churnProbability > 70 ? 'Immediate intervention is recommended.' : 'Regular monitoring and proactive outreach are advised.'}`,
  confidenceScore: 0.85,
});
