// ============================================
// ChurnGuard – API Service Layer
// ============================================

import axios from 'axios';
import { mockCustomers, mockTimelines, mockRiskHistory } from '../mock/customers';
import { mockDashboardKPIs, mockSparklines, mockRiskDistribution, mockChurnTrend, mockRevenueAtRisk, mockTopChurnDrivers, mockSegmentation } from '../mock/dashboard';
import { mockSHAPExplanations, getDefaultSHAPExplanation } from '../mock/explainability';
import { mockRecommendations, getDefaultRecommendations } from '../mock/recommendations';
import { mockOutreachEmails } from '../mock/outreach';
import { mockNotifications, mockChatResponses } from '../mock/notifications';
import { demoCredentials, mockUsers } from '../mock/users';
import { mockPlaybooks } from '../mock/playbooks';
import { delay } from '../utils/helpers';

const USE_MOCK = import.meta.env.VITE_USE_MOCK_API === 'true';
const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api';

// AI Assistant: when enabled, the frontend calls a server-side proxy (server.js)
// which holds the Grok (xAI) API key. The key is never present in client code.
// When disabled (default) or when the live call fails, the assistant falls back
// to canned demo responses so the UI always works without a backend.
const USE_LIVE_ASSISTANT = import.meta.env.VITE_USE_LIVE_ASSISTANT === 'true';
const ASSISTANT_URL = import.meta.env.VITE_ASSISTANT_API_URL || '/api/assistant';

// Simulated network latency for the mock layer. The per-call numbers below are
// kept at their original "realistic" values for documentation purposes, but are
// scaled down here so the prototype feels responsive — loading/skeleton states
// still appear (they're part of the product story) without making every click
// wait half a second or more. Raise SCALE toward 1 to demo slow-network states.
const MOCK_LATENCY_SCALE = 0.22;
const MOCK_LATENCY_MAX_MS = 600;

function mockDelay(ms) {
  return delay(Math.min(Math.round(ms * MOCK_LATENCY_SCALE), MOCK_LATENCY_MAX_MS));
}

// Axios instance
const apiClient = axios.create({
  baseURL: BASE_URL,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

// Auth interceptor
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('churnguard_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor
apiClient.interceptors.response.use(
  (response) => response.data,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('churnguard_token');
      localStorage.removeItem('churnguard_user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// ============================================
// Auth Services
// ============================================

export const authService = {
  async login(email, password) {
    if (USE_MOCK) {
      await mockDelay(800);
      if (email === demoCredentials.email && password === demoCredentials.password) {
        return { token: 'mock-jwt-token-2026', user: demoCredentials.user };
      }
      // Accept any email/password in demo
      const user = { ...mockUsers[0], email, name: email.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) };
      return { token: 'mock-jwt-token-2026', user };
    }
    return apiClient.post('/auth/login', { email, password });
  },

  async signup(data) {
    if (USE_MOCK) {
      await mockDelay(1000);
      return { token: 'mock-jwt-token-2026', user: { ...mockUsers[0], name: data.name, email: data.email, company: data.company } };
    }
    return apiClient.post('/auth/signup', data);
  },

  async forgotPassword(email) {
    if (USE_MOCK) {
      await mockDelay(800);
      return { message: 'Password reset email sent' };
    }
    return apiClient.post('/auth/forgot-password', { email });
  },

  async logout() {
    localStorage.removeItem('churnguard_token');
    localStorage.removeItem('churnguard_user');
  },
};

// ============================================
// Dashboard Services
// ============================================

export const dashboardService = {
  async getMetrics() {
    if (USE_MOCK) {
      await mockDelay(600);
      return { kpis: mockDashboardKPIs, sparklines: mockSparklines };
    }
    return apiClient.get('/dashboard');
  },

  async getRiskDistribution() {
    if (USE_MOCK) {
      await mockDelay(400);
      return mockRiskDistribution;
    }
    return apiClient.get('/dashboard/risk-distribution');
  },

  async getChurnTrend() {
    if (USE_MOCK) {
      await mockDelay(500);
      return mockChurnTrend;
    }
    return apiClient.get('/dashboard/churn-trend');
  },

  async getRevenueAtRisk() {
    if (USE_MOCK) {
      await mockDelay(400);
      return mockRevenueAtRisk;
    }
    return apiClient.get('/dashboard/revenue-at-risk');
  },

  async getTopDrivers() {
    if (USE_MOCK) {
      await mockDelay(400);
      return mockTopChurnDrivers;
    }
    return apiClient.get('/dashboard/top-drivers');
  },

  async getSegmentation() {
    if (USE_MOCK) {
      await mockDelay(500);
      return mockSegmentation;
    }
    return apiClient.get('/dashboard/segmentation');
  },
};

// ============================================
// Customer Services
// ============================================

export const customerService = {
  async getCustomers(params = {}) {
    if (USE_MOCK) {
      await mockDelay(500);
      let filtered = [...mockCustomers];

      if (params.search) {
        const s = params.search.toLowerCase();
        filtered = filtered.filter(c =>
          c.name.toLowerCase().includes(s) ||
          c.id.toLowerCase().includes(s) ||
          c.company.toLowerCase().includes(s) ||
          c.contactName.toLowerCase().includes(s)
        );
      }
      if (params.risk && params.risk !== 'all') {
        filtered = filtered.filter(c => c.riskTier === params.risk);
      }
      if (params.status && params.status !== 'all') {
        filtered = filtered.filter(c => c.status === params.status);
      }
      if (params.plan && params.plan !== 'all') {
        filtered = filtered.filter(c => c.plan === params.plan);
      }

      // Sort
      if (params.sortBy) {
        filtered.sort((a, b) => {
          const aVal = a[params.sortBy];
          const bVal = b[params.sortBy];
          const dir = params.sortDir === 'desc' ? -1 : 1;
          if (typeof aVal === 'number') return (aVal - bVal) * dir;
          return String(aVal).localeCompare(String(bVal)) * dir;
        });
      }

      const page = params.page || 1;
      const limit = params.limit || 10;
      const start = (page - 1) * limit;
      const paginated = filtered.slice(start, start + limit);

      return {
        customers: paginated,
        total: filtered.length,
        page,
        totalPages: Math.ceil(filtered.length / limit),
      };
    }
    return apiClient.get('/customers', { params });
  },

  async getCustomer(id) {
    if (USE_MOCK) {
      await mockDelay(400);
      const customer = mockCustomers.find(c => c.id === id);
      if (!customer) throw new Error('Customer not found');
      return {
        ...customer,
        timeline: mockTimelines[id] || mockTimelines['CUST-1001'],
        riskHistory: mockRiskHistory[id] || mockRiskHistory['CUST-1001'],
      };
    }
    return apiClient.get(`/customers/${id}`);
  },
};

// ============================================
// Explainability Services
// ============================================

export const explainabilityService = {
  async getSHAPExplanation(customerId) {
    if (USE_MOCK) {
      await mockDelay(800);
      if (mockSHAPExplanations[customerId]) {
        return mockSHAPExplanations[customerId];
      }
      const customer = mockCustomers.find(c => c.id === customerId);
      if (customer) return getDefaultSHAPExplanation(customer);
      throw new Error('Customer not found');
    }
    return apiClient.get(`/customers/${customerId}/explanation`);
  },
};

// ============================================
// Recommendations Services
// ============================================

export const recommendationService = {
  async getRecommendations(customerId) {
    if (USE_MOCK) {
      await mockDelay(600);
      if (mockRecommendations[customerId]) return mockRecommendations[customerId];
      const customer = mockCustomers.find(c => c.id === customerId);
      if (customer) return getDefaultRecommendations(customer);
      return [];
    }
    return apiClient.get(`/customers/${customerId}/recommendations`);
  },

  async updateStatus(recId, status) {
    if (USE_MOCK) {
      await mockDelay(400);
      return { id: recId, status };
    }
    return apiClient.put(`/recommendations/${recId}`, { status });
  },
};

// ============================================
// Outreach Services
// ============================================

export const outreachService = {
  async getEmails() {
    if (USE_MOCK) {
      await mockDelay(500);
      return mockOutreachEmails;
    }
    return apiClient.get('/outreach');
  },

  async generateEmail(customerId) {
    if (USE_MOCK) {
      await mockDelay(1500);
      const customer = mockCustomers.find(c => c.id === customerId);
      return {
        id: `OUT-${Date.now()}`,
        customerId,
        customerName: customer?.name || 'Unknown',
        contactName: customer?.contactName || 'Customer',
        contactEmail: customer?.email || '',
        subject: `Let's Ensure You're Getting Maximum Value from ChurnGuard`,
        body: `Dear ${customer?.contactName || 'Customer'},\n\nI wanted to reach out personally to check in on your experience with ChurnGuard. Your success is our top priority, and I'd love to discuss how we can help ${customer?.company || 'your organization'} get even more value from the platform.\n\nI've prepared some personalized insights based on your usage patterns that I think you'll find valuable. Would you be available for a quick 20-minute call this week?\n\nBest regards,\nYour Customer Success Team\nChurnGuard`,
        status: 'draft',
        tone: 'professional',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        auditTrail: [{ action: 'AI generated draft', user: 'System', timestamp: new Date().toISOString() }],
      };
    }
    return apiClient.post(`/customers/${customerId}/outreach/generate`);
  },

  async updateEmail(emailId, data) {
    if (USE_MOCK) {
      await mockDelay(400);
      return { id: emailId, ...data, updatedAt: new Date().toISOString() };
    }
    return apiClient.put(`/outreach/${emailId}`, data);
  },

  async approveEmail(emailId) {
    if (USE_MOCK) {
      await mockDelay(500);
      return { id: emailId, status: 'approved' };
    }
    return apiClient.post(`/outreach/${emailId}/approve`);
  },

  async sendEmail(emailId) {
    if (USE_MOCK) {
      await mockDelay(1000);
      return { id: emailId, status: 'sent' };
    }
    return apiClient.post(`/outreach/${emailId}/send`);
  },
};

// ============================================
// Dataset Services
// ============================================

export const datasetService = {
  async uploadDataset(file, onProgress) {
    if (USE_MOCK) {
      // Simulate upload progress
      for (let i = 0; i <= 100; i += 10) {
        await mockDelay(200);
        onProgress?.(i);
      }
      return {
        id: `DS-${Date.now()}`,
        filename: file.name,
        rows: 7043,
        columns: 21,
        size: file.size,
        uploadDate: new Date().toISOString(),
        status: 'uploaded',
      };
    }
    const formData = new FormData();
    formData.append('file', file);
    return apiClient.post('/datasets/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (e) => onProgress?.(Math.round((e.loaded * 100) / e.total)),
    });
  },

  async validateDataset(datasetId) {
    if (USE_MOCK) {
      await mockDelay(1500);
      return {
        datasetId,
        health: 92,
        missingValues: 2.3,
        duplicates: 14,
        status: 'passed_with_warnings',
        columns: [
          { name: 'customerID', type: 'string', missing: 0, unique: 7043 },
          { name: 'gender', type: 'categorical', missing: 0, unique: 2 },
          { name: 'SeniorCitizen', type: 'numeric', missing: 0, unique: 2 },
          { name: 'Partner', type: 'categorical', missing: 0, unique: 2 },
          { name: 'Dependents', type: 'categorical', missing: 0, unique: 2 },
          { name: 'tenure', type: 'numeric', missing: 0, unique: 73 },
          { name: 'PhoneService', type: 'categorical', missing: 0, unique: 2 },
          { name: 'MultipleLines', type: 'categorical', missing: 0, unique: 3 },
          { name: 'InternetService', type: 'categorical', missing: 0, unique: 3 },
          { name: 'OnlineSecurity', type: 'categorical', missing: 0, unique: 3 },
          { name: 'OnlineBackup', type: 'categorical', missing: 0, unique: 3 },
          { name: 'DeviceProtection', type: 'categorical', missing: 0, unique: 3 },
          { name: 'TechSupport', type: 'categorical', missing: 0, unique: 3 },
          { name: 'StreamingTV', type: 'categorical', missing: 0, unique: 3 },
          { name: 'StreamingMovies', type: 'categorical', missing: 0, unique: 3 },
          { name: 'Contract', type: 'categorical', missing: 0, unique: 3 },
          { name: 'PaperlessBilling', type: 'categorical', missing: 0, unique: 2 },
          { name: 'PaymentMethod', type: 'categorical', missing: 0, unique: 4 },
          { name: 'MonthlyCharges', type: 'numeric', missing: 0, unique: 1585 },
          { name: 'TotalCharges', type: 'numeric', missing: 11, unique: 6531 },
          { name: 'Churn', type: 'categorical', missing: 0, unique: 2 },
        ],
        warnings: [
          'TotalCharges has 11 missing values (0.16%)',
          '14 potential duplicate rows detected',
          'customerID appears to be an identifier column',
        ],
        preview: Array.from({ length: 5 }, (_, i) => ({
          customerID: `${7590 - i}-FAKEC`,
          gender: i % 2 === 0 ? 'Female' : 'Male',
          SeniorCitizen: i % 3 === 0 ? 1 : 0,
          tenure: [1, 34, 2, 45, 8][i],
          Contract: ['Month-to-month', 'One year', 'Month-to-month', 'Two year', 'Month-to-month'][i],
          MonthlyCharges: [29.85, 56.95, 53.85, 42.30, 70.70][i],
          TotalCharges: [29.85, 1889.5, 108.15, 1840.75, 151.65][i],
          Churn: ['Yes', 'No', 'Yes', 'No', 'Yes'][i],
        })),
      };
    }
    return apiClient.post(`/datasets/${datasetId}/validate`);
  },

  async mapColumns(datasetId, mappings) {
    if (USE_MOCK) {
      await mockDelay(800);
      return { datasetId, mappings, status: 'mapped' };
    }
    return apiClient.post(`/datasets/${datasetId}/map-columns`, { mappings });
  },

  async runPrediction(datasetId) {
    if (USE_MOCK) {
      await mockDelay(3000);
      return { datasetId, status: 'completed', customersProcessed: 7043, highRisk: 1869 };
    }
    return apiClient.post(`/datasets/${datasetId}/predict`);
  },
};

// ============================================
// Chat Services
// ============================================

async function getDemoChatResponse(message, context = {}) {
  await mockDelay(1200);
  const lower = message.toLowerCase();
  for (const [key, response] of Object.entries(mockChatResponses)) {
    if (key !== 'default' && lower.includes(key.toLowerCase().slice(0, 20))) {
      return response;
    }
  }
  // Contextual responses
  if (lower.includes('high risk') || lower.includes('highest risk')) {
    return mockChatResponses['Which customers are at highest risk?'];
  }
  if (lower.includes('churn driver') || lower.includes('why')) {
    return mockChatResponses['What are the biggest churn drivers?'];
  }
  if (lower.includes('email') || lower.includes('draft')) {
    return {
      message: `I'd be happy to help draft an outreach email. ${context.customerName ? `For ${context.customerName}, I recommend a personalized retention email addressing their specific concerns.` : 'Please navigate to a specific customer profile, and I can generate a tailored email.'}\n\nWould you like me to proceed?`,
      actions: context.customerId ? [{ label: 'Generate Email', link: `/outreach?customer=${context.customerId}` }] : [],
    };
  }
  if (lower.includes('summarize') || lower.includes('summary')) {
    return {
      message: '**Today\'s Retention Summary:**\n\n📊 **2,847** total customers monitored\n⚠️ **342** customers at High/Critical risk\n💰 **$4.28M** revenue at risk\n📉 Churn rate trending **up 2.5%** vs last month\n\n**Top concerns:**\n- 12 customers moved to High Risk this week\n- 3 critical accounts need immediate attention\n- 1 outreach email awaiting approval\n\n**Recommended priorities:**\n1. Contact DataSphere Solutions (88.1% risk)\n2. Review Zenith Healthcare support tickets\n3. Approve pending outreach for Acme Technologies',
      actions: [
        { label: 'View Dashboard', link: '/dashboard' },
        { label: 'High Risk Customers', link: '/customers?risk=critical' },
      ],
    };
  }
  return mockChatResponses['default'];
}

export const chatService = {
  async sendMessage(message, context = {}) {
    if (USE_LIVE_ASSISTANT) {
      try {
        const res = await fetch(ASSISTANT_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message, context }),
        });
        if (!res.ok) throw new Error(`Assistant service returned ${res.status}`);
        return await res.json();
      } catch {
        // Server-side Grok integration unavailable (no key configured, or the
        // proxy isn't running) — fall back to demo mode so the UI never breaks.
        return getDemoChatResponse(message, context);
      }
    }
    if (USE_MOCK) {
      return getDemoChatResponse(message, context);
    }
    return apiClient.post('/chat', { message, context });
  },
};

// ============================================
// Playbooks / Automation Services
// ============================================

let playbooksStore = [...mockPlaybooks];

export const playbookService = {
  async getPlaybooks() {
    if (USE_MOCK) {
      await mockDelay(400);
      return playbooksStore;
    }
    return apiClient.get('/playbooks');
  },

  async togglePlaybook(id) {
    if (USE_MOCK) {
      await mockDelay(300);
      playbooksStore = playbooksStore.map(p =>
        p.id === id ? { ...p, status: p.status === 'active' ? 'paused' : 'active' } : p
      );
      return playbooksStore.find(p => p.id === id);
    }
    return apiClient.post(`/playbooks/${id}/toggle`);
  },

  async createPlaybook(data) {
    if (USE_MOCK) {
      await mockDelay(600);
      const playbook = {
        id: `PB-${String(playbooksStore.length + 1).padStart(3, '0')}`,
        runsCount: 0,
        lastRun: null,
        createdAt: new Date().toISOString(),
        status: 'active',
        ...data,
      };
      playbooksStore = [playbook, ...playbooksStore];
      return playbook;
    }
    return apiClient.post('/playbooks', data);
  },
};

// ============================================
// Notification Services
// ============================================

export const notificationService = {
  async getNotifications() {
    if (USE_MOCK) {
      await mockDelay(300);
      return mockNotifications;
    }
    return apiClient.get('/notifications');
  },

  async markRead(id) {
    if (USE_MOCK) {
      await mockDelay(200);
      return { id, read: true };
    }
    return apiClient.put(`/notifications/${id}/read`);
  },

  async markAllRead() {
    if (USE_MOCK) {
      await mockDelay(300);
      return { success: true };
    }
    return apiClient.put('/notifications/read-all');
  },
};

// ============================================
// Simulator Services
// ============================================

export const simulatorService = {
  async simulate(customerId, adjustments) {
    if (USE_MOCK) {
      await mockDelay(1000);
      const customer = mockCustomers.find(c => c.id === customerId);
      if (!customer) throw new Error('Customer not found');

      const currentRisk = customer.churnProbability;
      let reduction = 0;
      if (adjustments.usageImprovement) reduction += adjustments.usageImprovement * 0.45;
      if (adjustments.loginFrequency) reduction += adjustments.loginFrequency * 0.35;
      if (adjustments.featureAdoption) reduction += adjustments.featureAdoption * 0.30;
      if (adjustments.supportResolution) reduction += adjustments.supportResolution * 0.25;
      if (adjustments.engagementScore) reduction += adjustments.engagementScore * 0.20;

      const projectedRisk = Math.max(5, currentRisk - reduction);
      return {
        customerId,
        currentRisk,
        projectedRisk: Math.round(projectedRisk * 10) / 10,
        improvement: Math.round((currentRisk - projectedRisk) * 10) / 10,
        adjustments,
        confidence: 0.87,
      };
    }
    return apiClient.post(`/simulator/what-if`, { customerId, adjustments });
  },
};
