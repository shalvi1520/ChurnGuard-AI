// ============================================
// ChurnGuard – API Service Layer
// ============================================

import axios from 'axios';
import { mockNotifications, mockChatResponses } from '../mock/notifications';
import { demoCredentials, mockUsers } from '../mock/users';
import { delay } from '../utils/helpers';

// ChurnGuard runs on a real FastAPI + ML backend (backend/) -- every
// customer/dashboard/explainability/recommendation/outreach number below
// comes from a model actually trained on the dataset the user uploaded.
// There is no local fabricated-data fallback for these: if the backend
// isn't running, the UI shows a real "couldn't load" error state rather
// than silently substituting invented numbers.
const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api';

// The AI assistant widget is a separate, self-contained feature (not part
// of the churn-prediction pipeline): when enabled, it calls a server-side
// proxy (server.js) holding the Grok/xAI key; otherwise it uses canned demo
// replies. This is unrelated to whether the churn backend is connected.
const USE_LIVE_ASSISTANT = import.meta.env.VITE_USE_LIVE_ASSISTANT === 'true';
const ASSISTANT_URL = import.meta.env.VITE_ASSISTANT_API_URL || '/api/assistant';

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
//
// No backend user-account system exists (see PROJECT_MEMORY.md) -- building
// one is a separate, much larger feature than connecting the ML pipeline.
// This stays a local/prototype session: any email/password is accepted and
// a session token is kept in localStorage. Known limitation, not an oversight.

export const authService = {
  async login(email, password) {
    await delay(400);
    if (email === demoCredentials.email && password === demoCredentials.password) {
      return { token: 'churnguard-local-session', user: demoCredentials.user };
    }
    const user = { ...mockUsers[0], email, name: email.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) };
    return { token: 'churnguard-local-session', user };
  },

  async signup(data) {
    await delay(500);
    return { token: 'churnguard-local-session', user: { ...mockUsers[0], name: data.name, email: data.email, company: data.company } };
  },

  async forgotPassword() {
    await delay(400);
    return { message: 'Password reset email sent' };
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
    return apiClient.get('/dashboard');
  },
  async getRiskDistribution() {
    return apiClient.get('/dashboard/risk-distribution');
  },
  async getChurnTrend() {
    return apiClient.get('/dashboard/churn-trend');
  },
  async getRevenueAtRisk() {
    return apiClient.get('/dashboard/revenue-at-risk');
  },
  async getTopDrivers() {
    return apiClient.get('/dashboard/top-drivers');
  },
  async getSegmentation() {
    return apiClient.get('/dashboard/segmentation');
  },
};

// ============================================
// Customer Services
// ============================================

export const customerService = {
  async getCustomers(params = {}) {
    return apiClient.get('/customers', { params });
  },
  async getCustomer(id) {
    return apiClient.get(`/customers/${id}`);
  },
};

// ============================================
// Explainability Services
// ============================================

export const explainabilityService = {
  async getSHAPExplanation(customerId) {
    return apiClient.get(`/customers/${customerId}/explanation`);
  },
};

// ============================================
// Recommendations Services
// ============================================

export const recommendationService = {
  async getRecommendations(customerId) {
    return apiClient.get(`/customers/${customerId}/recommendations`);
  },
  async updateStatus(recId, status) {
    return apiClient.put(`/recommendations/${recId}`, { status });
  },
};

// ============================================
// Outreach Services
// ============================================

export const outreachService = {
  async getEmails() {
    return apiClient.get('/outreach');
  },
  async generateEmail(customerId) {
    // LLM drafting (Groq, via backend/llm/) can take longer than a typical
    // API call.
    return apiClient.post(`/customers/${customerId}/outreach/generate`, null, { timeout: 60000 });
  },
  async updateEmail(emailId, data) {
    return apiClient.put(`/outreach/${emailId}`, data);
  },
  async approveEmail(emailId) {
    return apiClient.post(`/outreach/${emailId}/approve`);
  },
  async sendEmail(emailId) {
    return apiClient.post(`/outreach/${emailId}/send`);
  },
};

// ============================================
// Dataset Services
// ============================================

// Upload constraints stated to the UI. Kept in step with what the backend
// (backend/generic/io_utils.py) actually parses -- CSV and Excel via pandas.
export const DATASET_UPLOAD = {
  maxSizeBytes: 50 * 1024 * 1024,
  extensions: ['.csv', '.xlsx', '.xls'],
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

const GENERIC_HINT = 'Please try again — if it keeps happening, use a different file or the demo dataset.';

/** How to start the API, shown whenever it can't be reached. Worth being
 * specific: "something went wrong" sends people hunting through their file
 * when the real problem is that nothing is listening. */
export const BACKEND_START_HINT =
  `Start it from the project folder with: python -m uvicorn backend.api.main:app --reload --port 8000 — ` +
  `it should then answer at ${BASE_URL}.`;

/** True when the request never got a response: the server isn't running, the
 * URL is wrong, or CORS/DNS failed. `err.response` is undefined in all of
 * those, which is exactly what separates them from a real 4xx/5xx. */
function isUnreachable(err) {
  return !err.response || [502, 503, 504].includes(err.response.status);
}

/** Wraps a backend call so a 4xx/5xx surfaces as a DatasetError with the
 * server's real explanation, instead of a generic axios error the UI can't
 * show meaningfully.
 *
 * A connection failure is reported as its own thing rather than as a problem
 * with the user's data — telling someone to "try a different file" when the
 * backend simply isn't running sends them in entirely the wrong direction. */
async function callDatasetApi(promise) {
  try {
    return await promise;
  } catch (err) {
    if (err instanceof DatasetError) throw err;

    if (err.code === 'ECONNABORTED') {
      throw new DatasetError(
        'The ChurnGuard backend took too long to respond.',
        'Training a model on a large dataset can take a few minutes. If it keeps timing out, check the backend logs.'
      );
    }
    if (isUnreachable(err)) {
      throw new DatasetError("Can't reach the ChurnGuard backend.", BACKEND_START_HINT);
    }

    const detail = err.response?.data?.detail;
    throw new DatasetError(
      typeof detail === 'string' ? detail : 'Something went wrong while handling your dataset.',
      GENERIC_HINT
    );
  }
}

// The health answer is reused for a few seconds. Data Management mounts the
// notice on every visit (and twice per mount under React's StrictMode in dev),
// and re-asking an unreachable server on each of those is pure waste. Short
// enough that a backend started in another terminal is picked up on the next
// navigation; "Check again" passes `force` so the user never waits on it.
const HEALTH_CACHE_MS = 30000;
let healthCache = { checkedAt: 0, value: null };

/** Is the API up? Used to warn before the user picks a file, rather than
 * after. Returns the backend's health payload, or null if it can't be reached. */
export async function checkBackendHealth({ force = false } = {}) {
  if (!force && healthCache.checkedAt && Date.now() - healthCache.checkedAt < HEALTH_CACHE_MS) {
    return healthCache.value;
  }
  let value = null;
  try {
    value = await apiClient.get('/health', { timeout: 5000 });
  } catch {
    value = null;
  }
  healthCache = { checkedAt: Date.now(), value };
  return value;
}

export const datasetService = {
  async uploadDataset(file, onProgress) {
    const formData = new FormData();
    formData.append('file', file);
    return callDatasetApi(
      apiClient.post('/datasets/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (e) => onProgress?.(Math.round((e.loaded * 100) / e.total)),
      })
    );
  },

  async validateDataset(datasetId) {
    return callDatasetApi(apiClient.post(`/datasets/${datasetId}/validate`));
  },

  /** `mappings` is `{ [yourColumnName]: churnguardFieldKey }`. */
  async mapColumns(datasetId, mappings) {
    return callDatasetApi(apiClient.post(`/datasets/${datasetId}/map-columns`, { mappings }));
  },

  async runPrediction(datasetId) {
    // This is the real training + prediction step (Optuna-tuned stacking
    // ensemble + a batch SHAP pass) -- it can genuinely take a couple of
    // minutes for a larger dataset, well past a typical API timeout.
    return callDatasetApi(apiClient.post(`/datasets/${datasetId}/predict`, null, { timeout: 300000 }));
  },

  /** The dataset the backend currently holds, or null if there is none.
   * Lets the app tell "backend down" apart from "nothing connected yet". */
  async getCurrent() {
    try {
      return await apiClient.get('/dataset');
    } catch (err) {
      if (err.response?.status === 404) return null;
      throw err;
    }
  },

  /** "Replace dataset" -- drops the stored data server-side so a trained
   * model can never outlive the dataset it was built from. */
  async clearDataset() {
    return callDatasetApi(apiClient.delete('/dataset'));
  },
};

// ============================================
// CRM / API Connector Services
// ============================================
//
// Every call here is server-side (backend/api/connector_routes.py). Provider
// credentials are POSTed to our own backend, used for that one request and
// dropped -- they are never persisted, never logged, never written to
// localStorage, and never placed in a VITE_-prefixed variable, which would
// ship them in the browser bundle.
//
// A successful import lands in exactly the same place an uploaded file does:
// one dataset on the backend, ready for the same validate -> map -> predict
// path. There is deliberately no separate CRM pipeline.

export const connectorService = {
  /** Providers and their connect-form fields. `status` is honest: 'available'
   * really connects, 'coming_soon' will refuse rather than fake a session. */
  async listConnectors() {
    return callDatasetApi(apiClient.get('/connectors'));
  },

  async testConnection(providerId, credentials) {
    return callDatasetApi(apiClient.post(`/connectors/${providerId}/test`, { credentials }));
  },

  /** The selectable record collections inside the provider (a CRM object,
   * a report, an endpoint). */
  async listSources(providerId, credentials) {
    return callDatasetApi(apiClient.post(`/connectors/${providerId}/sources`, { credentials }));
  },

  /** Pulls records and registers them as the active dataset. Returns the same
   * shape `uploadDataset` does. Network round-trips to a third-party API can
   * be slow, so this gets a longer timeout than the default. */
  async importRecords(providerId, { credentials, sourceId, limit }) {
    return callDatasetApi(
      apiClient.post(
        `/connectors/${providerId}/import`,
        { credentials, sourceId, limit },
        { timeout: 120000 }
      )
    );
  },
};

// ============================================
// Chat Services
// ============================================
//
// Powers the floating AI assistant widget (components/ui/FloatingChatWidget).
// There is no assistant *page* — the widget is the whole surface. Separate
// concern from the churn-prediction backend above: it either talks to the
// live Grok proxy (server.js) or uses canned demo replies, never the churn API.

async function getDemoChatResponse(message, context = {}) {
  await delay(500);
  const lower = message.toLowerCase();
  for (const [key, response] of Object.entries(mockChatResponses)) {
    if (key !== 'default' && lower.includes(key.toLowerCase().slice(0, 20))) {
      return response;
    }
  }
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
      message: `I can't summarize your portfolio from here — that view lives on the Overview page, built from whatever dataset you've connected. Head there for the current totals, at-risk count and revenue at risk.`,
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
    return getDemoChatResponse(message, context);
  },
};

// ============================================
// Notification Services
// ============================================
//
// Unrelated to the churn pipeline (no backend endpoint exists for these) --
// local demo notifications, same as the chat widget above.

export const notificationService = {
  async getNotifications() {
    await delay(150);
    return mockNotifications;
  },
  async markRead(id) {
    await delay(100);
    return { id, read: true };
  },
  async markAllRead() {
    await delay(150);
    return { success: true };
  },
};
