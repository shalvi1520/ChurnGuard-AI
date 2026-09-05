// ============================================
// ChurnGuard – AI Assistant Proxy Server
// ============================================
// Minimal Express server that proxies chat requests to the xAI Grok API.
// This exists ONLY so the Grok API key never has to live in client-side code.
// The Vite frontend calls POST /api/assistant (same-origin in dev, via the
// proxy configured in vite.config.js); this server attaches the real key.
//
// If XAI_API_KEY is not set, this endpoint responds 503 and the frontend
// automatically falls back to demo-mode canned responses (see src/services/api.js).
// This server is NOT required to run the app — it is only needed when
// VITE_USE_LIVE_ASSISTANT=true and you want real Grok responses.

import 'dotenv/config';
import express from 'express';

const app = express();
app.use(express.json());

const PORT = process.env.ASSISTANT_PORT || 8787;
const XAI_MODEL = process.env.XAI_MODEL || 'grok-4-fast';

const SYSTEM_PROMPT = `You are the ChurnGuard AI Assistant, embedded inside the ChurnGuard customer retention platform.
ChurnGuard helps Customer Success teams: PREDICT which customers are at risk of churn, EXPLAIN why using SHAP-based feature contributions, and ACT via recommended next steps and outreach drafts.
Answer questions about churn risk, retention strategy, and how to navigate the app (Dashboard, Customers, Explainability, Recommendations, Outreach, Simulator, Analytics, Playbooks).
Be concise and practical. If asked about specific live customer numbers, note that this is a prototype and real figures come from the connected dataset.
Never claim to have sent an email or taken an irreversible action — all outreach requires human review and approval.`;

app.post('/api/assistant', async (req, res) => {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: 'Assistant not configured. Set XAI_API_KEY to enable live responses.' });
  }

  const { message, context } = req.body || {};
  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'A "message" string is required.' });
  }

  try {
    const contextNote = context && Object.keys(context).length
      ? `\n\nCurrent app context: ${JSON.stringify(context)}`
      : '';

    const response = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: XAI_MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT + contextNote },
          { role: 'user', content: message },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Grok API error:', response.status, errText);
      return res.status(502).json({ error: 'Assistant service returned an error.' });
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content?.trim() || 'Sorry, I could not generate a response.';
    res.json({ message: text, actions: [] });
  } catch (err) {
    console.error('Assistant proxy failed:', err);
    res.status(502).json({ error: 'Failed to reach assistant service.' });
  }
});

app.get('/api/assistant/health', (req, res) => {
  res.json({ configured: Boolean(process.env.XAI_API_KEY) });
});

app.listen(PORT, () => {
  console.log(`ChurnGuard AI Assistant proxy listening on http://localhost:${PORT}`);
  console.log(process.env.XAI_API_KEY ? 'XAI_API_KEY detected — live Grok responses enabled.' : 'XAI_API_KEY not set — /api/assistant will return 503 until configured.');
});
