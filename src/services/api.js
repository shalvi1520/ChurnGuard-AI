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
import { REQUIRED_FIELDS, suggestMappings } from '../mock/datasetSchema';
import { profileDataset, countChurnLabels } from '../utils/csv';
import { readTabularFile, isSupportedFile, getFileExtension, SUPPORTED_EXTENSIONS } from '../utils/spreadsheet';
import { delay } from '../utils/helpers';

// This is a frontend prototype and ships with a complete local demo data layer.
// Default to that layer when no .env file is present; a live backend must be
// opted into explicitly with VITE_USE_MOCK_API=false.
const USE_MOCK = import.meta.env.VITE_USE_MOCK_API !== 'false';
const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api';

// AI Assistant: when enabled, the frontend calls a server-side proxy (server.js)
// which holds the Grok (xAI) API key. The key is never present in client code.
// When disabled (default) or when the live call fails, the assistant falls back
// to canned demo responses so the widget always works without a backend.
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

// Upload constraints. Exported so the upload UI can state the real limits
// instead of describing formats or sizes the code doesn't actually handle.
export const DATASET_UPLOAD = {
  maxSizeBytes: 50 * 1024 * 1024,
  // Kept in step with what `utils/spreadsheet.js` can actually parse — the UI
  // reads this list, so it can never advertise a format we don't handle.
  extensions: SUPPORTED_EXTENSIONS,
  accept: {
    'text/csv': ['.csv'],
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
    'application/vnd.ms-excel': ['.xls'],
  },
};

/**
 * A problem with the user's dataset that we can explain in plain language.
 * `message` says what is wrong, `hint` says what to do about it.
 */
export class DatasetError extends Error {
  constructor(message, hint) {
    super(message);
    this.name = 'DatasetError';
    this.hint = hint;
  }
}

// Datasets picked during this session, keyed by the id returned from upload.
// The mock layer keeps the parsed file here so validation, mapping and
// prediction all report figures computed from the user's actual data rather
// than hardcoded statistics. In-memory, resets on reload — same pattern as the
// other mock stores in this file.
const uploadedDatasets = new Map();

const FORMAT_LIST = SUPPORTED_EXTENSIONS.map((e) => e.replace('.', '').toUpperCase()).join(', ');

/** Reads any supported file into `{ columns, rows, sheetName }` — see utils/spreadsheet.js. */
async function readDataset(file) {
  if (!isSupportedFile(file?.name)) {
    throw new DatasetError(
      `ChurnGuard can't read ${getFileExtension(file?.name) || 'that kind of'} files.`,
      `Supported formats are ${FORMAT_LIST}. Export or re-save your customer list in one of those and try again.`
    );
  }
  try {
    return await readTabularFile(file);
  } catch {
    throw new DatasetError(
      "We couldn't read that file.",
      'It may be corrupted, password-protected, or still open in another program. Try re-saving it and uploading again.'
    );
  }
}

function pluralize(count, singular, plural = `${singular}s`) {
  return count === 1 ? singular : plural;
}

/** Turns a parsed dataset into the plain-language report the setup flow shows. */
function buildValidationReport(datasetId, entry) {
  const { parsed, profile } = entry;
  const suggestedMappings = suggestMappings(parsed.columns);
  const missingRequired = REQUIRED_FIELDS.filter((f) => !suggestedMappings[f.key]);

  const warnings = [];
  const issues = [];

  if (profile.rowCount < 2) {
    issues.push({
      title: 'This file only contains a single customer row.',
      why: 'ChurnGuard compares customers against each other, so one row cannot produce a retention view.',
      action: 'Upload an export that contains your customer base, or continue with the demo dataset.',
    });
  }

  if (profile.emptyColumns.length === profile.columnCount && profile.columnCount > 0) {
    issues.push({
      title: 'Every column in this file is empty.',
      why: 'There are headers but no values underneath them, so there is nothing to analyse.',
      action: 'Check the export settings in your source system and upload the file again.',
    });
  }

  if (profile.missingCells > 0) {
    const worst = profile.columns
      .filter((c) => c.missing > 0)
      .sort((a, b) => b.missing - a.missing)
      .slice(0, 3);
    warnings.push({
      title: `${profile.missingCells.toLocaleString()} empty ${pluralize(profile.missingCells, 'value')} across ${worst.length === 1 ? '1 column' : `${profile.columns.filter((c) => c.missing > 0).length} columns`}`,
      why: 'Customers with gaps are still included, but the missing fields contribute less to their risk picture.',
      action: `Most affected: ${worst.map((c) => `${c.name} (${c.missing})`).join(', ')}. Fill these in your source system if they matter to you — otherwise you can continue.`,
    });
  }

  if (profile.duplicateRows > 0) {
    warnings.push({
      title: `${profile.duplicateRows} identical ${pluralize(profile.duplicateRows, 'row')}`,
      why: 'A repeated customer is counted more than once, which skews totals and revenue at risk.',
      action: 'Remove the duplicates in your export if they were not intentional.',
    });
  }

  if (profile.emptyColumns.length > 0 && issues.length === 0) {
    warnings.push({
      title: `${profile.emptyColumns.length} ${pluralize(profile.emptyColumns.length, 'column')} with no values`,
      why: 'Columns that are entirely blank add nothing to the analysis.',
      action: `${profile.emptyColumns.slice(0, 4).join(', ')} will simply be ignored — no action needed.`,
    });
  }

  if (missingRequired.length > 0) {
    warnings.push({
      title: `Couldn't automatically match ${missingRequired.map((f) => f.label).join(', ')}`,
      why: 'ChurnGuard needs these fields to build a customer view; your column names just differ from the ones we recognise.',
      action: 'Choose the matching column yourself in the next step.',
    });
  }

  return {
    datasetId,
    status: issues.length > 0 ? 'blocked' : warnings.length > 0 ? 'warning' : 'ready',
    columns: profile.columns,
    missingCells: profile.missingCells,
    missingPercent: Math.round(profile.missingPercent * 100) / 100,
    duplicateRows: profile.duplicateRows,
    preview: profile.preview,
    warnings,
    issues,
    suggestedMappings,
    requiredDetected: REQUIRED_FIELDS.length - missingRequired.length,
    requiredTotal: REQUIRED_FIELDS.length,
  };
}

export const datasetService = {
  async uploadDataset(file, onProgress) {
    if (USE_MOCK) {
      onProgress?.(5);
      const parsed = await readDataset(file);

      onProgress?.(60);
      if (parsed.columns.length === 0) {
        throw new DatasetError(
          'That file appears to be empty.',
          'Export your customer list again and make sure it has a header row plus at least one customer.'
        );
      }
      if (parsed.columns.length < 2) {
        throw new DatasetError(
          "We couldn't split that file into columns.",
          'Check that the first row names each column, and that a CSV export used commas as the separator.'
        );
      }
      if (parsed.rows.length === 0) {
        throw new DatasetError(
          'This file has column headers but no customer rows.',
          'Check that the export actually included your data, then upload it again.'
        );
      }

      onProgress?.(80);
      const profile = profileDataset(parsed);
      await mockDelay(700);
      onProgress?.(100);

      const id = `DS-${Date.now()}`;
      uploadedDatasets.set(id, { parsed, profile, mappings: null });

      return {
        id,
        filename: file.name,
        rows: profile.rowCount,
        columns: profile.columnCount,
        size: file.size,
        // Null for CSV; for a workbook, which sheet we read and how many it had.
        sheetName: parsed.sheetName,
        sheetCount: parsed.sheetCount,
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
      const entry = uploadedDatasets.get(datasetId);
      if (!entry) {
        throw new DatasetError(
          'That upload is no longer available.',
          'Uploads are held for the current session only — please select your file again.'
        );
      }
      return buildValidationReport(datasetId, entry);
    }
    return apiClient.post(`/datasets/${datasetId}/validate`);
  },

  /** `mappings` is `{ [yourColumnName]: churnguardFieldKey }`. */
  async mapColumns(datasetId, mappings) {
    if (USE_MOCK) {
      await mockDelay(800);
      const entry = uploadedDatasets.get(datasetId);
      if (!entry) {
        throw new DatasetError(
          'That upload is no longer available.',
          'Uploads are held for the current session only — please select your file again.'
        );
      }
      const mapped = new Set(Object.values(mappings || {}));
      const missing = REQUIRED_FIELDS.filter((f) => !mapped.has(f.key));
      if (missing.length > 0) {
        throw new DatasetError(
          `Still missing a column for ${missing.map((f) => f.label).join(', ')}.`,
          'Pick the matching column from your dataset for each required field.'
        );
      }
      entry.mappings = { ...mappings };
      return { datasetId, mappings: entry.mappings, status: 'mapped' };
    }
    return apiClient.post(`/datasets/${datasetId}/map-columns`, { mappings });
  },

  async runPrediction(datasetId) {
    if (USE_MOCK) {
      await mockDelay(3000);
      const entry = uploadedDatasets.get(datasetId);
      if (!entry) {
        throw new DatasetError(
          'That upload is no longer available.',
          'Uploads are held for the current session only — please select your file again.'
        );
      }
      const churnColumn = Object.keys(entry.mappings || {}).find((col) => entry.mappings[col] === 'churn');
      return {
        datasetId,
        status: 'completed',
        customersProcessed: entry.profile.rowCount,
        fieldsMapped: Object.keys(entry.mappings || {}).length,
        // A fact read straight out of the file — not a model output.
        labelledChurnCount: countChurnLabels(entry.parsed.rows, entry.parsed.columns.indexOf(churnColumn)),
        // Risk scores in this prototype are demo data; the UI says so.
        simulated: USE_MOCK,
      };
    }
    return apiClient.post(`/datasets/${datasetId}/predict`);
  },
};

// ============================================
// Chat Services
// ============================================
//
// Powers the floating AI assistant widget (components/ui/FloatingChatWidget).
// There is no assistant *page* — the widget is the whole surface.

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
    // Figures come from the same derived KPIs the Overview renders, so the
    // assistant can never quote a number that contradicts the dashboard.
    const { totalCustomers, customersAtRisk, revenueAtRisk } = mockDashboardKPIs;
    return {
      message: `**Today's Retention Summary:**\n\n📊 **${totalCustomers.value.toLocaleString()}** total customers monitored\n⚠️ **${customersAtRisk.value.toLocaleString()}** customers at High/Critical risk\n💰 **$${(revenueAtRisk.value / 1000000).toFixed(2)}M** revenue at risk\n📉 Churn rate trending **up ${Math.abs(mockDashboardKPIs.retentionRate.change)}%** vs last month\n\n**Top concerns:**\n- 3 critical accounts need immediate attention\n- 1 outreach email awaiting approval\n\n**Recommended priorities:**\n1. Contact DataSphere Solutions (88.1% risk)\n2. Review Zenith Healthcare support tickets\n3. Approve pending outreach for Acme Technologies`,
      actions: [
        { label: 'View Overview', link: '/dashboard' },
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
